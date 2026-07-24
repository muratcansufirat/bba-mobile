import OpenAI from "openai";
import pg from "pg";
const { Pool } = pg;

const openai = new OpenAI({ apiKey: process.env["OPENAI_API_KEY"] });

const conn = (process.env["SUPABASE_DB_URL"] ?? "")
  .replace(/[?&]pgbouncer=[^&]*/g, "")
  .replace(/\?&/, "?")
  .replace(/\?$/, "");

const pool = new Pool({ connectionString: conn, max: 2 });

const sorular = [
  "Koşulsuz sevgi nedir ve nasıl uygulanır?",
  "Suyun hafızası ve frekanslarla ilişkisi nedir?",
  "Düalite nedir? Tekamülde nasıl bir rol oynar?",
  "Antidepresan kullanımının ruhsal boyutu nedir?",
  "Namazın beden ve ruh üzerindeki etkileri nelerdir?",
];

async function main() {
  for (const soru of sorular) {
    const resp = await openai.embeddings.create({
      model: "text-embedding-3-small",
      input: soru.trim(),
      encoding_format: "float",
    });
    const vec = `[${resp.data[0].embedding.join(",")}]`;

    const { rows } = await pool.query<{ title: string; sim: number }>(
      `SELECT title,
              ROUND((1 - (embedding <=> $1::vector))::numeric, 4)::float AS sim
       FROM bba_knowledge_base
       WHERE embedding IS NOT NULL
       ORDER BY embedding <=> $1::vector ASC
       LIMIT 5`,
      [vec]
    );

    const en_yuksek = rows[0]?.sim ?? 0;
    const eslesen = rows.find((r) =>
      r.title.toLowerCase().includes(
        soru.toLowerCase().split(" ").slice(0, 2).join(" ")
      )
    );
    console.log(`\n"${soru}"`);
    console.log(`  En yüksek sim: ${en_yuksek} | Eşleşen: ${eslesen?.title ?? "—"}`);
    rows.forEach((r) => console.log(`    ${r.sim} ${r.title}`));
  }

  await pool.end();
}

await main();

// Boyut ve sıfır vektör testi
async function boyutTest() {
  const sorular2 = [
    "Koşulsuz sevgi nedir ve nasıl uygulanır?",
    "Suyun hafızası ve frekanslarla ilişkisi nedir?",
    "Karma nedir?",  // Bu çalışıyordu
  ];
  console.log("\n=== EMBEDDİNG BOYUT TEST ===");
  for (const s of sorular2) {
    const r = await openai.embeddings.create({ model: "text-embedding-3-small", input: s.trim(), encoding_format: "float" });
    const emb = r.data[0].embedding;
    const sifirSayisi = emb.filter(x => x === 0).length;
    const max = Math.max(...emb.slice(0, 100));
    const min = Math.min(...emb.slice(0, 100));
    console.log(`"${s.slice(0,35)}" → boyut:${emb.length} sıfır:${sifirSayisi} max:${max.toFixed(4)} min:${min.toFixed(4)}`);
  }
}

await boyutTest();
pool.end();
