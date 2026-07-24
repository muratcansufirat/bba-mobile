import { Feather } from "@expo/vector-icons";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  ActivityIndicator,
  FlatList,
  Image,
  Keyboard,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAuth } from "@/src/contexts/AuthContext";
import { useGorunum, type Dil, type Tema, type YaziBoyutu } from "@/src/contexts/GorunumContext";
import { useKlavye } from "@/src/contexts/KlavyeContext";
import {
  mesajKaydet,
  sohbetAdlandir,
  sohbetSabitle,
  sohbetSil,
  sohbetlerListele,
  sohbetiYukle,
  sonSohbetiYukle,
  yeniSohbetOlustur,
  type DbConversation,
  type DbMesaj,
} from "@/src/lib/sohbet";
import { hafizaKaydet, mesajdanHafizaCikar } from "@/src/lib/hafiza";
import { ragSorgusu } from "@/src/lib/rag";

const MAVI = "#3B82F6";
const BEYAZ = "#FFFFFF";
const KULLANICI_BALON = "#2563EB";
const LOGO_BOYUT = 220;
const AVATAR_BOYUT = 28;

// ── UI Tipleri ──────────────────────────────────────────────────────────────

type Kaynak = { id: string; tur: string; baslik: string; url: string };
type Mesaj = {
  id: string;
  gonderen: "kullanici" | "bba";
  icerik: string;
  kaynaklar?: Kaynak[];
  streaming?: boolean; // true → cevap hâlâ yazılıyor
};

// ── DB → UI dönüşümü ────────────────────────────────────────────────────────

function dbMesajToUi(dbM: DbMesaj): Mesaj {
  return {
    id: dbM.id,
    gonderen: dbM.sender_type === "user" ? "kullanici" : "bba",
    icerik: dbM.icerik,
    kaynaklar: dbM.sources.map((s) => ({
      id: s.id,
      tur: "Kaynak",
      baslik: s.baslik ?? "",
      url: s.kaynak_url ?? "",
    })),
  };
}


// ── Tarih biçimlendirme ──────────────────────────────────────────────────────

function formatTarih(isoStr: string, dil: "tr" | "en"): string {
  const tarih = new Date(isoStr);
  const simdi = new Date();
  const gunBaslangici = new Date(simdi.getFullYear(), simdi.getMonth(), simdi.getDate());
  const dunBaslangici = new Date(gunBaslangici.getTime() - 86400000);

  const saat = tarih.getHours().toString().padStart(2, "0");
  const dk = tarih.getMinutes().toString().padStart(2, "0");

  if (tarih >= gunBaslangici) {
    return dil === "tr" ? `Bugün, ${saat}:${dk}` : `Today, ${saat}:${dk}`;
  } else if (tarih >= dunBaslangici) {
    return dil === "tr" ? `Dün, ${saat}:${dk}` : `Yesterday, ${saat}:${dk}`;
  } else {
    const aylar = dil === "tr"
      ? ["Oca","Şub","Mar","Nis","May","Haz","Tem","Ağu","Eyl","Eki","Kas","Ara"]
      : ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    return `${tarih.getDate()} ${aylar[tarih.getMonth()]} ${tarih.getFullYear()}`;
  }
}

// ── Yazıyor Göstergesi (3 nokta animasyonu) ─────────────────────────────────

function YaziyorGostergesi({ renk }: { renk: string }) {
  const d1 = useRef(new Animated.Value(0)).current;
  const d2 = useRef(new Animated.Value(0)).current;
  const d3 = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    function dalgalan(dot: Animated.Value, gecikme: number) {
      return Animated.loop(
        Animated.sequence([
          Animated.delay(gecikme),
          Animated.timing(dot, { toValue: 1, duration: 280, useNativeDriver: true }),
          Animated.timing(dot, { toValue: 0, duration: 280, useNativeDriver: true }),
          Animated.delay(Math.max(0, 560 - gecikme)),
        ])
      );
    }
    const a1 = dalgalan(d1, 0);
    const a2 = dalgalan(d2, 180);
    const a3 = dalgalan(d3, 360);
    a1.start();
    a2.start();
    a3.start();
    return () => { a1.stop(); a2.stop(); a3.stop(); };
  }, [d1, d2, d3]);

  const nokta = (dot: Animated.Value) => ({
    opacity: dot.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] }),
    transform: [{ translateY: dot.interpolate({ inputRange: [0, 1], outputRange: [0, -5] }) }],
  });

  return (
    <View style={{ flexDirection: "row", gap: 5, paddingVertical: 10, paddingHorizontal: 4 }}>
      <Animated.View style={[{ width: 7, height: 7, borderRadius: 3.5, backgroundColor: renk }, nokta(d1)]} />
      <Animated.View style={[{ width: 7, height: 7, borderRadius: 3.5, backgroundColor: renk }, nokta(d2)]} />
      <Animated.View style={[{ width: 7, height: 7, borderRadius: 3.5, backgroundColor: renk }, nokta(d3)]} />
    </View>
  );
}

// ── Tema ikonu ───────────────────────────────────────────────────────────────

function TemaIkonu({ tema, acikMetin }: { tema: "gece" | "gunduz"; acikMetin: string }) {
  return (
    <View style={{ alignItems: "center", justifyContent: "center", gap: 0 }}>
      <Text style={{ fontSize: 13, color: acikMetin, lineHeight: 15 }}>{tema === "gece" ? "☾" : "☀"}</Text>
      <Text style={{ fontSize: 9, color: acikMetin, fontFamily: "Inter_600SemiBold", lineHeight: 11, letterSpacing: 0.5 }}>Aa</Text>
    </View>
  );
}

