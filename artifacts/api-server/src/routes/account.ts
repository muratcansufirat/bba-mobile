import { Router, type IRouter } from "express";

import { getAdminPool } from "../middleware/admin";

const router: IRouter = Router();

const HESAP_SILME_ONAYI = "DELETE_MY_ACCOUNT";

router.delete("/account", async (req, res) => {
  const authUserId = res.locals["authUserId"] as string | undefined;
  if (!authUserId) {
    res.status(401).json({ hata: "Geçerli kullanıcı oturumu gerekli." });
    return;
  }

  if (req.body?.confirmation !== HESAP_SILME_ONAYI) {
    res.status(400).json({ hata: "Hesap silme onayı geçersiz." });
    return;
  }

  const client = await getAdminPool().connect();
  try {
    await client.query("begin");

    const adminResult = await client.query(
      `select 1
         from public.admin_users
        where auth_user_id = $1
        limit 1
        for update`,
      [authUserId],
    );
    if (adminResult.rowCount) {
      await client.query("rollback");
      res.status(409).json({
        hata: "Yönetici hesabı uygulamadan silinemez. Önce yönetici yetkisinin güvenli biçimde kaldırılması gerekir.",
      });
      return;
    }

    const deleteResult = await client.query(
      `delete from auth.users
        where id = $1
          and deleted_at is null
      returning id`,
      [authUserId],
    );
    if (!deleteResult.rowCount) {
      await client.query("rollback");
      res.status(404).json({ hata: "Silinecek kullanıcı hesabı bulunamadı." });
      return;
    }

    await client.query("commit");
    req.log.info({ authUserId }, "Kullanıcı kendi hesabını sildi");
    res.status(204).end();
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    req.log.error({ authUserId, err: error }, "Kullanıcı hesabı silinemedi");
    res.status(500).json({ hata: "Hesap silinemedi. Lütfen daha sonra yeniden deneyin." });
  } finally {
    client.release();
  }
});

export default router;
