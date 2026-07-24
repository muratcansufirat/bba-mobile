import { Client } from "pg";

const tablolar = [
  "users",
  "bba_conversations",
  "bba_messages",
  "bba_message_sources",
  "community_rooms",
  "community_messages",
  "community_message_likes",
  "sessions",
  "announcements",
  "app_settings",
];

async function rlsAktif() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  console.log("Veritabanına bağlandı.");

  for (const tablo of tablolar) {
    await client.query(`ALTER TABLE "${tablo}" ENABLE ROW LEVEL SECURITY;`);
    console.log(`✓ ${tablo} — RLS aktif`);
  }

  await client.end();
  console.log("\nTüm tablolarda RLS etkinleştirildi.");
}

rlsAktif().catch((hata) => {
  console.error("Hata:", hata.message);
  process.exit(1);
});