// ── Ana Ekran ────────────────────────────────────────────────────────────────

export default function SohbetEkrani() {
  const { profil, cikisYap } = useAuth();
  const insets = useSafeAreaInsets();
  const { tema, setTema, yaziBoyutu, setYaziBoyutu, dil, setDil, olcek, renkler, t } = useGorunum();
  const { acik: klavyeAcik, yukseklik: klavyeYuksekligi, odaklandi, birakti } = useKlavye();

  const [soru, setSoru] = useState("");
  const [mesajlar, setMesajlar] = useState<Mesaj[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [yukleniyor, setYukleniyor] = useState(true);
  const [gonderiliyor, setGonderiliyor] = useState(false);
  const [gorunum, setGorunum] = useState(false);
  const [sanaOzelAcik, setSanaOzelAcik] = useState(false);
  const [konusmalar, setKonusmalar] = useState<DbConversation[]>([]);
  const [konusmalarYukleniyor, setKonusmalarYukleniyor] = useState(false);
  const [adlandirma, setAdlandirma] = useState<{ id: string; mevcutBaslik: string } | null>(null);
  const [yenAd, setYenAd] = useState("");
  const [adHata, setAdHata] = useState(false);
  const [adKaydediliyor, setAdKaydediliyor] = useState(false);
  const [silme, setSilme] = useState<{ id: string; baslik: string } | null>(null);
  const [siliniyor, setSiliniyor] = useState(false);

  const listRef = useRef<FlatList>(null);
  const streamIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Kayıt yapıldı mı? Her stream için ayrı tutulan flag
  const savedRef = useRef(false);
  // Kullanıcı listenin en altında mı? Scroll otomasyonunu yalnızca bu durumdayken çalıştır
  const isAtBottomRef = useRef(true);

  const ad = profil.adSoyad.trim() || (dil === "tr" ? "Kullanıcı" : "User");
  const tabYukseklik = 50 + insets.bottom;
  const inputBarYukseklik = 68;
  const klavyeTelafi = Platform.OS === "ios" ? klavyeYuksekligi : 0;
  const inputAlttan = klavyeAcik ? klavyeTelafi + 12 : tabYukseklik + 12;
  const altBosluk = (klavyeAcik ? klavyeTelafi : tabYukseklik) + inputBarYukseklik + 8;

  // ── Unmount temizliği ────────────────────────────────────────────────────

  useEffect(() => {
    return () => {
      if (streamIntervalRef.current) clearInterval(streamIntervalRef.current);
    };
  }, []);

  // ── Sana Özel paneli ─────────────────────────────────────────────────────

  async function sanaOzelAc() {
    setSanaOzelAcik(true);
    if (!profil.id) return;
    setKonusmalarYukleniyor(true);
    const data = await sohbetlerListele(profil.id);
    setKonusmalar(data);
    setKonusmalarYukleniyor(false);
  }

  function yeniSohbetBaslat() {
    // Yalnızca aktif conversation sıfırlanır; eski sohbetler dokunulmaz
    setConversationId(null);
    setMesajlar([]);
    setSanaOzelAcik(false);
  }

  async function sohbetiSec(convId: string) {
    setSanaOzelAcik(false);
    if (convId === conversationId) return; // zaten açık
    setYukleniyor(true);
    setMesajlar([]);
    const msgs = await sohbetiYukle(convId);
    setConversationId(convId);
    setMesajlar(msgs.map(dbMesajToUi));
    setYukleniyor(false);
  }

  // ── Yeniden adlandırma ───────────────────────────────────────────────────

  function adlandirmaBaslat(id: string, mevcutBaslik: string) {
    setAdlandirma({ id, mevcutBaslik });
    setYenAd(mevcutBaslik);
    setAdHata(false);
  }

  async function adlandirmaKaydet() {
    const temizAd = yenAd.trim();
    if (!temizAd) { setAdHata(true); return; }
    setAdKaydediliyor(true);
    const basari = await sohbetAdlandir(adlandirma!.id, temizAd);
    if (basari) {
      setKonusmalar((prev) =>
        prev.map((k) => k.id === adlandirma!.id ? { ...k, title: temizAd } : k)
      );
      setAdlandirma(null);
    }
    setAdKaydediliyor(false);
  }

  // ── Sabitleme ────────────────────────────────────────────────────────────

  async function sabitleToggle(id: string, mevcutDurum: boolean) {
    const yeniDurum = !mevcutDurum;
    await sohbetSabitle(id, yeniDurum);
    setKonusmalar((prev) => {
      const guncellenmis = prev.map((k) =>
        k.id === id ? { ...k, is_pinned: yeniDurum } : k
      );
      return [...guncellenmis].sort((a, b) => {
        if (a.is_pinned && !b.is_pinned) return -1;
        if (!a.is_pinned && b.is_pinned) return 1;
        return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
      });
    });
  }

  // ── Silme ────────────────────────────────────────────────────────────────

  function silmeBaslat(id: string, baslik: string) {
    setSilme({ id, baslik });
  }

  async function silmeOnayla() {
    if (!silme) return;
    setSiliniyor(true);
    const basari = await sohbetSil(silme.id);
    if (basari) {
      const silinen = silme.id;
      setKonusmalar((prev) => prev.filter((k) => k.id !== silinen));
      if (conversationId === silinen) {
        setConversationId(null);
        setMesajlar([]);
      }
      setSilme(null);
    }
    setSiliniyor(false);
  }

  // ── Uygulama açılışında son sohbeti yükle ────────────────────────────────

  useEffect(() => {
    if (!profil.id) { setYukleniyor(false); return; }

    setYukleniyor(true);
    sonSohbetiYukle(profil.id)
      .then(({ conversationId: convId, mesajlar: dbMesajlar }) => {
        setConversationId(convId);
        setMesajlar(dbMesajlar.map(dbMesajToUi));
      })
      .finally(() => setYukleniyor(false));
  }, [profil.id]);

  // ── Mesaj gönder ─────────────────────────────────────────────────────────

  async function gonder() {
    const metin = soru.trim();
    if (!metin || gonderiliyor) return;
    if (!profil.id) return;

    setSoru("");
    setGonderiliyor(true);

    // Yeni sohbet mi? (mesaj gönderilmeden önce conversation yoktu)
    const isIlkMesaj = conversationId === null;

    // Conversation yoksa yeni oluştur
    let convId = conversationId;
    if (!convId) {
      convId = await yeniSohbetOlustur(profil.id);
      if (convId) setConversationId(convId);
    }
    if (!convId) { setGonderiliyor(false); return; }

    // Kullanıcı mesajını DB'ye kaydet ve UI'a ekle
    const userMsgId = await mesajKaydet(convId, "user", metin);

    // İlk mesajdan otomatik başlık oluştur ve listeyi güncelle
    if (isIlkMesaj) {
      const s = metin.trim();
      const baslik = s.length > 48 ? s.slice(0, 48).replace(/\s\S*$/, "").trim() + "…" : s;
      void sohbetAdlandir(convId, baslik).then((ok) => {
        if (!ok) return;
        const now = new Date().toISOString();
        setKonusmalar((prev) => {
          const mevcutVar = prev.some((k) => k.id === convId);
          if (mevcutVar) {
            return prev.map((k) => k.id === convId ? { ...k, baslik, updated_at: now } : k);
          }
          return [{ id: convId!, baslik, is_pinned: false, created_at: now, updated_at: now }, ...prev];
        });
      });
    }
    isAtBottomRef.current = true; // Kullanıcı mesaj gönderdi → her zaman en alta git
    setMesajlar((prev) => [
      ...prev,
      { id: userMsgId ?? `temp-${Date.now()}`, gonderen: "kullanici", icerik: metin },
    ]);
    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 80);

    // Streaming mesajını UI'a ekle (henüz boş içerik)
    const streamId = `streaming-${Date.now()}`;
    setMesajlar((prev) => [
      ...prev,
      { id: streamId, gonderen: "bba", icerik: "", streaming: true },
    ]);
    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);

    // RAG API'sine sor — typing dots cevap gelene kadar gösterilir
    let bbaCevap: string;
    let bbaKaynaklar: Array<{ type: string; title: string; url: string }>;

    try {
      const ragSonuc = await ragSorgusu(metin, profil.id || undefined);
      bbaCevap = ragSonuc.cevap;
      bbaKaynaklar = ragSonuc.kullanilanKaynaklar.map((k) => ({
        type: "Kaynak",
        title: k.title,
        url: k.source_url ?? "",
      }));
    } catch {
      bbaCevap =
        dil === "tr"
          ? "Şu anda cevap üretemiyorum. Lütfen daha sonra tekrar deneyin."
          : "I'm unable to generate a response right now. Please try again later.";
      bbaKaynaklar = [];
    }

    const kelimeler = bbaCevap.split(" ");
    let kelimeIdx = 0;

    // Yinelenen kayıtları önlemek için flag sıfırla
    savedRef.current = false;

    // Mevcut interval varsa temizle
    if (streamIntervalRef.current) clearInterval(streamIntervalRef.current);

    const finalizeStream = async (finalText: string) => {
      // Tek kayıt güvencesi
      if (savedRef.current) return;
      savedRef.current = true;

      const bbaMsgId = await mesajKaydet(
        convId!,
        "bba",
        finalText,
        bbaKaynaklar
      );

      // Streaming mesajını kayıtlı, tam mesajla değiştir
      setMesajlar((prev) =>
        prev.map((m) =>
          m.id === streamId
            ? {
                id: bbaMsgId ?? streamId,
                gonderen: "bba",
                icerik: finalText,
                streaming: false,
                kaynaklar: bbaKaynaklar.map((k, i) => ({
                  id: `${bbaMsgId ?? streamId}-src-${i}`,
                  tur: k.type,
                  baslik: k.title,
                  url: k.url,
                })),
              }
            : m
        )
      );
      if (isAtBottomRef.current) {
        setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 80);
      }
      setGonderiliyor(false);

      // Hafıza çıkarımı — arka planda, kullanıcı akışını bloklamaz
      if (profil.id) {
        const uid = profil.id;
        void (async () => {
          const kayitlar = mesajdanHafizaCikar(metin);
          if (kayitlar.length > 0) {
            await hafizaKaydet(uid, convId!, kayitlar);
          }
        })();
      }
    };

    streamIntervalRef.current = setInterval(() => {
      kelimeIdx += 1;
      const kısmiMetin = kelimeler.slice(0, kelimeIdx).join(" ");

      setMesajlar((prev) =>
        prev.map((m) =>
          m.id === streamId ? { ...m, icerik: kısmiMetin } : m
        )
      );
      if (isAtBottomRef.current) {
        listRef.current?.scrollToEnd({ animated: false });
      }

      if (kelimeIdx >= kelimeler.length) {
        clearInterval(streamIntervalRef.current!);
        streamIntervalRef.current = null;
        void finalizeStream(bbaCevap);
      }
    }, 65);
  }

  // ── Stiller ──────────────────────────────────────────────────────────────

  const isGece = renkler.zemin === "#000000";

  const styles = useMemo(() => StyleSheet.create({
    zemin: { flex: 1, backgroundColor: renkler.zemin },
    header: {
      flexDirection: "row", alignItems: "center", justifyContent: "space-between",
      paddingHorizontal: 16, paddingVertical: 10,
      borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: renkler.sinir,
    },
    headerBaslik: { color: renkler.metin, fontSize: olcek(13), fontFamily: "Inter_700Bold", flexShrink: 1 },
    headerSag: { flexDirection: "row", alignItems: "center", gap: 6, flexShrink: 0 },
    dilKutu: {
      flexDirection: "row", alignItems: "center",
      backgroundColor: renkler.kart2, borderRadius: 6,
      paddingHorizontal: 6, paddingVertical: 3, marginLeft: 4,
    },
    dilAktif: { color: MAVI, fontSize: olcek(11), fontFamily: "Inter_700Bold" },
    dilCizgi: { color: renkler.sinir, fontSize: olcek(11) },
    dilPasif: { color: renkler.griMetin, fontSize: olcek(11), fontFamily: "Inter_500Medium" },
    ikonButon: { padding: 4 },
    subHeader: {
      flexDirection: "row", alignItems: "center", gap: 10,
      paddingHorizontal: 16, paddingVertical: 10,
      borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: renkler.sinir,
    },
    subHeaderMetin: { color: renkler.metin, fontSize: olcek(15), fontFamily: "Inter_600SemiBold" },
    karsilamaAlani: {
      flex: 1, alignItems: "center", justifyContent: "center", gap: 28,
      paddingHorizontal: 28, paddingBottom: 140,
    },
    logoSarici: {
      width: LOGO_BOYUT, height: LOGO_BOYUT,
      borderRadius: LOGO_BOYUT / 2, overflow: "hidden", backgroundColor: "#000",
    },
    logo: { width: LOGO_BOYUT, height: LOGO_BOYUT },
    karsilama: { color: renkler.metin, fontSize: olcek(20), fontFamily: "Inter_700Bold", textAlign: "center", lineHeight: olcek(30) },
    kullaniciBalonSarici: { alignItems: "flex-end" },
    kullaniciBalon: {
      backgroundColor: KULLANICI_BALON, borderRadius: 18,
      borderBottomRightRadius: 4, paddingHorizontal: 16, paddingVertical: 10, maxWidth: "80%",
    },
    kullaniciMetin: { color: BEYAZ, fontSize: olcek(15), fontFamily: "Inter_400Regular", lineHeight: olcek(22) },
    bbaSatir: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
    bbaAvatar: {
      width: AVATAR_BOYUT, height: AVATAR_BOYUT,
      borderRadius: AVATAR_BOYUT / 2, overflow: "hidden",
      backgroundColor: "#111", flexShrink: 0, marginTop: 2,
    },
    bbaAvatarImg: { width: AVATAR_BOYUT, height: AVATAR_BOYUT },
    bbaIcerik: { flex: 1, gap: 12 },
    bbaMetin: { color: renkler.metin, fontSize: olcek(15), fontFamily: "Inter_400Regular", lineHeight: olcek(24) },
    paragrafBlok: { gap: 8 },
    kaynakKartSatir: {
      backgroundColor: "rgba(59,130,246,0.12)",
      borderRadius: 10,
      borderWidth: 1,
      borderColor: "rgba(59,130,246,0.35)",
      paddingHorizontal: 12,
      paddingVertical: 10,
    },
    kaynakKartSatirIcerigi: {
      flexDirection: "row" as const,
      alignItems: "flex-start" as const,
      gap: 6,
    },
    kaynakTurEtiket: {
      color: MAVI, fontSize: olcek(11), fontFamily: "Inter_600SemiBold",
      flexShrink: 0 as const, paddingTop: 2,
    },
    kaynakKartSatirBaslik: {
      flex: 1, color: renkler.acikMetin, fontSize: olcek(13),
      fontFamily: "Inter_500Medium", lineHeight: olcek(18),
    },
    aksiyonlar: { flexDirection: "row", gap: 4 },
    aksiyonButon: {
      padding: 6, borderRadius: 8,
      borderWidth: 1, borderColor: renkler.sinir,
      backgroundColor: renkler.kart,
    },
    inputCubugu: { position: "absolute", left: 16, right: 16, flexDirection: "row", alignItems: "center", gap: 10 },
    inputSarici: {
      flex: 1, flexDirection: "row", alignItems: "center",
      backgroundColor: renkler.kart, borderRadius: 28,
      borderWidth: StyleSheet.hairlineWidth, borderColor: renkler.sinir,
      paddingHorizontal: 18, paddingVertical: Platform.OS === "ios" ? 13 : 10,
    },
    input: { flex: 1, color: renkler.metin, fontSize: olcek(15), fontFamily: "Inter_400Regular", padding: 0 },
    mikrofon: { marginLeft: 8 },
    gonderButon: { width: 44, height: 44, borderRadius: 22, backgroundColor: MAVI, alignItems: "center", justifyContent: "center" },
    gonderBtnPasif: { opacity: 0.5 },
  }), [renkler, olcek]);

  // ── Render yardımcıları ──────────────────────────────────────────────────

  const karsilamaEkrani = (
    <View style={styles.karsilamaAlani}>
      <View style={styles.logoSarici}>
        <Image source={require("@/assets/bba-logo.png")} style={styles.logo} resizeMode="cover" />
      </View>
      <Text style={styles.karsilama}>{t("merhabaAd", { ad })}</Text>
    </View>
  );

  function MesajSatiri({ item }: { item: Mesaj }) {
    if (item.gonderen === "kullanici") {
      return (
        <View style={styles.kullaniciBalonSarici}>
          <View style={styles.kullaniciBalon}>
            <Text style={styles.kullaniciMetin}>{item.icerik}</Text>
          </View>
        </View>
      );
    }

    // BBA mesajı — paragraf başına kaynak kartı
    const paragraflar = (!item.streaming && item.icerik)
      ? item.icerik.split(/\n\n+/).filter((p) => p.trim().length > 0)
      : [];
    const kaynakListesi = item.kaynaklar ?? [];

    function KaynakKarti({ kaynak }: { kaynak: Kaynak }) {
      const hasUrl = !!kaynak.url;
      if (hasUrl) {
        return (
          <TouchableOpacity
            style={styles.kaynakKartSatir}
            onPress={() => Linking.openURL(kaynak.url)}
            activeOpacity={0.75}
          >
            <View style={styles.kaynakKartSatirIcerigi}>
              <Text style={styles.kaynakTurEtiket}>{kaynak.tur}:</Text>
              <Text style={styles.kaynakKartSatirBaslik} numberOfLines={3}>{kaynak.baslik}</Text>
              <Feather name="external-link" size={13} color={MAVI} style={{ marginTop: 2, flexShrink: 0 }} />
            </View>
          </TouchableOpacity>
        );
      }
      return (
        <View style={styles.kaynakKartSatir}>
          <View style={styles.kaynakKartSatirIcerigi}>
            <Text style={styles.kaynakTurEtiket}>{kaynak.tur}:</Text>
            <Text style={styles.kaynakKartSatirBaslik} numberOfLines={3}>{kaynak.baslik}</Text>
          </View>
        </View>
      );
    }

    return (
      <View style={styles.bbaSatir}>
        <View style={styles.bbaAvatar}>
          <Image source={require("@/assets/bba-logo-transparent.png")} style={styles.bbaAvatarImg} resizeMode="contain" />
        </View>
        <View style={styles.bbaIcerik}>
          {/* Typing dots: streaming açık ve metin henüz boş */}
          {item.streaming && item.icerik === "" && (
            <YaziyorGostergesi renk={renkler.griMetin} />
          )}

          {/* Streaming sırasında metin tek blok — paragraf bölmesi yapılmaz */}
          {item.streaming && item.icerik !== "" && (
            <Text style={styles.bbaMetin}>{item.icerik}</Text>
          )}

          {/* Stream tamamlandı: her paragraf + altına kaynak kartı */}
          {!item.streaming && paragraflar.map((paragraf, i) => (
            <View key={i} style={styles.paragrafBlok}>
              <Text style={styles.bbaMetin}>{paragraf}</Text>
              {kaynakListesi[i] && <KaynakKarti kaynak={kaynakListesi[i]!} />}
            </View>
          ))}

          {/* Paragraf sayısından fazla kaynaklar son bloğun altında */}
          {!item.streaming && kaynakListesi.slice(paragraflar.length).map((kaynak, i) => (
            <KaynakKarti key={`artik-${i}`} kaynak={kaynak} />
          ))}

          {/* Aksiyonlar sadece stream tamamlandıktan sonra */}
          {!item.streaming && (
            <View style={styles.aksiyonlar}>
              <TouchableOpacity style={styles.aksiyonButon}><Feather name="thumbs-up" size={15} color={renkler.griMetin} /></TouchableOpacity>
              <TouchableOpacity style={styles.aksiyonButon}><Feather name="thumbs-down" size={15} color={renkler.griMetin} /></TouchableOpacity>
              <TouchableOpacity style={styles.aksiyonButon}><Feather name="share-2" size={15} color={renkler.griMetin} /></TouchableOpacity>
            </View>
          )}
        </View>
      </View>
    );
  }

  // ── JSX ──────────────────────────────────────────────────────────────────

  return (
    <View style={[styles.zemin, { paddingTop: insets.top }]}>

        {/* ── Header ── */}
        <View style={styles.header}>
          <Text style={styles.headerBaslik} numberOfLines={1}>{t("uygulamaAdi")}</Text>
          <View style={styles.headerSag}>
            <View style={styles.dilKutu}>
              <TouchableOpacity onPress={() => setDil("tr" as Dil)} hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}>
                <Text style={dil === "tr" ? styles.dilAktif : styles.dilPasif}>TR</Text>
              </TouchableOpacity>
              <Text style={styles.dilCizgi}> | </Text>
              <TouchableOpacity onPress={() => setDil("en" as Dil)} hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}>
                <Text style={dil === "en" ? styles.dilAktif : styles.dilPasif}>EN</Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity style={styles.ikonButon} onPress={() => setGorunum(true)}>
              <TemaIkonu tema={tema} acikMetin={renkler.acikMetin} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.ikonButon} onPress={() => cikisYap()}>
              <Feather name="log-out" size={16} color={renkler.acikMetin} />
            </TouchableOpacity>
          </View>
        </View>

        {/* ── Sub-header ── */}
        <TouchableOpacity style={styles.subHeader} onPress={sanaOzelAc} activeOpacity={0.7}>
          <Feather name="menu" size={18} color={renkler.metin} />
          <Text style={styles.subHeaderMetin}>{t("sanaOzel")}</Text>
          <Feather name="chevron-right" size={16} color={renkler.griMetin} style={{ marginLeft: "auto" }} />
        </TouchableOpacity>

        {/* ── İçerik ── */}
        <View style={{ flex: 1 }}>
          {yukleniyor ? (
            <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
              <ActivityIndicator size="large" color={MAVI} />
            </View>
          ) : mesajlar.length === 0 ? (
            karsilamaEkrani
          ) : (
            <FlatList
              ref={listRef}
              data={mesajlar}
              keyExtractor={(m) => m.id}
              renderItem={({ item }) => <MesajSatiri item={item} />}
              contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: altBosluk, gap: 20 }}
              showsVerticalScrollIndicator={false}
              keyboardDismissMode="on-drag"
              keyboardShouldPersistTaps="handled"
              scrollEventThrottle={100}
              onScroll={(e) => {
                const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
                const distFromBottom = contentSize.height - layoutMeasurement.height - contentOffset.y;
                isAtBottomRef.current = distFromBottom < 80;
              }}
            />
          )}

          {/* ── Input çubuğu ── */}
          <View style={[styles.inputCubugu, { bottom: inputAlttan }]}>
            <View style={styles.inputSarici}>
              <TextInput
                style={styles.input}
                placeholder={t("birSoruSorun")}
                placeholderTextColor={renkler.griMetin}
                value={soru}
                onChangeText={setSoru}
                multiline={false}
                returnKeyType="send"
                onSubmitEditing={gonder}
                onFocus={odaklandi}
                onBlur={birakti}
                editable={!gonderiliyor}
              />
              {gonderiliyor ? (
                <ActivityIndicator size="small" color={MAVI} style={styles.mikrofon} />
              ) : (
                <Feather name="mic" size={20} color={renkler.acikMetin} style={styles.mikrofon} />
              )}
            </View>
            <TouchableOpacity
              style={[styles.gonderButon, gonderiliyor && styles.gonderBtnPasif]}
              activeOpacity={0.8}
              onPress={gonder}
              disabled={gonderiliyor}
            >
              <Feather name="send" size={18} color={BEYAZ} />
            </TouchableOpacity>
          </View>
        </View>

        {/* ── Görünüm Ayarları Modali ── */}
        <Modal visible={gorunum} transparent animationType="fade" onRequestClose={() => setGorunum(false)}>
          <TouchableOpacity
            style={{ flex: 1, backgroundColor: "#000000BB", justifyContent: "flex-end" }}
            activeOpacity={1}
            onPress={() => setGorunum(false)}
          >
            <View style={{
              backgroundColor: renkler.kart, borderTopLeftRadius: 24, borderTopRightRadius: 24,
              paddingTop: 20, paddingHorizontal: 24, paddingBottom: insets.bottom + 24, gap: 16,
            }}>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                <Text style={{ color: renkler.metin, fontSize: 17, fontFamily: "Inter_700Bold" }}>{t("gorunumAyarlari")}</Text>
                <TouchableOpacity onPress={() => setGorunum(false)}>
                  <Feather name="x" size={20} color={renkler.acikMetin} />
                </TouchableOpacity>
              </View>

              <View style={{ height: 1, backgroundColor: renkler.sinir }} />

              <Text style={{ color: renkler.griMetin, fontSize: 12, fontFamily: "Inter_500Medium", textTransform: "uppercase", letterSpacing: 0.8 }}>{t("tema")}</Text>
              <View style={{ flexDirection: "row", gap: 12 }}>
                {([
                  { deger: "gece" as Tema, sembol: "☾", sembolRenk: "#FFFFFF" },
                  { deger: "gunduz" as Tema, sembol: "☀", sembolRenk: "#FFD60A" },
                ] as const).map((tm) => (
                  <TouchableOpacity
                    key={tm.deger}
                    style={{
                      flex: 1, alignItems: "center", justifyContent: "center", gap: 6,
                      paddingVertical: 16, borderRadius: 14,
                      backgroundColor: tema === tm.deger ? (isGece ? "#1A2744" : "#E8F0FE") : renkler.kart2,
                      borderWidth: 1, borderColor: tema === tm.deger ? MAVI : renkler.sinir,
                    }}
                    onPress={() => setTema(tm.deger)}
                    activeOpacity={0.8}
                  >
                    <Text style={{ fontSize: 22, lineHeight: 26, color: tm.sembolRenk }}>{tm.sembol}</Text>
                    <Text style={{ color: tema === tm.deger ? renkler.metin : renkler.griMetin, fontSize: 13, fontFamily: "Inter_500Medium" }}>
                      {tm.deger === "gece" ? t("gece") : t("gunduz")}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <View style={{ height: 1, backgroundColor: renkler.sinir }} />

              <Text style={{ color: renkler.griMetin, fontSize: 12, fontFamily: "Inter_500Medium", textTransform: "uppercase", letterSpacing: 0.8 }}>{t("yaziBoyutu")}</Text>
              <View style={{ flexDirection: "row", gap: 12 }}>
                {([
                  { deger: "kucuk" as YaziBoyutu, boyut: 13 },
                  { deger: "orta" as YaziBoyutu, boyut: 16 },
                  { deger: "buyuk" as YaziBoyutu, boyut: 20 },
                ] as const).map((b) => (
                  <TouchableOpacity
                    key={b.deger}
                    style={{
                      flex: 1, alignItems: "center", justifyContent: "center", gap: 6,
                      paddingVertical: 16, borderRadius: 14,
                      backgroundColor: yaziBoyutu === b.deger ? (isGece ? "#1A2744" : "#E8F0FE") : renkler.kart2,
                      borderWidth: 1, borderColor: yaziBoyutu === b.deger ? MAVI : renkler.sinir,
                    }}
                    onPress={() => setYaziBoyutu(b.deger)}
                    activeOpacity={0.8}
                  >
                    <Text style={{ color: renkler.metin, fontFamily: "Inter_700Bold", lineHeight: 28, fontSize: b.boyut }}>Aa</Text>
                    <Text style={{ color: yaziBoyutu === b.deger ? renkler.metin : renkler.griMetin, fontSize: 13, fontFamily: "Inter_500Medium" }}>
                      {b.deger === "kucuk" ? t("kucuk") : b.deger === "orta" ? t("orta") : t("buyuk")}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </TouchableOpacity>
        </Modal>

        {/* ── Silme Onay Modali ── */}
        <Modal visible={silme !== null} transparent animationType="fade" onRequestClose={() => setSilme(null)}>
          <TouchableOpacity
            style={{ flex: 1, backgroundColor: "#000000BB", justifyContent: "center", paddingHorizontal: 28 }}
            activeOpacity={1}
            onPress={() => !siliniyor && setSilme(null)}
          >
            <TouchableWithoutFeedback>
              <View style={{ backgroundColor: renkler.kart, borderRadius: 20, padding: 24, gap: 16 }}>
                <Text style={{ color: renkler.metin, fontSize: 17, fontFamily: "Inter_700Bold" }}>{t("sohbetiSil")}</Text>
                <Text style={{ color: renkler.griMetin, fontSize: 14, fontFamily: "Inter_400Regular", lineHeight: 21 }}>
                  {t("silOnayMesaj")}
                </Text>
                <View style={{ flexDirection: "row", gap: 10 }}>
                  <TouchableOpacity
                    style={{ flex: 1, paddingVertical: 12, borderRadius: 12, borderWidth: 1, borderColor: renkler.sinir, alignItems: "center" }}
                    onPress={() => setSilme(null)}
                    activeOpacity={0.8}
                    disabled={siliniyor}
                  >
                    <Text style={{ color: renkler.metin, fontSize: olcek(14), fontFamily: "Inter_500Medium" }}>{t("iptal")}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={{ flex: 1, paddingVertical: 12, borderRadius: 12, backgroundColor: "#FF453A", alignItems: "center" }}
                    onPress={silmeOnayla}
                    activeOpacity={0.8}
                    disabled={siliniyor}
                  >
                    {siliniyor
                      ? <ActivityIndicator size="small" color={BEYAZ} />
                      : <Text style={{ color: BEYAZ, fontSize: olcek(14), fontFamily: "Inter_600SemiBold" }}>{t("sil")}</Text>
                    }
                  </TouchableOpacity>
                </View>
              </View>
            </TouchableWithoutFeedback>
          </TouchableOpacity>
        </Modal>

        {/* ── Yeniden Adlandırma Modali ── */}
        <Modal visible={adlandirma !== null} transparent animationType="fade" onRequestClose={() => setAdlandirma(null)}>
          <TouchableOpacity
            style={{ flex: 1, backgroundColor: "#000000BB", justifyContent: "center", paddingHorizontal: 28 }}
            activeOpacity={1}
            onPress={() => setAdlandirma(null)}
          >
            <TouchableWithoutFeedback>
              <View style={{ backgroundColor: renkler.kart, borderRadius: 20, padding: 24, gap: 16 }}>
                <Text style={{ color: renkler.metin, fontSize: 17, fontFamily: "Inter_700Bold" }}>{t("yenidenAdlandir")}</Text>
                <View style={{
                  backgroundColor: renkler.kart2, borderRadius: 12,
                  borderWidth: StyleSheet.hairlineWidth, borderColor: adHata ? "#FF453A" : renkler.sinir,
                  paddingHorizontal: 14, paddingVertical: 10,
                }}>
                  <TextInput
                    style={{ color: renkler.metin, fontSize: olcek(15), fontFamily: "Inter_400Regular", padding: 0 }}
                    value={yenAd}
                    onChangeText={(v) => { setYenAd(v); if (adHata) setAdHata(false); }}
                    placeholder={t("baslikPh")}
                    placeholderTextColor={renkler.griMetin}
                    autoFocus
                    returnKeyType="done"
                    onSubmitEditing={adlandirmaKaydet}
                    maxLength={80}
                  />
                </View>
                {adHata && (
                  <Text style={{ color: "#FF453A", fontSize: 12, fontFamily: "Inter_400Regular", marginTop: -8 }}>
                    {t("baslikBos")}
                  </Text>
                )}
                <View style={{ flexDirection: "row", gap: 10 }}>
                  <TouchableOpacity
                    style={{ flex: 1, paddingVertical: 12, borderRadius: 12, borderWidth: 1, borderColor: renkler.sinir, alignItems: "center" }}
                    onPress={() => setAdlandirma(null)}
                    activeOpacity={0.8}
                  >
                    <Text style={{ color: renkler.metin, fontSize: olcek(14), fontFamily: "Inter_500Medium" }}>{t("iptal")}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={{ flex: 1, paddingVertical: 12, borderRadius: 12, backgroundColor: MAVI, alignItems: "center" }}
                    onPress={adlandirmaKaydet}
                    activeOpacity={0.8}
                    disabled={adKaydediliyor}
                  >
                    {adKaydediliyor
                      ? <ActivityIndicator size="small" color={BEYAZ} />
                      : <Text style={{ color: BEYAZ, fontSize: olcek(14), fontFamily: "Inter_600SemiBold" }}>{t("kaydet")}</Text>
                    }
                  </TouchableOpacity>
                </View>
              </View>
            </TouchableWithoutFeedback>
          </TouchableOpacity>
        </Modal>

        {/* ── Sana Özel Paneli ── */}
        <Modal visible={sanaOzelAcik} transparent animationType="slide" onRequestClose={() => setSanaOzelAcik(false)}>
          <View style={{ flex: 1, justifyContent: "flex-end" }}>
            {/* Backdrop: absoluteFill arkasında, panel dışı dokunuşu yakalar */}
            <Pressable
              style={[StyleSheet.absoluteFill, { backgroundColor: "#000000BB" }]}
              onPress={() => setSanaOzelAcik(false)}
            />
              <View style={{
                backgroundColor: renkler.kart,
                borderTopLeftRadius: 24, borderTopRightRadius: 24,
                paddingTop: 12, paddingBottom: insets.bottom + 24,
                maxHeight: "75%",
              }}>
                {/* Tutamaç */}
                <View style={{ width: 36, height: 4, backgroundColor: renkler.sinir, borderRadius: 2, alignSelf: "center", marginBottom: 16 }} />

                {/* Başlık */}
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 24, marginBottom: 16 }}>
                  <Text style={{ color: renkler.metin, fontSize: 17, fontFamily: "Inter_700Bold" }}>{t("sanaOzel")}</Text>
                  <TouchableOpacity onPress={() => setSanaOzelAcik(false)}>
                    <Feather name="x" size={20} color={renkler.acikMetin} />
                  </TouchableOpacity>
                </View>

                <View style={{ height: 1, backgroundColor: renkler.sinir, marginHorizontal: 24, marginBottom: 16 }} />

                {/* Yeni Sohbet butonu */}
                <TouchableOpacity
                  style={{
                    flexDirection: "row", alignItems: "center", gap: 10,
                    marginHorizontal: 16, marginBottom: 16,
                    paddingVertical: 13, paddingHorizontal: 16,
                    backgroundColor: MAVI, borderRadius: 14,
                  }}
                  onPress={yeniSohbetBaslat}
                  activeOpacity={0.8}
                >
                  <Feather name="plus-circle" size={18} color={BEYAZ} />
                  <Text style={{ color: BEYAZ, fontSize: 15, fontFamily: "Inter_600SemiBold" }}>
                    {t("yeniSohbet")}
                  </Text>
                </TouchableOpacity>

                <View style={{ height: 1, backgroundColor: renkler.sinir, marginHorizontal: 24, marginBottom: 16 }} />

                {/* Bölüm başlığı */}
                <Text style={{ color: renkler.griMetin, fontSize: 12, fontFamily: "Inter_500Medium", textTransform: "uppercase", letterSpacing: 0.8, paddingHorizontal: 24, marginBottom: 8 }}>
                  {t("sohbetGecmisi")}
                </Text>

                {/* Sohbet listesi */}
                {konusmalarYukleniyor ? (
                  <View style={{ alignItems: "center", paddingVertical: 28 }}>
                    <ActivityIndicator size="small" color={MAVI} />
                  </View>
                ) : konusmalar.length === 0 ? (
                  <Text style={{ color: renkler.griMetin, fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center", paddingVertical: 28, paddingHorizontal: 24 }}>
                    {t("sohbetYok")}
                  </Text>
                ) : (
                  <ScrollView
                    showsVerticalScrollIndicator={false}
                    contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 8, gap: 2 }}
                  >
                    {konusmalar.map((k) => {
                      const aktif = k.id === conversationId;
                      return (
                        <View
                          key={k.id}
                          style={{
                            flexDirection: "row", alignItems: "center",
                            borderRadius: 12,
                            backgroundColor: aktif ? (isGece ? "#1A2744" : "#E8F0FE") : "transparent",
                          }}
                        >
                          {/* Ana alan: konuşmayı seç */}
                          <TouchableOpacity
                            style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 11, paddingLeft: 12, paddingRight: 4 }}
                            onPress={() => sohbetiSec(k.id)}
                            activeOpacity={0.7}
                          >
                            <Feather name="message-circle" size={18} color={aktif ? MAVI : renkler.griMetin} />
                            <View style={{ flex: 1 }}>
                              <Text
                                style={{ color: renkler.metin, fontSize: 14, fontFamily: aktif ? "Inter_600SemiBold" : "Inter_400Regular" }}
                                numberOfLines={1}
                              >
                                {k.baslik ?? t("yeniSohbet")}
                              </Text>
                              <Text style={{ color: renkler.griMetin, fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 }}>
                                {formatTarih(k.updated_at, dil)}
                              </Text>
                            </View>
                            {aktif && <Feather name="check" size={15} color={MAVI} />}
                          </TouchableOpacity>
                          {/* İğne ikonu: sabitle / sabitlemeyi kaldır */}
                          <TouchableOpacity
                            style={{ paddingVertical: 11, paddingLeft: 8, paddingRight: 4 }}
                            onPress={() => sabitleToggle(k.id, k.is_pinned)}
                            hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
                          >
                            <Feather name="map-pin" size={14} color={k.is_pinned ? MAVI : renkler.griMetin} />
                          </TouchableOpacity>
                          {/* Kalem ikonu: yeniden adlandır */}
                          <TouchableOpacity
                            style={{ paddingVertical: 11, paddingLeft: 8, paddingRight: 4 }}
                            onPress={() => adlandirmaBaslat(k.id, k.baslik ?? t("sohbetBassiz"))}
                            hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
                          >
                            <Feather name="edit-2" size={14} color={renkler.griMetin} />
                          </TouchableOpacity>
                          {/* Çöp kutusu ikonu: sil */}
                          <TouchableOpacity
                            style={{ paddingVertical: 11, paddingLeft: 8, paddingRight: 12 }}
                            onPress={() => silmeBaslat(k.id, k.baslik ?? t("sohbetBassiz"))}
                            hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
                          >
                            <Feather name="trash-2" size={14} color={renkler.griMetin} />
                          </TouchableOpacity>
                        </View>
                      );
                    })}
                  </ScrollView>
                )}
              </View>
          </View>
        </Modal>

    </View>
  );
}
