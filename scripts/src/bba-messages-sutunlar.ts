import { Client } from "pg";

async function sutunEkle() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  console.log("Veritabanına bağlandı.");

  await client.query(`
    ALTER TABLE bba_messages
      ADD COLUMN IF NOT EXISTS conversation_id uuid,
      ADD COLUMN IF NOT EXISTS sender_type    text,
      ADD COLUMN IF NOT EXISTS message        text,
      ADD COLUMN IF NOT EXISTS source_count   integer NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS created_at     timestamptz NOT NULL DEFAULT now();
  `);
  console.log("✓ bba_messages tablosuna sütunlar eklendi.");

  await client.end();
}

sutunEkle().catch((hata) => {
  console.error("Hata:", hata.message);
  process.exit(1);
});
