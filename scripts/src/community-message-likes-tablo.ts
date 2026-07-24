import { Client } from "pg";

async function tabloOlustur() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  console.log("Veritabanına bağlandı.");

  await client.query(`
    CREATE TABLE IF NOT EXISTS community_message_likes (
      id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      message_id uuid NOT NULL,
      user_id    uuid NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT community_message_likes_unique UNIQUE (message_id, user_id)
    );
  `);
  console.log("✓ community_message_likes tablosu oluşturuldu.");
  console.log("  → (message_id, user_id) çifti benzersiz: ikinci beğeni engellendi.");

  await client.end();
}

tabloOlustur().catch((hata) => {
  console.error("Hata:", hata.message);
  process.exit(1);
});
