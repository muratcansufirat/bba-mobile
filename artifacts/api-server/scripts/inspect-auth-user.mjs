import pg from "pg";

const email = process.env.BBA_AUTH_EMAIL?.trim();
const connectionString = process.env.SUPABASE_DB_URL;

if (!email) throw new Error("BBA_AUTH_EMAIL tanımlı değil.");
if (!connectionString) throw new Error("SUPABASE_DB_URL tanımlı değil.");

const client = new pg.Client({ connectionString });
await client.connect();

try {
  const result = await client.query(
    `select
       id is not null as exists,
       email_confirmed_at is not null as email_confirmed,
       encrypted_password is not null and encrypted_password <> '' as password_configured,
       coalesce(raw_app_meta_data -> 'providers', '[]'::jsonb) as providers,
       banned_until is not null and banned_until > now() as banned,
       deleted_at is not null as deleted
     from auth.users
     where lower(email) = lower($1)
     limit 1`,
    [email],
  );

  console.log(JSON.stringify(result.rows[0] ?? { exists: false }));
} finally {
  await client.end();
}
