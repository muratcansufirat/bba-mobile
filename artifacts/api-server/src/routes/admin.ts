import { Router, type IRouter, type Request } from "express";
import multer from "multer";
import { ADMIN_ROLLERI, ROL_IZINLERI, adminDogrula, getAdminPool, izinGerekli, rolGerekli } from "../middleware/admin";
import { embeddingOlustur } from "../lib/embedding";
import { bilgiKayitlariniAyristir, bilgiKayitlariniParcala, dosyadanMetinCikar, embeddingGirdisi, kaynakBilgisiniDogrula, type BilgiKaydi } from "../lib/content-upload";
import { adminDenetimKaydet } from "../lib/admin-audit";
import type { AdminRolu } from "../middleware/admin";

const router: IRouter = Router();
const EMBEDDING_ESZAMANLILIK = 3;
const UUID_DESENI = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function okumaDenetimBilgisi(req: Request): { action: string; targetType: string; targetId?: string } | null {
  if (req.method !== "GET") return null;
  const path = req.originalUrl.split("?", 1)[0]?.replace(/^\/api/, "") ?? req.path;
  if (path === "/admin/session") return { action: "admin.session.view", targetType: "admin-session" };
  if (path === "/admin/roles") return { action: "admin.roles.view", targetType: "admin-roles" };
  if (path === "/admin/analytics") return { action: "analytics.view", targetType: "analytics" };
  if (path === "/admin/content") return { action: "content.list", targetType: "knowledge" };
  if (path === "/admin/users") return { action: "users.list", targetType: "user" };
  if (path === "/admin/audit-logs") return { action: "audit.list", targetType: "audit-log" };
  const userMatch = path.match(/^\/admin\/users\/([0-9a-f-]+)$/i);
  if (userMatch?.[1]) return { action: "user.view", targetType: "user", targetId: userMatch[1] };
  return null;
}

router.use("/admin", (req, res, next) => {
  const denetim = okumaDenetimBilgisi(req);
  if (!denetim) { next(); return; }

  res.once("finish", () => {
    const statusCode = res.statusCode;
    const basarili = statusCode >= 200 && statusCode < 400;
    const actorRole = (res.locals["adminRole"] as AdminRolu | undefined) ?? "unknown";
    const actorId = (res.locals["authUserId"] as string | undefined) ?? null;
    void adminDenetimKaydet(getAdminPool(), {
      actorId,
      actorRole,
      action: denetim.action,
      targetType: denetim.targetType,
      targetId: denetim.targetId,
      result: basarili ? "success" : "failure",
      errorCode: basarili ? null : `HTTP_${statusCode}`,
    }).catch((auditError) => req.log.error({ err: auditError }, "Yönetim okuma denetim kaydı yazılamadı"));
  });
  next();
});

function icerikGovdesiniDogrula(body: unknown): { kayit: BilgiKaydi } | { hata: string } {
  if (!body || typeof body !== "object") return { hata: "İçerik bilgileri gönderilmedi." };
  const veri = body as Record<string, unknown>;
  const title = typeof veri["title"] === "string" ? veri["title"].trim() : "";
  const content = typeof veri["content"] === "string" ? veri["content"].trim() : "";
  const source = typeof veri["source"] === "string" ? veri["source"].trim() : "";
  const tags = Array.isArray(veri["tags"])
    ? [...new Set(veri["tags"].filter((tag): tag is string => typeof tag === "string").map((tag) => tag.trim()).filter(Boolean))].slice(0, 30)
    : [];
  if (title.length < 2 || title.length > 500) return { hata: "Başlık 2-500 karakter arasında olmalıdır." };
  if (content.length < 10 || content.length > 20_000) return { hata: "İçerik 10-20.000 karakter arasında olmalıdır." };
  const kaynak = kaynakBilgisiniDogrula(source);
  if (!kaynak.gecerli) return { hata: kaynak.hata };
  return { kayit: { title, tags, content, source, source_url: kaynak.source_url } };
}

async function embeddingleriSinirliOlustur<T>(
  kayitlar: T[],
  metinOlustur: (kayit: T) => string,
): Promise<number[][]> {
  const sonuclar = new Array<number[]>(kayitlar.length);
  let siradaki = 0;
  const isci = async () => {
    while (siradaki < kayitlar.length) {
      const index = siradaki++;
      sonuclar[index] = await embeddingOlustur(metinOlustur(kayitlar[index]!));
    }
  };
  await Promise.all(Array.from({ length: Math.min(EMBEDDING_ESZAMANLILIK, kayitlar.length) }, () => isci()));
  return sonuclar;
}

const icerikYukle = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024,
    files: 1,
    fields: 0,
    parts: 1,
    fieldNameSize: 64,
  },
  fileFilter: (_req, file, callback) => {
    const uygun = /\.(pdf|docx|txt)$/i.test(file.originalname);
    if (!uygun) {
      callback(new Error("Yalnızca PDF, DOCX veya TXT dosyası yüklenebilir."));
      return;
    }
    callback(null, true);
  },
});

