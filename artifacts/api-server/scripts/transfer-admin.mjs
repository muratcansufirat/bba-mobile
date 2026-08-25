import pg from "pg";

const previousEmail = process.env.BBA_PREVIOUS_ADMIN_EMAIL?.trim();
const nextEmail = process.env.BBA_NEXT_ADMIN_EMAIL?.trim();
const connectionString = process.env.SUPABASE_DB_URL;

if (!previousEmail || !nextEmail) throw new Error("Admin e-posta değişkenleri eksik.");
if (!connectionString) throw new Error("SUPABASE_DB_URL tanımlı değil.");

const client = new pg.Client({ connectionString });
await client.connect();

try {
  await client.query("begin");

  const nextUserResult = await client.query(
    "select id from auth.users where lower(email) = lower($1) limit 1",
    [nextEmail],
  );
  const nextUser = nextUserResult.rows[0];
  if (!nextUser) throw new Error("Yeni admin e-postasıyla kayıtlı uygulama kullanıcısı bulunamadı.");

  await client.query(
    `update public.admin_users
        set is_active = false, updated_at = now()
      where auth_user_id in (
        select id from auth.users where lower(email) = lower($1)
      )`,
    [previousEmail],
  );

  await client.query(
    `insert into public.admin_users (auth_user_id, role, is_active)
     values ($1, 'admin', true)
     on conflict (auth_user_id) do update
       set role = 'admin', is_active = true, updated_at = now()`,
    [nextUser.id],
  );

  await client.query("commit");
  console.log("Admin yetkisi güvenli biçimde aktarıldı.");
} catch (error) {
  await client.query("rollback");
  throw error;
} finally {
  await client.end();
}
