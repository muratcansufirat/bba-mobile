import { getAdminPool } from "../middleware/admin";

export type PerformanceOperation =
  | "rag"
  | "voice_upload"
  | "voice_speech"
  | "client_rag"
  | "conversation_load";

export type PerformanceStatus = "success" | "no_source" | "error" | "timeout" | "cancelled";

export interface PerformanceMetric {
  userId: string;
  conversationId?: string;
  operation: PerformanceOperation;
  status: PerformanceStatus;
  durationMs: number;
  firstResponseMs?: number;
  firstTokenMs?: number;
  embeddingMs?: number;
  searchMs?: number;
  generationMs?: number;
  firstByteMs?: number;
  itemCount?: number;
  sourceCount?: number;
  promptTokens?: number;
  completionTokens?: number;
  embeddingTokens?: number;
  estimatedCostUsd?: number;
  chatModel?: string;
  embeddingModel?: string;
  errorCode?: string;
}

const ms = (value: number | undefined) => value == null ? null : Math.max(0, Math.round(value));

export async function performanceMetricKaydet(metric: PerformanceMetric): Promise<void> {
  await getAdminPool().query(
    `insert into public.api_usage_metrics
       (auth_user_id, conversation_id, operation, status, duration_ms,
        first_response_ms, first_token_ms, embedding_ms, search_ms, generation_ms, first_byte_ms, item_count,
        source_count, prompt_tokens, completion_tokens, embedding_tokens, estimated_cost_usd,
        chat_model, embedding_model, error_code)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12,
             $13, $14, $15, $16, $17, $18, $19, $20)`,
    [
      metric.userId,
      metric.conversationId ?? null,
      metric.operation,
      metric.status,
      ms(metric.durationMs),
      ms(metric.firstResponseMs),
      ms(metric.firstTokenMs),
      ms(metric.embeddingMs),
      ms(metric.searchMs),
      ms(metric.generationMs),
      ms(metric.firstByteMs),
      metric.itemCount ?? null,
      metric.sourceCount ?? 0,
      metric.promptTokens ?? 0,
      metric.completionTokens ?? 0,
      metric.embeddingTokens ?? 0,
      metric.estimatedCostUsd ?? 0,
      metric.chatModel ?? null,
      metric.embeddingModel ?? null,
      metric.errorCode ?? null,
    ],
  );
}
