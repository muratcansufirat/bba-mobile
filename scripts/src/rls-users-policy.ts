import { Client } from "pg";

async function policyOlustur() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  console.log("Veritabanına bağlandı.");

  // Önce mevcut policy'leri temizle (idempotent çalışması için)
  await client.query(`DROP POLICY IF EXISTS users_kendi_okuma   ON users;`);
  await client.query(`DROP POLICY IF EXISTS users_kendi_guncelle ON users;`);

  // SELECT: yalnızca kendi kaydını okuyabilir
  await client.query(`
    CREATE POLICY users_kendi_okuma
      ON users
      FOR SELECT
      USING (auth_user_id = auth.uid());
  `);
  console.log("✓ users_kendi_okuma policy oluşturuldu (SELECT)");

  // UPDATE: yalnızca kendi kaydındaki nickname alanını güncelleyebilir
  await client.query(`
    CREATE POLICY users_kendi_guncelle
      ON users
      FOR UPDATE
      USING (auth_user_id = auth.uid())
      WITH CHECK (auth_user_id = auth.uid());
  `);
  console.log("✓ users_kendi_guncelle policy oluşturuldu (UPDATE)");

  await client.end();
  console.log("\nusers tablosu RLS policy'leri oluşturuldu.");
}

policyOlustur().catch((hata) => {
  console.error("Hata:", hata.message);
  process.exit(1);
});
