begin;

create table if not exists public.admin_audit_logs (
  id bigint generated always as identity primary key,
  actor_auth_user_id uuid references auth.users(id) on delete set null,
  actor_role text not null check (actor_role in ('admin', 'editor', 'support')),
  action text not null check (char_length(action) between 3 and 100),
  target_type text not null check (char_length(target_type) between 2 and 50),
  target_id text,
  result text not null check (result in ('success', 'failure')),
  error_code text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint admin_audit_logs_target_id_length check (target_id is null or char_length(target_id) <= 500),
  constraint admin_audit_logs_error_code_length check (error_code is null or char_length(error_code) <= 100),
  constraint admin_audit_logs_details_object check (jsonb_typeof(details) = 'object')
);

create index if not exists admin_audit_logs_created_idx
  on public.admin_audit_logs (created_at desc);
create index if not exists admin_audit_logs_actor_created_idx
  on public.admin_audit_logs (actor_auth_user_id, created_at desc);
create index if not exists admin_audit_logs_target_created_idx
  on public.admin_audit_logs (target_type, target_id, created_at desc);

alter table public.admin_audit_logs enable row level security;
alter table public.admin_audit_logs force row level security;
revoke all on table public.admin_audit_logs from anon, authenticated;
revoke all on sequence public.admin_audit_logs_id_seq from anon, authenticated;

comment on table public.admin_audit_logs is
  'Backend-only central audit ledger for important management-panel operations. Secrets and raw personal content must never be stored here.';

commit;
