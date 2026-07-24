import { Client } from "pg";

async function sutunEkle() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  console.log("Veritabanına bağlandı.");

  await client.query(`
    ALTER TABLE community_messages
      ADD COLUMN IF NOT EXISTS reply_to_message_id uuid DEFAULT NULL;
  `);
  console.log("✓ reply_to_message_id sütunu eklendi (nullable).");

  await client.end();
}

sutunEkle().catch((hata) => {
  console.error("Hata:", hata.message);
  process.exit(1);
});
