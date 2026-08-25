import assert from "node:assert/strict";
import pg from "pg";

const connectionString = process.env.SUPABASE_DB_URL;
if (!connectionString) {
  throw new Error("SUPABASE_DB_URL tanımlı olmadığı için izolasyon testleri çalıştırılamadı.");
}

const pool = new pg.Pool({ connectionString, max: 1 });
const client = await pool.connect();
const results = [];

const entities = [
  { label: "Sohbet", table: "bba_conversations", field: "baslik", value: "İzolasyon testi" },
  { label: "Mesaj", table: "bba_messages", field: "icerik", value: "İzolasyon testi" },
  { label: "Kaynak", table: "bba_message_sources", field: "baslik", value: "İzolasyon kaynağı" },
  { label: "Hafıza", table: "bba_user_memories", field: "content", value: "İzolasyon hafızası" },
  { label: "Favori", table: "bba_message_favorites", field: "paragraph_index", value: 1 },
  { label: "Not", table: "bba_user_notes", field: "title", value: "İzolasyon notu" },
];

const hardenedTables = [
  "announcements",
  "app_settings",
  "bba_conversations",
  "bba_message_favorites",
  "bba_message_sources",
  "bba_messages",
  "bba_user_memories",
  "bba_user_notes",
  "community_message_likes",
  "community_messages",
  "community_rooms",
  "sessions",
  "users",
];

function record(label, detail) {
  results.push({ label, detail });
  console.log(`BAŞARILI | ${label} | ${detail}`);
}

async function impersonate(role, authUserId = null) {
  await client.query("reset role");
  if (role !== "authenticated" && role !== "anon") {
    throw new Error(`Geçersiz test rolü: ${role}`);
  }
  await client.query(`set local role ${role}`);
  await client.query("select set_config('request.jwt.claim.sub', $1, true)", [authUserId ?? ""]);
  await client.query("select set_config('request.jwt.claim.role', $1, true)", [role]);
  await client.query("select set_config('request.jwt.claims', $1, true)", [
    JSON.stringify(authUserId ? { sub: authUserId, role, aud: "authenticated" } : { role }),
  ]);
}

async function rollbackCheck(action) {
  await client.query("savepoint isolation_check");
  try {
    return { result: await action(), error: null };
  } catch (error) {
    return { result: null, error };
  } finally {
    await client.query("rollback to savepoint isolation_check");
    await client.query("release savepoint isolation_check");
  }
}

function assertBlocked(check, description) {
  if (check.error) {
    assert.equal(check.error.code, "42501", `${description}: beklenmeyen hata (${check.error.code})`);
    return;
  }
  assert.equal(check.result.rowCount, 0, `${description}: başka kullanıcıya ait kayıt değiştirildi`);
}

async function assertApiUnauthorized() {
  const apiBase = process.env.ISOLATION_TEST_API_BASE ?? `http://127.0.0.1:${process.env.PORT ?? "5000"}`;
  const protectedRoutes = [
    { label: "RAG API", path: "/api/rag", method: "POST" },
    { label: "Hafıza API", path: "/api/memories", method: "GET" },
    { label: "Yönetim API", path: "/api/admin/users", method: "GET" },
    { label: "Ses API", path: "/api/voice/transcribe", method: "POST" },
  ];

  try {
    const health = await fetch(`${apiBase}/api/healthz`, { signal: AbortSignal.timeout(2_500) });
    if (!health.ok) throw new Error(`Sağlık kontrolü ${health.status} döndürdü.`);
  } catch (error) {
    throw new Error(`API izolasyon testleri için sunucu çalışır durumda olmalıdır: ${error.message}`);
  }

  for (const route of protectedRoutes) {
    const response = await fetch(`${apiBase}${route.path}`, {
      method: route.method,
      signal: AbortSignal.timeout(5_000),
    });
    assert.equal(response.status, 401, `${route.label}: JWT olmadan erişim engellenmedi.`);
    record(route.label, "JWT olmadan erişim 401 ile reddedildi");
  }
}

