import { Client } from "pg";

async function sutunEkle() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  console.log("Veritabanına bağlandı.");

  await client.query(`
    ALTER TABLE app_settings
      ADD COLUMN IF NOT EXISTS setting_key   text UNIQUE NOT NULL DEFAULT '',
      ADD COLUMN IF NOT EXISTS setting_value text,
      ADD COLUMN IF NOT EXISTS description   text,
      ADD COLUMN IF NOT EXISTS created_at    timestamptz NOT NULL DEFAULT now(),
      ADD COLUMN IF NOT EXISTS updated_at    timestamptz NOT NULL DEFAULT now();
  `);
  console.log("✓ app_settings tablosuna sütunlar eklendi.");

  await client.end();
}

sutunEkle().catch((hata) => {
  console.error("Hata:", hata.message);
  process.exit(1);
});
