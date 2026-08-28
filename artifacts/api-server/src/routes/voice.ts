import { randomUUID } from "node:crypto";
import { extname } from "node:path";
import { Router, type IRouter } from "express";
import multer from "multer";
import OpenAI, { toFile } from "openai";
import { performanceMetricKaydet } from "../lib/performance-metrics";

const router: IRouter = Router();
let openai: OpenAI | null = null;
const MAKSIMUM_KAYIT_SURESI_MS = 60_000;
type DesteklenenDil = "tr" | "en";

function istekDiliniAl(deger: unknown): DesteklenenDil {
  return deger === "en" ? "en" : "tr";
}
const GECICI_SES_OMRU_MS = 2 * 60_000;
const GECICI_SESLER = new Map<string, {
  userId: string;
  metin: string;
  buffer?: Buffer;
  expiresAt: number;
}>();

function suresiDolanSesleriTemizle(): void {
  const simdi = Date.now();
  for (const [id, ses] of GECICI_SESLER) {
    if (ses.expiresAt <= simdi) GECICI_SESLER.delete(id);
  }
}

function openAIAl(): OpenAI {
  if (openai) return openai;
  const apiKey = process.env["OPENAI_API_KEY"];
  if (!apiKey) throw new Error("OPENAI_API_KEY ortam değişkeni tanımlı değil.");
  openai = new OpenAI({ apiKey, timeout: 20_000, maxRetries: 1 });
  return openai;
}
const IZINLI_UZANTILAR = new Set([".m4a", ".mp4", ".aac", ".wav", ".webm", ".3gp"]);
const IZINLI_MIME_TURLERI = new Set([
  "audio/mp4",
  "audio/m4a",
  "audio/x-m4a",
  "audio/aac",
  "audio/wav",
  "audio/x-wav",
  "audio/webm",
  "audio/3gpp",
  "application/octet-stream",
]);

const sesYukle = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024,
    files: 1,
    // iOS/Expo multipart aktarımı taşıma sırasında ek bir boş bölüm üretebilir.
    // Dosya sayısı ve boyutu sıkı kalırken buna güvenli tolerans tanınır.
    fields: 4,
    parts: 5,
    fieldSize: 32,
    fieldNameSize: 64,
  },
  fileFilter: (_req, file, callback) => {
    const uzanti = extname(file.originalname).toLocaleLowerCase("tr-TR");
    if (!IZINLI_UZANTILAR.has(uzanti) || !IZINLI_MIME_TURLERI.has(file.mimetype)) {
      callback(new Error("Desteklenmeyen ses dosyası türü."));
      return;
    }
    callback(null, true);
  },
});

