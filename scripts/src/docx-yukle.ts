/**
 * BBA DOCX Bilgi Yükleme Scripti
 *
 * Kullanım:
 *   pnpm --filter @workspace/scripts run docx-yukle <dosya.docx> [dosya2.docx ...]
 *
 * Örnek:
 *   pnpm --filter @workspace/scripts run docx-yukle attached_assets/icerik.docx
 *
 * Dosya içi format (Word'de düz metin olarak):
 *   Başlık: <başlık>
 *   Etiketler: <etiket1>, <etiket2>, ...
 *   İçerik: <içerik (çok satırlı olabilir)>
 *   Kaynak: [metin](url)  ya da düz URL
 *   ────────────────────────────────────────────────────────────────────────────────
 *
 * Yükleme sonrası otomatik olarak embedding oluşturur (NULL olanlar için).
 */

import { existsSync, readFileSync } from "fs";
import { resolve } from "path";
import mammoth from "mammoth";
import { Client } from "pg";
import OpenAI from "openai";

// ── Sabitler ──────────────────────────────────────────────────────────────────

const AYIRICI_REGEX = /^-{10,}\s*$/;

// ── Yardımcılar ───────────────────────────────────────────────────────────────

function temizleUrl(url: string): string {
  return url
    .replace(/[?&]pgbouncer=[^&]*/g, "")
    .replace(/\?&/, "?")
    .replace(/\?$/, "");
}

function alanCikar(satirlar: string[], anahtar: string): string {
  for (const satir of satirlar) {
    // "İçerik." (nokta) veya "İçerik:" (iki nokta) her ikisini kabul et
    const temizAnahtar = anahtar.replace(":", "");
    if (satir.startsWith(anahtar) || satir.startsWith(temizAnahtar + ".")) {
      const ayirac = satir.indexOf(anahtar.endsWith(":") ? ":" : ".");
      return satir.slice(ayirac + 1).trim();
    }
  }
  return "";
}

function cokSatirliAlanCikar(
  satirlar: string[],
  basAnahtar: string,
  bitisCumlecikleri: string[]
): string {
  let topluyor = false;
  const parcalar: string[] = [];

  for (const satir of satirlar) {
    // Hem "İçerik:" hem "İçerik." ile başlayan satırı yakala
    const basliyor =
      satir.startsWith(basAnahtar) ||
      satir.startsWith(basAnahtar.replace(":", "."));

    if (basliyor) {
      topluyor = true;
      const ayirac = satir.indexOf(satir.includes(":") ? ":" : ".");
      const satirIcerik = satir.slice(ayirac + 1).trim();
      if (satirIcerik) parcalar.push(satirIcerik);
      continue;
    }

    if (topluyor) {
      if (bitisCumlecikleri.some((b) => satir.startsWith(b))) break;
      if (AYIRICI_REGEX.test(satir)) break;
      parcalar.push(satir);
    }
  }

  while (parcalar.length > 0 && parcalar[0].trim() === "") parcalar.shift();
  while (
    parcalar.length > 0 &&
    parcalar[parcalar.length - 1].trim() === ""
  )
    parcalar.pop();

  return parcalar.join("\n");
}

function urlBul(metin: string): string | null {
  const eslesen = metin.match(/https?:\/\/[^\s)]+/);
  return eslesen ? eslesen[0] : null;
}

// ── Tipler ────────────────────────────────────────────────────────────────────

interface BilgiBolumu {
  title: string;
  tags: string[];
  content: string;
  source: string;
  source_url: string | null;
}

// ── Bölüm ayrıştırıcı ─────────────────────────────────────────────────────────

function bolumAyristir(bolumMetni: string): BilgiBolumu | null {
  const satirlar = bolumMetni.split("\n");
  const title = alanCikar(satirlar, "Başlık:");
  if (!title) return null;

  const tagsHam = alanCikar(satirlar, "Etiketler:");
  const tags = tagsHam
    ? tagsHam
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean)
    : [];

  const content = cokSatirliAlanCikar(satirlar, "İçerik:", [
    "Kaynak:",
    "Etiketler:",
  ]);
  const source = alanCikar(satirlar, "Kaynak:");
  const source_url =
    urlBul(source) ?? (source.startsWith("http") ? source : null);

  // İçerik boşsa atla
  if (!content) return null;

  return { title, tags, content, source, source_url };
}

// ── DOCX → metin ─────────────────────────────────────────────────────────────

async function docxMetniCikar(dosyaYolu: string): Promise<string> {
  const buffer = readFileSync(dosyaYolu);
  const sonuc = await mammoth.extractRawText({ buffer });
  return sonuc.value;
}

// ── Embedding oluştur ─────────────────────────────────────────────────────────

function embeddingGirdisi(title: string, tags: string[], content: string): string {
  const tagsMetin = tags.length > 0 ? `Etiketler: ${tags.join(", ")}\n` : "";
  return `Başlık: ${title}\n${tagsMetin}İçerik:\n${content}`.trim();
}

