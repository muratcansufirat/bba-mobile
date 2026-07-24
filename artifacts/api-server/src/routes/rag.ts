import { Router, type IRouter } from "express";
import { z } from "zod";
import { embeddingOlustur } from "../lib/embedding";
import { semantikArama } from "../lib/arama";
import { cevapUret } from "../lib/cevap";
import { kullanicihafizasiniGetir } from "../lib/hafiza";

const router: IRouter = Router();

const RagIstek = z.object({
  soru: z.string().min(1, "Soru boş olamaz.").max(8000, "Soru çok uzun."),
  limit: z.number().int().min(1).max(20).optional().default(5),
  minSimilarity: z.number().min(0).max(1).optional().default(0.30),
  userId: z.string().optional(),
});

/**
 * POST /api/rag
 *
 * Gövde: { "soru": "...", "limit"?: 5, "minSimilarity"?: 0.30, "userId"?: "uuid" }
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
  const sonuc = RagIstek.safeParse(req.body);

  if (!sonuc.success) {
    res.status(400).json({
      hata: "Geçersiz istek.",
      detay: sonuc.error.issues.map((i: z.ZodIssue) => i.message),
    });
    return;
  }

  const { soru, limit, minSimilarity, userId } = sonuc.data;

  try {
    // 1. Soru → embedding + hafıza okuma paralel
    // Hafıza hatası RAG akışını engellemez — boş dizi ile devam edilir.
    const [embedding, hafiza] = await Promise.all([
      embeddingOlustur(soru),
      userId
        ? kullanicihafizasiniGetir(userId).catch((err: unknown) => {
            req.log.warn({ err, userId }, "Hafıza okuma başarısız, boş devam");
            return [];
          })
        : Promise.resolve([]),
    ]);

    // 2. Semantik arama
    const kaynaklar = await semantikArama(embedding, limit, minSimilarity);

    // 3. GPT-4o-mini ile cevap üret
    const { cevap, kullanilanKaynaklar, kaynakBulundu } = await cevapUret(
      soru,
      kaynaklar,
      hafiza
    );

    res.json({
      cevap,
      kullanilanKaynaklar,
      kaynakBulundu,
      aramaToplamı: kaynaklar.length,
    });
  } catch (err: unknown) {
    const mesaj = err instanceof Error ? err.message : "Bilinmeyen hata.";
    req.log.error({ err }, "RAG işlemi başarısız");
    res.status(500).json({ hata: mesaj });
  }
});

export default router;
