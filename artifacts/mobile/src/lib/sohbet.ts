import { supabase } from "./supabase";

// ── Tipler ──────────────────────────────────────────────────────────────────

export type DbKaynak = {
  id: string;
  message_id: string;
  baslik: string | null;
  kaynak_url: string | null;
};

export type DbMesaj = {
  id: string;
  conversation_id: string;
  sender_type: "user" | "bba";
  icerik: string;
  created_at: string;
  sources: DbKaynak[];
};

export type DbConversation = {
  id: string;
  baslik: string | null;
  is_pinned: boolean;
  created_at: string;
  updated_at: string;
};

// ── Yardımcı ─────────────────────────────────────────────────────────────────

/**
 * auth.users UUID'sini public.users.id'ye çevirir.
 * bba_conversations.user_id FK'sı public.users.id'ye bağlı olduğu için
 * auth UUID'yi doğrudan kullanmak FK ihlali yaratır.
 */
async function publicUserIdGetir(authUserId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from("users")
    .select("id")
    .eq("auth_user_id", authUserId)
    .maybeSingle();
  if (error || !data) {
    console.warn("[BBA] publicUserIdGetir: public.users kaydı bulunamadı:", authUserId, error?.message);
    return null;
  }
  return data.id as string;
}

/** Conversation'ın updated_at alanını şimdiki zamana günceller */
async function sohbetZamanGuncelle(conversationId: string) {
  await supabase
    .from("bba_conversations")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", conversationId);
}

/** Mesaj listesi için paylaşılan source yükleme mantığı */
async function sourcelarYukle(
  msgs: Array<{ id: unknown; sender_type: unknown }>
): Promise<Record<string, DbKaynak[]>> {
  const bbaIds = msgs
    .filter((m) => m.sender_type === "bba")
    .map((m) => m.id as string);

  const sourcesMap: Record<string, DbKaynak[]> = {};
  if (bbaIds.length > 0) {
    const { data: sources } = await supabase
      .from("bba_message_sources")
      .select("*")
      .in("message_id", bbaIds);

    for (const src of sources ?? []) {
      const mid = src.message_id as string;
      if (!sourcesMap[mid]) sourcesMap[mid] = [];
      sourcesMap[mid].push(src as DbKaynak);
    }
  }
  return sourcesMap;
}

function rowToDbMesaj(m: Record<string, unknown>, sourcesMap: Record<string, DbKaynak[]>): DbMesaj {
  return {
    id: m.id as string,
    conversation_id: m.conversation_id as string,
    sender_type: m.sender_type as "user" | "bba",
    icerik: m.icerik as string,
    created_at: m.created_at as string,
    sources: sourcesMap[m.id as string] ?? [],
  };
}

// ── API ───────────────────────────────────────────────────────────────────────

/**
 * Kullanıcının en son conversation'ını ve mesajlarını yükler.
 * Conversation yoksa boş döner.
 */
export async function sonSohbetiYukle(userId: string): Promise<{
  conversationId: string | null;
  mesajlar: DbMesaj[];
}> {
  const publicId = await publicUserIdGetir(userId);
  if (!publicId) return { conversationId: null, mesajlar: [] };

  const { data: conv } = await supabase
    .from("bba_conversations")
    .select("id")
    .eq("user_id", publicId)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!conv) return { conversationId: null, mesajlar: [] };

  const { data: msgs, error } = await supabase
    .from("bba_messages")
    .select("*")
    .eq("conversation_id", conv.id)
    .order("created_at", { ascending: true });

  if (error || !msgs || msgs.length === 0) {
    return { conversationId: conv.id as string, mesajlar: [] };
  }

  const sourcesMap = await sourcelarYukle(msgs);
  return {
    conversationId: conv.id as string,
    mesajlar: msgs.map((m) => rowToDbMesaj(m as Record<string, unknown>, sourcesMap)),
  };
}

/**
 * Belirli bir conversation'ın mesajlarını yükler.
 */
export async function sohbetiYukle(conversationId: string): Promise<DbMesaj[]> {
  const { data: msgs, error } = await supabase
    .from("bba_messages")
    .select("*")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true });

  if (error || !msgs || msgs.length === 0) return [];

  const sourcesMap = await sourcelarYukle(msgs);
  return msgs.map((m) => rowToDbMesaj(m as Record<string, unknown>, sourcesMap));
}

/**
 * Kullanıcının tüm conversation'larını listeler.
 * Sıralama: önce sabitlenmiş, sonra updated_at azalan.
 */
