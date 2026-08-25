select
  c.relrowsecurity as rls_enabled,
  c.relforcerowsecurity as rls_forced,
  has_table_privilege('anon', 'public.admin_users', 'select') as anon_can_select,
  has_table_privilege('authenticated', 'public.admin_users', 'select') as authenticated_can_select,
  has_table_privilege('authenticated', 'public.admin_users', 'insert') as authenticated_can_insert,
  has_table_privilege('authenticated', 'public.admin_users', 'update') as authenticated_can_update,
  has_table_privilege('authenticated', 'public.admin_users', 'delete') as authenticated_can_delete
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname = 'admin_users';
