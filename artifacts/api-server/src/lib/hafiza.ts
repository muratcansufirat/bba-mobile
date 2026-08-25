/**
 * BBA Sunucu Hafıza Okuyucu
 *
 * bba_user_memories tablosundan kullanıcının aktif hafıza kayıtlarını getirir.
 * Aynı pg pool'u arama.ts ile paylaşır (SUPABASE_DB_URL).
 */

import pg, { type PoolClient } from "pg";

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

export interface KullaniciHafizaDetayi extends HafizaKaydi {
  id: string;
  created_at: string;
  updated_at: string;
}


type TercihKutuplugu = "positive" | "negative";

function karsilastirmaMetni(metin: string): string {
  return metin
    .toLocaleLowerCase("tr-TR")
    .replace(/yanıt/g, "cevap")
    .replace(/[^a-zçğıöşü0-9\s]/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function metinBenzerligi(sol: string, sag: string): number {
  const solKelimeler = new Set(karsilastirmaMetni(sol).split(" ").filter(Boolean));
  const sagKelimeler = new Set(karsilastirmaMetni(sag).split(" ").filter(Boolean));
  if (solKelimeler.size === 0 || sagKelimeler.size === 0) return 0;
  let ortak = 0;
  for (const kelime of solKelimeler) {
    if (sagKelimeler.has(kelime)) ortak += 1;
  }
  return (2 * ortak) / (solKelimeler.size + sagKelimeler.size);
}

function tercihImzasi(metin: string): { konu: string; kutup: TercihKutuplugu } | null {
  const temiz = metin.replace(/\s+/g, " ").trim();
  const negatif = temiz.match(/^(.+?)\s+(?:istemiyorum|sevmiyorum|nefret\s+ediyorum|hoşlanmıyorum)[.!?]*$/i);
  if (negatif?.[1]) return { konu: karsilastirmaMetni(negatif[1]), kutup: "negative" };
  const pozitif = temiz.match(/^(.+?)\s+(?:tercih\s+ediyorum|tercih\s+ederim|seviyorum|severim|çok\s+seviyorum|bayılıyorum|hoşlanıyorum)[.!?]*$/i);
  if (pozitif?.[1]) return { konu: karsilastirmaMetni(pozitif[1]), kutup: "positive" };
  return null;
}

function onemliBilgiTuru(metin: string): "age" | "job" | "education" | "location" | null {
  if (/\b\d{1,2}\s+yaşındayım\b/i.test(metin)) return "age";
  if (/\b(?:olarak\s+çalışıyorum|çalışıyorum)\b/i.test(metin)) return "job";
  if (/\b(?:mezunuyum|okudum|bitirdim)\b/i.test(metin)) return "education";
  if (/\b(?:yaşıyorum|oturuyorum)\b/i.test(metin)) return "location";
  return null;
}

function hitabiBicimlendir(hitam: string): string {
  const temiz = hitam.replace(/\s+/g, " ").trim();
  if (!temiz) return temiz;
  return `${temiz[0]!.toLocaleUpperCase("tr-TR")}${temiz.slice(1)}`;
}

function promptInjectionSuphesi(mesaj: string): boolean {
  const kaliplar = [
    /\b(?:önceki|tüm|bütün)\s+(?:talimatları|kuralları|yönergeleri)\s+(?:unut|yok\s+say|görmezden\s+gel)\b/i,
    /\b(?:sistem|system|developer|geliştirici)\s+(?:promptu|mesajı|talimatı|kuralları)\b/i,
    /\b(?:rolünü|kimliğini)\s+(?:değiştir|unut)\b/i,
    /(?:<\/?(?:system|developer|assistant)>|\[(?:system|developer|assistant)\])/i,
  ];
  return kaliplar.some((kalip) => kalip.test(mesaj));
}

function mesajdanHafizaCikar(mesaj: string): HafizaKaydi[] {
  const sonuclar: HafizaKaydi[] = [];
  const temizMesaj = mesaj.replace(/\s+/g, " ").trim().slice(0, 500);
  if (!temizMesaj) return sonuclar;
  const injectionSupheli = promptInjectionSuphesi(temizMesaj);

  const nickMatch =
    temizMesaj.match(/bana\s+"?(.+?)"?\s+(?:de\b|diyebilirsin\b|diye\s+hitap\s+et\b|olarak\s+hitap\s+et\b|olarak\s+çağır\b|çağır\b)/i) ||
    temizMesaj.match(/(?:benim\s+)?(?:adım|ismim)\s+([A-Za-zÇçĞğİıÖöŞşÜü]{2,})/i) ||
    temizMesaj.match(/beni\s+"?(.+?)"?\s+olarak\s+(?:çağır|bil|tanı)/i);
  const hitapAdayi = nickMatch?.[1]?.replace(/[?.!,;:]+$/g, "").trim();
  const soruSozcukleri = new Set(["ne", "nasıl", "kim", "neden", "niçin", "hangi", "kaç"]);
  const soruCumlesi = /\?|\b(?:etmelisin|etmeliyim|dersin|diyorsun)\b/i.test(temizMesaj);
  if (hitapAdayi && !soruCumlesi && !soruSozcukleri.has(hitapAdayi.toLocaleLowerCase("tr-TR"))) {
    sonuclar.push({ memory_type: "nickname", content: hitabiBicimlendir(hitapAdayi.slice(0, 100)) });
  }

  const tercihVar = [
    /(.{3,40})\s+(?:seviyorum|severim|çok\s+seviyorum|bayılıyorum)/i,
    /(.{3,40})\s+(?:istemiyorum|sevmiyorum|nefret\s+ediyorum|hoşlanmıyorum)/i,
    /(.{3,40})\s+tercih\s+ediyorum/i,
    /(.{3,40})\s+tercih\s+ederim/i,
    /(.{3,40})\s+hoşlanıyorum/i,
  ].some((kalip) => kalip.test(temizMesaj));
  if (tercihVar && !injectionSupheli) {
    sonuclar.push({ memory_type: "preference", content: temizMesaj });
  }

  const onemliBilgiVar = [
    /\b\d{1,2}\s+yaşındayım\b/i,
    /\b[A-Za-zÇçĞğİıÖöŞşÜü]+(?:\s+[A-Za-zÇçĞğİıÖöŞşÜü]+)?\s+(?:olarak\s+çalışıyorum|çalışıyorum)\b/i,
    /\b[A-Za-zÇçĞğİıÖöŞşÜü]+\s+(?:mezunuyum|okudum|bitirdim)\b/i,
    /\b[A-Za-zÇçĞğİıÖöŞşÜü]+(?:'[a-zA-Z]{1,2})?\s+(?:yaşıyorum|oturuyorum)\b/i,
  ].some((kalip) => kalip.test(temizMesaj));
  if (onemliBilgiVar && !injectionSupheli) {
    sonuclar.push({ memory_type: "important_fact", content: temizMesaj });
  }

  return sonuclar;
}

async function aktifHafizaIcinYerAc(
  client: PoolClient,
  userId: string,
): Promise<void> {
  await client.query(
    `WITH en_eski AS (
       SELECT id
       FROM bba_user_memories
       WHERE user_id = $1 AND is_active = true
       ORDER BY (memory_type = 'nickname') DESC, updated_at ASC, created_at ASC
       OFFSET 29
     )
     UPDATE bba_user_memories
     SET is_active = false, updated_at = now()
     WHERE id IN (SELECT id FROM en_eski)`,
    [userId],
  );
}

/**
 * Kullanıcı mesajından hafıza çıkarır ve yalnızca backend DB bağlantısıyla yazar.
 * Kullanıcı başına transaction advisory lock, eşzamanlı çift kayıtları engeller.
 */
export async function hafizayiMesajdanGuncelle(
  userId: string,
  conversationId: string,
  mesaj: string,
): Promise<number> {
  const kayitlar = mesajdanHafizaCikar(mesaj);
  if (kayitlar.length === 0) return 0;

  const client = await getPool().connect();
  let degisen = 0;
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [`bba-memory:${userId}`]);

    const sahiplik = await client.query(
      `SELECT 1
       FROM bba_conversations c
       JOIN public.users u ON u.id = c.user_id
       WHERE c.id = $1 AND u.auth_user_id = $2
       LIMIT 1`,
      [conversationId, userId],
    );
    if (sahiplik.rowCount !== 1) throw new Error("Hafıza kaynak sohbeti kullanıcıya ait değil.");

    for (const kayit of kayitlar) {
      if (kayit.memory_type === "nickname") {
        const mevcut = await client.query<{ id: string; content: string }>(
          `SELECT id, content FROM bba_user_memories
           WHERE user_id = $1 AND memory_type = 'nickname' AND is_active = true`,
          [userId],
        );
        if (mevcut.rows.some((satir) => karsilastirmaMetni(satir.content) === karsilastirmaMetni(kayit.content))) {
          continue;
        }
        await client.query(
          `UPDATE bba_user_memories
           SET is_active = false, updated_at = now()
           WHERE user_id = $1 AND memory_type = 'nickname' AND is_active = true`,
          [userId],
        );
        await aktifHafizaIcinYerAc(client, userId);
        await client.query(
          `INSERT INTO bba_user_memories
             (user_id, memory_type, content, source_conversation_id, is_active)
           VALUES ($1, 'nickname', $2, $3, true)`,
          [userId, kayit.content, conversationId],
        );
        degisen += 1;
        continue;
      }

      const mevcut = await client.query<{ id: string; content: string }>(
        `SELECT id, content FROM bba_user_memories
         WHERE user_id = $1 AND memory_type = $2 AND is_active = true`,
        [userId, kayit.memory_type],
      );
      const yeniTercih = kayit.memory_type === "preference" ? tercihImzasi(kayit.content) : null;
      const yeniBilgiTuru = kayit.memory_type === "important_fact" ? onemliBilgiTuru(kayit.content) : null;
      const celisenIds: string[] = [];
      let tekrar = false;

      for (const satir of mevcut.rows) {
        if (karsilastirmaMetni(satir.content) === karsilastirmaMetni(kayit.content)) {
          tekrar = true;
          break;
        }
        if (yeniTercih) {
          const eskiTercih = tercihImzasi(satir.content);
          if (eskiTercih && metinBenzerligi(eskiTercih.konu, yeniTercih.konu) >= 0.75) {
            if (eskiTercih.kutup === yeniTercih.kutup) tekrar = true;
            else celisenIds.push(satir.id);
          }
        } else if (yeniBilgiTuru) {
          const eskiBilgiTuru = onemliBilgiTuru(satir.content);
          if (eskiBilgiTuru === yeniBilgiTuru) {
            if (metinBenzerligi(satir.content, kayit.content) >= 0.8) tekrar = true;
            else celisenIds.push(satir.id);
          }
        } else if (metinBenzerligi(satir.content, kayit.content) >= 0.85) {
          tekrar = true;
        }
        if (tekrar) break;
      }
      if (tekrar) continue;

      if (celisenIds.length > 0) {
        await client.query(
          `UPDATE bba_user_memories
           SET is_active = false, updated_at = now()
           WHERE user_id = $1 AND id = ANY($2::uuid[])`,
          [userId, celisenIds],
        );
      }

      await aktifHafizaIcinYerAc(client, userId);
      await client.query(
        `INSERT INTO bba_user_memories
           (user_id, memory_type, content, source_conversation_id, is_active)
         VALUES ($1, $2, $3, $4, true)`,
        [userId, kayit.memory_type, kayit.content, conversationId],
      );
      degisen += 1;
    }

    await client.query("COMMIT");
    return degisen;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
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
     ORDER BY
       CASE WHEN memory_type = 'nickname' THEN 0 ELSE 1 END,
       updated_at DESC NULLS LAST,
       created_at DESC`,
    [userId]
  );

  return rows.map((kayit) => kayit.memory_type === "nickname"
    ? { ...kayit, content: hitabiBicimlendir(kayit.content) }
    : kayit);
}

export function ilgiliHafizalariSec(soru: string, hafiza: HafizaKaydi[]): HafizaKaydi[] {
  const soruKelimeleri = new Set(
    karsilastirmaMetni(soru).split(" ").filter((kelime) => kelime.length >= 3),
  );
  const genelYanitTercihi = /(?:cevap|yanıt|kısa|uzun|ayrıntılı|detaylı|üslup|ton|dil)/i;

  return hafiza.filter((kayit) => {
    if (kayit.memory_type === "nickname") return true;
    if (kayit.memory_type === "preference" && genelYanitTercihi.test(kayit.content)) return true;
    const hafizaKelimeleri = karsilastirmaMetni(kayit.content)
      .split(" ")
      .filter((kelime) => kelime.length >= 3);
    return hafizaKelimeleri.some((kelime) => soruKelimeleri.has(kelime));
  });
}

export async function kullaniciHafizalariniListele(userId: string): Promise<KullaniciHafizaDetayi[]> {
  const { rows } = await getPool().query<KullaniciHafizaDetayi>(
    `SELECT id, memory_type, content, created_at, updated_at
     FROM bba_user_memories
     WHERE user_id = $1 AND is_active = true
     ORDER BY
       CASE WHEN memory_type = 'nickname' THEN 0 ELSE 1 END,
       updated_at DESC NULLS LAST,
       created_at DESC`,
    [userId],
  );
  return rows.map((kayit) => kayit.memory_type === "nickname"
    ? { ...kayit, content: hitabiBicimlendir(kayit.content) }
    : kayit);
}

export async function kullaniciHafizasiniDuzenle(
  userId: string,
  hafizaId: string,
  content: string,
): Promise<KullaniciHafizaDetayi | null> {
  const temizIcerik = content.replace(/\s+/g, " ").trim().slice(0, 500);
  if (!temizIcerik) return null;
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [`bba-memory:${userId}`]);
    const mevcut = await client.query<KullaniciHafizaDetayi>(
      `SELECT id, memory_type, content, created_at, updated_at
       FROM bba_user_memories
       WHERE id = $1 AND user_id = $2 AND is_active = true
       FOR UPDATE`,
      [hafizaId, userId],
    );
    if (mevcut.rowCount !== 1) {
      await client.query("ROLLBACK");
      return null;
    }
    const yeniIcerik = mevcut.rows[0]!.memory_type === "nickname"
      ? hitabiBicimlendir(temizIcerik)
      : temizIcerik;
    const guncellenen = await client.query<KullaniciHafizaDetayi>(
      `UPDATE bba_user_memories
       SET content = $3, updated_at = now()
       WHERE id = $1 AND user_id = $2 AND is_active = true
       RETURNING id, memory_type, content, created_at, updated_at`,
      [hafizaId, userId, yeniIcerik],
    );
    await client.query("COMMIT");
    return guncellenen.rows[0] ?? null;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function kullaniciHafizasiniPasiflestir(
  userId: string,
  hafizaId: string,
): Promise<boolean> {
  const sonuc = await getPool().query(
    `UPDATE bba_user_memories
     SET is_active = false, updated_at = now()
     WHERE id = $1 AND user_id = $2 AND is_active = true
     RETURNING id`,
    [hafizaId, userId],
  );
  return sonuc.rowCount === 1;
}
