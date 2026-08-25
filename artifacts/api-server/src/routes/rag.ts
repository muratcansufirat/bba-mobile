import { Router, type IRouter, type Response } from "express";
import { z } from "zod";
import { aramaSorgusunuTurkcelestir, embeddingOlustur } from "../lib/embedding";
import { GUVENLI_MIN_BENZERLIK, semantikArama } from "../lib/arama";
import { cevapUret } from "../lib/cevap";
import { hafizayiMesajdanGuncelle, ilgiliHafizalariSec, kullanicihafizasiniGetir } from "../lib/hafiza";
import { getAdminPool } from "../middleware/admin";

const router: IRouter = Router();
const GPT_4O_MINI_INPUT_USD_PER_MILLION = 0.15;
const GPT_4O_MINI_OUTPUT_USD_PER_MILLION = 0.60;
const EMBEDDING_3_SMALL_USD_PER_MILLION = 0.02;

type OlcumDurumu = "success" | "no_source" | "error" | "timeout" | "cancelled";

function hataSinifi(err: unknown, istemciIptalEtti: boolean): OlcumDurumu {
  if (istemciIptalEtti) return "cancelled";
  const mesaj = err instanceof Error ? `${err.name} ${err.message}`.toLowerCase() : "";
  return /timeout|timed out|etimedout|zaman aş/.test(mesaj) ? "timeout" : "error";
}

async function olcumuKaydet(veri: {
  userId: string;
  conversationId?: string;
  status: OlcumDurumu;
  durationMs: number;
  sourceCount: number;
  promptTokens: number;
  completionTokens: number;
  embeddingTokens: number;
  errorCode?: string;
}): Promise<void> {
  const maliyet = (
    veri.promptTokens * GPT_4O_MINI_INPUT_USD_PER_MILLION
    + veri.completionTokens * GPT_4O_MINI_OUTPUT_USD_PER_MILLION
    + veri.embeddingTokens * EMBEDDING_3_SMALL_USD_PER_MILLION
  ) / 1_000_000;
  await getAdminPool().query(
    `insert into public.api_usage_metrics
       (auth_user_id, conversation_id, status, duration_ms, source_count,
        prompt_tokens, completion_tokens, embedding_tokens, estimated_cost_usd,
        chat_model, embedding_model, error_code)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'gpt-4o-mini',
             'text-embedding-3-small', $10)`,
    [veri.userId, veri.conversationId ?? null, veri.status, Math.max(0, Math.round(veri.durationMs)),
      veri.sourceCount, veri.promptTokens, veri.completionTokens, veri.embeddingTokens,
      maliyet, veri.errorCode ?? null],
  );
}
// Canlı pozitif/negatif örnek ölçümlerinde 0.40, teknik ve konu dışı bir
// soruyu yanlış eşleştirdi (0.405). 0.45 gerçek BBA sorularını korurken
// ölçülen ilişkisiz örneklerin tamamını güvenli biçimde reddetti.
function sseYaz(res: Response, olay: string, veri: unknown): void {
  res.write(`event: ${olay}\ndata: ${JSON.stringify(veri)}\n\n`);
}


const RagIstek = z.object({
  soru: z.string().min(1, "Soru boş olamaz.").max(8000, "Soru çok uzun."),
  userId: z.string().optional(),
  conversationId: z.string().uuid().optional(),
  stream: z.boolean().optional().default(false),
  memoryEnabled: z.boolean().optional().default(true),
  language: z.enum(["tr", "en"]).optional().default("tr"),
});

/**
 * POST /api/rag
 *
 * Gövde: { "soru": "...", "userId"?: "uuid" }
 *
 * Yanıt:
 * {
 *   "cevap": "...",
 *   "kullanilanKaynaklar": [{ title, source, source_url }],
 *   "kaynakBulundu": true,
 *   "aramaToplamı": N
 * }
 *
 * Akış:
 *   1. Soruyu embedding'e dönüştür
 *   2. bba_knowledge_base'de semantik arama yap
 *   3. userId varsa bba_user_memories'tan aktif hafıza kayıtlarını getir
 *   4. Kaynaklar + hafıza ile GPT-4o-mini'ye cevap ürettir
 *   5. Cevabı döndür
 */
