begin;

alter table public.api_usage_metrics
  drop constraint if exists api_usage_metrics_operation_check;

alter table public.api_usage_metrics
  add constraint api_usage_metrics_operation_check
  check (operation in ('rag', 'voice_upload', 'voice_speech', 'client_rag', 'conversation_load'));

alter table public.api_usage_metrics
  add column if not exists first_response_ms integer check (first_response_ms is null or first_response_ms >= 0),
  add column if not exists first_token_ms integer check (first_token_ms is null or first_token_ms >= 0),
  add column if not exists embedding_ms integer check (embedding_ms is null or embedding_ms >= 0),
  add column if not exists search_ms integer check (search_ms is null or search_ms >= 0),
  add column if not exists generation_ms integer check (generation_ms is null or generation_ms >= 0),
  add column if not exists first_byte_ms integer check (first_byte_ms is null or first_byte_ms >= 0),
  add column if not exists item_count integer check (item_count is null or item_count >= 0);

comment on column public.api_usage_metrics.first_response_ms is
  'Request start to first status/token response; no message content is stored.';
comment on column public.api_usage_metrics.first_token_ms is
  'Request start to first generated text token.';
comment on column public.api_usage_metrics.first_byte_ms is
  'Request start to first generated audio byte.';
comment on column public.api_usage_metrics.item_count is
  'Number of records loaded by client performance operations.';

commit;
