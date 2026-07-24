/**
 * BBA Bilgi Yükleme Scripti
 *
 * Kullanım:
 *   pnpm --filter @workspace/scripts run bilgi-yukle <dosya_yolu>
 *
 * Örnek:
 *   pnpm --filter @workspace/scripts run bilgi-yukle data/rag/bba-bilgi.txt
 *
 * Dosya formatı:
 *   Başlık: <başlık>
 *   Etiketler: <etiket1>, <etiket2>, ...
 *   İçerik:
 *   <içerik metni (çok satırlı olabilir)>
 *   Kaynak: <kaynak / url>
 *   --------------------------------------------------------------------------------
 */

import { readFileSync, existsSync } from "fs";
import { resolve } from "path";
import { Client } from "pg";

// ── Yardımcılar ───────────────────────────────────────────────────────────────

const AYIRICI = "--------------------------------------------------------------------------------";

/** pgbouncer parametresini bağlantı dizisinden temizler */
function temizleUrl(url: string): string {
  return url
    .replace(/[?&]pgbouncer=[^&]*/g, "")
    .replace(/\?&/, "?")
    .replace(/\?$/, "");
}

/** Başlık: … satırını çıkarır */
function alanCikar(satirlar: string[], anahtar: string): string {
  for (const satir of satirlar) {
    if (satir.startsWith(anahtar)) {
      return satir.slice(anahtar.length).trim();
    }
  }
  return "";
}

/** Çok satırlı bir alanı çıkarır: başlangıç anahtarından bir sonraki anahtara kadar */
function cokSatirliAlanCikar(
  satirlar: string[],
  basAnahtar: string,
  bitisCumlecikleri: string[]
): string {
  let topluyor = false;
  const parcalar: string[] = [];

  for (const satir of satirlar) {
    if (satir.startsWith(basAnahtar)) {
      topluyor = true;
      // Aynı satırda içerik varsa al
      const satirIcerik = satir.slice(basAnahtar.length).trim();
      if (satirIcerik) parcalar.push(satirIcerik);
      continue;
    }
    if (topluyor) {
      if (bitisCumlecikleri.some((b) => satir.startsWith(b))) break;
      parcalar.push(satir);
    }
  }

  // Baştaki ve sondaki boş satırları temizle
  while (parcalar.length > 0 && parcalar[0].trim() === "") parcalar.shift();
  while (parcalar.length > 0 && parcalar[parcalar.length - 1].trim() === "") parcalar.pop();

  return parcalar.join("\n");
}

/** Metin içindeki ilk URL'yi bulur */
function urlBul(metin: string): string | null {
  const eslesen = metin.match(/https?:\/\/[^\s]+/);
  return eslesen ? eslesen[0] : null;
}

// ── Bölüm ayrıştırıcı ─────────────────────────────────────────────────────────

interface BilgiBolumu {
  title: string;
  tags: string[];
  content: string;
  source: string;
  source_url: string | null;
}

function bolumAyristir(bolumMetni: string): BilgiBolumu | null {
  const satirlar = bolumMetni.split("\n");
  const title = alanCikar(satirlar, "Başlık:");
  if (!title) return null; // Başlıksız bölüm atla

  const tagsHam = alanCikar(satirlar, "Etiketler:");
  const tags = tagsHam
    ? tagsHam.split(",").map((t) => t.trim()).filter(Boolean)
    : [];

  const content = cokSatirliAlanCikar(satirlar, "İçerik:", ["Kaynak:"]);
  const source = alanCikar(satirlar, "Kaynak:");
  const source_url = urlBul(source) ?? (source.startsWith("http") ? source : null);

  return { title, tags, content, source, source_url };
}

// ── Ana işlev ────────────────────────────────────────────────────────────────

async function ana() {
  const dosyaYolu = process.argv[2];
  if (!dosyaYolu) {
    console.error("Hata: Dosya yolu belirtilmedi.");
    console.error("Kullanım: pnpm --filter @workspace/scripts run bilgi-yukle <dosya_yolu>");
    process.exit(1);
  }

  // Dosyayı oku — önce verildiği gibi, sonra workspace kökünden dene
  const tamYol = existsSync(dosyaYolu)
    ? dosyaYolu
    : resolve(process.cwd(), "..", dosyaYolu);

  let dosyaIcerik: string;
  try {
    dosyaIcerik = readFileSync(tamYol, "utf-8");
  } catch {
    console.error(`Hata: Dosya okunamadı → ${tamYol}`);
    process.exit(1);
  }

  // Bölümlere ayır
  const bolumler = dosyaIcerik
    .split(AYIRICI)
    .map((b) => b.trim())
    .filter(Boolean);

  console.log(`📄 Dosya okundu: ${dosyaYolu}`);
  console.log(`📦 Toplam bölüm: ${bolumler.length}`);

  // Ayrıştır
  const kayitlar: BilgiBolumu[] = [];
  let atlananSayisi = 0;

  for (const bolum of bolumler) {
    const kayit = bolumAyristir(bolum);
    if (kayit) {
      kayitlar.push(kayit);
    } else {
      atlananSayisi++;
    }
  }

  console.log(`✓ Geçerli kayıt: ${kayitlar.length}`);
  if (atlananSayisi > 0) {
    console.log(`⚠ Başlıksız / boş bölüm atlandı: ${atlananSayisi}`);
  }

  if (kayitlar.length === 0) {
    console.log("Eklenecek kayıt bulunamadı. İşlem tamamlandı.");
    return;
  }

  // Veritabanı bağlantısı
  const connString = process.env.DATABASE_URL ?? process.env.SUPABASE_DB_URL ?? "";
  if (!connString) {
    console.error("Hata: DATABASE_URL veya SUPABASE_DB_URL ortam değişkeni tanımlı değil.");
    process.exit(1);
  }

  const client = new Client({ connectionString: temizleUrl(connString) });
  await client.connect();
  console.log("🔌 Veritabanına bağlandı.");

  // Kayıtları ekle
  let eklendi = 0;
  let atlandiDb = 0;

  for (const kayit of kayitlar) {
    // Aynı başlık + kaynak kombinasyonu zaten varsa atla
    const mevcutSonuc = await client.query<{ id: string }>(
      "SELECT id FROM bba_knowledge_base WHERE title = $1 AND source = $2 LIMIT 1",
      [kayit.title, kayit.source]
    );

    if (mevcutSonuc.rows.length > 0) {
      console.log(`  ↩ Zaten var, atlandı: "${kayit.title}"`);
      atlandiDb++;
      continue;
    }

    await client.query(
      `INSERT INTO bba_knowledge_base (title, tags, content, source, source_url)
       VALUES ($1, $2, $3, $4, $5)`,
      [kayit.title, kayit.tags, kayit.content, kayit.source, kayit.source_url]
    );

    console.log(`  ✓ Eklendi: "${kayit.title}" [${kayit.tags.join(", ")}]`);
    eklendi++;
  }

  await client.end();

  console.log("\n── Özet ───────────────────────────────────────────────────────");
  console.log(`  Eklendi     : ${eklendi}`);
  console.log(`  Zaten vardı : ${atlandiDb}`);
  console.log(`  Toplam      : ${kayitlar.length}`);
  console.log("────────────────────────────────────────────────────────────────");
}

ana().catch((hata) => {
  console.error("Beklenmeyen hata:", hata.message);
  process.exit(1);
});
