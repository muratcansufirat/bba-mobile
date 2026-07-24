/**
 * BBA Embedding İstemcisi (mobil taraf)
 *
 * Kullanıcı sorusunun embedding vektörünü API server üzerinden alır.
 * OpenAI API anahtarı hiçbir zaman istemci tarafında bulunmaz.
 */

const API_BASE =
  process.env["EXPO_PUBLIC_API_BASE_URL"] ?? "";

/**
 * Verilen soruyu API server'a gönderir, 1536 boyutlu embedding vektörü döner.
 * Hata durumunda null döner.
 */
export async function soruEmbeddingAl(soru: string): Promise<number[] | null> {
  if (!soru.trim()) return null;

  try {
    const yanit = await fetch(`${API_BASE}/api/embedding`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ soru: soru.trim() }),
    });

    if (!yanit.ok) {
      const hata = await yanit.json().catch(() => ({}));
      console.warn("[BBA] Embedding alınamadı:", hata);
      return null;
    }

    const veri = await yanit.json();
    return veri.embedding as number[];
  } catch (err) {
    console.warn("[BBA] Embedding isteği başarısız:", err);
    return null;
  }
}
