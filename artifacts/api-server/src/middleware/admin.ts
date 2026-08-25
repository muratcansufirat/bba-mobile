import pg from "pg";
import type { NextFunction, Request, Response } from "express";

export const ADMIN_ROLLERI = ["admin", "editor", "support"] as const;
export type AdminRolu = (typeof ADMIN_ROLLERI)[number];

export const ROL_IZINLERI = {
  admin: ["users.read", "users.manage", "memories.read", "content.read", "content.manage", "analytics.read", "audit.read", "admins.manage"],
  editor: ["content.read", "content.manage", "analytics.read"],
  support: ["users.read", "analytics.read"],
} as const satisfies Record<AdminRolu, readonly string[]>;

export type AdminIzni = (typeof ROL_IZINLERI)[AdminRolu][number];

export function adminRoluMu(value: string): value is AdminRolu {
  return ADMIN_ROLLERI.some((role) => role === value);
}

const { Pool } = pg;
let pool: InstanceType<typeof Pool> | null = null;

export function getAdminPool(): InstanceType<typeof Pool> {
  if (!pool) {
    const connectionString = process.env["SUPABASE_DB_URL"];
    if (!connectionString) throw new Error("SUPABASE_DB_URL tanımlı değil.");
    pool = new Pool({ connectionString, max: 3 });
  }
  return pool;
}

export async function adminDogrula(req: Request, res: Response, next: NextFunction): Promise<void> {
  const authUserId = res.locals["authUserId"] as string | undefined;
  if (!authUserId) {
    res.status(401).json({ hata: "Geçerli kullanıcı oturumu gerekli." });
    return;
  }

  try {
    const { rows } = await getAdminPool().query<{ role: string }>(
      `select role
         from public.admin_users
        where auth_user_id = $1
          and is_active = true
        limit 1`,
      [authUserId],
    );
    const admin = rows[0];
    if (!admin || !adminRoluMu(admin.role)) {
      req.log.warn({ authUserId }, "Yetkisiz yönetim paneli erişimi reddedildi");
      res.status(403).json({ hata: "Bu hesap yönetim paneline erişemez." });
      return;
    }

    res.locals["adminRole"] = admin.role;
    res.locals["adminPermissions"] = ROL_IZINLERI[admin.role];
    next();
  } catch (error) {
    req.log.error({ err: error }, "Admin yetkisi doğrulanamadı");
    res.status(503).json({ hata: "Yönetim yetkilendirme servisine ulaşılamadı." });
  }
}

export function rolGerekli(...allowedRoles: readonly AdminRolu[]) {
  return (_req: Request, res: Response, next: NextFunction): void => {
    const role = res.locals["adminRole"] as AdminRolu | undefined;
    if (!role) {
      res.status(401).json({ hata: "Geçerli yönetim oturumu gerekli." });
      return;
    }
    if (!allowedRoles.includes(role)) {
      res.status(403).json({ hata: "Bu işlem için yeterli yönetim yetkiniz yok." });
      return;
    }
    next();
  };
}

export function izinGerekli(...requiredPermissions: readonly AdminIzni[]) {
  return (_req: Request, res: Response, next: NextFunction): void => {
    const permissions = res.locals["adminPermissions"] as readonly string[] | undefined;
    if (!permissions) {
      res.status(401).json({ hata: "Geçerli yönetim oturumu gerekli." });
      return;
    }
    if (!requiredPermissions.every((permission) => permissions.includes(permission))) {
      res.status(403).json({ hata: "Bu işlem için gerekli yönetim yetkiniz yok." });
      return;
    }
    next();
  };
}
