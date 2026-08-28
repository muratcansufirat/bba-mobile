import { API_BASE_URL } from "./apiConfig";
import { supabase } from "./supabase";

type ClientOperation = "client_rag" | "conversation_load";
type ClientStatus = "success" | "error" | "timeout" | "cancelled";

interface ClientPerformanceMetric {
  operation: ClientOperation;
  status: ClientStatus;
  durationMs: number;
  firstResponseMs?: number;
  itemCount?: number;
  conversationId?: string;
}

export async function performanceMetricGonder(metric: ClientPerformanceMetric): Promise<void> {
  try {
    const { data } = await supabase.auth.getSession();
    const accessToken = data.session?.access_token;
    if (!accessToken) return;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3_000);
    try {
      await fetch(`${API_BASE_URL}/api/performance/client`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(metric),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }
  } catch {
    // Telemetri hiçbir zaman kullanıcı akışını veya hata görünümünü etkilemez.
  }
}
