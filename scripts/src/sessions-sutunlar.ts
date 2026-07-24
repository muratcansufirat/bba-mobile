import { Client } from "pg";

async function sutunEkle() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  console.log("Veritabanına bağlandı.");

  await client.query(`
    ALTER TABLE sessions
      ADD COLUMN IF NOT EXISTS title       text,
      ADD COLUMN IF NOT EXISTS description text,
      ADD COLUMN IF NOT EXISTS is_active   boolean NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS created_at  timestamptz NOT NULL DEFAULT now(),
      ADD COLUMN IF NOT EXISTS updated_at  timestamptz NOT NULL DEFAULT now();
  `);
  console.log("✓ sessions tablosuna sütunlar eklendi.");

  await client.end();
}

sutunEkle().catch((hata) => {
  console.error("Hata:", hata.message);
  process.exit(1);
});
