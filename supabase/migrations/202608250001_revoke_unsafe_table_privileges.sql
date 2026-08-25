begin;

-- RLS does not protect TRUNCATE; these privileges are unnecessary for clients.
-- Preserve every existing SELECT, INSERT, UPDATE and DELETE grant.
revoke truncate, trigger, references on table
  public.announcements,
  public.app_settings,
  public.bba_conversations,
  public.bba_message_sources,
  public.bba_messages,
  public.bba_user_memories,
  public.community_message_likes,
  public.community_messages,
  public.community_rooms,
  public.sessions,
  public.users
from anon, authenticated;

commit;
