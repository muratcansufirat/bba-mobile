import pg from "pg";

const connectionString = process.env.SUPABASE_DB_URL;
if (!connectionString) throw new Error("SUPABASE_DB_URL tanımlı değil.");

const client = new pg.Client({ connectionString });
try {
  await client.connect();
  const result = await client.query(`
    select c.relname,
           c.relrowsecurity,
           c.relforcerowsecurity,
           has_table_privilege('anon', format('public.%I', c.relname), 'select') as anon_select,
           has_table_privilege('authenticated', format('public.%I', c.relname), 'select') as authenticated_select
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public'
       and c.relname in ('admin_user_access_events', 'admin_memory_access_events')
     order by c.relname
  `);
  console.log(JSON.stringify(result.rows));
} finally {
  await client.end();
}