router.get("/admin/session", adminDogrula, (_req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.json({
    authenticated: true,
    role: res.locals["adminRole"],
    permissions: res.locals["adminPermissions"],
  });
});

router.get("/admin/roles", adminDogrula, rolGerekli("admin"), (_req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.json({
    roles: ADMIN_ROLLERI.map((role) => ({ role, permissions: ROL_IZINLERI[role] })),
  });
});

router.get("/admin/analytics", adminDogrula, izinGerekli("analytics.read"), async (req, res) => {
  const requestedDays = Number.parseInt(String(req.query["days"] ?? "30"), 10);
  const days = [7, 30, 90].includes(requestedDays) ? requestedDays : 30;
  try {
    const result = await getAdminPool().query(
      `with bounds as (
         select now() - ($1::int * interval '1 day') as starts_at
       ),
       message_flow as (
         select m.sender_type, m.created_at,
                lag(m.sender_type) over (partition by m.conversation_id order by m.created_at, m.id) as previous_sender,
                lag(m.created_at) over (partition by m.conversation_id order by m.created_at, m.id) as previous_created_at
           from public.bba_messages m, bounds b
          where m.created_at >= b.starts_at
       ),
       response_times as (
         select extract(epoch from (created_at - previous_created_at)) * 1000 as duration_ms
           from message_flow
         where sender_type = 'bba' and previous_sender = 'user' and previous_created_at is not null
       ),
       api_metrics as (
         select m.* from public.api_usage_metrics m, bounds b where m.created_at >= b.starts_at
       ),
       daily as (
         select day::date,
                coalesce((select count(*) from public.bba_messages m where m.sender_type = 'user' and m.created_at >= day and m.created_at < day + interval '1 day'), 0)::int as user_messages,
                coalesce((select count(*) from public.bba_messages m where m.sender_type = 'bba' and m.created_at >= day and m.created_at < day + interval '1 day'), 0)::int as bba_messages
           from generate_series(date_trunc('day', now()) - (($1::int - 1) * interval '1 day'), date_trunc('day', now()), interval '1 day') day
       )
       select jsonb_build_object(
         'periodDays', $1::int,
         'generatedAt', now(),
         'totals', jsonb_build_object(
           'registeredUsers', (select count(*) from auth.users where deleted_at is null),
           'newUsers', (select count(*) from auth.users au, bounds b where au.deleted_at is null and au.created_at >= b.starts_at),
           'activeUsers', (select count(distinct c.user_id) from public.bba_conversations c, bounds b where c.updated_at >= b.starts_at),
           'conversations', (select count(*) from public.bba_conversations c, bounds b where c.created_at >= b.starts_at),
           'userMessages', (select count(*) from public.bba_messages m, bounds b where m.sender_type = 'user' and m.created_at >= b.starts_at),
           'bbaMessages', (select count(*) from public.bba_messages m, bounds b where m.sender_type = 'bba' and m.created_at >= b.starts_at),
           'sourcedAnswers', (select count(distinct s.message_id) from public.bba_message_sources s join public.bba_messages m on m.id = s.message_id, bounds b where m.created_at >= b.starts_at),
           'activeKnowledge', (select count(*) from public.bba_knowledge_base where deleted_at is null and is_active = true),
           'failedEmbeddings', (select count(*) from public.bba_knowledge_base where deleted_at is null and (embedding is null or vector_dims(embedding) <> 1536))
         ),
         'performance', jsonb_build_object(
           'sampleCount', (select count(*) from response_times),
           'averageResponseMs', coalesce((select round(avg(duration_ms)) from response_times), 0),
           'p95ResponseMs', coalesce((select round(percentile_cont(0.95) within group (order by duration_ms)) from response_times), 0),
           'trackedRequests', (select count(*) from api_metrics),
           'successfulRequests', (select count(*) from api_metrics where status in ('success', 'no_source')),
           'errors', (select count(*) from api_metrics where status = 'error'),
           'timeouts', (select count(*) from api_metrics where status = 'timeout'),
           'cancelled', (select count(*) from api_metrics where status = 'cancelled'),
           'trackedAverageMs', coalesce((select round(avg(duration_ms)) from api_metrics), 0),
           'firstResponseAverageMs', coalesce((select round(avg(first_response_ms)) from api_metrics where first_response_ms is not null), 0),
           'firstTokenAverageMs', coalesce((select round(avg(first_token_ms)) from api_metrics where first_token_ms is not null), 0),
           'embeddingAverageMs', coalesce((select round(avg(embedding_ms)) from api_metrics where embedding_ms is not null), 0),
           'searchAverageMs', coalesce((select round(avg(search_ms)) from api_metrics where search_ms is not null), 0),
           'generationAverageMs', coalesce((select round(avg(generation_ms)) from api_metrics where generation_ms is not null), 0),
           'voiceFirstByteAverageMs', coalesce((select round(avg(first_byte_ms)) from api_metrics where operation = 'voice_speech' and first_byte_ms is not null), 0),
           'conversationLoadAverageMs', coalesce((select round(avg(duration_ms)) from api_metrics where operation = 'conversation_load' and status = 'success'), 0),
           'conversationLoadMaxItems', coalesce((select max(item_count) from api_metrics where operation = 'conversation_load'), 0),
           'promptTokens', coalesce((select sum(prompt_tokens) from api_metrics), 0),
           'completionTokens', coalesce((select sum(completion_tokens) from api_metrics), 0),
           'embeddingTokens', coalesce((select sum(embedding_tokens) from api_metrics), 0),
           'estimatedCostUsd', coalesce((select round(sum(estimated_cost_usd), 6) from api_metrics), 0),
           'errorBreakdown', coalesce((select jsonb_object_agg(error_code, adet) from (select coalesce(error_code, 'Bilinmeyen') error_code, count(*) adet from api_metrics where status in ('error', 'timeout') group by coalesce(error_code, 'Bilinmeyen')) e), '{}'::jsonb)
         ),
         'daily', (select coalesce(jsonb_agg(jsonb_build_object('date', day, 'userMessages', user_messages, 'bbaMessages', bba_messages) order by day), '[]'::jsonb) from daily)
       ) as report`,
      [days],
    );
    res.setHeader("Cache-Control", "no-store, private");
    res.json(result.rows[0]?.report ?? {});
  } catch (error) {
    req.log.error({ err: error, days }, "Kullanım raporu alınamadı");
    res.status(500).json({ hata: "Kullanım ve performans raporu alınamadı." });
  }
});

