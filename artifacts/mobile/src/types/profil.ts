import type { User } from "@supabase/supabase-js";

export type KullaniciProfili = {
  id: string | null;
  eposta: string | null;
  adSoyad: string;
};

export const BOŞ_PROFİL: KullaniciProfili = {
  id: null,
  eposta: null,
  adSoyad: "",
};

export function kullaniciDanProfilOlustur(user: User | null | undefined): KullaniciProfili {
  if (!user) return BOŞ_PROFİL;
  const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
  const adSoyad =
    (typeof meta.full_name === "string" && meta.full_name) ||
    (typeof meta.name === "string" && meta.name) ||
    "";
  return {
    id: user.id,
    eposta: user.email ?? null,
    adSoyad,
  };
}
