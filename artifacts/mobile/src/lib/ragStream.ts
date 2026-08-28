import { RagIstekHatasi, type RagSonucu } from "./rag";
import { supabase } from "./supabase";
import { hafizaKullanimiAcikMi } from "./hafizaAyarlari";
import { API_BASE_URL as API_BASE } from "./apiConfig";
import { performanceMetricGonder } from "./performanceMetric";
const STREAM_TIMEOUT_MS = 60_000;
// Sunucu en geç beş saniye içinde isteği kabul ettiğini belirten bir SSE olayı
// göndermelidir. Bu ilk olaydan sonra gerçek cevap akışı için genel 60 saniyelik
// güvenlik sınırı uygulanır.
const ILK_YANIT_TIMEOUT_MS = 5_000;

async function hazirlikAsamasiniZamanAsimliCalistir<T>(
  islem: Promise<T>,
  signal?: AbortSignal,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let tamamlandi = false;
    const bitir = (fn: () => void) => {
      if (tamamlandi) return;
      tamamlandi = true;
      clearTimeout(timeoutId);
      signal?.removeEventListener("abort", iptalEt);
      fn();
    };
    const iptalEt = () => bitir(() => reject(
      new RagIstekHatasi("iptal", "RAG hazırlığı kullanıcı tarafından iptal edildi.")
    ));
    const timeoutId = setTimeout(() => bitir(() => reject(
      new RagIstekHatasi("timeout", "RAG isteği hazırlık aşamasında zaman aşımına uğradı.")
    )), ILK_YANIT_TIMEOUT_MS);

    signal?.addEventListener("abort", iptalEt, { once: true });
    islem.then(
      (deger) => bitir(() => resolve(deger)),
      (hata: unknown) => bitir(() => reject(hata)),
    );
  });
}

interface SseOlayi {
  olay: string;
  veri: unknown;
}

function sseBlogunuAyikla(blok: string): SseOlayi | null {
  let olay = "message";
  const veriSatirlari: string[] = [];

  for (const satir of blok.split("\n")) {
    if (satir.startsWith("event:")) olay = satir.slice(6).trim();
    if (satir.startsWith("data:")) veriSatirlari.push(satir.slice(5).trimStart());
  }

  if (veriSatirlari.length === 0) return null;
  try {
    return { olay, veri: JSON.parse(veriSatirlari.join("\n")) as unknown };
  } catch {
    return null;
  }
}