router.post(
  "/admin/content/upload",
  adminDogrula,
  izinGerekli("content.manage"),
  (req, res, next) => {
    icerikYukle.single("file")(req, res, (error) => {
      if (!error) return next();
      const limitAsildi = error instanceof multer.MulterError && error.code.startsWith("LIMIT_");
      const mesaj = error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE"
        ? "Dosya en fazla 10 MB olabilir."
        : limitAsildi
          ? "Dosya yükleme isteği izin verilen boyut veya alan sınırını aşıyor."
          : error instanceof Error ? error.message : "Dosya yüklenemedi.";
      res.status(limitAsildi ? 413 : 400).json({ hata: mesaj });
    });
  },
  async (req, res) => {
    const file = req.file;
    if (!file) { res.status(400).json({ hata: "Yüklenecek dosya seçilmedi." }); return; }
    const actorId = String(res.locals["authUserId"] ?? "");
    const actorRole = res.locals["adminRole"] as AdminRolu;
    try {
      const metin = await dosyadanMetinCikar(file);
      const { kayitlar: anaKayitlar, gecersizBolum, kaynakHatalari } = bilgiKayitlariniAyristir(metin);
      if (anaKayitlar.length === 0) {
        res.status(422).json({ hata: "Dosyada Başlık, İçerik ve Kaynak alanlarına sahip geçerli kayıt bulunamadı." });
        return;
      }
      if (gecersizBolum > 0) {
        res.status(422).json({
          hata: `${gecersizBolum} bölümde Başlık, İçerik veya Kaynak alanı eksik. Hiçbir içerik kaydedilmedi.`,
        });
        return;
      }
      if (anaKayitlar.length > 200) {
        res.status(422).json({ hata: "Tek dosyada en fazla 200 içerik bölümü yüklenebilir." });
        return;
      }
      if (kaynakHatalari.length > 0) {
        const ilkHata = kaynakHatalari[0]!;
        res.status(422).json({
          hata: `Kaynak doğrulaması başarısız: ${ilkHata.bolum}. bölüm (${ilkHata.baslik}): ${ilkHata.hata} Hiçbir içerik kaydedilmedi.`,
          sourceErrors: kaynakHatalari,
        });
        return;
      }
      const kayitlar = bilgiKayitlariniParcala(anaKayitlar);
      if (kayitlar.length > 1000) {
        res.status(422).json({ hata: "İçerik parçalandıktan sonra tek dosyada en fazla 1000 kayıt oluşturulabilir." });
        return;
      }
      const benzersiz = new Map<string, typeof kayitlar[number]>();
      for (const kayit of kayitlar) benzersiz.set(`${kayit.title}\u0000${kayit.source}\u0000${kayit.content}`, kayit);
      const adaylar = [...benzersiz.values()];
      const pool = getAdminPool();
      const mevcut = await pool.query<{ title: string; source: string; content: string }>(
        `select title, source, content from public.bba_knowledge_base
          where deleted_at is null
            and (title, source, content) in (select * from unnest($1::text[], $2::text[], $3::text[]))`,
        [adaylar.map((kayit) => kayit.title), adaylar.map((kayit) => kayit.source), adaylar.map((kayit) => kayit.content)],
      );
      const mevcutAnahtarlar = new Set(mevcut.rows.map((kayit) => `${kayit.title}\u0000${kayit.source}\u0000${kayit.content}`));
      const eklenecekler = adaylar.filter((kayit) => !mevcutAnahtarlar.has(`${kayit.title}\u0000${kayit.source}\u0000${kayit.content}`));
      const embeddingler = await embeddingleriSinirliOlustur(eklenecekler, embeddingGirdisi);
      const client = await pool.connect();
      try {
        await client.query("begin");
        await client.query("lock table public.bba_knowledge_base in share row exclusive mode");
        let eklendi = 0;
        for (let index = 0; index < eklenecekler.length; index++) {
          const kayit = eklenecekler[index]!;
          const embedding = embeddingler[index]!;
          const sonuc = await client.query(
            `insert into public.bba_knowledge_base (title, tags, content, source, source_url, embedding)
             select $1, $2, $3, $4, $5, $6
              where not exists (select 1 from public.bba_knowledge_base where title = $1 and source = $4 and content = $3 and deleted_at is null)`,
            [kayit.title, kayit.tags, kayit.content, kayit.source, kayit.source_url, `[${embedding.join(",")}]`],
          );
          eklendi += sonuc.rowCount ?? 0;
        }
        await adminDenetimKaydet(client, {
          actorId,
          actorRole,
          action: "content.upload",
          targetType: "content_file",
          targetId: file.originalname,
          result: "success",
          details: { parsed: anaKayitlar.length, chunks: kayitlar.length, inserted: eklendi, skipped: kayitlar.length - eklendi },
        });
        await client.query("commit");
        res.status(201).json({ success: true, fileName: file.originalname, parsed: anaKayitlar.length, chunks: kayitlar.length, inserted: eklendi, skipped: kayitlar.length - eklendi, invalidSections: gecersizBolum });
      } catch (error) {
        await client.query("rollback");
        throw error;
      } finally { client.release(); }
    } catch (error) {
      req.log.error({ err: error, fileName: file.originalname }, "İçerik dosyası yüklenemedi");
      await adminDenetimKaydet(getAdminPool(), {
        actorId, actorRole, action: "content.upload", targetType: "content_file",
        targetId: file.originalname, result: "failure", errorCode: "CONTENT_UPLOAD_FAILED",
      }).catch((auditError) => req.log.error({ err: auditError }, "Başarısız içerik yükleme denetim kaydı yazılamadı"));
      res.status(500).json({ hata: "Dosya işlenemedi; hiçbir içerik kaydedilmedi." });
    }
  },
);

