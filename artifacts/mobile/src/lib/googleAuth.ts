import Constants, { ExecutionEnvironment } from "expo-constants";
import { makeRedirectUri } from "expo-auth-session";
import * as WebBrowser from "expo-web-browser";
import { Platform } from "react-native";

import { supabase } from "@/src/lib/supabase";

WebBrowser.maybeCompleteAuthSession();

// Replit'in geliştirme ortamı Expo'yu "--localhost" bayrağıyla başlattığı için
// otomatik oluşturulan adres "exp://localhost:.../--/..." olur; bu adres gerçek
// bir telefondan asla açılamaz (telefonun kendisine bakar). Bu yüzden Expo Go
// için tünel adresini (EXPO_PUBLIC_EXPO_DEV_DOMAIN) elle kullanıyoruz.
// Standalone / development build'lerde ise normal "mobile://" şema adresi kullanılır.
function yonlendirmeUrlOlustur(): string {
  const tunelAdresi = process.env.EXPO_PUBLIC_EXPO_DEV_DOMAIN;
  if (
    Constants.executionEnvironment === ExecutionEnvironment.StoreClient &&
    tunelAdresi
  ) {
    return `exp://${tunelAdresi}/--/giris-geri-donus`;
  }
  return makeRedirectUri({ path: "giris-geri-donus" });
}

// Uygulamanın deep link dönüş adresi. Standalone/dev-client derlemelerde
// "mobile://giris-geri-donus" üretir; Expo Go içinde ise gerçek tünel
// adresine göre doğru "exp://" URL'sini oluşturur.
const YONLENDIRME_URL = yonlendirmeUrlOlustur();

function paramlariAyikla(url: string): Record<string, string> {
  const parcaIndex = url.indexOf("#");
  const soruIndex = url.indexOf("?");
  const ayrikBaslangic =
    parcaIndex !== -1 ? parcaIndex + 1 : soruIndex !== -1 ? soruIndex + 1 : -1;
  if (ayrikBaslangic === -1) return {};
  const parcalar = url.slice(ayrikBaslangic).split("&");
  const sonuc: Record<string, string> = {};
  for (const parca of parcalar) {
    const [anahtar, deger] = parca.split("=");
    if (anahtar) sonuc[decodeURIComponent(anahtar)] = decodeURIComponent(deger ?? "");
  }
  return sonuc;
}

export async function googleIleGirisYap(): Promise<{ hata: string | null }> {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: YONLENDIRME_URL,
      skipBrowserRedirect: true,
    },
  });

  if (error || !data?.url) {
    return { hata: error?.message ?? "Google girişi başlatılamadı." };
  }

  if (Platform.OS === "web") {
    window.location.href = data.url;
    return { hata: null };
  }

  const sonuc = await WebBrowser.openAuthSessionAsync(data.url, YONLENDIRME_URL);

  if (sonuc.type !== "success" || !sonuc.url) {
    if (sonuc.type === "cancel" || sonuc.type === "dismiss") {
      return { hata: null };
    }
    return { hata: "Google girişi tamamlanamadı." };
  }

  const parametreler = paramlariAyikla(sonuc.url);

  if (parametreler.error) {
    return { hata: parametreler.error_description || parametreler.error };
  }

  if (!parametreler.access_token || !parametreler.refresh_token) {
    return { hata: "Oturum bilgisi alınamadı." };
  }

  const { error: oturumHatasi } = await supabase.auth.setSession({
    access_token: parametreler.access_token,
    refresh_token: parametreler.refresh_token,
  });

  if (oturumHatasi) {
    return { hata: oturumHatasi.message };
  }

  return { hata: null };
}

export function googleYonlendirmeUrlAl(): string {
  return YONLENDIRME_URL;
}
