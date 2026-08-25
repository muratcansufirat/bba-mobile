import { supabase } from "./supabase";

export type DbKullaniciNotu = {
  id: string;
  title: string;
  content: string;
  created_at: string;
  updated_at: string;
};

async function publicUserIdGetir(authUserId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from("users")
    .select("id")
    .eq("auth_user_id", authUserId)
    .maybeSingle();

  if (error || !data) return null;
  return data.id as string;
}

export async function notlariListele(
  authUserId: string,
): Promise<{ notlar: DbKullaniciNotu[]; hata: boolean }> {
  const publicId = await publicUserIdGetir(authUserId);
  if (!publicId) return { notlar: [], hata: true };

  const { data, error } = await supabase
    .from("bba_user_notes")
    .select("id, title, content, created_at, updated_at")
    .eq("user_id", publicId)
    .order("updated_at", { ascending: false });

  return {
    notlar: error ? [] : (data ?? []) as DbKullaniciNotu[],
    hata: Boolean(error),
  };
}

export async function notKaydet(
  authUserId: string,
  noteId: string | null,
  title: string,
  content: string,
): Promise<DbKullaniciNotu | null> {
  const publicId = await publicUserIdGetir(authUserId);
  if (!publicId) return null;

  const now = new Date().toISOString();
  const sorgu = noteId
    ? supabase
        .from("bba_user_notes")
        .update({ title, content, updated_at: now })
        .eq("id", noteId)
        .eq("user_id", publicId)
    : supabase
        .from("bba_user_notes")
        .insert({ user_id: publicId, title, content });

  const { data, error } = await sorgu
    .select("id, title, content, created_at, updated_at")
    .single();

  return error ? null : data as DbKullaniciNotu;
}

export async function notSil(authUserId: string, noteId: string): Promise<boolean> {
  const publicId = await publicUserIdGetir(authUserId);
  if (!publicId) return false;

  const { error } = await supabase
    .from("bba_user_notes")
    .delete()
    .eq("id", noteId)
    .eq("user_id", publicId);

  return !error;
}