router.get("/admin/content", adminDogrula, izinGerekli("content.read"), async (req, res) => {
  const page = Math.max(1, Number.parseInt(String(req.query["page"] ?? "1"), 10) || 1);
  const limit = Math.min(50, Math.max(1, Number.parseInt(String(req.query["limit"] ?? "10"), 10) || 10));
  const search = String(req.query["q"] ?? "").trim().slice(0, 100);
  const status = req.query["status"] === "inactive" ? "inactive" : req.query["status"] === "all" ? "all" : "active";
  const embeddingStatus = req.query["embedding"] === "failed" ? "failed" : req.query["embedding"] === "ready" ? "ready" : "all";
  const offset = (page - 1) * limit;
  const statusKosulu = status === "all" ? "" : status === "inactive" ? "and kb.is_active = false" : "and kb.is_active = true";
  const embeddingKosulu = embeddingStatus === "ready"
    ? "and kb.embedding is not null and vector_dims(kb.embedding) = 1536"
    : embeddingStatus === "failed"
      ? "and (kb.embedding is null or vector_dims(kb.embedding) <> 1536)"
      : "";
  try {
    const pool = getAdminPool();
    const [liste, sayi, embeddingOzeti] = await Promise.all([
      pool.query(
        `select kb.id, kb.title, kb.tags, kb.content, kb.source, kb.source_url,
                kb.is_active, kb.created_at, kb.updated_at,
                case
                  when kb.embedding is null then 'missing'
                  when vector_dims(kb.embedding) <> 1536 then 'invalid'
                  else 'ready'
                end as embedding_status
           from public.bba_knowledge_base kb
          where kb.deleted_at is null
            ${statusKosulu}
            ${embeddingKosulu}
            and ($1 = '' or kb.title ilike '%' || $1 || '%' or kb.source ilike '%' || $1 || '%'
                 or kb.content ilike '%' || $1 || '%' or $1 = any(kb.tags))
          order by kb.updated_at desc, kb.id
          limit $2 offset $3`,
        [search, limit, offset],
      ),
      pool.query<{ total: string }>(
        `select count(*)::text as total
           from public.bba_knowledge_base kb
          where kb.deleted_at is null
            ${statusKosulu}
            ${embeddingKosulu}
            and ($1 = '' or kb.title ilike '%' || $1 || '%' or kb.source ilike '%' || $1 || '%'
                 or kb.content ilike '%' || $1 || '%' or $1 = any(kb.tags))`,
        [search],
      ),
      pool.query<{ total: string; ready: string; failed: string }>(
        `select count(*)::text as total,
                count(*) filter (where embedding is not null and vector_dims(embedding) = 1536)::text as ready,
                count(*) filter (where embedding is null or vector_dims(embedding) <> 1536)::text as failed
           from public.bba_knowledge_base
          where deleted_at is null`,
      ),
    ]);
    const total = Number.parseInt(sayi.rows[0]?.total ?? "0", 10);
    const ozet = embeddingOzeti.rows[0];
    res.setHeader("Cache-Control", "no-store, private");
    res.json({
      items: liste.rows,
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
      embeddingSummary: {
        total: Number.parseInt(ozet?.total ?? "0", 10),
        ready: Number.parseInt(ozet?.ready ?? "0", 10),
        failed: Number.parseInt(ozet?.failed ?? "0", 10),
      },
    });
  } catch (error) {
    req.log.error({ err: error }, "Kaynak listesi alınamadı");
    res.status(500).json({ hata: "Kaynak listesi alınamadı." });
  }
});

