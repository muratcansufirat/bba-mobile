import pg from "pg";

const connectionString = process.env["SUPABASE_DB_URL"];
if (!connectionString) throw new Error("SUPABASE_DB_URL tanımlı değil.");

const pool = new pg.Pool({ connectionString, max: 1 });
const client = await pool.connect();

try {
  const protectedTables = [
    "admin_users",
    "admin_user_access_events",
    "admin_memory_access_events",
    "admin_content_events",
    "api_usage_metrics",
    "admin_audit_logs",
  ];
  const catalog = await client.query(`
    select c.relname as table_name,
           c.relrowsecurity as rls_enabled,
           c.relforcerowsecurity as rls_forced,
           has_table_privilege('anon', format('public.%I', c.relname), 'select') as anon_select,
           has_table_privilege('authenticated', format('public.%I', c.relname), 'select') as authenticated_select,
           (select count(*)::int
              from pg_policies
             where schemaname = 'public'
               and tablename = c.relname) as policy_count
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public'
       and c.relname = any($1::text[])
     order by c.relname
  `, [protectedTables]);
  console.log(JSON.stringify(catalog.rows));

  const actorRoleConstraint = await client.query(`
    select pg_get_constraintdef(c.oid) as definition
      from pg_constraint c
      join pg_class t on t.oid = c.conrelid
      join pg_namespace n on n.oid = t.relnamespace
     where n.nspname = 'public'
       and t.relname = 'admin_audit_logs'
       and c.conname = 'admin_audit_logs_actor_role_check'
  `);
  const constraintDefinition = actorRoleConstraint.rows[0]?.definition ?? "";
  console.log(`AUDIT_UNKNOWN_ROLE=${constraintDefinition.includes("unknown") ? "ALLOWED" : "MISSING"}`);

  const roleCounts = await client.query(`
    select role, count(*)::int as account_count
      from public.admin_users
     where is_active = true
     group by role
     order by role
  `);
  console.log(`ACTIVE_ADMIN_ROLES=${JSON.stringify(roleCounts.rows)}`);

  const readAuditCounts = await client.query(`
    select action, count(*)::int as event_count
      from public.admin_audit_logs
     where action in ('admin.session.view', 'admin.roles.view', 'analytics.view', 'content.list', 'users.list', 'user.view', 'audit.list')
     group by action
     order by action
  `);
  console.log(`READ_AUDIT_EVENTS=${JSON.stringify(readAuditCounts.rows)}`);

  for (const role of ["anon", "authenticated"]) {
    await client.query("begin");
    try {
      await client.query(`set local role ${role}`);
      await client.query("select count(*) from public.admin_audit_logs");
      console.log(`${role.toUpperCase()}_DIRECT_READ=ALLOWED`);
    } catch {
      console.log(`${role.toUpperCase()}_DIRECT_READ=DENIED`);
    } finally {
      await client.query("rollback");
    }
  }
} finally {
  client.release();
  await pool.end();
}
