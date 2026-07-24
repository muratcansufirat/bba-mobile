/**
 * BBA Semantik Arama (sunucu tarafı)
 *
 * pgvector cosine similarity ile bba_knowledge_base tablosunda arama yapar.
 * SUPABASE_DB_URL üzerinden doğrudan PostgreSQL bağlantısı kullanır.
 *
 * IVFFlat indeksi 351 kayıt için yaklaşık (ANN) arama yaptığından
 * doğru kayıtları atlayabilir. Her sorguda SET LOCAL enable_indexscan = off
 * ile indeks devre dışı bırakılır → tam (exact) cosine similarity taraması.
 */

import pg from "pg";

const { Pool } = pg;

let _pool: InstanceType<typeof Pool> | null = null;

function getPool(): InstanceType<typeof Pool> {
  if (!_pool) {
    const connString = process.env["SUPABASE_DB_URL"];
    if (!connString) {
      throw new Error(
        "SUPABASE_DB_URL ortam değişkeni tanımlı değil."
      );
    }
    // pgbouncer parametresini temizle
    const temiz = connString
      .replace(/[?&]pgbouncer=[^&]*/g, "")
      .replace(/\?&/, "?")
      .replace(/\?$/, "");
    _pool = new Pool({ connectionString: temiz, max: 5 });
  }
  return _pool;
}

export interface AramaSonucu {
  id: string;
  title: string;
  tags: string[];
  content: string;
  source: string | null;
  source_url: string | null;
  similarity: number;
}

/**
 * Verilen embedding vektörü ile bba_knowledge_base tablosunda
 * exact cosine similarity araması yapar.
 *
 * IVFFlat indeksi devre dışı bırakılarak sequential scan kullanılır;
 * bu sayede 351 kayıtlık tabloda hiçbir kayıt atlanmaz.
 *
 * @param embedding      1536 boyutlu float dizisi (text-embedding-3-small)
 * @param limit          Döndürülecek maksimum sonuç sayısı (varsayılan: 5)
 * @param minSimilarity  Minimum benzerlik eşiği 0-1 arası (varsayılan: 0.30)
 */
export async function semantikArama(
  embedding: number[],
  limit = 5,
  minSimilarity = 0.30
): Promise<AramaSonucu[]> {
  const pool = getPool();

  // pgvector formatı: [v1,v2,...] string
  const vektor = `[${embedding.join(",")}]`;

  const client = await pool.connect();
  try {
    // Transaction içinde SET LOCAL ile sadece bu sorgu için
    // IVFFlat indeksini devre dışı bırak → exact sequential scan
    await client.query("BEGIN");
    await client.query("SET LOCAL enable_indexscan = off");

    const { rows } = await client.query<AramaSonucu>(
      `SELECT
         id,
         title,
         tags,
         content,
         source,
         source_url,
         ROUND((1 - (embedding <=> $1::vector))::numeric, 6)::float AS similarity
       FROM bba_knowledge_base
       WHERE embedding IS NOT NULL
         AND (1 - (embedding <=> $1::vector)) >= $2
       ORDER BY embedding <=> $1::vector ASC
       LIMIT $3`,
      [vektor, minSimilarity, limit]
    );

    await client.query("COMMIT");
    return rows;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
