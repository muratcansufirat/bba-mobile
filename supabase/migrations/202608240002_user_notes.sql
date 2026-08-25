begin;

create table if not exists public.bba_user_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  title text not null,
  content text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint bba_user_notes_title_length check (char_length(title) between 1 and 100),
  constraint bba_user_notes_content_length check (char_length(content) between 1 and 10000)
);

create index if not exists bba_user_notes_user_updated_idx
  on public.bba_user_notes (user_id, updated_at desc);

alter table public.bba_user_notes enable row level security;
alter table public.bba_user_notes force row level security;

revoke all on table public.bba_user_notes from anon;
grant select, insert, update, delete on table public.bba_user_notes to authenticated;

drop policy if exists bba_user_notes_select_own on public.bba_user_notes;
create policy bba_user_notes_select_own
  on public.bba_user_notes for select to authenticated
  using (
    exists (
      select 1 from public.users u
      where u.id = bba_user_notes.user_id
        and u.auth_user_id = auth.uid()
    )
  );

drop policy if exists bba_user_notes_insert_own on public.bba_user_notes;
create policy bba_user_notes_insert_own
  on public.bba_user_notes for insert to authenticated
  with check (
    exists (
      select 1 from public.users u
      where u.id = bba_user_notes.user_id
        and u.auth_user_id = auth.uid()
    )
  );

drop policy if exists bba_user_notes_update_own on public.bba_user_notes;
create policy bba_user_notes_update_own
  on public.bba_user_notes for update to authenticated
  using (
    exists (
      select 1 from public.users u
      where u.id = bba_user_notes.user_id
        and u.auth_user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.users u
      where u.id = bba_user_notes.user_id
        and u.auth_user_id = auth.uid()
    )
  );

drop policy if exists bba_user_notes_delete_own on public.bba_user_notes;
create policy bba_user_notes_delete_own
  on public.bba_user_notes for delete to authenticated
  using (
    exists (
      select 1 from public.users u
      where u.id = bba_user_notes.user_id
        and u.auth_user_id = auth.uid()
    )
  );

comment on table public.bba_user_notes is
  'Private, user-owned notebook entries protected by RLS.';

commit;
