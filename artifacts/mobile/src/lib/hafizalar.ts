import { supabase } from "./supabase";
import { API_BASE_URL as API_BASE } from "./apiConfig";

export type HafizaTuru = "nickname" | "preference" | "important_fact";

export interface KullaniciHafizasi {
  id: string;
  memory_type: HafizaTuru;
  content: string;
  created_at: string;
  updated_at: string;
}

async function apiIstegi<T>(path: string, init?: RequestInit): Promise<T> {
  const { data, error } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (error || !token) throw new Error("Geçerli kullanıcı oturumu bulunamadı.");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        ...(init?.headers ?? {}),
      },
      signal: controller.signal,
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({})) as { hata?: string };
      throw new Error(body.hata ?? "Hafıza işlemi tamamlanamadı.");
    }
    if (response.status === 204) return undefined as T;
    return await response.json() as T;
  } finally {
    clearTimeout(timeout);
  }
}

export async function hafizalariListele(): Promise<KullaniciHafizasi[]> {
  const sonuc = await apiIstegi<{ hafizalar: KullaniciHafizasi[] }>("/api/memories");
  return sonuc.hafizalar;
}

export async function hafizaDuzenle(id: string, content: string): Promise<KullaniciHafizasi> {
  const sonuc = await apiIstegi<{ hafiza: KullaniciHafizasi }>(`/api/memories/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ content }),
  });
  return sonuc.hafiza;
}

export async function hafizaPasiflestir(id: string): Promise<void> {
  await apiIstegi<void>(`/api/memories/${id}`, { method: "DELETE" });
}