router.post("/rag", async (req, res) => {
  const baslangic = performance.now();
  let istemciIptalEtti = false;
  let embeddingTokens = 0;
  let sourceCount = 0;
  req.once("aborted", () => { istemciIptalEtti = true; });
  res.once("close", () => { if (!res.writableEnded) istemciIptalEtti = true; });
  const sonuc = RagIstek.safeParse(req.body);

  if (!sonuc.success) {
    res.status(400).json({
      hata: "Geçersiz istek.",
      detay: sonuc.error.issues.map((i: z.ZodIssue) => i.message),
    });
    return;
  }

  const { soru, stream, conversationId, memoryEnabled, language } = sonuc.data;
  // İstemci eşiği düşürerek ilgisiz bilgi tabanı kayıtlarını cevaba zorlayamaz.
  const userId = res.locals["authUserId"] as string;

  try {
    // Mobil istemci ilk beş saniye içinde sunucudan veri görmezse bağlantıyı
    // zaman aşımı olarak kapatır. Uzun sürebilen embedding ve kaynak aramasına
    // başlamadan önce SSE bağlantısını açıp güvenli bir hazırlık olayı gönder.
    if (stream) {
      res.status(200);
      res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
      res.setHeader("Cache-Control", "no-cache, no-transform");
      res.setHeader("Connection", "keep-alive");
      res.flushHeaders();
      sseYaz(res, "status", { durum: "hazirlaniyor" });
    }

    // Bilgi tabanı Türkçe olduğu için İngilizce sorular yalnızca kaynak araması
    // amacıyla Türkçeye çevrilir. Cevap üretiminde özgün soru ve seçili dil korunur.
    const aramaSorgusu = language === "en"
      ? await aramaSorgusunuTurkcelestir(soru).catch((err: unknown) => {
          req.log.warn({ err, userId }, "İngilizce arama sorgusu Türkçeye çevrilemedi, özgün sorguyla devam");
          return soru;
        })
      : soru;

    // 1. Soru → embedding + hafıza okuma paralel
    // Hafıza hatası RAG akışını engellemez — boş dizi ile devam edilir.
    const [embedding, hafiza] = await Promise.all([
      embeddingOlustur(aramaSorgusu, (olcum) => { embeddingTokens = olcum.tokens; }),
      userId && memoryEnabled
        ? kullanicihafizasiniGetir(userId).catch((err: unknown) => {
            req.log.warn({ err, userId }, "Hafıza okuma başarısız, boş devam");
            return [];
          })
        : Promise.resolve([]),
    ]);
    const ilgiliHafiza = memoryEnabled ? ilgiliHafizalariSec(soru, hafiza) : [];

    // 2. Semantik arama
    // Bilgi tabanının tamamı exact olarak taranır ve eşik üzerindeki bütün
    // ilgili parçalar alınır; aynı kaynağa ait parçalar burada atılmaz.
    const kaynaklar = await semantikArama(embedding, null, GUVENLI_MIN_BENZERLIK);
    sourceCount = kaynaklar.length;

    // 3. GPT-4o-mini ile cevap üret
    const { cevap, kullanilanKaynaklar, kaynakBulundu, kullanim } = await cevapUret(
      soru,
      kaynaklar,
      ilgiliHafiza,
      language,
      stream
        ? {
            onParca: (parca) => {
              if (!res.writableEnded) sseYaz(res, "token", { parca });
            },
          }
        : {}
    );
    if (kaynakBulundu && kullanilanKaynaklar.length === 0) {
      throw new Error("Kaynak kullanan cevap kaynak bilgisi olmadan tamamlanamaz.");
    }

    await olcumuKaydet({
      userId,
      conversationId,
      status: kaynakBulundu ? "success" : "no_source",
      durationMs: performance.now() - baslangic,
      sourceCount: kullanilanKaynaklar.length,
      promptTokens: kullanim?.prompt_tokens ?? 0,
      completionTokens: kullanim?.completion_tokens ?? 0,
      embeddingTokens,
    }).catch((error: unknown) => req.log.warn({ err: error }, "RAG ölçümü kaydedilemedi"));

    if (conversationId && memoryEnabled) {
      await hafizayiMesajdanGuncelle(userId, conversationId, soru).catch((err: unknown) => {
        req.log.warn({ err, userId, conversationId }, "Backend hafıza çıkarımı başarısız");
        return 0;
      });
    }

    if (stream) {
      sseYaz(res, "done", {
        cevap,
        kullanilanKaynaklar,
        kaynakBulundu,
        "aramaToplamı": kaynaklar.length,
      });
      res.end();
      return;
    }
    res.json({
      cevap,
      kullanilanKaynaklar,

      kaynakBulundu,
      aramaToplamı: kaynaklar.length,
    });
  } catch (err: unknown) {
    const mesaj = err instanceof Error ? err.message : "Bilinmeyen hata.";
    req.log.error({ err }, "RAG işlemi başarısız");
    const status = hataSinifi(err, istemciIptalEtti);
    await olcumuKaydet({
      userId,
      conversationId,
      status,
      durationMs: performance.now() - baslangic,
      sourceCount,
      promptTokens: 0,
      completionTokens: 0,
      embeddingTokens,
      errorCode: err instanceof Error ? err.name.slice(0, 120) : "UnknownError",
    }).catch((error: unknown) => req.log.warn({ err: error }, "Başarısız RAG ölçümü kaydedilemedi"));
    if (res.headersSent) {
      if (!res.writableEnded) {
        sseYaz(res, "error", { hata: mesaj });
        res.end();
      }
      return;
    }
    res.status(500).json({ hata: mesaj });
  }
});

export default router;
