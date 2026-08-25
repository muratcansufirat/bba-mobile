import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";

const outputDirectories = process.argv.slice(2);
assert.ok(outputDirectories.length > 0, "Denetlenecek production çıktı dizini belirtilmedi.");

const sensitiveVariableNames = [
  "OPENAI_API_KEY",
  "SUPABASE_DB_URL",
  "DATABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "SERVICE_ROLE_KEY",
  "SUPABASE_JWT_SECRET",
];

const sensitiveValues = sensitiveVariableNames
  .map((name) => ({ name, value: process.env[name]?.trim() }))
  .filter(({ value }) => value && value.length >= 12);

const mobileEnv = await fs.readFile(new URL("../.env", import.meta.url), "utf8");
const mobileVariableNames = [...mobileEnv.matchAll(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/gm)]
  .map((match) => match[1]);
const forbiddenMobileVariables = mobileVariableNames.filter((name) =>
  /OPENAI|SERVICE[_-]?ROLE|DATABASE|DB_URL|JWT_SECRET|PRIVATE[_-]?KEY|PASSWORD/i.test(name),
);
assert.equal(
  forbiddenMobileVariables.length,
  0,
  `Mobil environment içinde yasak değişken adı bulundu: ${forbiddenMobileVariables.join(", ")}`,
);

const findings = [];
let scannedFiles = 0;
let scannedBundles = 0;

async function scanDirectory(directory) {
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      await scanDirectory(target);
      continue;
    }
    if (!entry.isFile()) continue;

    const content = await fs.readFile(target);
    scannedFiles += 1;
    if (/\.(?:js|hbc)(?:\.map)?$/i.test(entry.name)) scannedBundles += 1;

    for (const { name, value } of sensitiveValues) {
      if (content.includes(Buffer.from(value))) {
        findings.push({ file: target, type: `${name} gerçek değeri pakete sızmış` });
      }
    }

    if (!/\.(?:js|json|hbc|map|html)$/i.test(entry.name)) continue;
    const text = content.toString("utf8");

    if (/\bsk-(?:proj-)?[A-Za-z0-9_-]{24,}/.test(text)) {
      findings.push({ file: target, type: "OpenAI secret key kalıbı" });
    }
    if (/postgres(?:ql)?:\/\/[^\s"'`\\]{8,}/i.test(text)) {
      findings.push({ file: target, type: "PostgreSQL bağlantı adresi" });
    }

    const jwtCandidates = text.matchAll(/eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g);
    for (const match of jwtCandidates) {
      try {
        const payload = JSON.parse(Buffer.from(match[0].split(".")[1], "base64url").toString("utf8"));
        if (payload.role === "service_role" || payload.role === "supabase_admin") {
          findings.push({ file: target, type: `${payload.role} JWT pakete sızmış` });
        }
      } catch {
        // JWT biçimine benzeyen bağımlılık metinleri güvenlik bulgusu değildir.
      }
    }
  }
}

for (const directory of outputDirectories) {
  const resolved = path.resolve(directory);
  const status = await fs.stat(resolved);
  assert.ok(status.isDirectory(), `Production çıktı dizini bulunamadı: ${resolved}`);
  await scanDirectory(resolved);
}

assert.ok(scannedBundles > 0, "Gerçek production JavaScript veya Hermes paketi bulunamadı.");

if (findings.length > 0) {
  for (const finding of findings) {
    console.error(`GÜVENLİK HATASI | ${finding.type} | ${finding.file}`);
  }
  console.error(`SONUÇ: ${findings.length} gizli bilgi sızıntısı bulundu.`);
  process.exitCode = 1;
} else {
  console.log(`BAŞARILI | Mobil environment | Yasak gizli değişken bulunmadı`);
  console.log(`BAŞARILI | Gerçek secret karşılaştırması | ${sensitiveValues.length} sunucu değişkeni kontrol edildi`);
  console.log(`BAŞARILI | Production paketleri | ${scannedBundles} paket, toplam ${scannedFiles} dosya tarandı`);
  console.log(`BAŞARILI | OpenAI / PostgreSQL / Service Role | Sızıntı bulunmadı`);
  console.log("SONUÇ: 0 gizli bilgi sızıntısı.");
}
