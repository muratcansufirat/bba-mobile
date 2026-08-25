select
  role,
  count(*) filter (where is_active) as active_count,
  count(*) filter (where not is_active) as inactive_count
from public.admin_users
group by role
order by role;

select count(*) as invalid_role_count
from public.admin_users
where role not in ('admin', 'editor', 'support');
