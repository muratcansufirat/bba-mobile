begin;

create index if not exists admin_audit_logs_result_created_idx
  on public.admin_audit_logs (result, created_at desc);

comment on index public.admin_audit_logs_result_created_idx is
  'Separates successful and failed administrator operations for security reporting.';

commit;