router.post(
  "/voice/upload",
  (_req, res, next) => {
    res.locals["voiceRequestStartedAt"] = performance.now();
    next();
  },
  (req, res, next) => {
    sesYukle.single("audio")(req, res, (error) => {
      if (!error) {
        next();
        return;
      }
      const limitAsildi = error instanceof multer.MulterError && error.code.startsWith("LIMIT_");
      if (error instanceof multer.MulterError) {
        req.log.warn({ multerCode: error.code, field: error.field }, "Ses yükleme sınırı aşıldı");
      }
      const mesaj = error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE"
        ? "Ses dosyası en fazla 10 MB olabilir."
        : limitAsildi
          ? "Ses yükleme isteği izin verilen boyut veya alan sınırını aşıyor."
          : error instanceof Error ? error.message : "Ses dosyası yüklenemedi.";
      res.status(limitAsildi ? 413 : 400).json({ hata: mesaj });
    });
  },
  async (req, res) => {
    if (!req.file || req.file.size === 0) {
      res.status(400).json({ hata: "Geçerli bir ses dosyası gerekli." });
      return;
    }

    const kayitSuresiMs = Number(req.body?.["durationMs"]);
    const language = istekDiliniAl(req.body?.["language"]);
    if (!Number.isFinite(kayitSuresiMs) || kayitSuresiMs <= 0) {
      res.status(400).json({ hata: "Ses kaydı süresi geçersiz." });
      return;
    }
    if (kayitSuresiMs > MAKSIMUM_KAYIT_SURESI_MS) {
      res.status(400).json({ hata: "Ses kaydı en fazla 60 saniye olabilir." });
      return;
    }

    const userId = res.locals["authUserId"] as string;
    const receiptId = randomUUID();
    req.log.info(
      { authUserId: userId, receiptId, byteLength: req.file.size, mimeType: req.file.mimetype },
      "Ses dosyası güvenli şekilde alındı",
    );

    try {
      const sesDosyasi = await toFile(req.file.buffer, req.file.originalname, {
        type: req.file.mimetype,
      });
      const sonuc = await openAIAl().audio.transcriptions.create({
        file: sesDosyasi,
        model: "gpt-4o-mini-transcribe",
        language,
        response_format: "json",
      });
      const metin = sonuc.text.trim();

      if (!metin) {
        res.status(422).json({ hata: "Ses kaydında anlaşılır bir konuşma bulunamadı." });
        return;
      }

      req.log.info(
        { authUserId: userId, receiptId, characterCount: metin.length },
        "Ses kaydı backend tarafında metne dönüştürüldü",
      );
      res.status(201).json({
        accepted: true,
        receiptId,
        byteLength: req.file.size,
        mimeType: req.file.mimetype,
        transcript: metin,
      });
      void performanceMetricKaydet({
        userId,
        operation: "voice_upload",
        status: "success",
        durationMs: performance.now() - (res.locals["voiceRequestStartedAt"] as number),
      }).catch((metricError: unknown) => req.log.warn({ err: metricError }, "Ses yükleme ölçümü kaydedilemedi"));
    } catch (error) {
      req.log.error(
        { authUserId: userId, receiptId, err: error },
        "Ses kaydı metne dönüştürülemedi",
      );
      res.status(502).json({ hata: "Ses kaydı metne dönüştürülemedi. Lütfen yeniden deneyin." });
      void performanceMetricKaydet({
        userId,
        operation: "voice_upload",
        status: "error",
        durationMs: performance.now() - (res.locals["voiceRequestStartedAt"] as number),
        errorCode: error instanceof Error ? error.name : "unknown",
      }).catch((metricError: unknown) => req.log.warn({ err: metricError }, "Ses yükleme hata ölçümü kaydedilemedi"));
    }
  },
);

router.post("/voice/speech", (req, res) => {
  const userId = res.locals["authUserId"] as string;
  const messageId = typeof req.body?.["messageId"] === "string" ? req.body["messageId"].trim() : "";
  const metin = typeof req.body?.["text"] === "string" ? req.body["text"].trim() : "";
  const language = istekDiliniAl(req.body?.["language"]);
  if (!messageId || !metin) {
    res.status(400).json({ hata: "Mesaj kimliği ve seslendirilecek metin gerekli." });
    return;
  }
  if (metin.length > 4_096) {
    res.status(400).json({ hata: "Seslendirilecek cevap en fazla 4096 karakter olabilir." });
    return;
  }

  suresiDolanSesleriTemizle();
  const audioId = randomUUID();
  GECICI_SESLER.set(audioId, { userId, metin, expiresAt: Date.now() + GECICI_SES_OMRU_MS });
  req.log.info({ authUserId: userId, messageId, audioId, characterCount: metin.length, language }, "BBA ses akışı hazırlandı");
  res.status(201).json({
    audioId,
    audioPath: `/api/voice/speech/${audioId}`,
    expiresInSeconds: Math.floor(GECICI_SES_OMRU_MS / 1000),
  });
});

