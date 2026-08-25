-- Bu dosya yalnızca yapısal doğrulama yapar; veri değiştirmez.

select
  c.relname as table_name,
  c.relrowsecurity as rls_enabled,
  c.relforcerowsecurity as rls_forced
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in ('bba_message_favorites', 'bba_user_notes')
order by c.relname;

select
  tablename,
  policyname,
  cmd,
  roles,
  qual,
  with_check
from pg_policies
where schemaname = 'public'
  and tablename in ('bba_message_favorites', 'bba_user_notes')
order by tablename, cmd, policyname;

select
  table_name,
  grantee,
  string_agg(privilege_type, ', ' order by privilege_type) as privileges
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name in ('bba_message_favorites', 'bba_user_notes')
  and grantee in ('anon', 'authenticated', 'PUBLIC')
group by table_name, grantee
order by table_name, grantee;

select
  conrelid::regclass as table_name,
  conname as constraint_name,
  pg_get_constraintdef(oid) as definition
from pg_constraint
where contype = 'f'
  and conrelid in (
    'public.bba_message_favorites'::regclass,
    'public.bba_user_notes'::regclass
  )
order by conrelid::regclass::text, conname;
