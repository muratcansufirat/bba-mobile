import { Router, type IRouter } from "express";
import { z } from "zod";
import { embeddingOlustur } from "../lib/embedding";
import { semantikArama, type AramaSonucu } from "../lib/arama";

const router: IRouter = Router();

const AramaIstek = z.object({
  soru: z.string().min(1, "Soru boş olamaz.").max(8000, "Soru çok uzun."),
  limit: z.number().int().min(1).max(20).optional().default(5),
  minSimilarity: z.number().min(0).max(1).optional().default(0.30),
});

export interface AramaYanit {
  sonuclar: AramaSonucu[];
  toplam: number;
  soru: string;
}

/**
 * POST /api/arama
 *
 * Gövde: { "soru": "...", "limit"?: 5, "minSimilarity"?: 0.30 }
 * Yanıt: { "sonuclar": [...], "toplam": N, "soru": "..." }
 *
 * Her sonuç: { id, title, tags, content, source, source_url, similarity }
 */
router.post("/arama", async (req, res) => {
  const sonuc = AramaIstek.safeParse(req.body);

  if (!sonuc.success) {
    res.status(400).json({
      hata: "Geçersiz istek.",
      detay: sonuc.error.issues.map((i: z.ZodIssue) => i.message),
    });
    return;
  }

  const { soru, limit, minSimilarity } = sonuc.data;

  try {
    // 1. Soruyu vektöre dönüştür
    const embedding = await embeddingOlustur(soru);

    // 2. Semantik arama yap
    const aramaYanit = await semantikArama(embedding, limit, minSimilarity);

    const yanit: AramaYanit = {
      sonuclar: aramaYanit,
      toplam: aramaYanit.length,
      soru,
    };

    res.json(yanit);
  } catch (err: unknown) {
    const mesaj = err instanceof Error ? err.message : "Bilinmeyen hata.";
    req.log.error({ err }, "Semantik arama başarısız");
    res.status(500).json({ hata: mesaj });
  }
});

export default router;
