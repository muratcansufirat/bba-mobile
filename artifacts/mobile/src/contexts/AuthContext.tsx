import type { Session } from "@supabase/supabase-js";
import React, { createContext, useContext, useEffect, useRef, useState } from "react";

import { googleIleGirisYap } from "@/src/lib/googleAuth";
import { supabase } from "@/src/lib/supabase";
import { BOŞ_PROFİL, KullaniciProfili, kullaniciDanProfilOlustur } from "@/src/types/profil";

type SonucDurumu = { hata: string | null };

type AuthDurumu = {
  girisYapildi: boolean;
  yukleniyor: boolean;
  profil: KullaniciProfili;
  girisYapEposta: (eposta: string, sifre: string) => Promise<SonucDurumu>;
  kayitOlEposta: (
    eposta: string,
    sifre: string,
    hitapAdi: string
  ) => Promise<SonucDurumu & { epostaDogrulamaGerekli: boolean }>;
  googleIleGiris: () => Promise<SonucDurumu>;
  cikisYap: () => Promise<void>;
  profilGuncelle: (yeniProfil: Partial<KullaniciProfili>) => Promise<SonucDurumu>;
};

const AuthContext = createContext<AuthDurumu>({
  girisYapildi: false,
  yukleniyor: true,
  profil: BOŞ_PROFİL,
  girisYapEposta: async () => ({ hata: "Bağlam mevcut değil." }),
  kayitOlEposta: async () => ({ hata: "Bağlam mevcut değil.", epostaDogrulamaGerekli: false }),
  googleIleGiris: async () => ({ hata: "Bağlam mevcut değil." }),
  cikisYap: async () => {},
  profilGuncelle: async () => ({ hata: "Bağlam mevcut değil." }),
});

function hataMesajiCevir(mesaj: string): string {
  const m = mesaj.toLowerCase();
  if (m.includes("invalid login credentials")) return "E-posta veya şifre hatalı.";
  if (m.includes("email not confirmed")) return "E-posta adresiniz henüz doğrulanmadı. Lütfen gelen kutunuzu kontrol edin.";
  if (m.includes("user already registered") || m.includes("already registered"))
    return "Bu e-posta adresiyle zaten bir hesap var.";
  if (m.includes("password should be at least")) return "Şifre en az 6 karakter olmalıdır.";
  if (m.includes("network")) return "İnternet bağlantınızı kontrol edin.";
  return mesaj;
}

// users tablosundan hitap adını çek; satır yoksa oluştur (metadan gelen adı yalnızca ilk kez yaz)
async function kullaniciHitapAdiGetir(userId: string, metaAdi: string): Promise<string> {
  // Satır yoksa ekle, varsa dokunma (ignoreDuplicates: true)
  await supabase.from("users").upsert(
    { auth_user_id: userId, nickname: metaAdi || null },
    { onConflict: "auth_user_id", ignoreDuplicates: true }
  );

  // Kayıtlı nickname'i oku
  const { data } = await supabase
    .from("users")
    .select("nickname")
    .eq("auth_user_id", userId)
    .maybeSingle();

  return (data?.nickname as string | null | undefined) ?? metaAdi;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [yukleniyor, setYukleniyor] = useState(true);
  const [dbHitapAdi, setDbHitapAdi] = useState<string>("");
  const ilkYuklemeYapildi = useRef(false);
  const sonKullaniciId = useRef<string | null>(null);

  // Oturum başladığında / değiştiğinde users tablosundan hitap adını çek
  useEffect(() => {
    const userId = session?.user?.id ?? null;
    if (!userId) {
      setDbHitapAdi("");
      sonKullaniciId.current = null;
      return;
    }
    if (userId === sonKullaniciId.current) return; // aynı kullanıcı, tekrar çekme
    sonKullaniciId.current = userId;

    const metaAdi =
      (session?.user?.user_metadata?.full_name as string | undefined) ||
      (session?.user?.user_metadata?.name as string | undefined) ||
      "";

    kullaniciHitapAdiGetir(userId, metaAdi).then(setDbHitapAdi);
  }, [session?.user?.id]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      ilkYuklemeYapildi.current = true;
      setYukleniyor(false);
    });

    const { data: dinleyici } = supabase.auth.onAuthStateChange((_olay, yeniOturum) => {
      setSession(yeniOturum);
      if (ilkYuklemeYapildi.current) setYukleniyor(false);
    });

    return () => dinleyici.subscription.unsubscribe();
  }, []);

  const girisYapEposta = async (eposta: string, sifre: string): Promise<SonucDurumu> => {
    const { error } = await supabase.auth.signInWithPassword({
      email: eposta.trim(),
      password: sifre,
    });
    if (error) return { hata: hataMesajiCevir(error.message) };
    return { hata: null };
  };

  const kayitOlEposta = async (
    eposta: string,
    sifre: string,
    hitapAdi: string
  ): Promise<SonucDurumu & { epostaDogrulamaGerekli: boolean }> => {
    const { data, error } = await supabase.auth.signUp({
      email: eposta.trim(),
      password: sifre,
      options: {
        data: { full_name: hitapAdi.trim() },
      },
    });
    if (error) return { hata: hataMesajiCevir(error.message), epostaDogrulamaGerekli: false };

    // E-posta doğrulama gerekmeden oturum açıldıysa hemen users tablosuna yaz
    if (data.user && data.session) {
      await supabase.from("users").upsert(
        { auth_user_id: data.user.id, nickname: hitapAdi.trim() || null },
        { onConflict: "auth_user_id", ignoreDuplicates: true }
      );
      setDbHitapAdi(hitapAdi.trim());
      sonKullaniciId.current = data.user.id;
    }

    const epostaDogrulamaGerekli = !!data.user && !data.session;
    return { hata: null, epostaDogrulamaGerekli };
  };

  const googleIleGiris = async (): Promise<SonucDurumu> => {
    return googleIleGirisYap();
  };

  const cikisYap = async () => {
    setDbHitapAdi("");
    sonKullaniciId.current = null;
    await supabase.auth.signOut();
  };

  const profilGuncelle = async (yeniProfil: Partial<KullaniciProfili>): Promise<SonucDurumu> => {
    if (yeniProfil.adSoyad === undefined) return { hata: null };
    const yeniAd = yeniProfil.adSoyad.trim();
    const userId = session?.user?.id;

    // 1. Supabase auth metadata güncelle
    const { error } = await supabase.auth.updateUser({
      data: { full_name: yeniAd },
    });
    if (error) return { hata: hataMesajiCevir(error.message) };

    // 2. users tablosunu güncelle
    if (userId) {
      await supabase.from("users").update({ nickname: yeniAd }).eq("auth_user_id", userId);
      setDbHitapAdi(yeniAd);
    }

    return { hata: null };
  };

  // users tablosu → birincil kaynak; auth metadata → yedek
  const profilMeta = kullaniciDanProfilOlustur(session?.user);
  const profil: KullaniciProfili = {
    ...profilMeta,
    adSoyad: dbHitapAdi || profilMeta.adSoyad,
  };

  return (
    <AuthContext.Provider
      value={{
        girisYapildi: !!session,
        yukleniyor,
        profil,
        girisYapEposta,
        kayitOlEposta,
        googleIleGiris,
        cikisYap,
        profilGuncelle,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
