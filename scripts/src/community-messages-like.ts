import { Client } from "pg";

async function sutunEkle() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  console.log("Veritabanına bağlandı.");

  await client.query(`
    ALTER TABLE community_messages
      ADD COLUMN IF NOT EXISTS like_count integer NOT NULL DEFAULT 0
        CONSTRAINT community_messages_like_count_non_negative CHECK (like_count >= 0);
  `);
  console.log("✓ like_count sütunu eklendi (varsayılan 0, negatif kabul etmez).");

  await client.end();
}

sutunEkle().catch((hata) => {
  console.error("Hata:", hata.message);
  process.exit(1);
});
