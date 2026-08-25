import assert from "node:assert/strict";
import Module from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { build } from "esbuild";
import pg from "pg";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const apiDirectory = path.dirname(scriptDirectory);
const middlewarePath = path.join(apiDirectory, "src", "middleware", "auth.ts");
const virtualModulePath = path.join(scriptDirectory, ".verify-revoked-access.cjs");
const authUserId = "11111111-1111-4111-8111-111111111111";
const publicUserId = "22222222-2222-4222-8222-222222222222";

const compiled = await build({
  entryPoints: [middlewarePath],
  bundle: true,
  write: false,
  platform: "node",
  format: "cjs",
  packages: "external",
  logLevel: "silent",
});

const testModule = new Module(virtualModulePath);
testModule.filename = virtualModulePath;
testModule.paths = Module._nodeModulePaths(scriptDirectory);
testModule._compile(compiled.outputFiles[0].text, virtualModulePath);
const { jwtDogrula } = testModule.exports;

const originalFetch = globalThis.fetch;
const originalPoolQuery = pg.Pool.prototype.query;
const originalSupabaseUrl = process.env.SUPABASE_URL;
const originalAnonKey = process.env.SUPABASE_ANON_KEY;
const originalDatabaseUrl = process.env.SUPABASE_DB_URL;

process.env.SUPABASE_URL = "https://supabase.invalid";
process.env.SUPABASE_ANON_KEY = "test-anon-key";
process.env.SUPABASE_DB_URL = "postgresql://test:test@127.0.0.1:5432/test";

let authIsValid = true;
let databaseRows = [];
let checkedQuery = false;
let checks = 0;

globalThis.fetch = async () => ({
  ok: authIsValid,
  async json() {
    return { id: authUserId };
  },
});

pg.Pool.prototype.query = async function query(sql, values) {
  assert.match(sql, /au\.deleted_at\s+is\s+null/i, "Silinmiş kullanıcılar sorgudan dışlanmalıdır.");
  assert.match(sql, /au\.banned_until/i, "Askıya alınmış kullanıcılar sorguda kontrol edilmelidir.");
  assert.match(sql, /pu\.auth_user_id\s*=\s*au\.id/i, "Public profil, auth kullanıcısıyla eşleştirilmelidir.");
  assert.deepEqual(values, [authUserId], "JWT kullanıcısı sorguya güvenli parametre olarak aktarılmalıdır.");
  checkedQuery = true;
  return { rows: databaseRows, rowCount: databaseRows.length };
};

async function verify(label, { authorization = "Bearer existing-session-token", valid = true, rows = [], expectedStatus, expectedNext = false }) {
  authIsValid = valid;
  databaseRows = rows;

  let nextCalled = false;
  let statusCode;
  let responseBody;
  const req = {
    header(name) {
      return name.toLowerCase() === "authorization" ? authorization : undefined;
    },
    log: { warn() {}, error() {} },
  };
  const res = {
    locals: {},
    status(value) {
      statusCode = value;
      return this;
    },
    json(value) {
      responseBody = value;
      return this;
    },
  };

  await jwtDogrula(req, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, expectedNext, `${label}: erişim sonucu hatalı.`);
  assert.equal(statusCode, expectedStatus, `${label}: HTTP durum kodu hatalı.`);
  if (expectedNext) {
    assert.equal(res.locals.authUserId, authUserId);
    assert.equal(res.locals.publicUserId, publicUserId);
  } else {
    assert.equal(typeof responseBody?.hata, "string", `${label}: güvenli hata mesajı eksik.`);
  }

  checks += 1;
  console.log(`BAŞARILI | ${label}${expectedStatus ? ` | ${expectedStatus}` : " | erişim açık"}`);
}

try {
  await verify("Authorization eksik", { authorization: "", expectedStatus: 401 });
  await verify("Geçersiz JWT", { valid: false, expectedStatus: 401 });
  await verify("Aktif kullanıcı ve mevcut token", {
    rows: [{ access_suspended: false, public_user_id: publicUserId }],
    expectedNext: true,
  });
  await verify("Askıya alınmış kullanıcı ve mevcut token", {
    rows: [{ access_suspended: true, public_user_id: publicUserId }],
    expectedStatus: 403,
  });
  await verify("Silinmiş kullanıcı ve mevcut token", { rows: [], expectedStatus: 403 });
  await verify("Public profili bulunmayan kullanıcı", {
    rows: [{ access_suspended: false, public_user_id: null }],
    expectedStatus: 403,
  });
  assert.equal(checkedQuery, true, "Kullanıcı durumu veritabanından yeniden doğrulanmadı.");
  console.log(`SONUÇ: ${checks} erişim güvenliği kontrolü başarılı.`);
} finally {
  globalThis.fetch = originalFetch;
  pg.Pool.prototype.query = originalPoolQuery;

  for (const [name, value] of [
    ["SUPABASE_URL", originalSupabaseUrl],
    ["SUPABASE_ANON_KEY", originalAnonKey],
    ["SUPABASE_DB_URL", originalDatabaseUrl],
  ]) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
}
