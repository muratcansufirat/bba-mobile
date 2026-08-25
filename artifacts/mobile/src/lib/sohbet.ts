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
  is_favorite: boolean;
  favorite_paragraph_indexes: number[];
};

export type DbFavoriParagraf = {
  id: string;
  message_id: string;
  conversation_id: string;
  paragraph_index: number;
  paragraph_content: string;
  created_at: string;
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

/** Mesaj sayfasındaki favori BBA cevaplarını mevcut kullanıcı için yükler. */
async function favorilerYukle(
  msgs: Array<{ id: unknown; sender_type: unknown }>
): Promise<Map<string, number[]>> {
  const bbaIds = msgs
    .filter((m) => m.sender_type === "bba")
    .map((m) => m.id as string);

  if (bbaIds.length === 0) return new Map<string, number[]>();

  const { data, error } = await supabase
    .from("bba_message_favorites")
    .select("message_id, paragraph_index")
    .in("message_id", bbaIds);

  if (error) {
    console.warn("[BBA] Favoriler yüklenemedi:", error.message);
    return new Map<string, number[]>();
  }

  const sonuc = new Map<string, number[]>();
  for (const row of data ?? []) {
    const messageId = row.message_id as string;
    const indexes = sonuc.get(messageId) ?? [];
    indexes.push(Number(row.paragraph_index ?? 0));
    sonuc.set(messageId, indexes);
  }
  return sonuc;
}

function rowToDbMesaj(
  m: Record<string, unknown>,
  sourcesMap: Record<string, DbKaynak[]>,
  favoriParagrafIndeksleri: Map<string, number[]>,
): DbMesaj {
  const favoriIndeksleri = favoriParagrafIndeksleri.get(m.id as string) ?? [];
  return {
    id: m.id as string,
    conversation_id: m.conversation_id as string,
    sender_type: m.sender_type as "user" | "bba",
    icerik: m.icerik as string,
    created_at: m.created_at as string,
    sources: sourcesMap[m.id as string] ?? [],
    is_favorite: favoriIndeksleri.length > 0,
    favorite_paragraph_indexes: favoriIndeksleri,
  };
}

function mesajParagraflari(icerik: string): string[] {
  return icerik.split(/\n\n+/).filter((paragraf) =>
    paragraf.trim().length > 0 && !/^(?:Kaynaklar?|Sources?)\s*:/i.test(paragraf.trim())
  );
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

  const [sourcesMap, favoriMesajIdleri] = await Promise.all([
    sourcelarYukle(msgs),
    favorilerYukle(msgs),
  ]);
  return {
    conversationId: conv.id as string,
    mesajlar: msgs.map((m) => rowToDbMesaj(m as Record<string, unknown>, sourcesMap, favoriMesajIdleri)),
  };
}

/**
 * Belirli bir conversation'ın mesajlarını en yeniden eskiye sayfalı yükler.
 * Dönen sayfa, arayüzde doğru görünmesi için kronolojik sıraya çevrilir.
 */
export async function sohbetiYukle(
  conversationId: string,
  offset = 0,
  limit = 40,
  signal?: AbortSignal,
): Promise<{ mesajlar: DbMesaj[]; devamVar: boolean }> {
  let sorgu = supabase
    .from("bba_messages")
    .select("*")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .range(offset, offset + limit);

  if (signal) sorgu = sorgu.abortSignal(signal);

  const { data: msgs, error } = await sorgu;

  if (error || !msgs || msgs.length === 0) {
    return { mesajlar: [], devamVar: false };
  }

  const devamVar = msgs.length > limit;
  const sayfa = msgs.slice(0, limit).reverse();
  const [sourcesMap, favoriMesajIdleri] = await Promise.all([
    sourcelarYukle(sayfa),
    favorilerYukle(sayfa),
  ]);
  return {
    mesajlar: sayfa.map((m) => rowToDbMesaj(m as Record<string, unknown>, sourcesMap, favoriMesajIdleri)),
    devamVar,
  };
}

/**
 * Kullanıcının conversation'larını sayfalı olarak listeler.
 * Sıralama: önce sabitlenmiş, sonra updated_at azalan.
 */
export async function sohbetlerListele(
  userId: string,
  offset = 0,
  limit = 20,
  signal?: AbortSignal,
): Promise<{ konusmalar: DbConversation[]; devamVar: boolean; hata: boolean }> {
  const publicId = await publicUserIdGetir(userId);
  if (!publicId) return { konusmalar: [], devamVar: false, hata: true };

  let sorgu = supabase
    .from("bba_conversations")
    .select("id, baslik, is_pinned, created_at, updated_at")
    .eq("user_id", publicId)
    .order("is_pinned", { ascending: false })
    .order("updated_at", { ascending: false })
    .range(offset, offset + limit);

  if (signal) sorgu = sorgu.abortSignal(signal);
  const { data, error } = await sorgu;

  if (error || !data) return { konusmalar: [], devamVar: false, hata: true };

  const satirlar = (data as DbConversation[]).map((row) => ({
    id: row.id,
    baslik: row.baslik,
    is_pinned: row.is_pinned,
    created_at: row.created_at,
    updated_at: row.updated_at,
  }));
  return {
    konusmalar: satirlar.slice(0, limit),
    devamVar: satirlar.length > limit,
    hata: false,
  };
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
 * Sohbeti tek bir veritabanı işlemiyle siler.
 * bba_messages.conversation_id ve bba_message_sources.message_id foreign key'leri
 * ON DELETE CASCADE olduğundan bağlı mesajlar ve kaynaklar veritabanında atomik silinir.
 */
export async function sohbetSil(conversationId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from("bba_conversations")
    .delete()
    .eq("id", conversationId)
    .select("id")
    .maybeSingle();

  if (error || !data || data.id !== conversationId) {
    console.warn(
      "[BBA] sohbetSil: sohbet silinemedi:",
      error?.message ?? "Silinen sohbet veritabanı tarafından doğrulanmadı.",
      error?.code ?? "NO_DELETED_ROW",
    );
    return false;
  }

  // Silme yanıtı başarılı görünse bile kaydın gerçekten artık okunamadığını
  // doğrula. Böylece RLS veya ağ kaynaklı yarım işlemler başarılı sayılmaz.
  const { data: kalanKayit, error: dogrulamaHatasi } = await supabase
    .from("bba_conversations")
    .select("id")
    .eq("id", conversationId)
    .maybeSingle();

  if (dogrulamaHatasi || kalanKayit) {
    console.warn(
      "[BBA] sohbetSil: silme kalıcı olarak doğrulanamadı:",
      dogrulamaHatasi?.message ?? "Sohbet kaydı hâlâ mevcut.",
      dogrulamaHatasi?.code ?? "ROW_STILL_EXISTS",
    );
    return false;
  }

  return true;
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
 * Bir mesajı kaydeder.
 * Conversation'ın updated_at alanı güncellenir.
 * DB ID'sini döner; hata durumunda null.
 */
export async function mesajKaydet(
  conversationId: string,
  senderType: "user" | "bba",
  message: string
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

  await sohbetZamanGuncelle(conversationId);
  return msgId;
}

export async function mesajGuncelle(
  messageId: string,
  message: string
): Promise<boolean> {
  const { error } = await supabase
    .from("bba_messages")
    .update({ icerik: message })
    .eq("id", messageId);

  if (error) {
    console.warn("[BBA] mesajGuncelle hatasi:", error.message);
    return false;
  }

  return true;
}

/** Mesaj metnini ve tüm kaynaklarını veritabanında tek transaction içinde kesinleştirir. */
export async function mesajVeKaynaklariKesinlestir(
  messageId: string,
  message: string,
  sources: Array<{ type: string; title: string; url: string }>
): Promise<boolean> {
  const gorulen = new Set<string>();
  const tekilKaynaklar = sources.filter((source) => {
    const etiket = `${source.type} ${source.title}`
      .normalize("NFKC")
      .replace(/[^\p{L}\p{N}]+/gu, " ")
      .trim()
      .toLocaleLowerCase("tr-TR");
    const kanonikUrl = source.url.trim().toLowerCase().replace(/[?#].*$/, "").replace(/\/$/, "");
    const anahtar = etiket || kanonikUrl;
    if (gorulen.has(anahtar)) return false;
    gorulen.add(anahtar);
    return true;
  }).slice(0, 5);

  const { data, error } = await supabase.rpc("finalize_bba_message_with_sources", {
    p_message_id: messageId,
    p_content: message,
    p_sources: tekilKaynaklar.map((source) => ({
      title: `${source.type}|${source.title}`,
      url: source.url || null,
    })),
  });

  if (error || data !== true) {
    console.warn("[BBA] Mesaj ve kaynak transaction hatası:", error?.message ?? "RPC başarısız oldu.");
    return false;
  }
  return true;
}

/** BBA mesajını mevcut kullanıcının favorilerine ekler veya favorilerden çıkarır. */
export async function mesajFavoriDurumuDegistir(
  authUserId: string,
  messageId: string,
  paragraphIndex: number,
  favoriyeEkle: boolean,
): Promise<boolean> {
  const publicId = await publicUserIdGetir(authUserId);
  if (!publicId) return false;

  if (favoriyeEkle) {
    const { error } = await supabase
      .from("bba_message_favorites")
      .upsert(
        { user_id: publicId, message_id: messageId, paragraph_index: paragraphIndex },
        { onConflict: "user_id,message_id,paragraph_index", ignoreDuplicates: true },
      );
    if (error) console.warn("[BBA] Mesaj favorilere eklenemedi:", error.message);
    return !error;
  }

  const { error } = await supabase
    .from("bba_message_favorites")
    .delete()
    .eq("user_id", publicId)
    .eq("message_id", messageId)
    .eq("paragraph_index", paragraphIndex);
  if (error) console.warn("[BBA] Mesaj favorilerden çıkarılamadı:", error.message);
  return !error;
}

/** Kullanıcının favoriye aldığı cevap paragraflarını en yeniden eskiye getirir. */
export async function favoriParagraflariListele(
  authUserId: string,
): Promise<{ favoriler: DbFavoriParagraf[]; hata: boolean }> {
  const publicId = await publicUserIdGetir(authUserId);
  if (!publicId) return { favoriler: [], hata: true };

  const { data: favoriteRows, error: favoriteError } = await supabase
    .from("bba_message_favorites")
    .select("id, message_id, paragraph_index, created_at")
    .eq("user_id", publicId)
    .order("created_at", { ascending: false });

  if (favoriteError) {
    console.warn("[BBA] Favoriler listelenemedi:", favoriteError.message);
    return { favoriler: [], hata: true };
  }

  const messageIds = [...new Set((favoriteRows ?? []).map((row) => row.message_id as string))];
  if (messageIds.length === 0) return { favoriler: [], hata: false };

  const { data: messages, error: messageError } = await supabase
    .from("bba_messages")
    .select("id, conversation_id, icerik")
    .in("id", messageIds)
    .eq("sender_type", "bba");

  if (messageError) {
    console.warn("[BBA] Favori mesajları yüklenemedi:", messageError.message);
    return { favoriler: [], hata: true };
  }

  const messageMap = new Map((messages ?? []).map((message) => [message.id as string, message]));
  const favoriler = (favoriteRows ?? []).flatMap((row) => {
    const message = messageMap.get(row.message_id as string);
    const paragraphIndex = Number(row.paragraph_index ?? 0);
    const paragraph = message ? mesajParagraflari(message.icerik as string)[paragraphIndex] : null;
    if (!message || !paragraph) return [];
    return [{
      id: row.id as string,
      message_id: row.message_id as string,
      conversation_id: message.conversation_id as string,
      paragraph_index: paragraphIndex,
      paragraph_content: paragraph.trim(),
      created_at: row.created_at as string,
    } satisfies DbFavoriParagraf];
  });

  return { favoriler, hata: false };
}