router.put("/admin/content/:id", adminDogrula, izinGerekli("content.manage"), async (req, res) => {
  const id = String(req.params["id"] ?? "");
  const actorId = String(res.locals["authUserId"] ?? "");
  const actorRole = res.locals["adminRole"] as AdminRolu;
  if (!UUID_DESENI.test(id)) { res.status(400).json({ hata: "Geçersiz içerik kimliği." }); return; }
  const dogrulama = icerikGovdesiniDogrula(req.body);
  if ("hata" in dogrulama) { res.status(400).json({ hata: dogrulama.hata }); return; }
  try {
    const embedding = await embeddingOlustur(embeddingGirdisi(dogrulama.kayit));
    const client = await getAdminPool().connect();
    try {
      await client.query("begin");
      const onceki = await client.query(
        `select id, title, tags, content, source, source_url, is_active, created_at, updated_at
           from public.bba_knowledge_base where id = $1 and deleted_at is null for update`,
        [id],
      );
      if (!onceki.rows[0]) { await client.query("rollback"); res.status(404).json({ hata: "İçerik bulunamadı." }); return; }
      const sonuc = await client.query(
        `update public.bba_knowledge_base
            set title = $2, tags = $3, content = $4, source = $5, source_url = $6,
                embedding = $7, updated_at = now()
          where id = $1
          returning id, title, tags, content, source, source_url, is_active, created_at, updated_at`,
        [id, dogrulama.kayit.title, dogrulama.kayit.tags, dogrulama.kayit.content, dogrulama.kayit.source,
          dogrulama.kayit.source_url, `[${embedding.join(",")}]`],
      );
      await client.query(
        `insert into public.admin_content_events (knowledge_id, actor_auth_user_id, action, before_state, after_state)
         values ($1, $2, 'updated', $3::jsonb, $4::jsonb)`,
        [id, actorId, JSON.stringify(onceki.rows[0]), JSON.stringify(sonuc.rows[0])],
      );
      await adminDenetimKaydet(client, {
        actorId, actorRole, action: "content.update", targetType: "knowledge", targetId: id,
        result: "success", details: { title: dogrulama.kayit.title },
      });
      await client.query("commit");
      res.json({ item: sonuc.rows[0] });
    } catch (error) { await client.query("rollback"); throw error; } finally { client.release(); }
  } catch (error) {
    req.log.error({ err: error, id, actorId }, "İçerik güncellenemedi");
    await adminDenetimKaydet(getAdminPool(), {
      actorId, actorRole, action: "content.update", targetType: "knowledge", targetId: id,
      result: "failure", errorCode: "CONTENT_UPDATE_FAILED",
    }).catch((auditError) => req.log.error({ err: auditError }, "Başarısız içerik güncelleme denetim kaydı yazılamadı"));
    res.status(500).json({ hata: "İçerik güncellenemedi; mevcut kayıt korundu." });
  }
});

router.put("/admin/content/:id/status", adminDogrula, izinGerekli("content.manage"), async (req, res) => {
  const id = String(req.params["id"] ?? "");
  const actorId = String(res.locals["authUserId"] ?? "");
  const actorRole = res.locals["adminRole"] as AdminRolu;
  const active = req.body?.active;
  if (!UUID_DESENI.test(id)) { res.status(400).json({ hata: "Geçersiz içerik kimliği." }); return; }
  if (typeof active !== "boolean") { res.status(400).json({ hata: "Aktiflik durumu belirtilmelidir." }); return; }
  const client = await getAdminPool().connect();
  try {
    await client.query("begin");
    const onceki = await client.query(
      `select id, title, tags, content, source, source_url, is_active, created_at, updated_at
         from public.bba_knowledge_base where id = $1 and deleted_at is null for update`,
      [id],
    );
    if (!onceki.rows[0]) { await client.query("rollback"); res.status(404).json({ hata: "İçerik bulunamadı." }); return; }
    const sonuc = await client.query(
      `update public.bba_knowledge_base set is_active = $2, updated_at = now() where id = $1
       returning id, title, tags, content, source, source_url, is_active, created_at, updated_at`,
      [id, active],
    );
    await client.query(
      `insert into public.admin_content_events (knowledge_id, actor_auth_user_id, action, before_state, after_state)
       values ($1, $2, $3, $4::jsonb, $5::jsonb)`,
      [id, actorId, active ? "activated" : "deactivated", JSON.stringify(onceki.rows[0]), JSON.stringify(sonuc.rows[0])],
    );
    await adminDenetimKaydet(client, {
      actorId, actorRole, action: active ? "content.activate" : "content.deactivate",
      targetType: "knowledge", targetId: id, result: "success", details: { active },
    });
    await client.query("commit");
    res.json({ item: sonuc.rows[0] });
  } catch (error) {
    await client.query("rollback");
    req.log.error({ err: error, id, actorId }, "İçerik durumu güncellenemedi");
    await adminDenetimKaydet(getAdminPool(), {
      actorId, actorRole, action: active ? "content.activate" : "content.deactivate",
      targetType: "knowledge", targetId: id, result: "failure", errorCode: "CONTENT_STATUS_FAILED",
    }).catch((auditError) => req.log.error({ err: auditError }, "Başarısız içerik durumu denetim kaydı yazılamadı"));
    res.status(500).json({ hata: "İçerik durumu güncellenemedi." });
  } finally { client.release(); }
});

