import { Client } from "pg";

const tablolar = [
  "users",
  "community_rooms",
  "community_messages",
  "bba_conversations",
  "bba_messages",
  "sessions",
  "announcements",
  "app_settings",
];

async function tablolarOlustur() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  console.log("Veritabanına bağlandı.");

  for (const tablo of tablolar) {
    await client.query(
      `CREATE TABLE IF NOT EXISTS "${tablo}" (id uuid PRIMARY KEY DEFAULT gen_random_uuid());`
    );
    console.log(`✓ ${tablo} tablosu oluşturuldu.`);
  }

  await client.end();
  console.log("\nTüm tablolar başarıyla oluşturuldu.");
}

tablolarOlustur().catch((hata) => {
  console.error("Hata:", hata.message);
  process.exit(1);
});
