/**
 * BBA Cevap Üretici (sunucu tarafı)
 *
 * Semantik arama sonuçlarını context olarak kullanıp
 * GPT-4o-mini ile Türkçe cevap üretir.
 * Kullanıcı hafızası varsa ayrı bir bölüm olarak eklenir —
 * yalnızca hitap ve kişisel bağlam için kullanılır, asla kaynak yerine geçmez.
 */

import OpenAI from "openai";
import type { AramaSonucu } from "./arama";
import type { HafizaKaydi } from "./hafiza";

const ICERIK_LIMIT = 3000;

let _openai: OpenAI | null = null;

function getOpenAI(): OpenAI {
  if (!_openai) {
    const apiKey = process.env["OPENAI_API_KEY"];
    if (!apiKey) {
      throw new Error("OPENAI_API_KEY ortam değişkeni tanımlı değil.");
    }
    _openai = new OpenAI({ apiKey });
  }
  return _openai;
}

const SISTEM_MESAJI = `Sen BBA (Birleşik Bilinç Alanı) asistanısın.

Sana üç şey verilecek:
1. Kullanıcı sorusu
2. (Varsa) Bilgi tabanı kaynakları — BBA içerikleri
3. (Varsa) Kullanıcı hafızası — kullanıcıya özel kişisel bilgiler

KURALLAR — kesinlikle uygula:

A) Bilgi tabanı kaynakları:
   - Cevabını YALNIZCA bu kaynaklara dayan.
   - Kaynaklarda olmayan bilgiyi ekleme, uydurma.
   - Kaynaklar yeterliyse net ve açık cevap ver.
   - Kaynaklar soruyu yanıtlamaya yetmiyorsa şunu söyle: "Bu konuda bilgi tabanımda yeterli bilgi bulunamadı."
   - Cevabın sonunda hangi kaynağa dayandığını belirt.

B) Kullanıcı hafızası:
   - Hafızayı YALNIZCA hitap şekli (lakap), kişisel tercihler ve bağlam için kullan.
   - Hafıza asla bilgi tabanı kaynağı yerine geçmez.
   - Kaynak bulunamadığında hafızadan bilgi/içerik cevabı üretme.
   - Örnek doğru kullanım: kullanıcının adıyla hitap etmek, tercihine göre ton ayarlamak.

C) Türkçe cevap ver.`;

export interface CevapSonucu {
  cevap: string;
  kullanilanKaynaklar: Array<{
    title: string;
    source: string | null;
    source_url: string | null;
  }>;
  kaynakBulundu: boolean;
}

function dedupAnahtari(k: AramaSonucu): string {
  if (k.source_url?.trim()) return k.source_url.trim().toLowerCase();
  return k.title.trim().toLowerCase().replace(/\s+/g, " ");
}

function kaynaklariHazirla(kaynaklar: AramaSonucu[]): AramaSonucu[] {
  const gorulmus = new Set<string>();
  const sonuc: AramaSonucu[] = [];
  for (const k of kaynaklar) {
    const anahtar = dedupAnahtari(k);
    if (gorulmus.has(anahtar)) continue;
    gorulmus.add(anahtar);
    sonuc.push({
      ...k,
      content:
        k.content.length > ICERIK_LIMIT
          ? k.content.slice(0, ICERIK_LIMIT) + "…"
          : k.content,
    });
  }
  return sonuc;
}

function hafizaBolumu(hafiza: HafizaKaydi[]): string {
  if (hafiza.length === 0) return "";

  const etiketler: Record<HafizaKaydi["memory_type"], string> = {
    nickname: "Lakap/Ad",
    preference: "Tercih",
    important_fact: "Önemli bilgi",
  };

  const satirlar = hafiza.map((h) => `- ${etiketler[h.memory_type]}: ${h.content}`);

  return (
    "\n\n--- KULLANICI HAFIZASI (Yalnızca hitap ve kişisel bağlam için; bilgi kaynağı değil) ---\n" +
    satirlar.join("\n")
  );
}

/**
 * Semantik arama sonuçlarını ve isteğe bağlı kullanıcı hafızasını
 * GPT-4o-mini'ye göndererek cevap üretir.
 *
 * @param soru      Kullanıcı sorusu
 * @param kaynaklar Semantik aramadan dönen kayıtlar
 * @param hafiza    Kullanıcının aktif hafıza kayıtları (opsiyonel)
 */
export async function cevapUret(
  soru: string,
  kaynaklar: AramaSonucu[],
  hafiza: HafizaKaydi[] = []
): Promise<CevapSonucu> {
  const openai = getOpenAI();

  if (kaynaklar.length === 0) {
    const hafizaBol = hafizaBolumu(hafiza);
    const hitap = hafiza.find((h) => h.memory_type === "nickname");
    const cevap = hitap
      ? `${hitap.content}, bu konuda bilgi tabanımda yeterli bilgi bulunamadı.`
      : "Bu konuda bilgi tabanımda yeterli bilgi bulunamadı.";

    return {
      cevap,
      kullanilanKaynaklar: [],
      kaynakBulundu: false,
    };
  }

  const hazirKaynaklar = kaynaklariHazirla(kaynaklar);

  const contextMetni = hazirKaynaklar
    .map((k, i) => {
      const satirlar = [`--- Kaynak ${i + 1}: ${k.title} ---`, k.content];
      if (k.source) satirlar.push(`Kaynak: ${k.source}`);
      if (k.source_url) satirlar.push(`URL: ${k.source_url}`);
      return satirlar.join("\n");
    })
    .join("\n\n");

  const kullanimciMesaji =
    `Kullanıcı sorusu: ${soru}\n\n` +
    `BİLGİ TABANI KAYNAKLARI:\n\n${contextMetni}` +
    hafizaBolumu(hafiza);

  const yanit = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: SISTEM_MESAJI },
      { role: "user", content: kullanimciMesaji },
    ],
    temperature: 0.3,
    max_tokens: 1024,
  });

  const cevap = yanit.choices[0]?.message?.content ?? "";
  const kullanim = yanit.usage;

  if (kullanim) {
    const gonderilenSayisi = hazirKaynaklar.length;
    const atilacakSayisi = kaynaklar.length - gonderilenSayisi;
    console.info(
      `[BBA/RAG] kaynaklar: ${gonderilenSayisi}/${kaynaklar.length}` +
        (atilacakSayisi > 0 ? ` (${atilacakSayisi} tekilleştirildi)` : "") +
        ` | hafıza: ${hafiza.length} kayıt` +
        ` | tokens — prompt: ${kullanim.prompt_tokens}, completion: ${kullanim.completion_tokens}, toplam: ${kullanim.total_tokens}`
    );
  }

  return {
    cevap,
    kullanilanKaynaklar: hazirKaynaklar.map((k) => ({
      title: k.title,
      source: k.source,
      source_url: k.source_url,
    })),
    kaynakBulundu: true,
  };
}
