/**
 * BBA Sunucu Hafıza Okuyucu
 *
 * bba_user_memories tablosundan kullanıcının aktif hafıza kayıtlarını getirir.
 * Aynı pg pool'u arama.ts ile paylaşır (SUPABASE_DB_URL).
 */

import pg from "pg";

const { Pool } = pg;

let _pool: InstanceType<typeof Pool> | null = null;

function getPool(): InstanceType<typeof Pool> {
  if (!_pool) {
    const connString = process.env["SUPABASE_DB_URL"];
    if (!connString) {
      throw new Error("SUPABASE_DB_URL ortam değişkeni tanımlı değil.");
    }
    const temiz = connString
      .replace(/[?&]pgbouncer=[^&]*/g, "")
      .replace(/\?&/, "?")
      .replace(/\?$/, "");
    _pool = new Pool({ connectionString: temiz, max: 5 });
  }
  return _pool;
}

export interface HafizaKaydi {
  memory_type: "nickname" | "preference" | "important_fact";
  content: string;
}

/**
 * Kullanıcının aktif hafıza kayıtlarını getirir.
 *
 * @param userId  bba_user_memories.user_id — auth UUID (profil.id)
 */
export async function kullanicihafizasiniGetir(
  userId: string
): Promise<HafizaKaydi[]> {
  const pool = getPool();

  const { rows } = await pool.query<HafizaKaydi>(
    `SELECT memory_type, content
     FROM bba_user_memories
     WHERE user_id = $1
       AND is_active = true
     ORDER BY updated_at DESC NULLS LAST, created_at DESC`,
    [userId]
  );

  return rows;
}
