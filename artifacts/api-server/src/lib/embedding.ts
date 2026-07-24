/**
 * BBA Embedding Yardımcısı (sunucu tarafı)
 *
 * OpenAI text-embedding-3-small modelini kullanarak metin → vektör dönüşümü yapar.
 * OPENAI_API_KEY yalnızca bu modül üzerinden okunur; istemci tarafına asla aktarılmaz.
 */

import OpenAI from "openai";

let _openai: OpenAI | null = null;

function getOpenAI(): OpenAI {
  if (!_openai) {
    const apiKey = process.env["OPENAI_API_KEY"];
    if (!apiKey) {
      throw new Error(
        "OPENAI_API_KEY ortam değişkeni tanımlı değil. Replit Secrets bölümünden ekleyin."
      );
    }
    _openai = new OpenAI({ apiKey });
  }
  return _openai;
}

/**
 * Verilen metni OpenAI text-embedding-3-small ile vektöre dönüştürür.
 * 1536 boyutlu float dizisi döner.
 */
export async function embeddingOlustur(metin: string): Promise<number[]> {
  if (!metin.trim()) {
    throw new Error("Boş metin embedding'e dönüştürülemez.");
  }

  const openai = getOpenAI();

  const yanit = await openai.embeddings.create({
    model: "text-embedding-3-small",
    input: metin.trim(),
    encoding_format: "float",
  });

  return yanit.data[0].embedding;
}
