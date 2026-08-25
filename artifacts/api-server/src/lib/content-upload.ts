import { extname } from "node:path";
import mammoth from "mammoth";
import pdfParse from "pdf-parse/lib/pdf-parse.js";

const AYIRICI = /^-{10,}\s*$/m;
const URL_DESENI = /https?:\/\/[^\s<>"'()[\]{}]+/gi;
const HEDEF_PARCA_UZUNLUGU = 1600;
const AZAMI_PARCA_UZUNLUGU = 2200;

export type BilgiKaydi = {
  title: string;
  tags: string[];
  content: string;
  source: string;
  source_url: string | null;
};

export type KaynakDogrulamaSonucu =
  | { gecerli: true; source_url: string }
  | { gecerli: false; hata: string };

function sondakiNoktalamaIsaretleriniTemizle(deger: string): string {
  return deger.replace(/[.,;:!?]+$/u, "");
}

export function kaynakBilgisiniDogrula(source: string): KaynakDogrulamaSonucu {
  const temizKaynak = source.trim();
  if (!temizKaynak) return { gecerli: false, hata: "Kaynak adı ve bağlantısı boş bırakılamaz." };
  if (temizKaynak.length > 1500) return { gecerli: false, hata: "Kaynak bilgisi en fazla 1500 karakter olabilir." };
  if (/\p{Cc}/u.test(temizKaynak)) return { gecerli: false, hata: "Kaynak bilgisi geçersiz kontrol karakteri içeriyor." };

  const baglantilar = [...temizKaynak.matchAll(URL_DESENI)]
    .map((eslesme) => sondakiNoktalamaIsaretleriniTemizle(eslesme[0]));
  if (baglantilar.length === 0) return { gecerli: false, hata: "Kaynak bağlantısı bulunamadı." };
  if (baglantilar.length > 1) return { gecerli: false, hata: "Her içerik bölümünde yalnızca bir kaynak bağlantısı bulunmalıdır." };

  const sourceUrl = baglantilar[0]!;
  try {
    const url = new URL(sourceUrl);
    if (!(["http:", "https:"] as string[]).includes(url.protocol) || !url.hostname) {
      return { gecerli: false, hata: "Kaynak bağlantısı geçerli bir HTTP veya HTTPS adresi olmalıdır." };
    }
    if (url.username || url.password) {
      return { gecerli: false, hata: "Kaynak bağlantısında kullanıcı adı veya şifre bulunamaz." };
    }
  } catch {
    return { gecerli: false, hata: "Kaynak bağlantısı geçerli değil." };
  }

  const kaynakAdi = temizKaynak
    .replace(sourceUrl, "")
    .replace(/[\[\]()]/g, " ")
    .replace(/^[\s:;,.|\-]+|[\s:;,.|\-]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (kaynakAdi.length < 3) return { gecerli: false, hata: "Bağlantının yanında okunabilir bir kaynak adı bulunmalıdır." };

  return { gecerli: true, source_url: sourceUrl };
}

function uzunMetniKelimeSinirindanBol(metin: string, azamiUzunluk: number): string[] {
  const parcalar: string[] = [];
  let kalan = metin.trim();
  while (kalan.length > azamiUzunluk) {
    const aday = kalan.slice(0, azamiUzunluk + 1);
    const kesim = Math.max(aday.lastIndexOf(" "), aday.lastIndexOf("\n"));
    const guvenliKesim = kesim >= Math.floor(azamiUzunluk * 0.6) ? kesim : azamiUzunluk;
    parcalar.push(kalan.slice(0, guvenliKesim).trim());
    kalan = kalan.slice(guvenliKesim).trim();
  }
  if (kalan) parcalar.push(kalan);
  return parcalar;
}

function uzunParagrafiBol(paragraf: string): string[] {
  if (paragraf.length <= AZAMI_PARCA_UZUNLUGU) return [paragraf];
  const cumleler = paragraf.match(/[^.!?…]+(?:[.!?…]+[”"']?|$)/gu)?.map((cumle) => cumle.trim()).filter(Boolean) ?? [];
  if (cumleler.length < 2) return uzunMetniKelimeSinirindanBol(paragraf, AZAMI_PARCA_UZUNLUGU);

  const parcalar: string[] = [];
  let mevcut = "";
  for (const cumle of cumleler) {
    if (cumle.length > AZAMI_PARCA_UZUNLUGU) {
      if (mevcut) parcalar.push(mevcut);
      parcalar.push(...uzunMetniKelimeSinirindanBol(cumle, AZAMI_PARCA_UZUNLUGU));
      mevcut = "";
      continue;
    }
    const aday = mevcut ? `${mevcut} ${cumle}` : cumle;
    if (aday.length > AZAMI_PARCA_UZUNLUGU) {
      parcalar.push(mevcut);
      mevcut = cumle;
    } else {
      mevcut = aday;
    }
  }
  if (mevcut) parcalar.push(mevcut);
  return parcalar;
}

export function bilgiKaydiniParcala(kayit: BilgiKaydi): BilgiKaydi[] {
  if (kayit.content.length <= AZAMI_PARCA_UZUNLUGU) return [kayit];

  const paragraflar = kayit.content
    .replace(/\r\n?/g, "\n")
    .split(/\n\s*\n+/)
    .map((paragraf) => paragraf.trim())
    .filter(Boolean)
    .flatMap(uzunParagrafiBol);
  const icerikParcalari: string[] = [];
  let mevcut = "";
  for (const paragraf of paragraflar) {
    const aday = mevcut ? `${mevcut}\n\n${paragraf}` : paragraf;
    if (mevcut && (aday.length > AZAMI_PARCA_UZUNLUGU || mevcut.length >= HEDEF_PARCA_UZUNLUGU)) {
      icerikParcalari.push(mevcut);
      mevcut = paragraf;
    } else {
      mevcut = aday;
    }
  }
  if (mevcut) icerikParcalari.push(mevcut);

  return icerikParcalari.map((content) => ({ ...kayit, content }));
}

export function bilgiKayitlariniParcala(kayitlar: BilgiKaydi[]): BilgiKaydi[] {
  return kayitlar.flatMap(bilgiKaydiniParcala);
}

function alanCikar(satirlar: string[], anahtar: string): string {
  const alternatif = anahtar.replace(/:$/, ".");
  const satir = satirlar.find((deger) => deger.trimStart().startsWith(anahtar) || deger.trimStart().startsWith(alternatif));
  if (!satir) return "";
  const temiz = satir.trimStart();
  return temiz.slice(anahtar.length).trim();
}

function icerikCikar(satirlar: string[]): string {
  const baslangic = satirlar.findIndex((satir) => /^\s*İçerik[.:]/i.test(satir));
  if (baslangic < 0) return "";
  const ilkSatir = satirlar[baslangic]!.replace(/^\s*İçerik[.:]\s*/i, "");
  const parcalar = ilkSatir ? [ilkSatir] : [];
  for (let index = baslangic + 1; index < satirlar.length; index++) {
    const satir = satirlar[index]!;
    if (/^\s*Kaynak[.:]/i.test(satir) || AYIRICI.test(satir)) break;
    parcalar.push(satir);
  }
  return parcalar.join("\n").trim();
}

function bolumAyristir(bolum: string): BilgiKaydi | null {
  const satirlar = bolum.replace(/\r\n?/g, "\n").split("\n");
  const title = alanCikar(satirlar, "Başlık:");
  const content = icerikCikar(satirlar);
  const source = alanCikar(satirlar, "Kaynak:");
  if (!title || !content || !source) return null;
  const tagsHam = alanCikar(satirlar, "Etiketler:");
  const tags = tagsHam.split(",").map((tag) => tag.trim()).filter(Boolean).slice(0, 30);
  const kaynakDogrulama = kaynakBilgisiniDogrula(source);
  const sourceUrl = kaynakDogrulama.gecerli ? kaynakDogrulama.source_url : null;
  return { title: title.slice(0, 500), tags, content, source, source_url: sourceUrl };
}

export function bilgiKayitlariniAyristir(metin: string): {
  kayitlar: BilgiKaydi[];
  gecersizBolum: number;
  kaynakHatalari: Array<{ bolum: number; baslik: string; hata: string }>;
} {
  const normalize = metin.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n").trim();
  const bolumler = normalize
    .split(/\n(?=-{10,}\s*$)|(?<=\n-{10,})\n|\n(?=Başlık:\s*)/m)
    .flatMap((bolum) => bolum.split(/^-{10,}\s*$/m))
    .map((bolum) => bolum.trim())
    .filter(Boolean);
  const ayristirilan = bolumler.map(bolumAyristir);
  const kayitlar = ayristirilan.filter((kayit): kayit is BilgiKaydi => kayit !== null);
  const kaynakHatalari = ayristirilan.flatMap((kayit, index) => {
    if (!kayit) return [];
    const sonuc = kaynakBilgisiniDogrula(kayit.source);
    return sonuc.gecerli ? [] : [{ bolum: index + 1, baslik: kayit.title, hata: sonuc.hata }];
  });
  return { kayitlar, gecersizBolum: bolumler.length - kayitlar.length, kaynakHatalari };
}

export async function dosyadanMetinCikar(file: Express.Multer.File): Promise<string> {
  const uzanti = extname(file.originalname).toLocaleLowerCase("tr-TR");
  if (uzanti === ".txt") return file.buffer.toString("utf8");
  if (uzanti === ".docx") return (await mammoth.extractRawText({ buffer: file.buffer })).value;
  if (uzanti === ".pdf") return (await pdfParse(file.buffer)).text;
  throw new Error("Desteklenmeyen dosya türü.");
}

export function embeddingGirdisi(kayit: BilgiKaydi): string {
  const etiket = kayit.tags.length ? `Etiketler: ${kayit.tags.join(", ")}\n` : "";
  return `Başlık: ${kayit.title}\n${etiket}İçerik:\n${kayit.content}`;
}
