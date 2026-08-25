begin;

create index if not exists admin_users_active_role_idx
  on public.admin_users (role, auth_user_id)
  where is_active = true;

comment on column public.admin_users.role is
  'Yönetim rolü: admin, editor veya support. Normal uygulama kullanıcıları bu tabloda yer almaz.';

comment on column public.admin_users.is_active is
  'False olduğunda yönetim erişimi anında reddedilir; yetki kaydı denetim için korunur.';

commit;
