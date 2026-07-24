import { Client } from "pg";

async function kisitEkle() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  console.log("Veritabanına bağlandı.");

  await client.query(`
    ALTER TABLE bba_messages
      ADD CONSTRAINT bba_messages_sender_type_check
      CHECK (sender_type IN ('user', 'bba'));
  `);
  console.log("✓ sender_type CHECK kısıtı eklendi: yalnızca 'user' ve 'bba' kabul edilir.");

  await client.end();
}

kisitEkle().catch((hata) => {
  console.error("Hata:", hata.message);
  process.exit(1);
});
