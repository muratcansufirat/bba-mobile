export type UygulamaOrtami = "development" | "preview" | "production";

const rawEnvironment = process.env["EXPO_PUBLIC_APP_ENV"];
const rawApiBaseUrl = process.env["EXPO_PUBLIC_API_BASE_URL"]?.trim();

export const UYGULAMA_ORTAMI: UygulamaOrtami =
  rawEnvironment === "preview" || rawEnvironment === "production"
    ? rawEnvironment
    : "development";

function apiAdresiniDogrula(): string {
  if (!rawApiBaseUrl) {
    throw new Error("API adresi yapılandırılmamış.");
  }

  let url: URL;
  try {
    url = new URL(rawApiBaseUrl);
  } catch {
    throw new Error("API adresi geçerli bir URL değil.");
  }

  if (UYGULAMA_ORTAMI !== "development") {
    const yerelHost =
      url.hostname === "localhost" ||
      url.hostname === "127.0.0.1" ||
      url.hostname.startsWith("192.168.") ||
      url.hostname.startsWith("10.");

    if (url.protocol !== "https:" || yerelHost) {
      throw new Error(
        "Preview ve production ortamlarında yalnızca HTTPS production API kullanılabilir.",
      );
    }
  }

  return rawApiBaseUrl.replace(/\/$/, "");
}

export const API_BASE_URL = apiAdresiniDogrula();
