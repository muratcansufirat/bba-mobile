import { supabase } from "./supabase";

// ── Tipler ───────────────────────────────────────────────────────────────────

export type MemoryType = "nickname" | "preference" | "important_fact";

export interface HafizaKaydi {
  memory_type: MemoryType;
  content: string;
}

// ── Kural tabanlı çıkarım ─────────────────────────────────────────────────────

/**
 * Kullanıcı mesajını tarar; nickname, preference, important_fact
 * için kural tabanlı eşleşme yapar.
 */
export function mesajdanHafizaCikar(mesaj: string): HafizaKaydi[] {
  const sonuclar: HafizaKaydi[] = [];

  // ── Nickname ────────────────────────────────────────────────────────────────
  const nickMatch =
    mesaj.match(
      /bana\s+"?(.+?)"?\s+(?:de\b|diyebilirsin|diye\s+hitap\s+et|olarak\s+hitap\s+et|olarak\s+çağır|çağır)/i
    ) ||
    mesaj.match(/(?:benim\s+)?(?:adım|ismim)\s+([A-Za-zÇçĞğİıÖöŞşÜü]{2,})/i) ||
    mesaj.match(/beni\s+"?(.+?)"?\s+olarak\s+(?:çağır|bil|tanı)/i);
  if (nickMatch?.[1]) {
    sonuclar.push({ memory_type: "nickname", content: nickMatch[1].trim() });
  }

  // ── Preference ──────────────────────────────────────────────────────────────
  const prefPatterns = [
    /(.{3,40})\s+(?:seviyorum|severim|çok\s+seviyorum|bayılıyorum)/i,
    /(.{3,40})\s+(?:istemiyorum|sevmiyorum|nefret\s+ediyorum|hoşlanmıyorum)/i,
    /(.{3,40})\s+tercih\s+ediyorum/i,
    /(.{3,40})\s+hoşlanıyorum/i,
  ];
  for (const pat of prefPatterns) {
    const m = mesaj.match(pat);
    if (m?.[1] && m[1].trim().length >= 3) {
      sonuclar.push({ memory_type: "preference", content: mesaj.trim() });
      break;
    }
  }

  // ── Important fact ──────────────────────────────────────────────────────────
  const factPatterns: RegExp[] = [
    /\b\d{1,2}\s+yaşındayım\b/i,
    /\b[A-Za-zÇçĞğİıÖöŞşÜü]+(?:\s+[A-Za-zÇçĞğİıÖöŞşÜü]+)?\s+(?:olarak\s+çalışıyorum|çalışıyorum)\b/i,
    /\b[A-Za-zÇçĞğİıÖöŞşÜü]+\s+(?:mezunuyum|okudum|bitirdim)\b/i,
    /\b[A-Za-zÇçĞğİıÖöŞşÜü]+(?:'[a-zA-Z]{1,2})?\s+(?:yaşıyorum|oturuyorum)\b/i,
  ];
  for (const pat of factPatterns) {
    if (pat.test(mesaj)) {
      sonuclar.push({ memory_type: "important_fact", content: mesaj.trim() });
      break;
    }
  }

  return sonuclar;
}

// ── Supabase yazma ────────────────────────────────────────────────────────────

/**
 * Çıkarılan hafıza kayıtlarını bba_user_memories tablosuna yazar.
 *
 * Kurallar:
 * - nickname   → tek aktif kayıt; farklıysa güncelle, aynıysa atla.
 * - preference / important_fact → aynı içerik zaten aktifse ekleme, yoksa ekle.
 *
 * Hata durumunda sessizce geçer (kullanıcı akışını bozmaz).
 */
export async function hafizaKaydet(
  userId: string,
  conversationId: string,
  kayitlar: HafizaKaydi[]
): Promise<void> {
  for (const kayit of kayitlar) {
    try {
      if (kayit.memory_type === "nickname") {
        const { data: mevcut } = await supabase
          .from("bba_user_memories")
          .select("id, content")
          .eq("user_id", userId)
          .eq("memory_type", "nickname")
          .eq("is_active", true)
          .maybeSingle();

        if (mevcut) {
          if (mevcut.content === kayit.content) continue;
          await supabase
            .from("bba_user_memories")
            .update({
              content: kayit.content,
              source_conversation_id: conversationId,
              updated_at: new Date().toISOString(),
            })
            .eq("id", mevcut.id);
        } else {
          await supabase.from("bba_user_memories").insert({
            user_id: userId,
            memory_type: kayit.memory_type,
            content: kayit.content,
            source_conversation_id: conversationId,
            is_active: true,
          });
        }
      } else {
        const { data: mevcut } = await supabase
          .from("bba_user_memories")
          .select("id")
          .eq("user_id", userId)
          .eq("memory_type", kayit.memory_type)
          .eq("content", kayit.content)
          .eq("is_active", true)
          .maybeSingle();

        if (mevcut) continue;

        await supabase.from("bba_user_memories").insert({
          user_id: userId,
          memory_type: kayit.memory_type,
          content: kayit.content,
          source_conversation_id: conversationId,
          is_active: true,
        });
      }
    } catch {
      // Hafıza hatası kullanıcı akışını etkilemez
    }
  }
}
