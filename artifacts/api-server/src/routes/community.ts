import { Router, type IRouter, type Request, type Response } from "express";
import { z } from "zod";
import { getAdminPool } from "../middleware/admin";

const router: IRouter = Router();
const GENEL_ODA_ID = "00000000-0000-4000-8000-000000000001";
const AKTIFLIK_SURESI_SANIYE = 45;

const MesajGonder = z.object({
  content: z.string().trim().min(1).max(1000),
});

type ToplulukMesajiSatiri = {
  id: string;
  user_id: string;
  sender_name: string | null;
  content: string;
  created_at: Date;
};

async function varligiGuncelle(userId: string): Promise<void> {
  await getAdminPool().query(
    `insert into public.community_presence (user_id, last_seen)
     values ($1, now())
     on conflict (user_id) do update set last_seen = excluded.last_seen`,
    [userId],
  );
}

async function cevrimiciSayisiniGetir(): Promise<number> {
  const { rows } = await getAdminPool().query<{ count: string }>(
    `select count(*)::text as count
       from public.community_presence
      where last_seen >= now() - ($1 * interval '1 second')`,
    [AKTIFLIK_SURESI_SANIYE],
  );
  return Number(rows[0]?.count ?? 0);
}

function hataYanitla(req: Request, res: Response, error: unknown): void {
  req.log.error({ err: error }, "Topluluk işlemi tamamlanamadı");
  res.status(503).json({ hata: "Topluluk servisine şu anda ulaşılamıyor." });
}

router.get("/community/messages", async (req, res) => {
  const userId = res.locals["publicUserId"] as string;
  try {
    await varligiGuncelle(userId);
    const [mesajSonucu, onlineCount] = await Promise.all([
      getAdminPool().query<ToplulukMesajiSatiri>(
        `select cm.id::text,
                cm.user_id::text,
                coalesce(nullif(trim(u.nickname), ''), 'Kullanıcı') as sender_name,
                cm.icerik as content,
                cm.created_at
           from public.community_messages cm
           join public.users u on u.id = cm.user_id
          where cm.room_id = $1
          order by cm.created_at desc
          limit 100`,
        [GENEL_ODA_ID],
      ),
      cevrimiciSayisiniGetir(),
    ]);

    res.json({
      messages: mesajSonucu.rows.reverse().map((mesaj) => ({
        id: mesaj.id,
        senderId: mesaj.user_id,
        senderName: mesaj.sender_name ?? "Kullanıcı",
        content: mesaj.content,
        createdAt: mesaj.created_at.toISOString(),
        isOwn: mesaj.user_id === userId,
      })),
      onlineCount,
    });
  } catch (error) {
    hataYanitla(req, res, error);
  }
});

router.post("/community/messages", async (req, res) => {
  const body = MesajGonder.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ hata: "Mesaj 1 ile 1000 karakter arasında olmalıdır." });
    return;
  }

  const userId = res.locals["publicUserId"] as string;
  try {
    await varligiGuncelle(userId);
    const { rows } = await getAdminPool().query<ToplulukMesajiSatiri>(
      `with eklenen as (
         insert into public.community_messages (room_id, user_id, icerik)
         values ($1, $2, $3)
         returning id, user_id, icerik, created_at
       )
       select e.id::text,
              e.user_id::text,
              coalesce(nullif(trim(u.nickname), ''), 'Kullanıcı') as sender_name,
              e.icerik as content,
              e.created_at
         from eklenen e
         join public.users u on u.id = e.user_id`,
      [GENEL_ODA_ID, userId, body.data.content],
    );
    const mesaj = rows[0];
    if (!mesaj) throw new Error("Eklenen topluluk mesajı okunamadı.");
    res.status(201).json({
      message: {
        id: mesaj.id,
        senderId: mesaj.user_id,
        senderName: mesaj.sender_name ?? "Kullanıcı",
        content: mesaj.content,
        createdAt: mesaj.created_at.toISOString(),
        isOwn: true,
      },
    });
  } catch (error) {
    hataYanitla(req, res, error);
  }
});

router.post("/community/presence", async (req, res) => {
  const userId = res.locals["publicUserId"] as string;
  try {
    await varligiGuncelle(userId);
    res.json({ onlineCount: await cevrimiciSayisiniGetir() });
  } catch (error) {
    hataYanitla(req, res, error);
  }
});

export default router;
