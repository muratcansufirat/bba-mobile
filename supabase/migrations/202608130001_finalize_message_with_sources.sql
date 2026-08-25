begin;

create or replace function public.finalize_bba_message_with_sources(
  p_message_id uuid,
  p_content text,
  p_sources jsonb default '[]'::jsonb
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_conversation_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if p_content is null or btrim(p_content) = '' then
    raise exception 'Message content cannot be empty' using errcode = '22023';
  end if;
  if p_sources is null or jsonb_typeof(p_sources) <> 'array' then
    raise exception 'Sources must be a JSON array' using errcode = '22023';
  end if;
  if jsonb_array_length(p_sources) > 5 then
    raise exception 'At most 5 sources are allowed' using errcode = '22023';
  end if;

  select m.conversation_id
    into v_conversation_id
    from public.bba_messages m
    join public.bba_conversations c on c.id = m.conversation_id
    join public.users u on u.id = c.user_id
   where m.id = p_message_id
     and m.sender_type = 'bba'
     and u.auth_user_id = auth.uid()
   for update of m;

  if v_conversation_id is null then
    raise exception 'Message not found or access denied' using errcode = '42501';
  end if;

  update public.bba_messages set icerik = p_content where id = p_message_id;
  delete from public.bba_message_sources where message_id = p_message_id;

  insert into public.bba_message_sources (message_id, baslik, kaynak_url)
  select p_message_id,
         nullif(btrim(source_item->>'title'), ''),
         nullif(btrim(source_item->>'url'), '')
    from jsonb_array_elements(p_sources) as source_item
   where nullif(btrim(source_item->>'title'), '') is not null;

  update public.bba_conversations set updated_at = now() where id = v_conversation_id;
  return true;
end;
$$;

revoke all on function public.finalize_bba_message_with_sources(uuid, text, jsonb) from public;
revoke all on function public.finalize_bba_message_with_sources(uuid, text, jsonb) from anon;
grant execute on function public.finalize_bba_message_with_sources(uuid, text, jsonb) to authenticated;

commit;
