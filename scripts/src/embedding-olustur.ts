/**
 * BBA Embedding Oluşturma Scripti
 *
 * Kullanım:
 *   pnpm --filter @workspace/scripts run embedding-olustur
 *
 * - Yalnızca embedding alanı NULL olan kayıtları işler.
 * - OpenAI text-embedding-3-small modeli kullanılır (1536 boyut).
 * - Embedding girdisi: title + tags + content (source ve source_url dahil edilmez).
 * - Hata veren kayıtlar atlanır, süreç devam eder.
 * - API anahtarı yalnızca OPENAI_API_KEY ortam değişkeninden okunur.
 */

import { Client } from "pg";
import OpenAI from "openai";
import { resolve } from "path";

// ── Yardımcılar ───────────────────────────────────────────────────────────────

function temizleUrl(url: string): string {
  return url
    .replace(/[?&]pgbouncer=[^&]*/g, "")
    .replace(/\?&/, "?")
    .replace(/\?$/, "");
}

function embeddingGirdisiOlustur(
  title: string,
  tags: string[],
  content: string
): string {
  const tagsMetin = tags.length > 0 ? `Etiketler: ${tags.join(", ")}\n` : "";
  return `Başlık: ${title}\n${tagsMetin}İçerik:\n${content}`.trim();
}

// Saniyede en fazla 500 istek limiti için küçük gecikme
function bekle(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// ── Tipler ────────────────────────────────────────────────────────────────────

interface KnowledgeRow {
  id: string;
  title: string;
  tags: string[];
  content: string;
}

// ── Ana işlev ────────────────────────────────────────────────────────────────

async function ana() {
  // API anahtarı kontrolü
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error("Hata: OPENAI_API_KEY ortam değişkeni tanımlı değil.");
    console.error("API sunucusunun .env dosyasına OPENAI_API_KEY değerini ekleyin.");
    process.exit(1);
  }

  // OpenAI istemcisi
  const openai = new OpenAI({ apiKey });

  // Veritabanı bağlantısı
  const connString = process.env.SUPABASE_DB_URL ?? process.env.DATABASE_URL ?? "";
  if (!connString) {
    console.error("Hata: DATABASE_URL veya SUPABASE_DB_URL ortam değişkeni tanımlı değil.");
    process.exit(1);
  }

  const client = new Client({ connectionString: temizleUrl(connString) });
  await client.connect();
  console.log("🔌 Veritabanına bağlandı.");

  // Embedding'i boş olan kayıtları çek
  const { rows } = await client.query<KnowledgeRow>(
    `SELECT id, title, tags, content
     FROM bba_knowledge_base
     WHERE embedding IS NULL
     ORDER BY created_at ASC`
  );

  if (rows.length === 0) {
    console.log("✓ Tüm kayıtlar zaten işlenmiş. Yapılacak işlem yok.");
    await client.end();
    return;
  }

  console.log(`📦 Embedding oluşturulacak kayıt sayısı: ${rows.length}`);
  console.log(`🤖 Model: text-embedding-3-small (1536 boyut)\n`);

  let basarili = 0;
  let basarisiz = 0;

  for (const row of rows) {
    const girdi = embeddingGirdisiOlustur(row.title, row.tags, row.content);

    try {
      const yanit = await openai.embeddings.create({
        model: "text-embedding-3-small",
        input: girdi,
        encoding_format: "float",
      });

      const vektor = yanit.data[0].embedding;

      // pgvector formatı: [0.1, 0.2, ...] string olarak gönderilir
      await client.query(
        `UPDATE bba_knowledge_base SET embedding = $1 WHERE id = $2`,
        [`[${vektor.join(",")}]`, row.id]
      );

      console.log(`  ✓ "${row.title}"`);
      basarili++;
    } catch (hata: unknown) {
      const mesaj = hata instanceof Error ? hata.message : String(hata);
      console.error(`  ✗ "${row.title}" — Hata: ${mesaj}`);
      basarisiz++;
    }

    // Rate limit: çok hızlı gönderimi önle
    if (basarili + basarisiz < rows.length) {
      await bekle(200);
    }
  }

  await client.end();

  console.log("\n── Özet ───────────────────────────────────────────────────────");
  console.log(`  Başarılı  : ${basarili}`);
  console.log(`  Başarısız : ${basarisiz}`);
  console.log(`  Toplam    : ${rows.length}`);
  console.log("────────────────────────────────────────────────────────────────");
}

ana().catch((hata) => {
  console.error("Beklenmeyen hata:", hata.message);
  process.exit(1);
});
