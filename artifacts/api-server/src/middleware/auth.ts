import type { NextFunction, Request, Response } from "express";
import { getAdminPool } from "./admin";

type SupabaseUserResponse = { id?: unknown };

export async function jwtDogrula(req: Request, res: Response, next: NextFunction): Promise<void> {
  const authorization = req.header("authorization") ?? "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    res.status(401).json({ hata: "Authorization Bearer token gerekli." });
    return;
  }

  const supabaseUrl = process.env["SUPABASE_URL"]?.replace(/\/$/, "");
  const anonKey = process.env["SUPABASE_ANON_KEY"];
  if (!supabaseUrl || !anonKey) {
    req.log.error("Supabase JWT dogrulamasi icin ortam degiskenleri eksik");
    res.status(503).json({ hata: "Kimlik dogrulama servisi yapilandirilmamis." });
    return;
  }

  try {
    const authResponse = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${match[1]}`,
      },
      signal: AbortSignal.timeout(10_000),
    });
    if (!authResponse.ok) {
      res.status(401).json({ hata: "Gecersiz veya suresi dolmus oturum." });
      return;
    }

    const user = await authResponse.json() as SupabaseUserResponse;
    if (typeof user.id !== "string" || !user.id) {
      res.status(401).json({ hata: "Gecersiz kullanici oturumu." });
      return;
    }

    const accessResult = await getAdminPool().query<{
      access_suspended: boolean;
      public_user_id: string | null;
    }>(
      `select (au.banned_until is not null and au.banned_until > now()) as access_suspended,
              pu.id::text as public_user_id
         from auth.users au
         left join public.users pu on pu.auth_user_id = au.id
        where au.id = $1 and au.deleted_at is null
        limit 1`,
      [user.id],
    );
    const access = accessResult.rows[0];
    if (!access) {
      req.log.warn({ authUserId: user.id }, "Silinmiş veya bulunamayan kullanıcı erişimi reddedildi");
      res.status(403).json({ hata: "Kullanıcı hesabı artık kullanılamıyor." });
      return;
    }

    if (access.access_suspended) {
      req.log.warn({ authUserId: user.id }, "Askıya alınmış kullanıcı erişimi reddedildi");
      res.status(403).json({ hata: "Hesabınızın erişimi askıya alınmıştır." });
      return;
    }

    if (!access.public_user_id) {
      req.log.warn({ authUserId: user.id }, "Public kullanıcı profili bulunamadı");
      res.status(403).json({ hata: "Kullanıcı profili bulunamadı." });
      return;
    }

    res.locals["authUserId"] = user.id;
    res.locals["publicUserId"] = access.public_user_id;
    next();
  } catch (error) {
    req.log.error({ err: error }, "Supabase JWT dogrulamasi basarisiz");
    res.status(503).json({ hata: "Kimlik dogrulama servisine ulasilamadi." });
  }
}
