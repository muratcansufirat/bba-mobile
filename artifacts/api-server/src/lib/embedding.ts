/**
 * BBA Embedding Yardımcısı (sunucu tarafı)
 *
 * OpenAI text-embedding-3-small modelini kullanarak metin → vektör dönüşümü yapar.
 * OPENAI_API_KEY yalnızca bu modül üzerinden okunur; istemci tarafına asla aktarılmaz.
 */

import OpenAI from "openai";
import { createHash } from "node:crypto";

const EMBEDDING_MODELI = "text-embedding-3-small";
const ONBELLEK_SURESI_MS = 24 * 60 * 60 * 1000;
const ONBELLEK_AZAMI_KAYIT = 500;
const CEVIRI_ONBELLEK_AZAMI_KAYIT = 500;

interface EmbeddingOnbellekKaydi {
  embedding: number[];
  expiresAt: number;
}

const embeddingOnbellegi = new Map<string, EmbeddingOnbellekKaydi>();
const devamEdenEmbeddingler = new Map<string, Promise<number[]>>();
const turkceAramaSorgusuOnbellegi = new Map<string, string>();
let onbellekIsabeti = 0;
let onbellekIskasi = 0;
let birlestirilenIstek = 0;

export interface EmbeddingOlcumu {
  model: string;
  tokens: number;
  apiCall: boolean;
}

let _openai: OpenAI | null = null;

function getOpenAI(): OpenAI {
  if (!_openai) {
    const apiKey = process.env["OPENAI_API_KEY"];
    if (!apiKey) {
      throw new Error(
        "OPENAI_API_KEY ortam değişkeni tanımlı değil. API sunucusunun .env dosyasına ekleyin."
      );
    }
    _openai = new OpenAI({ apiKey });
  }
  return _openai;
}

/**
 * Türkçe bilgi tabanında arama yapabilmek için İngilizce kullanıcı sorusunu
 * yalnızca arama amacıyla Türkçeye dönüştürür. Kullanıcıya gösterilen soru ve
 * üretilecek yanıt dili bu işlemden etkilenmez.
 */
export async function aramaSorgusunuTurkcelestir(metin: string): Promise<string> {
  const temizMetin = metin.normalize("NFKC").replace(/\s+/g, " ").trim();
  if (!temizMetin) return temizMetin;

  const anahtar = temizMetin.toLocaleLowerCase("en-US");
  const onbellekteki = turkceAramaSorgusuOnbellegi.get(anahtar);
  if (onbellekteki) return onbellekteki;

  const yanit = await getOpenAI().chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0,
    max_tokens: 300,
    messages: [
      {
        role: "system",
        content: "Translate the user's search query into natural Turkish. Preserve meaning, names and intent. Return only the Turkish query; do not answer it.",
      },
      { role: "user", content: temizMetin },
    ],
  }, { timeout: 3_000, maxRetries: 0 });

  const turkceSorgu = yanit.choices[0]?.message?.content?.trim();
  if (!turkceSorgu) return temizMetin;

  while (turkceAramaSorgusuOnbellegi.size >= CEVIRI_ONBELLEK_AZAMI_KAYIT) {
    const enEski = turkceAramaSorgusuOnbellegi.keys().next().value as string | undefined;
    if (!enEski) break;
    turkceAramaSorgusuOnbellegi.delete(enEski);
  }
  turkceAramaSorgusuOnbellegi.set(anahtar, turkceSorgu);
  return turkceSorgu;
}

function embeddingAnahtari(metin: string): string {
  const normalizeMetin = metin
    .normalize("NFKC")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleLowerCase("tr-TR");

  return createHash("sha256")
    .update(`${EMBEDDING_MODELI}\n${normalizeMetin}`, "utf8")
    .digest("hex");
}

function onbellektenGetir(anahtar: string): number[] | null {
  const kayit = embeddingOnbellegi.get(anahtar);
  if (!kayit) return null;

  if (kayit.expiresAt <= Date.now()) {
    embeddingOnbellegi.delete(anahtar);
    return null;
  }

  // Map ekleme sırası LRU sırası olarak kullanılır.
  embeddingOnbellegi.delete(anahtar);
  embeddingOnbellegi.set(anahtar, kayit);
  return [...kayit.embedding];
}

function onbellegeEkle(anahtar: string, embedding: number[]): void {
  const simdi = Date.now();
  for (const [kayitAnahtari, kayit] of embeddingOnbellegi) {
    if (kayit.expiresAt <= simdi) embeddingOnbellegi.delete(kayitAnahtari);
  }

  while (embeddingOnbellegi.size >= ONBELLEK_AZAMI_KAYIT) {
    const enEskiAnahtar = embeddingOnbellegi.keys().next().value as string | undefined;
    if (!enEskiAnahtar) break;
    embeddingOnbellegi.delete(enEskiAnahtar);
  }

  embeddingOnbellegi.set(anahtar, {
    embedding: [...embedding],
    expiresAt: simdi + ONBELLEK_SURESI_MS,
  });
}

export function embeddingOnbellekIstatistigi(): {
  kayit: number;
  isabet: number;
  iska: number;
  birlestirilen: number;
} {
  return {
    kayit: embeddingOnbellegi.size,
    isabet: onbellekIsabeti,
    iska: onbellekIskasi,
    birlestirilen: birlestirilenIstek,
  };
}

/**
 * Verilen metni OpenAI text-embedding-3-small ile vektöre dönüştürür.
 * 1536 boyutlu float dizisi döner.
 */
export async function embeddingOlustur(
  metin: string,
  onOlcum?: (olcum: EmbeddingOlcumu) => void,
): Promise<number[]> {
  const temizMetin = metin.trim();
  if (!temizMetin) {
    throw new Error("Boş metin embedding'e dönüştürülemez.");
  }

  const anahtar = embeddingAnahtari(temizMetin);
  const onbellekteki = onbellektenGetir(anahtar);
  if (onbellekteki) {
    onbellekIsabeti++;
    onOlcum?.({ model: EMBEDDING_MODELI, tokens: 0, apiCall: false });
    return onbellekteki;
  }

  const devamEden = devamEdenEmbeddingler.get(anahtar);
  if (devamEden) {
    birlestirilenIstek++;
    onOlcum?.({ model: EMBEDDING_MODELI, tokens: 0, apiCall: false });
    return [...(await devamEden)];
  }

  onbellekIskasi++;
  const istek = (async () => {
    const openai = getOpenAI();

    const yanit = await openai.embeddings.create({
      model: EMBEDDING_MODELI,
      input: temizMetin,
      encoding_format: "float",
    });

    const embedding = yanit.data[0]?.embedding;
    if (!embedding || embedding.length !== 1536 || !embedding.every(Number.isFinite)) {
      throw new Error("OpenAI geçerli bir embedding döndürmedi.");
    }

    onbellegeEkle(anahtar, embedding);
    onOlcum?.({ model: EMBEDDING_MODELI, tokens: yanit.usage?.total_tokens ?? 0, apiCall: true });
    return embedding;
  })();

  devamEdenEmbeddingler.set(anahtar, istek);

  try {
    return [...(await istek)];
  } finally {
    devamEdenEmbeddingler.delete(anahtar);
  }
}
