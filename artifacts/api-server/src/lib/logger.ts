import pino from "pino";

const isProduction = process.env.NODE_ENV === "production";

function guvenliHataSerilestir(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object") return { type: "Error" };
  const error = value as Record<string, unknown>;
  const serialized: Record<string, unknown> = {
    type: typeof error["name"] === "string" ? error["name"] : "Error",
  };
  if (typeof error["code"] === "string" || typeof error["code"] === "number") serialized["code"] = error["code"];
  if (typeof error["status"] === "number") serialized["status"] = error["status"];
  if (typeof error["statusCode"] === "number") serialized["statusCode"] = error["statusCode"];
  if (!isProduction && typeof error["stack"] === "string") serialized["stack"] = error["stack"];
  return serialized;
}

export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  redact: [
    "req.headers.authorization",
    "req.headers.cookie",
    "req.body.password",
    "req.body.newPassword",
    "req.body.access_token",
    "req.body.refresh_token",
    "res.headers['set-cookie']",
    "authorization",
    "password",
    "token",
    "access_token",
    "refresh_token",
    "apikey",
    "apiKey",
    "openaiApiKey",
    "supabaseAnonKey",
    "supabaseDbUrl",
    "*.authorization",
    "*.password",
    "*.token",
    "*.access_token",
    "*.refresh_token",
    "*.apikey",
    "*.apiKey",
    "*.*.authorization",
    "*.*.password",
    "*.*.token",
    "*.*.access_token",
    "*.*.refresh_token",
    "*.*.apikey",
    "*.*.apiKey",
  ],
  serializers: { err: guvenliHataSerilestir },
  ...(isProduction
    ? {}
    : {
        transport: {
          target: "pino-pretty",
          options: { colorize: true },
        },
      }),
});
