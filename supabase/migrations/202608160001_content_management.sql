begin;

alter table public.bba_knowledge_base
  add column if not exists is_active boolean not null default true,
  add column if not exists deleted_at timestamptz;

create index if not exists bba_knowledge_base_active_updated_idx
  on public.bba_knowledge_base (is_active, updated_at desc)
  where deleted_at is null;

create table if not exists public.admin_content_events (
  id bigint generated always as identity primary key,
  knowledge_id uuid not null,
  actor_auth_user_id uuid not null references auth.users(id) on delete restrict,
  action text not null check (action in ('updated', 'activated', 'deactivated', 'deleted')),
  before_state jsonb,
  after_state jsonb,
  created_at timestamptz not null default now()
);

create index if not exists admin_content_events_knowledge_created_idx
  on public.admin_content_events (knowledge_id, created_at desc);

alter table public.admin_content_events enable row level security;
alter table public.admin_content_events force row level security;
revoke all on table public.admin_content_events from anon, authenticated;
revoke all on sequence public.admin_content_events_id_seq from anon, authenticated;

comment on column public.bba_knowledge_base.is_active is
  'Controls whether this knowledge chunk can participate in RAG retrieval.';
comment on column public.bba_knowledge_base.deleted_at is
  'Recoverable soft-delete timestamp; deleted rows are excluded from RAG and admin default lists.';
comment on table public.admin_content_events is
  'Backend-only audit trail for administrator changes to knowledge-base content.';

commit;
