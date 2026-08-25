import type { Pool, PoolClient } from "pg";
import type { AdminRolu } from "../middleware/admin";

type SorguCalistirici = Pick<Pool | PoolClient, "query">;

export type AdminDenetimKaydi = {
  actorId?: string | null;
  actorRole: AdminRolu | "unknown";
  action: string;
  targetType: string;
  targetId?: string | null;
  result: "success" | "failure";
  errorCode?: string | null;
  details?: Record<string, string | number | boolean | null>;
};

export async function adminDenetimKaydet(
  db: SorguCalistirici,
  kayit: AdminDenetimKaydi,
): Promise<void> {
  await db.query(
    `insert into public.admin_audit_logs
       (actor_auth_user_id, actor_role, action, target_type, target_id, result, error_code, details)
     values ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)`,
    [
      kayit.actorId || null,
      kayit.actorRole,
      kayit.action.slice(0, 100),
      kayit.targetType.slice(0, 50),
      kayit.targetId?.slice(0, 500) ?? null,
      kayit.result,
      kayit.errorCode?.slice(0, 100) ?? null,
      JSON.stringify(kayit.details ?? {}),
    ],
  );
}
