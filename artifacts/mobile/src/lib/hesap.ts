import { supabase } from "./supabase";
import { API_BASE_URL as API_BASE } from "./apiConfig";

export async function hesabiKaliciSil(): Promise<void> {
  const { data, error } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (error || !token) throw new Error("Geçerli kullanıcı oturumu bulunamadı.");
  if (!API_BASE) throw new Error("API adresi yapılandırılmamış.");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);
  try {
    const response = await fetch(`${API_BASE}/api/account`, {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ confirmation: "DELETE_MY_ACCOUNT" }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const body = await response.json().catch(() => ({})) as { hata?: string };
      throw new Error(body.hata ?? "Hesap silinemedi.");
    }
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("Hesap silme isteği zaman aşımına uğradı. Lütfen yeniden deneyin.");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