router.get("/voice/speech/:audioId", async (req, res) => {
  const baslangic = performance.now();
  suresiDolanSesleriTemizle();
  const userId = res.locals["authUserId"] as string;
  const audioId = req.params["audioId"] ?? "";
  const ses = GECICI_SESLER.get(audioId);
  if (!ses || ses.userId !== userId) {
    res.status(404).json({ hata: "Ses kaydı bulunamadı veya süresi doldu." });
    return;
  }
  const range = req.headers.range;
  res.setHeader("Accept-Ranges", "bytes");
  res.setHeader("Cache-Control", "no-store, max-age=0");
  res.setHeader("Content-Type", "audio/mpeg");
  if (ses.buffer && range) {
    const eslesme = /^bytes=(\d+)-(\d*)$/.exec(range);
    const baslangic = eslesme ? Number(eslesme[1]) : Number.NaN;
    const istenenBitis = eslesme?.[2] ? Number(eslesme[2]) : ses.buffer.length - 1;
    const bitis = Math.min(istenenBitis, ses.buffer.length - 1);
    if (!Number.isFinite(baslangic) || baslangic < 0 || baslangic > bitis) {
      res.status(416).setHeader("Content-Range", `bytes */${ses.buffer.length}`).end();
      return;
    }
    const parca = ses.buffer.subarray(baslangic, bitis + 1);
    res.status(206);
    res.setHeader("Content-Range", `bytes ${baslangic}-${bitis}/${ses.buffer.length}`);
    res.setHeader("Content-Length", parca.length);
    res.end(parca);
    return;
  }
  if (ses.buffer) {
    res.setHeader("Content-Length", ses.buffer.length);
    res.end(ses.buffer);
    return;
  }

  const controller = new AbortController();
  res.on("close", () => {
    if (!res.writableEnded) controller.abort();
  });

  try {
    const sonuc = await openAIAl().audio.speech.create({
      model: "tts-1",
      voice: "ash",
      input: ses.metin,
      response_format: "mp3",
    }, { signal: controller.signal });
    if (!sonuc.body) throw new Error("Ses akışı alınamadı.");

    res.status(200);
    res.flushHeaders();

    const parcalar: Buffer[] = [];
    let toplamBoyut = 0;
    let firstByteMs: number | undefined;
    for await (const hamParca of sonuc.body) {
      const parca = Buffer.from(hamParca);
      if (firstByteMs == null) firstByteMs = performance.now() - baslangic;
      toplamBoyut += parca.length;
      if (toplamBoyut > 5 * 1024 * 1024) throw new Error("Oluşturulan ses dosyası çok büyük.");
      parcalar.push(parca);
      if (!res.write(parca)) await new Promise<void>((resolve) => res.once("drain", resolve));
    }
    if (toplamBoyut === 0) throw new Error("Oluşturulan ses dosyası boş.");

    ses.buffer = Buffer.concat(parcalar, toplamBoyut);
    ses.metin = "";
    req.log.info({ authUserId: userId, audioId, byteLength: toplamBoyut }, "BBA cevabı akışla seslendirildi");
    res.end();
    void performanceMetricKaydet({
      userId,
      operation: "voice_speech",
      status: "success",
      durationMs: performance.now() - baslangic,
      firstByteMs,
    }).catch((metricError: unknown) => req.log.warn({ err: metricError }, "Ses akışı ölçümü kaydedilemedi"));
  } catch (error) {
    if (!controller.signal.aborted) {
      req.log.error({ authUserId: userId, audioId, err: error }, "BBA ses akışı başarısız");
    }
    if (!res.headersSent) {
      res.status(502).json({ hata: "BBA cevabı seslendirilemedi. Lütfen yeniden deneyin." });
    } else if (!res.writableEnded) {
      res.destroy(error instanceof Error ? error : undefined);
    }
    void performanceMetricKaydet({
      userId,
      operation: "voice_speech",
      status: controller.signal.aborted ? "cancelled" : "error",
      durationMs: performance.now() - baslangic,
      errorCode: error instanceof Error ? error.name : "unknown",
    }).catch((metricError: unknown) => req.log.warn({ err: metricError }, "Ses akışı hata ölçümü kaydedilemedi"));
  }
});

router.delete("/voice/speech/:audioId", (req, res) => {
  const userId = res.locals["authUserId"] as string;
  const audioId = req.params["audioId"] ?? "";
  const ses = GECICI_SESLER.get(audioId);
  if (ses?.userId === userId) GECICI_SESLER.delete(audioId);
  res.status(204).end();
});

export default router;
