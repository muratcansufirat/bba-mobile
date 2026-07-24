import { Client } from "pg";

async function kur() {
  const client = new Client({ connectionString: process.env.SUPABASE_DB_URL });
  await client.connect();
  console.log("Supabase veritabanına bağlandı.\n");

  // ── 1. TABLOLAR ──────────────────────────────────────────────────────────

  await client.query(`
    CREATE TABLE IF NOT EXISTS users (
      id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      auth_user_id  uuid UNIQUE NOT NULL,
      nickname      text,
      created_at    timestamptz NOT NULL DEFAULT now()
    );
  `);
  console.log("✓ users tablosu");

  await client.query(`
    CREATE TABLE IF NOT EXISTS bba_conversations (
      id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id    uuid NOT NULL REFERENCES users(id),
      baslik     text,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
  `);
  console.log("✓ bba_conversations tablosu");

  await client.query(`
    CREATE TABLE IF NOT EXISTS bba_messages (
      id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      conversation_id uuid NOT NULL REFERENCES bba_conversations(id),
      sender_type     text NOT NULL CHECK (sender_type IN ('user','bba')),
      icerik          text NOT NULL,
      created_at      timestamptz NOT NULL DEFAULT now()
    );
  `);
  console.log("✓ bba_messages tablosu");

  await client.query(`
    CREATE TABLE IF NOT EXISTS bba_message_sources (
      id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      message_id uuid NOT NULL REFERENCES bba_messages(id),
      kaynak_url text,
      baslik     text,
      created_at timestamptz NOT NULL DEFAULT now()
    );
  `);
  console.log("✓ bba_message_sources tablosu");

  await client.query(`
    CREATE TABLE IF NOT EXISTS community_rooms (
      id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      ad          text NOT NULL,
      aciklama    text,
      created_at  timestamptz NOT NULL DEFAULT now()
    );
  `);
  console.log("✓ community_rooms tablosu");

  await client.query(`
    CREATE TABLE IF NOT EXISTS community_messages (
      id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      room_id    uuid NOT NULL REFERENCES community_rooms(id),
      user_id    uuid NOT NULL REFERENCES users(id),
      icerik     text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    );
  `);
  console.log("✓ community_messages tablosu");

  await client.query(`
    CREATE TABLE IF NOT EXISTS community_message_likes (
      id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      message_id uuid NOT NULL REFERENCES community_messages(id),
      user_id    uuid NOT NULL REFERENCES users(id),
      created_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (message_id, user_id)
    );
  `);
  console.log("✓ community_message_likes tablosu");

  await client.query(`
    CREATE TABLE IF NOT EXISTS sessions (
      id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id     uuid NOT NULL REFERENCES users(id),
      baslik      text,
      baslangic   timestamptz,
      bitis       timestamptz,
      created_at  timestamptz NOT NULL DEFAULT now()
    );
  `);
  console.log("✓ sessions tablosu");

  await client.query(`
    CREATE TABLE IF NOT EXISTS announcements (
      id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      baslik      text NOT NULL,
      icerik      text,
      yayin_tarihi timestamptz,
      created_at  timestamptz NOT NULL DEFAULT now()
    );
  `);
  console.log("✓ announcements tablosu");

  await client.query(`
    CREATE TABLE IF NOT EXISTS app_settings (
      id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      setting_key  text NOT NULL UNIQUE,
      setting_value text,
      created_at   timestamptz NOT NULL DEFAULT now()
    );
  `);
  console.log("✓ app_settings tablosu");

  // ── 2. RLS ETKİNLEŞTİR ───────────────────────────────────────────────────

  const tablolar = [
    "users", "bba_conversations", "bba_messages", "bba_message_sources",
    "community_rooms", "community_messages", "community_message_likes",
    "sessions", "announcements", "app_settings",
  ];
  for (const t of tablolar) {
    await client.query(`ALTER TABLE ${t} ENABLE ROW LEVEL SECURITY;`);
  }
  console.log("\n✓ Tüm tablolarda RLS etkinleştirildi");

  // ── 3. USERS POLICY'LERİ ─────────────────────────────────────────────────

  await client.query(`DROP POLICY IF EXISTS users_kendi_okuma    ON users;`);
  await client.query(`DROP POLICY IF EXISTS users_kendi_guncelle ON users;`);

  await client.query(`
    CREATE POLICY users_kendi_okuma
      ON users
      FOR SELECT
      USING (auth_user_id = auth.uid());
  `);
  console.log("✓ users — SELECT policy (yalnızca kendi kaydı)");

  await client.query(`
    CREATE POLICY users_kendi_guncelle
      ON users
      FOR UPDATE
      USING     (auth_user_id = auth.uid())
      WITH CHECK (auth_user_id = auth.uid());
  `);
  console.log("✓ users — UPDATE policy (yalnızca kendi kaydı)");

  await client.end();
  console.log("\nKurulum tamamlandı.");
}

kur().catch((hata) => {
  console.error("Hata:", hata.message);
  process.exit(1);
});
