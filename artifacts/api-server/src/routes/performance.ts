import { Router, type IRouter } from "express";
import { z } from "zod";
import { performanceMetricKaydet } from "../lib/performance-metrics";

const router: IRouter = Router();

const ClientMetric = z.object({
  operation: z.enum(["client_rag", "conversation_load"]),
  status: z.enum(["success", "error", "timeout", "cancelled"]),
  durationMs: z.number().finite().min(0).max(120_000),
  firstResponseMs: z.number().finite().min(0).max(120_000).optional(),
  itemCount: z.number().int().min(0).max(10_000).optional(),
  conversationId: z.string().uuid().optional(),
});

router.post("/performance/client", async (req, res) => {
  const parsed = ClientMetric.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ hata: "Geçersiz performans ölçümü." });
    return;
  }

  try {
    await performanceMetricKaydet({
      userId: res.locals["authUserId"] as string,
      ...parsed.data,
    });
    res.status(204).end();
  } catch (error) {
    req.log.warn({ err: error }, "İstemci performans ölçümü kaydedilemedi");
    res.status(503).json({ hata: "Performans ölçümü kaydedilemedi." });
  }
});

export default router;