try {
  await client.query("begin");
  await client.query("set local statement_timeout = '10s'");

  const profiles = await client.query(
    `select u.id::text as public_user_id, u.auth_user_id::text as auth_user_id
       from public.users u
       join auth.users au on au.id = u.auth_user_id
      where au.deleted_at is null
      order by u.created_at
      limit 2`,
  );
  assert.equal(profiles.rowCount, 2, "İzolasyon testleri için en az iki geçerli kullanıcı profili gerekiyor.");
  const [owner, stranger] = profiles.rows;

  const conversation = await client.query(
    "insert into public.bba_conversations (user_id, baslik) values ($1, $2) returning id::text as id",
    [owner.public_user_id, "Geçici izolasyon testi"],
  );
  const message = await client.query(
    "insert into public.bba_messages (conversation_id, sender_type, icerik) values ($1, 'bba', $2) returning id::text as id",
    [conversation.rows[0].id, "Geçici izolasyon mesajı"],
  );
  const source = await client.query(
    "insert into public.bba_message_sources (message_id, baslik, kaynak_url) values ($1, $2, $3) returning id::text as id",
    [message.rows[0].id, "Geçici kaynak", "https://example.invalid/isolation-test"],
  );
  const memory = await client.query(
    "insert into public.bba_user_memories (user_id, memory_type, content, source_conversation_id) values ($1, 'preference', $2, $3) returning id::text as id",
    [owner.auth_user_id, "Geçici izolasyon hafızası", conversation.rows[0].id],
  );
  const favorite = await client.query(
    "insert into public.bba_message_favorites (user_id, message_id, paragraph_index) values ($1, $2, 0) returning id::text as id",
    [owner.public_user_id, message.rows[0].id],
  );
  const note = await client.query(
    "insert into public.bba_user_notes (user_id, title, content) values ($1, $2, $3) returning id::text as id",
    [owner.public_user_id, "Geçici not", "Geçici izolasyon notu"],
  );

  const fixtureIds = {
    bba_conversations: conversation.rows[0].id,
    bba_messages: message.rows[0].id,
    bba_message_sources: source.rows[0].id,
    bba_user_memories: memory.rows[0].id,
    bba_message_favorites: favorite.rows[0].id,
    bba_user_notes: note.rows[0].id,
  };

  const tableSecurity = await client.query(
    `select c.relname, c.relrowsecurity
       from pg_class c
       join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname = any($1::text[])`,
    [entities.map((entity) => entity.table)],
  );
  assert.equal(tableSecurity.rowCount, entities.length, "Beklenen kullanıcı tablolarından biri eksik.");
  for (const row of tableSecurity.rows) {
    assert.equal(row.relrowsecurity, true, `${row.relname} tablosunda RLS etkin değil.`);
  }
  record("RLS", "Altı kullanıcı tablosunun tamamında etkin");

  const unsafeTablePrivileges = await client.query(
    `select table_name, grantee, privilege_type
       from information_schema.role_table_grants
      where table_schema = 'public'
        and table_name = any($1::text[])
        and grantee in ('anon', 'authenticated')
        and privilege_type in ('TRUNCATE', 'TRIGGER', 'REFERENCES')`,
    [hardenedTables],
  );
  assert.equal(
    unsafeTablePrivileges.rowCount,
    0,
    `Gereksiz tablo yetkileri bulundu: ${unsafeTablePrivileges.rows
      .map((row) => `${row.table_name}:${row.grantee}:${row.privilege_type}`)
      .join(', ')}`,
  );
  record("Tablo yetkileri", "TRUNCATE, TRIGGER ve REFERENCES yetkileri kaldırılmış");

  await impersonate("authenticated", owner.auth_user_id);
  for (const entity of entities) {
    const result = await client.query(`select id from public.${entity.table} where id = $1`, [
      fixtureIds[entity.table],
    ]);
    assert.equal(result.rowCount, 1, `${entity.label}: sahibi kendi kaydına erişemiyor.`);
    record(entity.label, "Sahibi kendi kaydını okuyabiliyor");
  }

  for (const entity of entities.filter((entry) => !["bba_user_memories", "bba_message_favorites"].includes(entry.table))) {
    const check = await rollbackCheck(() =>
      client.query(`update public.${entity.table} set ${entity.field} = $1 where id = $2`, [
        entity.value,
        fixtureIds[entity.table],
      ]),
    );
    assert.ifError(check.error);
    assert.equal(check.result.rowCount, 1, `${entity.label}: sahibi kendi kaydını güncelleyemiyor.`);
    record(entity.label, "Sahibi kendi kaydını güncelleyebiliyor");
  }

  const ownerMemoryWrite = await rollbackCheck(() =>
    client.query("update public.bba_user_memories set content = $1 where id = $2", [
      "Mobil istemci yazamamalı",
      fixtureIds.bba_user_memories,
    ]),
  );
  assertBlocked(ownerMemoryWrite, "Hafıza doğrudan mobil istemci yazımı");
  record("Hafıza", "Mobil istemci doğrudan UPDATE yapamıyor");

  await impersonate("authenticated", stranger.auth_user_id);
  for (const entity of entities) {
    const result = await client.query(`select id from public.${entity.table} where id = $1`, [
      fixtureIds[entity.table],
    ]);
    assert.equal(result.rowCount, 0, `${entity.label}: başka kullanıcının kaydı okunabiliyor.`);
    record(entity.label, "Başka kullanıcı kaydı okuyamıyor");

    const update = await rollbackCheck(() =>
      client.query(`update public.${entity.table} set ${entity.field} = $1 where id = $2`, [
        entity.value,
        fixtureIds[entity.table],
      ]),
    );
    assertBlocked(update, `${entity.label} yetkisiz UPDATE`);
    record(entity.label, "Başka kullanıcı kaydı güncelleyemiyor");

    const deletion = await rollbackCheck(() =>
      client.query(`delete from public.${entity.table} where id = $1`, [fixtureIds[entity.table]]),
    );
    assertBlocked(deletion, `${entity.label} yetkisiz DELETE`);
    record(entity.label, "Başka kullanıcı kaydı silemiyor");
  }

  const unauthorizedInserts = [
    {
      label: "Sohbet",
      sql: "insert into public.bba_conversations (user_id, baslik) values ($1, 'Yetkisiz')",
      values: [owner.public_user_id],
    },
    {
      label: "Mesaj",
      sql: "insert into public.bba_messages (conversation_id, sender_type, icerik) values ($1, 'user', 'Yetkisiz')",
      values: [fixtureIds.bba_conversations],
    },
    {
      label: "Kaynak",
      sql: "insert into public.bba_message_sources (message_id, baslik) values ($1, 'Yetkisiz')",
      values: [fixtureIds.bba_messages],
    },
    {
      label: "Hafıza",
      sql: "insert into public.bba_user_memories (user_id, memory_type, content) values ($1, 'preference', 'Yetkisiz')",
      values: [owner.auth_user_id],
    },
    {
      label: "Favori",
      sql: "insert into public.bba_message_favorites (user_id, message_id, paragraph_index) values ($1, $2, 9)",
      values: [owner.public_user_id, fixtureIds.bba_messages],
    },
    {
      label: "Not",
      sql: "insert into public.bba_user_notes (user_id, title, content) values ($1, 'Yetkisiz', 'Yetkisiz')",
      values: [owner.public_user_id],
    },
  ];

  for (const insert of unauthorizedInserts) {
    const check = await rollbackCheck(() => client.query(insert.sql, insert.values));
    assert.ok(check.error, `${insert.label}: başka kullanıcı adına kayıt oluşturulabildi.`);
    assert.equal(check.error.code, "42501", `${insert.label}: yetkisiz INSERT doğru şekilde reddedilmedi.`);
    record(insert.label, "Başka kullanıcı adına kayıt oluşturulamıyor");
  }

  const finalize = await rollbackCheck(() =>
    client.query("select public.finalize_bba_message_with_sources($1, $2, $3::jsonb)", [
      fixtureIds.bba_messages,
      "Yetkisiz mesaj güncellemesi",
      JSON.stringify([{ title: "Yetkisiz kaynak", url: "https://example.invalid" }]),
    ]),
  );
  assert.ok(finalize.error, "Mesaj ve kaynak transaction fonksiyonu başka kullanıcı tarafından çalıştırıldı.");
  assert.equal(finalize.error.code, "42501", "Mesaj ve kaynak transaction fonksiyonu yetki hatası döndürmedi.");
  record("Mesaj ve kaynak transaction", "Başka kullanıcıya ait mesaj güncellenemiyor");

  await impersonate("anon");
  for (const entity of entities) {
    const check = await rollbackCheck(() =>
      client.query(`select id from public.${entity.table} where id = $1`, [fixtureIds[entity.table]]),
    );
    if (check.error) {
      assert.equal(check.error.code, "42501", `${entity.label}: anonim erişim beklenmeyen hata döndürdü.`);
    } else {
      assert.equal(check.result.rowCount, 0, `${entity.label}: anonim kullanıcı kaydı okuyabildi.`);
    }
    record(entity.label, "Anonim erişim engellendi");
  }

  await client.query("reset role");
  await client.query("rollback");
  record("Veri bütünlüğü", "Bütün geçici test kayıtları transaction rollback ile kaldırıldı");

  await assertApiUnauthorized();
  console.log(`\nSONUÇ: ${results.length} izolasyon kontrolü başarılı, 0 hata.`);
} catch (error) {
  try {
    await client.query("reset role");
    await client.query("rollback");
  } catch {
    // Asıl test hatası aşağıda güvenli biçimde raporlanır.
  }
  console.error(`\nİZOLASYON TESTİ BAŞARISIZ: ${error.message}`);
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}
