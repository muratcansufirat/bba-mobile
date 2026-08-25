import Constants, { ExecutionEnvironment } from "expo-constants";
import { makeRedirectUri } from "expo-auth-session";
import * as WebBrowser from "expo-web-browser";
import { Platform } from "react-native";

import { supabase } from "@/src/lib/supabase";

WebBrowser.maybeCompleteAuthSession();

const CALLBACK_PATH = "giris-geri-donus";
const UYGULAMA_SCHEME = "bba";

export type GoogleGirisSonucu = {
  hata: string | null;
  iptalEdildi?: boolean;
};

/**
 * Web, Expo Go ve özel native build aynı redirect adresini paylaşamaz.
 *
 * - Web: mevcut web origin'i (localhost/LAN/production domain)
 * - Expo Go: Metro'nun exp:// LAN adresi
 * - Development/standalone build: app.json içindeki bba:// scheme
 */
export function googleYonlendirmeUrlAl(): string {
  if (Platform.OS === "web") {
    if (typeof window !== "undefined") {
      return new URL(`/${CALLBACK_PATH}`, window.location.origin).toString();
    }
    return makeRedirectUri({ path: CALLBACK_PATH });
  }

  if (Constants.executionEnvironment === ExecutionEnvironment.StoreClient) {
    return makeRedirectUri({ path: CALLBACK_PATH });
  }

  return makeRedirectUri({
    scheme: UYGULAMA_SCHEME,
    path: CALLBACK_PATH,
  });
}

function callbackParametreleriniAyikla(url: string): URLSearchParams {
  const parsed = new URL(url);
  const params = new URLSearchParams(parsed.search);
  const fragment = parsed.hash.startsWith("#") ? parsed.hash.slice(1) : parsed.hash;

  for (const [key, value] of new URLSearchParams(fragment)) {
    if (!params.has(key)) params.set(key, value);
  }

  return params;
}

function oauthHatasiniAyikla(params: URLSearchParams): string | null {
  const error = params.get("error");
  const errorCode = params.get("error_code");
  if (!error && !errorCode) return null;

  return (
    params.get("error_description") ??
    errorCode ??
    error ??
    "Google girişi tamamlanamadı."
  );
}

/**
 * Supabase PKCE callback'ini session'a çevirir. Eski implicit callback biçimi,
 * mevcut oturumları bozmamak için kontrollü bir fallback olarak desteklenir.
 */
export async function googleCallbackTamamla(url: string): Promise<GoogleGirisSonucu> {
  let params: URLSearchParams;
  try {
    params = callbackParametreleriniAyikla(url);
  } catch {
    return { hata: "Geçersiz Google giriş dönüş adresi." };
  }

  const oauthHatasi = oauthHatasiniAyikla(params);
  if (oauthHatasi) return { hata: oauthHatasi };

  const code = params.get("code");
  if (code) {
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) return { hata: error.message };
    if (!data.session) return { hata: "Google oturumu oluşturulamadı." };
    return { hata: null };
  }

  const accessToken = params.get("access_token");
  const refreshToken = params.get("refresh_token");
  if (accessToken && refreshToken) {
    const { data, error } = await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });
    if (error) return { hata: error.message };
    if (!data.session) return { hata: "Google oturumu oluşturulamadı." };
    return { hata: null };
  }

  return { hata: "Google giriş dönüşünde doğrulama kodu bulunamadı." };
}

export async function googleIleGirisYap(): Promise<GoogleGirisSonucu> {
  const redirectTo = googleYonlendirmeUrlAl();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo,
      skipBrowserRedirect: true,
    },
  });

  if (error || !data?.url) {
    return { hata: error?.message ?? "Google girişi başlatılamadı." };
  }

  if (Platform.OS === "web") {
    window.location.assign(data.url);
    return { hata: null };
  }

  const sonuc = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);

  if (sonuc.type === "cancel" || sonuc.type === "dismiss") {
    return { hata: null, iptalEdildi: true };
  }
  if (sonuc.type !== "success" || !sonuc.url) {
    return { hata: "Google girişi tamamlanamadı." };
  }

  return googleCallbackTamamla(sonuc.url);
}
