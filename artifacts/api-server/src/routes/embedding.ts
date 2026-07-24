import { Router, type IRouter } from "express";
import { embeddingOlustur } from "../lib/embedding";
import { z } from "zod";

const router: IRouter = Router();

const EmbeddingIstek = z.object({
  soru: z.string().min(1, "Soru boş olamaz.").max(8000, "Soru çok uzun."),
});

/**
 * POST /api/embedding
 *
 * Gövde: { "soru": "Kullanıcının sorusu..." }
 * Yanıt: { "embedding": [0.1, -0.2, ...], "boyut": 1536, "model": "text-embedding-3-small" }
 */
router.post("/embedding", async (req, res) => {
  const sonuc = EmbeddingIstek.safeParse(req.body);

  if (!sonuc.success) {
    res.status(400).json({
      hata: "Geçersiz istek.",
      detay: sonuc.error.issues.map((i: z.ZodIssue) => i.message),
    });
    return;
  }

  try {
    const embedding = await embeddingOlustur(sonuc.data.soru);
    res.json({
      embedding,
      boyut: embedding.length,
      model: "text-embedding-3-small",
    });
  } catch (err: unknown) {
    const mesaj = err instanceof Error ? err.message : "Bilinmeyen hata.";
    req.log.error({ err }, "Embedding oluşturulamadı");
    res.status(500).json({ hata: mesaj });
  }
});

export default router;