router.delete("/admin/content/:id", adminDogrula, izinGerekli("content.manage"), async (req, res) => {
  const id = String(req.params["id"] ?? "");
  const actorId = String(res.locals["authUserId"] ?? "");
  const actorRole = res.locals["adminRole"] as AdminRolu;
  if (!UUID_DESENI.test(id)) { res.status(400).json({ hata: "Geçersiz içerik kimliği." }); return; }
  const client = await getAdminPool().connect();
  try {
    await client.query("begin");
    const onceki = await client.query(
      `select id, title, tags, content, source, source_url, is_active, created_at, updated_at
         from public.bba_knowledge_base where id = $1 and deleted_at is null for update`,
      [id],
    );
    if (!onceki.rows[0]) { await client.query("rollback"); res.status(404).json({ hata: "İçerik bulunamadı." }); return; }
    await client.query(
      `update public.bba_knowledge_base set is_active = false, deleted_at = now(), updated_at = now() where id = $1`,
      [id],
    );
    await client.query(
      `insert into public.admin_content_events (knowledge_id, actor_auth_user_id, action, before_state, after_state)
       values ($1, $2, 'deleted', $3::jsonb, null)`,
      [id, actorId, JSON.stringify(onceki.rows[0])],
    );
    await adminDenetimKaydet(client, {
      actorId, actorRole, action: "content.delete", targetType: "knowledge", targetId: id,
      result: "success", details: { softDelete: true },
    });
    await client.query("commit");
    res.json({ success: true });
  } catch (error) {
    await client.query("rollback");
    req.log.error({ err: error, id, actorId }, "İçerik silinemedi");
    await adminDenetimKaydet(getAdminPool(), {
      actorId, actorRole, action: "content.delete", targetType: "knowledge", targetId: id,
      result: "failure", errorCode: "CONTENT_DELETE_FAILED",
    }).catch((auditError) => req.log.error({ err: auditError }, "Başarısız içerik silme denetim kaydı yazılamadı"));
    res.status(500).json({ hata: "İçerik silinemedi; mevcut kayıt korundu." });
  } finally { client.release(); }
});

router.get("/admin/users", adminDogrula, rolGerekli("admin", "support"), async (req, res) => {
  const page = Math.max(1, Number.parseInt(String(req.query["page"] ?? "1"), 10) || 1);
  const limit = Math.min(50, Math.max(1, Number.parseInt(String(req.query["limit"] ?? "20"), 10) || 20));
  const search = String(req.query["q"] ?? "").trim().slice(0, 100);
  const offset = (page - 1) * limit;

  try {
    const pool = getAdminPool();
    const [usersResult, countResult] = await Promise.all([
      pool.query(
        `select au.id,
                au.email,
                pu.nickname,
                au.created_at,
                au.last_sign_in_at,
                au.email_confirmed_at is not null as email_confirmed,
                (au.banned_until is not null and au.banned_until > now()) as access_suspended,
                coalesce(ad.role, 'user') as role,
                coalesce(ad.is_active, false) as admin_access_active
           from auth.users au
           left join public.users pu on pu.auth_user_id = au.id
           left join public.admin_users ad on ad.auth_user_id = au.id
          where au.deleted_at is null
            and ($1 = '' or au.email ilike '%' || $1 || '%' or coalesce(pu.nickname, '') ilike '%' || $1 || '%')
          order by au.created_at desc, au.id
          limit $2 offset $3`,
        [search, limit, offset],
      ),
      pool.query<{ total: string }>(
        `select count(*)::text as total
           from auth.users au
           left join public.users pu on pu.auth_user_id = au.id
          where au.deleted_at is null
            and ($1 = '' or au.email ilike '%' || $1 || '%' or coalesce(pu.nickname, '') ilike '%' || $1 || '%')`,
        [search],
      ),
    ]);

    const total = Number.parseInt(countResult.rows[0]?.total ?? "0", 10);
    res.setHeader("Cache-Control", "no-store");
    res.json({ users: usersResult.rows, page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) });
  } catch (error) {
    req.log.error({ err: error }, "Üye listesi alınamadı");
    res.status(500).json({ hata: "Üye listesi alınamadı." });
  }
});

