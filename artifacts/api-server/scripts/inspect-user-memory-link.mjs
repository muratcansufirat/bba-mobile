import pg from "pg";

const connectionString = process.env.SUPABASE_DB_URL;
if (!connectionString) throw new Error("SUPABASE_DB_URL tanımlı değil.");
const email = process.argv[2]?.trim().toLowerCase();
if (!email) throw new Error("E-posta gerekli.");

const client = new pg.Client({ connectionString });
try {
  await client.connect();
  const result = await client.query(`
    select
      count(*) filter (where um.user_id = pu.id and um.is_active = true)::int as public_id_active,
      count(*) filter (where um.user_id = pu.id and um.is_active = false)::int as public_id_inactive,
      count(*) filter (where um.user_id = au.id and um.is_active = true)::int as auth_id_active,
      count(*) filter (where um.user_id = au.id and um.is_active = false)::int as auth_id_inactive,
      (pu.id = au.id) as profile_id_matches_auth_id
    from auth.users au
    left join public.users pu on pu.auth_user_id = au.id
    left join public.bba_user_memories um on um.user_id in (pu.id, au.id)
    where lower(au.email) = $1
    group by pu.id, au.id
  `, [email]);
  console.log(JSON.stringify(result.rows[0] ?? null));
} finally {
  await client.end();
}
