begin;

alter table public.bba_message_favorites
  add column if not exists paragraph_index integer not null default 0;

alter table public.bba_message_favorites
  drop constraint if exists bba_message_favorites_paragraph_index_check;

alter table public.bba_message_favorites
  add constraint bba_message_favorites_paragraph_index_check
  check (paragraph_index >= 0);

alter table public.bba_message_favorites
  drop constraint if exists bba_message_favorites_user_message_unique;

alter table public.bba_message_favorites
  drop constraint if exists bba_message_favorites_user_message_paragraph_unique;

alter table public.bba_message_favorites
  add constraint bba_message_favorites_user_message_paragraph_unique
  unique (user_id, message_id, paragraph_index);

comment on column public.bba_message_favorites.paragraph_index is
  'Zero-based index of the favorited paragraph in the completed BBA message.';

commit;