router.get("/admin/users/:id", adminDogrula, rolGerekli("admin", "support"), async (req, res) => {
  const userId = String(req.params["id"] ?? "");
  if (!userId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(userId)) {
    res.status(400).json({ hata: "Geçersiz kullanıcı kimliği." });
    return;
  }

  try {
    const result = await getAdminPool().query(
      `select au.id,
              au.email,
              pu.nickname,
              au.created_at,
              au.updated_at,
              au.last_sign_in_at,
              au.email_confirmed_at,
              (au.banned_until is not null and au.banned_until > now()) as access_suspended,
              au.banned_until,
              coalesce(au.raw_app_meta_data -> 'providers', '[]'::jsonb) as providers,
              coalesce(ad.role, 'user') as role,
              coalesce(ad.is_active, false) as admin_access_active,
              (select count(*)::int from public.bba_conversations c where c.user_id = pu.id) as conversation_count,
              (select count(*)::int from public.bba_messages m join public.bba_conversations c on c.id = m.conversation_id where c.user_id = pu.id) as message_count,
              (select count(*)::int from public.bba_user_memories um where um.user_id = au.id and um.is_active = true) as active_memory_count
         from auth.users au
         left join public.users pu on pu.auth_user_id = au.id
         left join public.admin_users ad on ad.auth_user_id = au.id
        where au.id = $1 and au.deleted_at is null
        limit 1`,
      [userId],
    );
    const user = result.rows[0];
    if (!user) { res.status(404).json({ hata: "Kullanıcı bulunamadı." }); return; }
    res.setHeader("Cache-Control", "no-store");
    res.json({ user });
  } catch (error) {
    req.log.error({ err: error }, "Kullanıcı detayı alınamadı");
    res.status(500).json({ hata: "Kullanıcı detayı alınamadı." });
  }
});

router.put("/admin/users/:id/access", adminDogrula, rolGerekli("admin"), async (req, res) => {
  const userId = String(req.params["id"] ?? "");
  const actorId = String(res.locals["authUserId"] ?? "");
  const actorRole = res.locals["adminRole"] as AdminRolu;
  const suspended = req.body?.suspended;
  const reason = typeof req.body?.reason === "string" ? req.body.reason.trim().slice(0, 500) : "";

  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(userId)) {
    res.status(400).json({ hata: "Geçersiz kullanıcı kimliği." });
    return;
  }
  if (typeof suspended !== "boolean") {
    res.status(400).json({ hata: "Askıya alma durumu belirtilmelidir." });
    return;
  }
  if (suspended && reason.length < 3) {
    res.status(400).json({ hata: "Askıya alma nedeni en az 3 karakter olmalıdır." });
    return;
  }
  if (userId === actorId) {
    res.status(409).json({ hata: "Kendi yönetici hesabınızı askıya alamazsınız." });
    return;
  }

  const client = await getAdminPool().connect();
  try {
    await client.query("begin");
    const targetResult = await client.query<{ is_admin: boolean }>(
      `select exists(
         select 1 from public.admin_users
          where auth_user_id = au.id and is_active = true
       ) as is_admin
         from auth.users au
        where au.id = $1 and au.deleted_at is null
        for update`,
      [userId],
    );
    const target = targetResult.rows[0];
    if (!target) {
      await client.query("rollback");
      res.status(404).json({ hata: "Kullanıcı bulunamadı." });
      return;
    }
    if (target.is_admin) {
      await client.query("rollback");
      res.status(409).json({ hata: "Aktif yönetici hesapları bu ekrandan askıya alınamaz." });
      return;
    }

    await client.query(
      `update auth.users
          set banned_until = case when $2::boolean then 'infinity'::timestamptz else null end,
              updated_at = now()
        where id = $1`,
      [userId, suspended],
    );
    if (suspended) await client.query("delete from auth.sessions where user_id = $1", [userId]);
    await client.query(
      `insert into public.admin_user_access_events
         (target_auth_user_id, actor_auth_user_id, action, reason)
       values ($1, $2, $3, nullif($4, ''))`,
      [userId, actorId, suspended ? "suspended" : "reactivated", reason],
    );
    await adminDenetimKaydet(client, {
      actorId, actorRole, action: suspended ? "user.suspend" : "user.reactivate",
      targetType: "user", targetId: userId, result: "success",
      details: { sessionRevoked: suspended, reasonProvided: reason.length > 0 },
    });
    await client.query("commit");
    res.setHeader("Cache-Control", "no-store");
    res.json({ success: true, access_suspended: suspended });
  } catch (error) {
    await client.query("rollback");
    req.log.error({ err: error, userId, actorId }, "Kullanıcı erişim durumu güncellenemedi");
    await adminDenetimKaydet(getAdminPool(), {
      actorId, actorRole, action: suspended ? "user.suspend" : "user.reactivate",
      targetType: "user", targetId: userId, result: "failure", errorCode: "USER_ACCESS_UPDATE_FAILED",
    }).catch((auditError) => req.log.error({ err: auditError }, "Başarısız kullanıcı erişimi denetim kaydı yazılamadı"));
    res.status(500).json({ hata: "Kullanıcı erişim durumu güncellenemedi." });
  } finally {
    client.release();
  }
});

