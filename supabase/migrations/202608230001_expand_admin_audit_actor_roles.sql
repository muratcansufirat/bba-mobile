begin;

alter table public.admin_audit_logs
  drop constraint if exists admin_audit_logs_actor_role_check;

alter table public.admin_audit_logs
  add constraint admin_audit_logs_actor_role_check
  check (actor_role in ('admin', 'editor', 'support', 'unknown'));

comment on column public.admin_audit_logs.actor_role is
  'Resolved management role, or unknown when an authenticated account is denied before a management role can be established.';

commit;
