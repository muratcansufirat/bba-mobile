import type { NextFunction, Request, Response } from "express";

type RateLimitKaydi = {
  count: number;
  resetAt: number;
};

type RateLimitSecenekleri = {
  ad: string;
  limit: number;
  pencereMs: number;
  anahtar: (req: Request, res: Response) => string | undefined;
};

const kayitlar = new Map<string, RateLimitKaydi>();
const TEMIZLIK_ARALIGI_MS = 5 * 60_000;

const temizlikZamanlayicisi = setInterval(() => {
  const simdi = Date.now();
  for (const [anahtar, kayit] of kayitlar) {
    if (kayit.resetAt <= simdi) kayitlar.delete(anahtar);
  }
}, TEMIZLIK_ARALIGI_MS);
temizlikZamanlayicisi.unref();

function pozitifTamSayi(deger: string | undefined, varsayilan: number): number {
  const sayi = Number(deger);
  return Number.isInteger(sayi) && sayi > 0 ? sayi : varsayilan;
}

function rateLimitOlustur({ ad, limit, pencereMs, anahtar }: RateLimitSecenekleri) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const kimlik = anahtar(req, res);
    if (!kimlik) {
      req.log.error({ rateLimit: ad }, "Rate limit anahtari olusturulamadi");
      res.status(500).json({ hata: "Istek guvenlik kontrolu tamamlanamadi." });
      return;
    }

    const simdi = Date.now();
    const kayitAnahtari = `${ad}:${kimlik}`;
    let kayit = kayitlar.get(kayitAnahtari);
    if (!kayit || kayit.resetAt <= simdi) {
      kayit = { count: 0, resetAt: simdi + pencereMs };
      kayitlar.set(kayitAnahtari, kayit);
    }

    kayit.count += 1;
    const kalan = Math.max(0, limit - kayit.count);
    const yenidenDeneSaniye = Math.max(1, Math.ceil((kayit.resetAt - simdi) / 1000));

    res.setHeader("RateLimit-Limit", String(limit));
    res.setHeader("RateLimit-Remaining", String(kalan));
    res.setHeader("RateLimit-Reset", String(yenidenDeneSaniye));

    if (kayit.count > limit) {
      res.setHeader("Retry-After", String(yenidenDeneSaniye));
      req.log.warn({ rateLimit: ad, retryAfterSeconds: yenidenDeneSaniye }, "Istek siniri asildi");
      res.status(429).json({
        hata: "Cok fazla istek gonderildi. Lutfen kisa bir sure sonra yeniden deneyin.",
        yenidenDeneSaniye,
      });
      return;
    }

    next();
  };
}

const pencereMs = pozitifTamSayi(process.env["RATE_LIMIT_WINDOW_MS"], 60_000);

export const ipRateLimit = rateLimitOlustur({
  ad: "ip",
  limit: pozitifTamSayi(process.env["RATE_LIMIT_IP_MAX"], 240),
  pencereMs,
  anahtar: (req) => req.ip || req.socket.remoteAddress || undefined,
});

export const kullaniciRateLimit = rateLimitOlustur({
  ad: "user",
  limit: pozitifTamSayi(process.env["RATE_LIMIT_USER_MAX"], 120),
  pencereMs,
  anahtar: (_req, res) => res.locals["authUserId"] as string | undefined,
});
