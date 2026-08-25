import { Router, type IRouter } from "express";
import { z } from "zod";
import {
  kullaniciHafizalariniListele,
  kullaniciHafizasiniDuzenle,
  kullaniciHafizasiniPasiflestir,
} from "../lib/hafiza";

const router: IRouter = Router();
const HafizaId = z.string().uuid();
const HafizaDuzenle = z.object({ content: z.string().trim().min(1).max(500) });

router.get("/memories", async (_req, res) => {
  const userId = res.locals["authUserId"] as string;
  const hafizalar = await kullaniciHafizalariniListele(userId);
  res.json({ hafizalar });
});

router.patch("/memories/:id", async (req, res) => {
  const id = HafizaId.safeParse(req.params["id"]);
  const body = HafizaDuzenle.safeParse(req.body);
  if (!id.success || !body.success) {
    res.status(400).json({ hata: "Geçersiz hafıza düzenleme isteği." });
    return;
  }
  const userId = res.locals["authUserId"] as string;
  const hafiza = await kullaniciHafizasiniDuzenle(userId, id.data, body.data.content);
  if (!hafiza) {
    res.status(404).json({ hata: "Aktif hafıza bulunamadı." });
    return;
  }
  res.json({ hafiza });
});

router.delete("/memories/:id", async (req, res) => {
  const id = HafizaId.safeParse(req.params["id"]);
  if (!id.success) {
    res.status(400).json({ hata: "Geçersiz hafıza kimliği." });
    return;
  }
  const userId = res.locals["authUserId"] as string;
  const pasiflestirildi = await kullaniciHafizasiniPasiflestir(userId, id.data);
  if (!pasiflestirildi) {
    res.status(404).json({ hata: "Aktif hafıza bulunamadı." });
    return;
  }
  res.status(204).send();
});

export default router;