router.get("/admin/users/:id/memories", adminDogrula, izinGerekli("memories.read"), async (req, res) => {
  const userId = String(req.params["id"] ?? "");
  const actorId = String(res.locals["authUserId"] ?? "");
  const actorRole = res.locals["adminRole"] as AdminRolu;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(userId)) {
    res.status(400).json({ hata: "Geçersiz kullanıcı kimliği." });
    return;
  }

  const client = await getAdminPool().connect();
  try {
    await client.query("begin");
    const result = await client.query(
      `select um.id, um.memory_type, um.content, um.created_at, um.updated_at
         from auth.users au
         join public.bba_user_memories um on um.user_id = au.id
        where au.id = $1
          and au.deleted_at is null
          and um.is_active = true
        order by (um.memory_type = 'nickname') desc, um.updated_at desc, um.id
        limit 30`,
      [userId],
    );
    await client.query(
      `insert into public.admin_memory_access_events
         (target_auth_user_id, actor_auth_user_id, viewed_memory_count)
       values ($1, $2, $3)`,
      [userId, actorId, result.rowCount ?? 0],
    );
    await adminDenetimKaydet(client, {
      actorId, actorRole, action: "user.memories.view", targetType: "user", targetId: userId,
      result: "success", details: { viewedCount: result.rowCount ?? 0 },
    });
    await client.query("commit");
    res.setHeader("Cache-Control", "no-store, private");
    res.json({ memories: result.rows });
  } catch (error) {
    await client.query("rollback");
    req.log.error({ err: error, userId, actorId }, "Kullanıcı hafızaları görüntülenemedi");
    await adminDenetimKaydet(getAdminPool(), {
      actorId, actorRole, action: "user.memories.view", targetType: "user", targetId: userId,
      result: "failure", errorCode: "MEMORY_ACCESS_FAILED",
    }).catch((auditError) => req.log.error({ err: auditError }, "Başarısız hafıza erişimi denetim kaydı yazılamadı"));
    res.status(500).json({ hata: "Kullanıcı hafızaları görüntülenemedi." });
  } finally {
    client.release();
  }
});

router.get("/admin/audit-logs", adminDogrula, izinGerekli("audit.read"), async (req, res) => {
  const page = Math.max(1, Number.parseInt(String(req.query["page"] ?? "1"), 10) || 1);
  const limit = Math.min(50, Math.max(1, Number.parseInt(String(req.query["limit"] ?? "20"), 10) || 20));
  const offset = (page - 1) * limit;
  const resultFilter = String(req.query["result"] ?? "all");
  const search = String(req.query["q"] ?? "").trim().slice(0, 100);

  if (!["all", "success", "failure"].includes(resultFilter)) {
    res.status(400).json({ hata: "Geçersiz sonuç filtresi." });
    return;
  }

  const conditions: string[] = [];
  const values: unknown[] = [];
  if (resultFilter !== "all") {
    values.push(resultFilter);
    conditions.push(`l.result = $${values.length}`);
  }
  if (search) {
    values.push(`%${search}%`);
    conditions.push(`(l.action ilike $${values.length} or l.target_type ilike $${values.length} or coalesce(l.target_id, '') ilike $${values.length} or coalesce(au.email, '') ilike $${values.length})`);
  }
  const whereClause = conditions.length ? `where ${conditions.join(" and ")}` : "";

  try {
    const countResult = await getAdminPool().query(
      `select count(*)::int as total
         from public.admin_audit_logs l
         left join auth.users au on au.id = l.actor_auth_user_id
         ${whereClause}`,
      values,
    );
    const listValues = [...values, limit, offset];
    const listResult = await getAdminPool().query(
      `select l.id, l.actor_auth_user_id, l.actor_role, au.email as actor_email,
              l.action, l.target_type, l.target_id, l.result, l.error_code, l.created_at
         from public.admin_audit_logs l
         left join auth.users au on au.id = l.actor_auth_user_id
         ${whereClause}
        order by l.created_at desc, l.id desc
        limit $${values.length + 1} offset $${values.length + 2}`,
      listValues,
    );
    const total = Number(countResult.rows[0]?.total ?? 0);
    res.setHeader("Cache-Control", "no-store, private");
    res.json({
      items: listResult.rows,
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    });
  } catch (error) {
    req.log.error({ err: error }, "Güvenlik kayıtları listelenemedi");
    res.status(500).json({ hata: "Güvenlik kayıtları alınamadı." });
  }
});

export default router;