export async function ragSorgusuStream(
  soru: string,
  onParca: (parca: string) => void,
  signal?: AbortSignal,
  conversationId?: string,
  language: "tr" | "en" = "tr",
): Promise<RagSonucu> {
  const istekBaslangici = performance.now();
  const [memoryEnabled, oturumSonucu] = await hazirlikAsamasiniZamanAsimliCalistir(
    Promise.all([hafizaKullanimiAcikMi(), supabase.auth.getSession()]),
    signal,
  );
  const { data, error } = oturumSonucu;
  const accessToken = data.session?.access_token;
  if (error || !accessToken) {
    throw new RagIstekHatasi("sunucu", "Gecerli kullanici oturumu bulunamadi.");
  }

  return new Promise<RagSonucu>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new RagIstekHatasi("iptal", "RAG streaming kullanici tarafindan iptal edildi."));
      return;
    }

    const xhr = new XMLHttpRequest();
    let okunanKarakter = 0;
    let tampon = "";
    let tamamlandi = false;
    let ilkYanitAlindi = false;
    let ilkTokenMs: number | undefined;
    let ilkYanitTimeout: ReturnType<typeof setTimeout> | null = null;

    const abortDinleyicisi = () => xhr.abort();
    signal?.addEventListener("abort", abortDinleyicisi, { once: true });

    const temizle = () => {
      signal?.removeEventListener("abort", abortDinleyicisi);
      if (ilkYanitTimeout) clearTimeout(ilkYanitTimeout);
      ilkYanitTimeout = null;
    };

    const basarisiz = (hata: RagIstekHatasi) => {
      if (tamamlandi) return;
      tamamlandi = true;
      temizle();
      void performanceMetricGonder({
        operation: "client_rag",
        status: hata.tur === "timeout" ? "timeout" : hata.tur === "iptal" ? "cancelled" : "error",
        durationMs: performance.now() - istekBaslangici,
        firstResponseMs: ilkTokenMs,
        conversationId,
      });
      reject(hata);
    };

    const sseOlayiniIsle = (blok: string) => {
      const sse = sseBlogunuAyikla(blok);
      if (!sse) return;

      if (sse.olay === "token") {
        const veri = sse.veri as { parca?: unknown };
        if (typeof veri.parca === "string") {
          if (ilkTokenMs == null) ilkTokenMs = performance.now() - istekBaslangici;
          onParca(veri.parca);
        }
        return;
      }

      if (sse.olay === "done") {
        if (tamamlandi) return;
        const sonuc = sse.veri as RagSonucu;
        if (sonuc.kaynakBulundu && sonuc.kullanilanKaynaklar.length === 0) {
          basarisiz(new RagIstekHatasi(
            "sunucu",
            "Kaynak kullanan cevap icin kaynak bilgisi donmedi."
          ));
          return;
        }
        tamamlandi = true;
        temizle();
        void performanceMetricGonder({
          operation: "client_rag",
          status: "success",
          durationMs: performance.now() - istekBaslangici,
          firstResponseMs: ilkTokenMs,
          conversationId,
        });
        resolve(sonuc);
        return;
      }

      if (sse.olay === "error") {
        const veri = sse.veri as { hata?: unknown };
        basarisiz(new RagIstekHatasi(
          "sunucu",
          typeof veri.hata === "string" ? veri.hata : "Streaming sunucu hatasi."
        ));
      }
    };

    xhr.open("POST", `${API_BASE}/api/rag`);
    xhr.setRequestHeader("Content-Type", "application/json");
    xhr.setRequestHeader("Authorization", `Bearer ${accessToken}`);
    xhr.timeout = STREAM_TIMEOUT_MS;

    const gelenVeriyiIsle = () => {
      if (!ilkYanitAlindi && xhr.responseText.length > 0) {
        ilkYanitAlindi = true;
        if (ilkYanitTimeout) clearTimeout(ilkYanitTimeout);
        ilkYanitTimeout = null;
      }
      const yeniBolum = xhr.responseText.slice(okunanKarakter);
      okunanKarakter = xhr.responseText.length;
      tampon = (tampon + yeniBolum).replace(/\r\n/g, "\n");

      let sinir = tampon.indexOf("\n\n");
      while (sinir >= 0) {
        const blok = tampon.slice(0, sinir);
        tampon = tampon.slice(sinir + 2);
        sseOlayiniIsle(blok);
        sinir = tampon.indexOf("\n\n");
      }
    };

    xhr.onprogress = gelenVeriyiIsle;

    xhr.onload = () => {
      gelenVeriyiIsle();
      if (tamamlandi) return;
      if (xhr.status < 200 || xhr.status >= 300) {
        basarisiz(new RagIstekHatasi("sunucu", `API hatasi: ${xhr.status}`));
        return;
      }
      basarisiz(new RagIstekHatasi("sunucu", "Streaming yaniti tamamlanamadi."));
    };

    xhr.onerror = () => basarisiz(new RagIstekHatasi("ag", "RAG sunucusuna baglanilamadi."));
    xhr.ontimeout = () => basarisiz(new RagIstekHatasi("timeout", "RAG streaming zaman asimi."));
    xhr.onabort = () => basarisiz(new RagIstekHatasi("iptal", "RAG streaming kullanici tarafindan iptal edildi."));

    ilkYanitTimeout = setTimeout(() => {
      basarisiz(new RagIstekHatasi("timeout", "RAG sunucusundan ilk yanit zamaninda gelmedi."));
      xhr.abort();
    }, ILK_YANIT_TIMEOUT_MS);

    xhr.send(JSON.stringify({
      soru,
      stream: true,
      conversationId,
      memoryEnabled,
      language,
    }));
  });
}
