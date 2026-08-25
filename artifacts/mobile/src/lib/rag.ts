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

import { supabase } from "./supabase";
import { hafizaKullanimiAcikMi } from "./hafizaAyarlari";

const API_BASE = process.env["EXPO_PUBLIC_API_BASE_URL"] ?? "";
const RAG_TIMEOUT_MS = 30_000;

export type RagHataTuru = "ag" | "timeout" | "sunucu" | "iptal";

export class RagIstekHatasi extends Error {
  constructor(
    public readonly tur: RagHataTuru,
    message: string
  ) {
    super(message);
    this.name = "RagIstekHatasi";
  }
}

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
  _userId?: string
): Promise<RagSonucu> {
  const memoryEnabled = await hafizaKullanimiAcikMi();
  const { data, error } = await supabase.auth.getSession();
  const accessToken = data.session?.access_token;
  if (error || !accessToken) {
    throw new RagIstekHatasi("sunucu", "Gecerli kullanici oturumu bulunamadi.");
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), RAG_TIMEOUT_MS);
  const yanit = await fetch(`${API_BASE}/api/rag`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ soru, memoryEnabled }),
    signal: controller.signal,
  }).catch((hata: unknown) => {
    const zamanAsimi = controller.signal.aborted ||
      (hata instanceof Error && hata.name === "AbortError");
    clearTimeout(timeoutId);
    if (zamanAsimi) {
      throw new RagIstekHatasi("timeout", "RAG istegi zaman asimina ugradi.");
    }
    throw new RagIstekHatasi("ag", "RAG sunucusuna baglanilamadi.");
  });
  clearTimeout(timeoutId);

  if (!yanit.ok) {
    const hata = await yanit.json().catch(() => ({})) as Record<string, unknown>;
    throw new Error((hata["hata"] as string | undefined) ?? `API hatası: ${yanit.status}`);
  }

  return yanit.json() as Promise<RagSonucu>;
}