function bekle(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// ── Ana işlev ─────────────────────────────────────────────────────────────────

async function ana() {
  const dosyaYollari = process.argv.slice(2);
  if (dosyaYollari.length === 0) {
    console.error("Hata: En az bir dosya yolu belirtilmeli.");
    console.error(
      "Kullanım: pnpm --filter @workspace/scripts run docx-yukle <dosya.docx> ..."
    );
    process.exit(1);
  }

  // Ortam değişkenleri
  const connString =
    process.env["SUPABASE_DB_URL"] ?? process.env["DATABASE_URL"] ?? "";
  if (!connString) {
    console.error("Hata: SUPABASE_DB_URL veya DATABASE_URL tanımlı değil.");
    process.exit(1);
  }

  const apiKey = process.env["OPENAI_API_KEY"];
  if (!apiKey) {
    console.error("Hata: OPENAI_API_KEY tanımlı değil.");
    process.exit(1);
  }

  const client = new Client({ connectionString: temizleUrl(connString) });
  await client.connect();
  console.log("🔌 Veritabanına bağlandı.\n");

  const openai = new OpenAI({ apiKey });

  let toplamEklendi = 0;
  let toplamAtlandi = 0;
  let toplamHata = 0;
  const hatalar: string[] = [];

  // ── Her dosya için ────────────────────────────────────────────────────────

  for (const dosyaYolu of dosyaYollari) {
    const tamYol = existsSync(dosyaYolu)
      ? dosyaYolu
      : resolve(process.cwd(), "..", dosyaYolu);

    if (!existsSync(tamYol)) {
      const hata = `Dosya bulunamadı: ${tamYol}`;
      console.error(`✗ ${hata}`);
      hatalar.push(hata);
      continue;
    }

    console.log(`📄 Dosya: ${dosyaYolu}`);

    // DOCX'ten metin çıkar
    let metin: string;
    try {
      metin = await docxMetniCikar(tamYol);
    } catch (hata: unknown) {
      const mesaj = hata instanceof Error ? hata.message : String(hata);
      console.error(`  ✗ DOCX okunamadı: ${mesaj}`);
      hatalar.push(`${dosyaYolu}: DOCX okuma hatası — ${mesaj}`);
      continue;
    }

    // Bölümlere ayır — hem "---" çizgilerini hem de "Başlık:" ile başlayan yeni bölümleri destekle
    let bolumler: string[];
    if (AYIRICI_REGEX.test(metin)) {
      // Dosyada "---" ayırıcı var — standart bölme
      bolumler = metin
        .split(/\n(?=-{10,})|(?<=-{10,})\n/)
        .flatMap((b) => b.split(AYIRICI_REGEX))
        .map((b) => b.trim())
        .filter(Boolean);
    } else {
      // Ayırıcı yok — her "Başlık:" ile yeni bölüm başlar
      bolumler = metin
        .split(/\n(?=Başlık:\s)/)
        .map((b) => b.trim())
        .filter(Boolean);
    }

    console.log(`  📦 Toplam bölüm: ${bolumler.length}`);

    // Ayrıştır
    const kayitlar: BilgiBolumu[] = [];
    let atlananBolum = 0;

    for (const bolum of bolumler) {
      const kayit = bolumAyristir(bolum);
      if (kayit) {
        kayitlar.push(kayit);
      } else {
        atlananBolum++;
      }
    }

    console.log(`  ✓ Geçerli kayıt: ${kayitlar.length}`);
    if (atlananBolum > 0) {
      console.log(`  ⚠ Başlıksız/boş bölüm atlandı: ${atlananBolum}`);
    }

    // DB'ye ekle
    let dosyaEklendi = 0;
    let dosyaAtlandi = 0;

    for (const kayit of kayitlar) {
      try {
        const mevcutSonuc = await client.query<{ id: string }>(
          "SELECT id FROM bba_knowledge_base WHERE title = $1 AND source = $2 LIMIT 1",
          [kayit.title, kayit.source]
        );

        if (mevcutSonuc.rows.length > 0) {
          console.log(`    ↩ Zaten var, atlandı: "${kayit.title}"`);
          dosyaAtlandi++;
          continue;
        }

        const insertSonuc = await client.query<{ id: string }>(
          `INSERT INTO bba_knowledge_base (title, tags, content, source, source_url)
           VALUES ($1, $2, $3, $4, $5)
           RETURNING id`,
          [kayit.title, kayit.tags, kayit.content, kayit.source, kayit.source_url]
        );

        // Embedding oluştur
        const girdi = embeddingGirdisi(kayit.title, kayit.tags, kayit.content);
        const yanit = await openai.embeddings.create({
          model: "text-embedding-3-small",
          input: girdi,
          encoding_format: "float",
        });
        const vektor = yanit.data[0]!.embedding;
        const insertedId = insertSonuc.rows[0]!.id;

        await client.query(
          "UPDATE bba_knowledge_base SET embedding = $1 WHERE id = $2",
          [`[${vektor.join(",")}]`, insertedId]
        );

        console.log(`    ✓ Eklendi + embedding: "${kayit.title}"`);
        dosyaEklendi++;

        // Rate limit
        await bekle(50);
      } catch (hata: unknown) {
        const mesaj = hata instanceof Error ? hata.message : String(hata);
        console.error(`    ✗ "${kayit.title}" — ${mesaj}`);
        hatalar.push(`"${kayit.title}": ${mesaj}`);
        toplamHata++;
      }
    }

    toplamEklendi += dosyaEklendi;
    toplamAtlandi += dosyaAtlandi;

    console.log(
      `  → Dosya özeti: ${dosyaEklendi} eklendi, ${dosyaAtlandi} zaten vardı\n`
    );
  }

  await client.end();

  // ── Genel özet ────────────────────────────────────────────────────────────

  console.log("══════════════════════════════════════════════════════════════");
  console.log(`  Toplam eklendi   : ${toplamEklendi}`);
  console.log(`  Zaten vardı      : ${toplamAtlandi}`);
  console.log(`  Hata             : ${toplamHata}`);
  console.log("══════════════════════════════════════════════════════════════");

  if (hatalar.length > 0) {
    console.log("\nHata listesi:");
    hatalar.forEach((h) => console.error(`  ✗ ${h}`));
  }
}

ana().catch((hata) => {
  console.error("Beklenmeyen hata:", hata.message ?? hata);
  process.exit(1);
});
