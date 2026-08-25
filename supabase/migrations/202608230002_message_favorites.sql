begin;

create table if not exists public.bba_message_favorites (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  message_id uuid not null references public.bba_messages(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint bba_message_favorites_user_message_unique unique (user_id, message_id)
);

create index if not exists bba_message_favorites_user_created_idx
  on public.bba_message_favorites (user_id, created_at desc);

alter table public.bba_message_favorites enable row level security;
alter table public.bba_message_favorites force row level security;

revoke all on table public.bba_message_favorites from anon;
grant select, insert, delete on table public.bba_message_favorites to authenticated;

drop policy if exists bba_message_favorites_select_own on public.bba_message_favorites;
create policy bba_message_favorites_select_own
  on public.bba_message_favorites
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.users u
      where u.id = bba_message_favorites.user_id
        and u.auth_user_id = auth.uid()
    )
  );

drop policy if exists bba_message_favorites_insert_own_bba_message on public.bba_message_favorites;
create policy bba_message_favorites_insert_own_bba_message
  on public.bba_message_favorites
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.users u
      join public.bba_conversations c on c.user_id = u.id
      join public.bba_messages m on m.conversation_id = c.id
      where u.id = bba_message_favorites.user_id
        and u.auth_user_id = auth.uid()
        and m.id = message_id
        and m.sender_type = 'bba'
    )
  );

drop policy if exists bba_message_favorites_delete_own on public.bba_message_favorites;
create policy bba_message_favorites_delete_own
  on public.bba_message_favorites
  for delete
  to authenticated
  using (
    exists (
      select 1
      from public.users u
      where u.id = bba_message_favorites.user_id
        and u.auth_user_id = auth.uid()
    )
  );

comment on table public.bba_message_favorites is
  'User-owned favorite BBA messages. Rows are removed automatically with their message or user.';

commit;
