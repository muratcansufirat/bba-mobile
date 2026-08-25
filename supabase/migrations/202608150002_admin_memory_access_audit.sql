begin;

create table if not exists public.admin_memory_access_events (
  id bigint generated always as identity primary key,
  target_auth_user_id uuid not null references auth.users(id) on delete cascade,
  actor_auth_user_id uuid not null references auth.users(id) on delete restrict,
  viewed_memory_count integer not null default 0 check (viewed_memory_count >= 0),
  created_at timestamptz not null default now()
);

create index if not exists admin_memory_access_events_target_created_idx
  on public.admin_memory_access_events (target_auth_user_id, created_at desc);

alter table public.admin_memory_access_events enable row level security;
alter table public.admin_memory_access_events force row level security;
revoke all on table public.admin_memory_access_events from anon, authenticated;
revoke all on sequence public.admin_memory_access_events_id_seq from anon, authenticated;

comment on table public.admin_memory_access_events is
  'Backend-only audit trail recording privileged administrator access to active user memories.';

commit;
