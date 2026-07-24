import { Client } from "pg";

async function calistir() {
  const client = new Client({ connectionString: process.env.SUPABASE_DB_URL });
  await client.connect();
  console.log("Bağlandı.");

  await client.query(`DROP POLICY IF EXISTS users_kendi_ekle ON users;`);
  await client.query(`
    CREATE POLICY users_kendi_ekle
      ON users
      FOR INSERT
      WITH CHECK (auth_user_id = auth.uid());
  `);
  console.log("✓ users — INSERT policy eklendi");

  const res = await client.query(`
    SELECT column_name FROM information_schema.columns
    WHERE table_name='users' AND column_name='updated_at';
  `);
  if (res.rows.length === 0) {
    await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();`);
    console.log("✓ users — updated_at sütunu eklendi");
  } else {
    console.log("✓ users — updated_at zaten mevcut");
  }

  await client.end();
  console.log("Tamamlandı.");
}

calistir().catch((e) => { console.error(e.message); process.exit(1); });
