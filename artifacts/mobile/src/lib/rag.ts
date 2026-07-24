/**
 * BBA RAG İstemcisi (mobil taraf)
 *
 * /api/rag endpoint'ini çağırır:
 *   1. Soruyu embedding'e dönüştürür
 *   2. bba_knowledge_base'de semantik arama yapar
 *   3. Bulunan kaynaklarla GPT-4o-mini'ye cevap ürettir
 *
 * OpenAI API anahtarı hiçbir zaman istemci tarafında bulunmaz.
 */

const API_BASE = process.env["EXPO_PUBLIC_API_BASE_URL"] ?? "";

export interface RagKaynak {
  title: string;
  source: string | null;
  source_url: string | null;
}

export interface RagSonucu {
  cevap: string;
  kullanilanKaynaklar: RagKaynak[];
  kaynakBulundu: boolean;
  aramaToplamı: number;
}

/**
 * Kullanıcı sorusunu RAG pipeline'ına gönderir.
 * userId verilirse sunucu, kullanıcı hafızasını GPT context'ine ekler.
 *
 * @param soru    Kullanıcı sorusu
 * @param userId  Supabase auth UUID (profil.id) — opsiyonel
 */
export async function ragSorgusu(
  soru: string,
  userId?: string
): Promise<RagSonucu> {
  const yanit = await fetch(`${API_BASE}/api/rag`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ soru, ...(userId ? { userId } : {}) }),
  });

  if (!yanit.ok) {
    const hata = await yanit.json().catch(() => ({})) as Record<string, unknown>;
    throw new Error((hata["hata"] as string | undefined) ?? `API hatası: ${yanit.status}`);
  }

  return yanit.json() as Promise<RagSonucu>;
}