export async function sohbetlerListele(userId: string): Promise<DbConversation[]> {
  const publicId = await publicUserIdGetir(userId);
  if (!publicId) return [];

  const { data, error } = await supabase
    .from("bba_conversations")
    .select("id, baslik, is_pinned, created_at, updated_at")
    .eq("user_id", publicId)
    .order("is_pinned", { ascending: false })
    .order("updated_at", { ascending: false });

  if (error || !data) return [];
  return data as DbConversation[];
}

/**
 * Bir conversation'ın sabitleme durumunu değiştirir.
 * Başarı durumunda true döner.
 */
export async function sohbetSabitle(conversationId: string, isPinned: boolean): Promise<boolean> {
  const { error } = await supabase
    .from("bba_conversations")
    .update({ is_pinned: isPinned })
    .eq("id", conversationId);
  return !error;
}

/**
 * Bir conversation'ı ve bağlı tüm mesajları / kaynakları siler.
 * Sıra: bba_message_sources → bba_messages → bba_conversations
 * Başarı durumunda true döner.
 */
export async function sohbetSil(conversationId: string): Promise<boolean> {
  // 1. Mesaj ID'lerini al
  const { data: msgs } = await supabase
    .from("bba_messages")
    .select("id")
    .eq("conversation_id", conversationId);

  const msgIds = (msgs ?? []).map((m) => (m as { id: string }).id);

  // 2. Kaynakları sil (FK ihlalini önler)
  if (msgIds.length > 0) {
    const { error: srcErr } = await supabase
      .from("bba_message_sources")
      .delete()
      .in("message_id", msgIds);
    if (srcErr) {
      console.warn("[BBA] sohbetSil: bba_message_sources silinemedi:", srcErr.message, srcErr.code);
      return false;
    }
  }

  // 3. Mesajları sil
  const { error: msgErr } = await supabase
    .from("bba_messages")
    .delete()
    .eq("conversation_id", conversationId);
  if (msgErr) {
    console.warn("[BBA] sohbetSil: bba_messages silinemedi:", msgErr.message, msgErr.code);
    return false;
  }

  // 4. Conversation'ı sil
  const { error: convErr } = await supabase
    .from("bba_conversations")
    .delete()
    .eq("id", conversationId);
  if (convErr) {
    console.warn("[BBA] sohbetSil: bba_conversations silinemedi:", convErr.message, convErr.code);
  }
  return !convErr;
}

/**
 * Bir conversation'ın başlığını günceller.
 * Başarı durumunda true döner.
 */
export async function sohbetAdlandir(conversationId: string, title: string): Promise<boolean> {
  const { error } = await supabase
    .from("bba_conversations")
    .update({ baslik: title })
    .eq("id", conversationId);
  return !error;
}

/**
 * Yeni bir conversation oluşturur ve ID'sini döner.
 */
export async function yeniSohbetOlustur(userId: string): Promise<string | null> {
  const publicId = await publicUserIdGetir(userId);
  if (!publicId) {
    console.warn("[BBA] yeniSohbetOlustur: public.users.id çözümlenemedi, auth userId:", userId);
    return null;
  }

  const { data, error } = await supabase
    .from("bba_conversations")
    .insert({ user_id: publicId })
    .select("id")
    .single();

  if (error || !data) {
    console.warn("[BBA] yeniSohbetOlustur: conversation oluşturulamadı:", error?.message);
    return null;
  }
  return data.id as string;
}

/**
 * Bir mesajı kaydeder. BBA mesajları için kaynaklar da kaydedilir.
 * Conversation'ın updated_at alanı güncellenir.
 * DB ID'sini döner; hata durumunda null.
 */
export async function mesajKaydet(
  conversationId: string,
  senderType: "user" | "bba",
  message: string,
  sources?: Array<{ type: string; title: string; url: string }>
): Promise<string | null> {
  const { data, error } = await supabase
    .from("bba_messages")
    .insert({
      conversation_id: conversationId,
      sender_type: senderType,
      icerik: message,
    })
    .select("id")
    .single();

  if (error || !data) {
    console.warn("[BBA] mesajKaydet hatası:", error?.message);
    return null;
  }
  const msgId = data.id as string;

  if (sources && sources.length > 0) {
    const { error: srcErr } = await supabase.from("bba_message_sources").insert(
      sources.map((s) => ({
        message_id: msgId,
        baslik: s.title,
        kaynak_url: s.url || null,
      }))
    );
    if (srcErr) {
      console.warn("[BBA] Kaynak kaydı hatası:", srcErr.message);
    }
  }

  await sohbetZamanGuncelle(conversationId);
  return msgId;
}
