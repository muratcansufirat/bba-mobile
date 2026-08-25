begin;

-- Favoriler ve notlar yalnızca oturum açmış kayıt sahibine açıktır.
-- Service role, Supabase'in RLS bypass davranışıyla backend işlemlerini sürdürebilir.
alter table public.bba_message_favorites enable row level security;
alter table public.bba_message_favorites force row level security;
alter table public.bba_user_notes enable row level security;
alter table public.bba_user_notes force row level security;

revoke all on table public.bba_message_favorites from public, anon, authenticated;
revoke all on table public.bba_user_notes from public, anon, authenticated;

grant select, insert, delete on table public.bba_message_favorites to authenticated;
grant select, insert, update, delete on table public.bba_user_notes to authenticated;

-- Bu iki kullanıcı tablosunda daha önce kalmış olabilecek gevşek politikaları kaldır.
do $migration$
declare
  policy_record record;
begin
  for policy_record in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename in ('bba_message_favorites', 'bba_user_notes')
  loop
    execute format(
      'drop policy if exists %I on %I.%I',
      policy_record.policyname,
      policy_record.schemaname,
      policy_record.tablename
    );
  end loop;
end
$migration$;

create policy bba_message_favorites_select_own
  on public.bba_message_favorites
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.users u
      where u.id = bba_message_favorites.user_id
        and u.auth_user_id = (select auth.uid())
    )
  );

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
        and u.auth_user_id = (select auth.uid())
        and m.id = bba_message_favorites.message_id
        and m.sender_type = 'bba'
    )
  );

create policy bba_message_favorites_delete_own
  on public.bba_message_favorites
  for delete
  to authenticated
  using (
    exists (
      select 1
      from public.users u
      where u.id = bba_message_favorites.user_id
        and u.auth_user_id = (select auth.uid())
    )
  );

create policy bba_user_notes_select_own
  on public.bba_user_notes
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.users u
      where u.id = bba_user_notes.user_id
        and u.auth_user_id = (select auth.uid())
    )
  );

create policy bba_user_notes_insert_own
  on public.bba_user_notes
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.users u
      where u.id = bba_user_notes.user_id
        and u.auth_user_id = (select auth.uid())
    )
  );

create policy bba_user_notes_update_own
  on public.bba_user_notes
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.users u
      where u.id = bba_user_notes.user_id
        and u.auth_user_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1
      from public.users u
      where u.id = bba_user_notes.user_id
        and u.auth_user_id = (select auth.uid())
    )
  );

create policy bba_user_notes_delete_own
  on public.bba_user_notes
  for delete
  to authenticated
  using (
    exists (
      select 1
      from public.users u
      where u.id = bba_user_notes.user_id
        and u.auth_user_id = (select auth.uid())
    )
  );

commit;
