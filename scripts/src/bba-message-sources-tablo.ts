import { Client } from "pg";

async function tabloOlustur() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  console.log("Veritabanına bağlandı.");

  await client.query(`
    CREATE TABLE IF NOT EXISTS bba_message_sources (
      id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      message_id       uuid,
      source_type      text,
      source_title     text,
      source_url       text,
      source_reference text,
      created_at       timestamptz NOT NULL DEFAULT now()
    );
  `);
  console.log("✓ bba_message_sources tablosu oluşturuldu.");

  await client.end();
}

tabloOlustur().catch((hata) => {
  console.error("Hata:", hata.message);
  process.exit(1);
});
