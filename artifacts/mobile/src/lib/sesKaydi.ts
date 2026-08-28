import { File } from "expo-file-system";

import { supabase } from "./supabase";
import { API_BASE_URL as API_BASE } from "./apiConfig";

type SesYuklemeSonucu = {
  accepted: true;
  receiptId: string;
  byteLength: number;
  mimeType: string;
  transcript: string;
};

export type GeciciBbaSesi = {
  audioId: string;
  audioUrl: string;
  accessToken: string;
  expiresInSeconds: number;
};

function dosyaBilgisi(uri: string) {
  const temizUri = uri.split("?")[0]?.toLocaleLowerCase("tr-TR") ?? "";
  if (temizUri.endsWith(".wav")) return { name: "voice-question.wav", type: "audio/wav" };
  if (temizUri.endsWith(".webm")) return { name: "voice-question.webm", type: "audio/webm" };
  if (temizUri.endsWith(".3gp")) return { name: "voice-question.3gp", type: "audio/3gpp" };
  if (temizUri.endsWith(".aac")) return { name: "voice-question.aac", type: "audio/aac" };
  return { name: "voice-question.m4a", type: "audio/mp4" };
}

export async function geciciSesKaydiniSil(uri: string | null | undefined): Promise<void> {
  if (!uri) return;

  try {
    const dosya = new File(uri);
    if (dosya.exists) dosya.delete();
  } catch {
    // Geçici dosya temizliği sesli soru akışını bozmamalı.
  }
}

export async function sesKaydiniBackendYukle(
  uri: string,
  durationMs: number,
  language: "tr" | "en" = "tr",
): Promise<SesYuklemeSonucu> {
  if (!API_BASE) throw new Error("API adresi yapılandırılmamış.");

  const { data, error } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (error || !token) throw new Error("Oturum bulunamadı.");

  const bilgi = dosyaBilgisi(uri);
  const form = new FormData();
  form.append("durationMs", String(Math.round(durationMs)));
  form.append("language", language);
  form.append("audio", { uri, name: bilgi.name, type: bilgi.type } as unknown as Blob);

  const response = await fetch(`${API_BASE}/api/voice/upload`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });

  const body = await response.json().catch(() => null) as (SesYuklemeSonucu & { hata?: string }) | null;
  if (!response.ok || !body?.accepted) {
    throw new Error(body?.hata ?? "Ses dosyası backend'e gönderilemedi.");
  }
  return body;
}

export async function bbaSesiniOlustur(
  messageId: string,
  text: string,
  language: "tr" | "en" = "tr",
  signal?: AbortSignal,
): Promise<GeciciBbaSesi> {
  if (!API_BASE) throw new Error("API adresi yapılandırılmamış.");
  const { data, error } = await supabase.auth.getSession();
  const accessToken = data.session?.access_token;
  if (error || !accessToken) throw new Error("Oturum bulunamadı.");
  const response = await fetch(`${API_BASE}/api/voice/speech`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ messageId, text, language }),
    signal,
  });
  const body = await response.json().catch(() => null) as {
    audioId?: string; audioPath?: string; expiresInSeconds?: number; hata?: string;
  } | null;
  if (!response.ok || !body?.audioId || !body.audioPath) {
    throw new Error(body?.hata ?? "BBA cevabı seslendirilemedi.");
  }
  return {
    audioId: body.audioId,
    audioUrl: `${API_BASE}${body.audioPath}`,
    accessToken,
    expiresInSeconds: body.expiresInSeconds ?? 120,
  };
}

export async function geciciBbaSesiniSil(audioId: string, accessToken: string): Promise<void> {
  if (!API_BASE || !audioId || !accessToken) return;
  await fetch(`${API_BASE}/api/voice/speech/${encodeURIComponent(audioId)}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${accessToken}` },
  }).catch(() => undefined);
}
