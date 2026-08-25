import express, { type Express, type NextFunction, type Request, type Response } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();
const productionOrtami = process.env["NODE_ENV"] === "production";
const gelistirmeOriginleri = new Set([
  "http://localhost:8081",
  "http://127.0.0.1:8081",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
]);
const yapilandirilmisOriginler = new Set(
  (process.env["CORS_ALLOWED_ORIGINS"] ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter((origin) => {
      if (!origin) return false;

      try {
        const adres = new URL(origin);
        return adres.origin === origin && (!productionOrtami || adres.protocol === "https:");
      } catch {
        return false;
      }
    }),
);

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors({
  origin(origin, callback) {
    // React Native istekleri Origin gondermez. Web originleri whitelist ile sinirlanir.
    if (
      !origin ||
      (!productionOrtami && gelistirmeOriginleri.has(origin)) ||
      yapilandirilmisOriginler.has(origin)
    ) {
      callback(null, true);
      return;
    }
    callback(null, false);
  },
}));
// İstek gövdeleri belleğe alınmadan önce açık sınırlarla reddedilir.
app.use(express.json({ limit: "256kb" }));
app.use(express.urlencoded({ extended: false, limit: "64kb", parameterLimit: 50 }));

app.use("/api", router);

app.use((error: unknown, req: Request, res: Response, next: NextFunction) => {
  const govdeHatasi = error as { type?: string; status?: number; statusCode?: number };
  if (govdeHatasi?.type === "entity.too.large" || govdeHatasi?.status === 413 || govdeHatasi?.statusCode === 413) {
    req.log.warn("İstek gövdesi boyut sınırını aştı");
    res.status(413).json({ hata: "İstek içeriği izin verilen boyutu aşıyor." });
    return;
  }
  next(error);
});

export default app;
