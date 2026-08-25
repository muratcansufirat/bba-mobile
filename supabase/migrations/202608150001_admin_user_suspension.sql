begin;

create table if not exists public.admin_user_access_events (
  id bigint generated always as identity primary key,
  target_auth_user_id uuid not null references auth.users(id) on delete cascade,
  actor_auth_user_id uuid not null references auth.users(id) on delete restrict,
  action text not null check (action in ('suspended', 'reactivated')),
  reason text,
  created_at timestamptz not null default now(),
  constraint admin_user_access_events_reason_length check (reason is null or char_length(reason) <= 500)
);

create index if not exists admin_user_access_events_target_created_idx
  on public.admin_user_access_events (target_auth_user_id, created_at desc);

alter table public.admin_user_access_events enable row level security;
alter table public.admin_user_access_events force row level security;
revoke all on table public.admin_user_access_events from anon, authenticated;
revoke all on sequence public.admin_user_access_events_id_seq from anon, authenticated;

comment on table public.admin_user_access_events is
  'Backend-only audit trail for administrator user suspension and reactivation actions.';

commit;
