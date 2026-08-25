begin;

create table if not exists public.admin_users (
  auth_user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'admin' check (role in ('admin', 'editor', 'support')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.admin_users enable row level security;
alter table public.admin_users force row level security;

revoke all on table public.admin_users from anon, authenticated;

comment on table public.admin_users is
  'Yönetim paneli yetkileri. Kayıtlar yalnızca güvenilir backend/veritabanı yönetimi üzerinden değiştirilir.';

commit;
