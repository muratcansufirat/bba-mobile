import pg from "pg";

const email = process.env.BBA_ADMIN_EMAIL?.trim();
const connectionString = process.env.SUPABASE_DB_URL;

if (!email) throw new Error("BBA_ADMIN_EMAIL tanımlı değil.");
if (!connectionString) throw new Error("SUPABASE_DB_URL tanımlı değil.");

const client = new pg.Client({ connectionString });
await client.connect();

try {
  await client.query("begin");

  const userResult = await client.query(
    "select id from auth.users where lower(email) = lower($1) limit 1",
    [email],
  );
  const user = userResult.rows[0];
  if (!user) throw new Error("Bu e-posta ile kayıtlı Supabase kullanıcısı bulunamadı.");

  await client.query(
    `insert into public.admin_users (auth_user_id, role, is_active)
     values ($1, 'admin', true)
     on conflict (auth_user_id) do update
       set role = 'admin', is_active = true, updated_at = now()`,
    [user.id],
  );

  await client.query("commit");
  console.log("Admin yetkisi başarıyla etkinleştirildi.");
} catch (error) {
  await client.query("rollback");
  throw error;
} finally {
  await client.end();
}
