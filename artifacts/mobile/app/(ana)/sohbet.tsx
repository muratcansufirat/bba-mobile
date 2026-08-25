import { Feather } from "@expo/vector-icons";
import * as Sharing from "expo-sharing";
import {
  getRecordingPermissionsAsync,
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioPlayer,
  useAudioPlayerStatus,
  useAudioRecorder,
  useAudioRecorderState,
} from "expo-audio";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  ActivityIndicator,
  Alert,
  AppState,
  FlatList,
  Image,
  InteractionManager,
  Keyboard,
  KeyboardAvoidingView,
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
import ViewShot from "react-native-view-shot";

import { useAuth } from "@/src/contexts/AuthContext";
import { useGorunum, type Dil, type Tema, type YaziBoyutu } from "@/src/contexts/GorunumContext";
import { useKlavye } from "@/src/contexts/KlavyeContext";
import {
  bbaSesiniOlustur,
  geciciBbaSesiniSil,
  geciciSesKaydiniSil,
  sesKaydiniBackendYukle,
  type GeciciBbaSesi,
} from "@/src/lib/sesKaydi";
import {
  favoriParagraflariListele,
  mesajKaydet,
  mesajGuncelle,
  mesajFavoriDurumuDegistir,
  mesajVeKaynaklariKesinlestir,
  sohbetAdlandir,
  sohbetSabitle,
  sohbetSil,
  sohbetlerListele,
  sohbetiYukle,
  yeniSohbetOlustur,
  type DbConversation,
  type DbFavoriParagraf,
  type DbMesaj,
} from "@/src/lib/sohbet";
import { RagIstekHatasi } from "@/src/lib/rag";
import { ragSorgusuStream } from "@/src/lib/ragStream";
import {
  notKaydet,
  notlariListele,
  notSil,
  type DbKullaniciNotu,
} from "@/src/lib/notDefteri";

const MAVI = "#3B82F6";
const BEYAZ = "#FFFFFF";
const KULLANICI_BALON = "#2563EB";
const LOGO_BOYUT = 220;
const AVATAR_BOYUT = 28;
const SOHBET_SAYFA_BOYUTU = 10;
const MESAJ_SAYFA_BOYUTU = 40;
const MAKSIMUM_SES_KAYDI_MS = 60_000;

// ── UI Tipleri ──────────────────────────────────────────────────────────────

type Kaynak = { id: string; tur: string; baslik: string; url: string };
type PaylasimKartiVerisi = { metin: string; kaynak?: Kaynak };
type Mesaj = {
  id: string;
  gonderen: "kullanici" | "bba";
  icerik: string;
  kaynaklar?: Kaynak[];
  streaming?: boolean; // true → cevap hâlâ yazılıyor
  favoriParagrafIndeksleri?: number[];
};

type YenidenDeneIstegi = {
  metin: string;
  conversationId: string;
  bbaMesajId: string | null;
};

function kaynaklariTekillestir<T>(
  kaynaklar: T[],
  bilgileriAl: (kaynak: T) => Pick<Kaynak, "tur" | "baslik" | "url">
): T[] {
  const gorulen = new Set<string>();
  return kaynaklar.filter((kaynak) => {
    const bilgiler = bilgileriAl(kaynak);
    const etiket = `${bilgiler.tur} ${bilgiler.baslik}`
      .normalize("NFKC")
      .replace(/[^\p{L}\p{N}]+/gu, " ")
      .trim()
      .toLocaleLowerCase("tr-TR");
    const kanonikUrl = bilgiler.url.trim().toLowerCase().replace(/[?#].*$/, "").replace(/\/$/, "");
    const anahtar = etiket || kanonikUrl;
    if (gorulen.has(anahtar)) return false;
    gorulen.add(anahtar);
    return true;
  });
}

function kaynakBilgisiniAyikla(
  source: string | null | undefined,
  yedekBaslik: string,
  yedekUrl: string | null | undefined
): { tur: string; baslik: string; url: string } {
  const hamDeger = source?.trim() ?? "";
  const markdown = hamDeger.match(/^\[([^\]]+)\]\((https?:\/\/[^)]+)\)\s*:?.*$/);
  const gorunenMetin = (markdown?.[1] ?? hamDeger)
    .replace(/https?:\/\/\S+/g, "")
    .replace(/^[\[\s]+|[\]\s:]+$/g, "")
    .trim();

  let tur = "Kaynak";
  let baslik = gorunenMetin;

  if (gorunenMetin.includes("|")) {
    const [turBolumu, ...baslikBolumleri] = gorunenMetin.split("|");
    tur = turBolumu?.trim() || "Kaynak";
    baslik = baslikBolumleri.join("|").trim();
  } else {
    const ikiNokta = gorunenMetin.indexOf(":");
    if (ikiNokta > 0) {
      tur = gorunenMetin.slice(0, ikiNokta).trim() || "Kaynak";
      baslik = gorunenMetin.slice(ikiNokta + 1).trim();
    }
  }

  const url = (markdown?.[2] ?? yedekUrl?.trim() ?? "")
    .replace(/[\]\),.;:]+$/, "");

  return {
    tur,
    baslik: baslik || yedekBaslik.trim(),
    url,
  };
}

// ── DB → UI dönüşümü ────────────────────────────────────────────────────────

function dbMesajToUi(dbM: DbMesaj): Mesaj {
  const kaynaklar = kaynaklariTekillestir(dbM.sources.map((s) => {
    const hamBaslik = s.baslik ?? "";
    const ayirici = hamBaslik.indexOf("|");
    return {
      id: s.id,
      tur: ayirici > 0 ? hamBaslik.slice(0, ayirici).trim() : "Kaynak",
      baslik: ayirici > 0 ? hamBaslik.slice(ayirici + 1).trim() : hamBaslik,
      url: s.kaynak_url ?? "",
    };
  }), (kaynak) => kaynak);
  return {
    id: dbM.id,
    gonderen: dbM.sender_type === "user" ? "kullanici" : "bba",
    icerik: dbM.icerik,
    kaynaklar,
    favoriParagrafIndeksleri: dbM.favorite_paragraph_indexes,
  };
}

function otomatikSohbetBasligiOlustur(ilkMesaj: string): string {
  const temizMetin = ilkMesaj.replace(/\s+/g, " ").trim();
  if (temizMetin.length <= 48) return temizMetin;

  const kesit = temizMetin.slice(0, 48);
  const sonBosluk = kesit.lastIndexOf(" ");
  const kelimeyiBolmeden = sonBosluk >= 24
    ? kesit.slice(0, sonBosluk)
    : kesit;
  return `${kelimeyiBolmeden.trimEnd()}…`;
}


// ── Tarih biçimlendirme ──────────────────────────────────────────────────────

function sohbetleriSirala(konusmalar: DbConversation[]): DbConversation[] {
  return [...konusmalar].sort((a, b) => {
    if (a.is_pinned !== b.is_pinned) {
      return a.is_pinned ? -1 : 1;
    }
    return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
  });
}

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
  const [eskiMesajDevamVar, setEskiMesajDevamVar] = useState(false);
  const [eskiMesajYukleniyor, setEskiMesajYukleniyor] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [yukleniyor, setYukleniyor] = useState(true);
  const [gonderiliyor, setGonderiliyor] = useState(false);
  const [yenidenDeneGoster, setYenidenDeneGoster] = useState(false);
  const [gorunum, setGorunum] = useState(false);
  const [sanaOzelAcik, setSanaOzelAcik] = useState(false);
  const [konusmalar, setKonusmalar] = useState<DbConversation[]>([]);
  const [konusmalarYukleniyor, setKonusmalarYukleniyor] = useState(false);
  const [dahaFazlaYukleniyor, setDahaFazlaYukleniyor] = useState(false);
  const [sohbetDevamVar, setSohbetDevamVar] = useState(false);
  const [sohbetListeHatasi, setSohbetListeHatasi] = useState(false);
  const [sohbetArama, setSohbetArama] = useState("");
  const [favoriler, setFavoriler] = useState<DbFavoriParagraf[]>([]);
  const [favorilerYukleniyor, setFavorilerYukleniyor] = useState(false);
  const [favoriListeHatasi, setFavoriListeHatasi] = useState(false);
  const [favorilerAcik, setFavorilerAcik] = useState(false);
  const [sohbetGecmisiAcik, setSohbetGecmisiAcik] = useState(false);
  const [notDefteriAcik, setNotDefteriAcik] = useState(false);
  const [notlar, setNotlar] = useState<DbKullaniciNotu[]>([]);
  const [notlarYukleniyor, setNotlarYukleniyor] = useState(false);
  const [notListeHatasi, setNotListeHatasi] = useState(false);
  const [notEditoru, setNotEditoru] = useState<{ id: string | null } | null>(null);
  const [notBasligi, setNotBasligi] = useState("");
  const [notIcerigi, setNotIcerigi] = useState("");
  const [notKaydediliyor, setNotKaydediliyor] = useState(false);
  const [adlandirma, setAdlandirma] = useState<{ id: string; mevcutBaslik: string } | null>(null);
  const [yenAd, setYenAd] = useState("");
  const [adHata, setAdHata] = useState(false);
  const [adKaydediliyor, setAdKaydediliyor] = useState(false);
  const [silme, setSilme] = useState<{ id: string; baslik: string } | null>(null);
  const [siliniyor, setSiliniyor] = useState(false);
  const [mikrofonIzniKontrolEdiliyor, setMikrofonIzniKontrolEdiliyor] = useState(false);
  const [sesKaydiUri, setSesKaydiUri] = useState<string | null>(null);
  const [sesKaydiIsleniyor, setSesKaydiIsleniyor] = useState(false);
  const [sesKaydiAktif, setSesKaydiAktif] = useState(false);
  const [sesHazirlaniyorMesajId, setSesHazirlaniyorMesajId] = useState<string | null>(null);
  const [sesOynatilanMesajId, setSesOynatilanMesajId] = useState<string | null>(null);
  const [sesDuraklatilanMesajId, setSesDuraklatilanMesajId] = useState<string | null>(null);
  const [favoriIsleniyorMesajId, setFavoriIsleniyorMesajId] = useState<string | null>(null);
  const [paylasimKarti, setPaylasimKarti] = useState<PaylasimKartiVerisi | null>(null);
  const [paylasiliyor, setPaylasiliyor] = useState(false);

  const sesKaydedici = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const sesKaydiDurumu = useAudioRecorderState(sesKaydedici, 250);
  const sesOynatici = useAudioPlayer(null, { updateInterval: 250 });
  const sesOynatmaDurumu = useAudioPlayerStatus(sesOynatici);

  const listRef = useRef<FlatList>(null);
  const paylasimKartRef = useRef<ViewShot>(null);
  const streamFlushTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);
  const streamAbortRef = useRef<AbortController | null>(null);
  const gonderimKilidiRef = useRef(false);
  const yenidenDeneIstegiRef = useRef<YenidenDeneIstegi | null>(null);
  const adlandirmaKilidiRef = useRef(false);
  const sabitlemeKilitleriRef = useRef(new Set<string>());
  const silmeKilidiRef = useRef(false);
  const silinenSohbetlerRef = useRef(new Set<string>());
  const sesKaydiKilidiRef = useRef(false);
  const sesKaydiAktifRef = useRef(false);
  const geciciBbaSesiRef = useRef<GeciciBbaSesi | null>(null);
  const ttsAbortRef = useRef<AbortController | null>(null);
  const sesYukleninceBaslatRef = useRef(false);
  const sesDuraklatilanMesajIdRef = useRef<string | null>(null);
  // Kayıt yapıldı mı? Her stream için ayrı tutulan flag
  const kesinlesenMesajlarRef = useRef(new Set<string>());
  // Kullanıcı listenin en altında mı? Scroll otomasyonunu yalnızca bu durumdayken çalıştır
  const isAtBottomRef = useRef(true);
  // Scroll to the final message once after a historical chat is laid out.
  const sohbetAcilisindaKaydirRef = useRef(false);
  // Eski bir sohbet yükleme isteğinin daha yeni seçimi ezmesini engeller
  const sohbetYuklemeAbortRef = useRef<AbortController | null>(null);
  const secilenSohbetIstekRef = useRef<string | null>(null);
  const paneldenBekleyenSohbetRef = useRef<string | null>(null);
  const sohbetYuklemeRef = useRef(0);
  // Stale list requests cannot write into a new user session.
  const sohbetListesiIstekRef = useRef(0);
  const sohbetListesiAbortRef = useRef<AbortController | null>(null);
  const aktifKullaniciIdRef = useRef(profil.id);

  const ad = profil.adSoyad.trim() || (dil === "tr" ? "Kullanıcı" : "User");
  const tabYukseklik = 50 + insets.bottom;
  const inputBarYukseklik = 68;
  const klavyeTelafi = Platform.OS === "ios" ? klavyeYuksekligi : 0;
  const inputAlttan = klavyeAcik ? klavyeTelafi + 12 : tabYukseklik + 12;
  const altBosluk = (klavyeAcik ? klavyeTelafi : tabYukseklik) + inputBarYukseklik + 8;
  const sesKaydiToplamSaniye = Math.floor(sesKaydiDurumu.durationMillis / 1000);
  const sesKaydiSuresi = `${String(Math.floor(sesKaydiToplamSaniye / 60)).padStart(2, "0")}:${String(sesKaydiToplamSaniye % 60).padStart(2, "0")}`;

  // ── Unmount temizliği ────────────────────────────────────────────────────

  useEffect(() => {
    return () => {
      mountedRef.current = false;
      streamAbortRef.current?.abort();
      streamAbortRef.current = null;
      sohbetYuklemeAbortRef.current?.abort();
      sohbetYuklemeAbortRef.current = null;
      sohbetListesiAbortRef.current?.abort();
      sohbetListesiAbortRef.current = null;
      secilenSohbetIstekRef.current = null;
      if (streamFlushTimeoutRef.current) clearTimeout(streamFlushTimeoutRef.current);
      streamFlushTimeoutRef.current = null;
      if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
      scrollTimeoutRef.current = null;
      sohbetYuklemeRef.current += 1;
      kesinlesenMesajlarRef.current.clear();
      if (sesKaydiAktifRef.current) {
        sesKaydiAktifRef.current = false;
        void sesKaydedici.stop()
          .catch(() => undefined)
          .finally(() => geciciSesKaydiniSil(sesKaydedici.uri));
        void setAudioModeAsync({ allowsRecording: false }).catch(() => undefined);
      }
      ttsAbortRef.current?.abort();
      ttsAbortRef.current = null;
      sesOynatici.pause();
      const geciciSes = geciciBbaSesiRef.current;
      geciciBbaSesiRef.current = null;
      if (geciciSes) void geciciBbaSesiniSil(geciciSes.audioId, geciciSes.accessToken);
    };
  }, [sesKaydedici, sesOynatici]);

  async function sesOynatmayiDurdur(hazirlanacakMesajId: string | null = null): Promise<void> {
    ttsAbortRef.current?.abort();
    ttsAbortRef.current = null;
    sesOynatici.pause();
    sesYukleninceBaslatRef.current = false;
    sesDuraklatilanMesajIdRef.current = null;
    if (mountedRef.current) {
      setSesHazirlaniyorMesajId(hazirlanacakMesajId);
      setSesOynatilanMesajId(null);
      setSesDuraklatilanMesajId(null);
    }
    await sesOynatici.seekTo(0).catch(() => undefined);
    const geciciSes = geciciBbaSesiRef.current;
    geciciBbaSesiRef.current = null;
    if (geciciSes) await geciciBbaSesiniSil(geciciSes.audioId, geciciSes.accessToken);
  }

  async function bbaCevabiniSeslendir(messageId: string, metin: string): Promise<void> {
    if (!metin.trim()) return;
    if (sesOynatilanMesajId === messageId && geciciBbaSesiRef.current) {
      if (sesDuraklatilanMesajIdRef.current === messageId) {
        sesDuraklatilanMesajIdRef.current = null;
        setSesDuraklatilanMesajId(null);
        try { sesOynatici.play(); } catch { /* durum akışı kullanıcıya bilgi verir */ }
      } else if (sesOynatmaDurumu.playing) {
        sesOynatici.pause();
        sesDuraklatilanMesajIdRef.current = messageId;
        setSesDuraklatilanMesajId(messageId);
      } else if (sesOynatmaDurumu.isLoaded) {
        sesDuraklatilanMesajIdRef.current = null;
        setSesDuraklatilanMesajId(null);
        try { sesOynatici.play(); } catch { /* kullanıcıya aşağıdaki durum akışı bilgi verir */ }
      } else {
        sesYukleninceBaslatRef.current = true;
      }
      return;
    }

    if (mountedRef.current) setSesHazirlaniyorMesajId(messageId);
    await sesOynatmayiDurdur(messageId);
    const controller = new AbortController();
    ttsAbortRef.current = controller;
    try {
      const ses = await bbaSesiniOlustur(messageId, metin, dil, controller.signal);
      if (controller.signal.aborted || !mountedRef.current) {
        await geciciBbaSesiniSil(ses.audioId, ses.accessToken);
        return;
      }
      geciciBbaSesiRef.current = ses;
      await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
      sesOynatici.replace({
        uri: ses.audioUrl,
        headers: { Authorization: `Bearer ${ses.accessToken}` },
      });
      setSesOynatilanMesajId(messageId);
      setSesDuraklatilanMesajId(null);
      sesYukleninceBaslatRef.current = true;
    } catch (error) {
      if (!controller.signal.aborted && mountedRef.current) {
        setSesHazirlaniyorMesajId(null);
        Alert.alert(
          dil === "tr" ? "Ses oynatılamadı" : "Audio could not be played",
          error instanceof Error ? error.message : (dil === "tr" ? "Lütfen yeniden deneyin." : "Please try again."),
        );
      }
    } finally {
      if (ttsAbortRef.current === controller) ttsAbortRef.current = null;
    }
  }

  useEffect(() => {
    if (sesOynatmaDurumu.didJustFinish) void sesOynatmayiDurdur();
  }, [sesOynatmaDurumu.didJustFinish]);

  useEffect(() => {
    if (!sesOynatmaDurumu.isLoaded || !sesYukleninceBaslatRef.current) return;
    sesYukleninceBaslatRef.current = false;
    try {
      sesOynatici.play();
      sesDuraklatilanMesajIdRef.current = null;
      setSesDuraklatilanMesajId(null);
    } catch {
      void sesOynatmayiDurdur();
      Alert.alert(
        dil === "tr" ? "Ses oynatılamadı" : "Audio could not be played",
        dil === "tr" ? "Ses dosyası yüklenemedi. Lütfen yeniden deneyin." : "The audio file could not be loaded. Please try again.",
      );
    }
  }, [sesOynatmaDurumu.isLoaded, sesOynatici, dil]);

  useEffect(() => {
    if (!sesOynatmaDurumu.playing || !sesOynatilanMesajId) return;
    setSesHazirlaniyorMesajId(null);
  }, [sesOynatmaDurumu.playing, sesOynatilanMesajId]);

  useEffect(() => {
    const abonelik = AppState.addEventListener("change", (durum) => {
      if (durum === "active") return;
      if (sesKaydiAktifRef.current) {
        sesKaydiAktifRef.current = false;
        setSesKaydiAktif(false);
        void sesKaydedici.stop()
          .catch(() => undefined)
          .finally(() => geciciSesKaydiniSil(sesKaydedici.uri));
        void setAudioModeAsync({ allowsRecording: false }).catch(() => undefined);
      }
      void sesOynatmayiDurdur();
    });
    return () => abonelik.remove();
  }, [sesKaydedici, sesOynatici]);

  useEffect(() => {
    if (sesKaydiAktif && sesKaydiDurumu.durationMillis >= MAKSIMUM_SES_KAYDI_MS) {
      void sesKaydiniBaslatVeyaDurdur();
    }
  }, [sesKaydiAktif, sesKaydiDurumu.durationMillis]);

  useEffect(() => {
    streamAbortRef.current?.abort();
    streamAbortRef.current = null;
    sohbetYuklemeAbortRef.current?.abort();
    sohbetYuklemeAbortRef.current = null;
    secilenSohbetIstekRef.current = null;
    aktifKullaniciIdRef.current = profil.id;
    sohbetListesiAbortRef.current?.abort();
    sohbetListesiAbortRef.current = null;
    sohbetListesiIstekRef.current += 1;
    setKonusmalar([]);
    setKonusmalarYukleniyor(false);
    setSohbetListeHatasi(false);
  }, [profil.id]);

  function cevapOlusturmayiIptalEt() {
    streamAbortRef.current?.abort();
  }

  async function mikrofonIzniHazirla() {
    if (mikrofonIzniKontrolEdiliyor) return false;

    setMikrofonIzniKontrolEdiliyor(true);
    try {
      let izin = await getRecordingPermissionsAsync();
      if (!izin.granted && izin.canAskAgain) {
        izin = await requestRecordingPermissionsAsync();
      }

      if (izin.granted) {
        return true;
      }

      if (!izin.canAskAgain) {
        Alert.alert(
          dil === "tr" ? "Mikrofon izni gerekli" : "Microphone permission required",
          dil === "tr"
            ? "Mikrofon erişimi cihaz ayarlarından açılmalıdır."
            : "Microphone access must be enabled from the device settings.",
          [
            { text: dil === "tr" ? "Vazgeç" : "Cancel", style: "cancel" },
            {
              text: dil === "tr" ? "Ayarları aç" : "Open settings",
              onPress: () => { void Linking.openSettings(); },
            },
          ],
        );
        return false;
      }

      Alert.alert(
        dil === "tr" ? "Mikrofon izni verilmedi" : "Microphone permission denied",
        dil === "tr"
          ? "Sesli soru sorabilmek için mikrofon erişimine izin vermeniz gerekir."
          : "You need to allow microphone access to ask voice questions.",
      );
      return false;
    } catch {
      Alert.alert(
        dil === "tr" ? "Mikrofon kullanılamadı" : "Microphone unavailable",
        dil === "tr"
          ? "Mikrofon izni kontrol edilemedi. Lütfen yeniden deneyin."
          : "Microphone permission could not be checked. Please try again.",
      );
      return false;
    } finally {
      if (mountedRef.current) setMikrofonIzniKontrolEdiliyor(false);
    }
  }

  async function sesKaydiniBaslatVeyaDurdur() {
    if (sesKaydiKilidiRef.current || gonderiliyor) return;

    sesKaydiKilidiRef.current = true;
    setSesKaydiIsleniyor(true);
    try {
      if (sesKaydiAktifRef.current) {
        sesKaydiAktifRef.current = false;
        setSesKaydiAktif(false);
        const kayitSuresi = sesKaydiDurumu.durationMillis;

        await Promise.race([
          sesKaydedici.stop(),
          new Promise<void>((_, reject) => {
            setTimeout(() => reject(new Error("Ses kaydı durdurma zaman aşımı")), 4000);
          }),
        ]);
        await setAudioModeAsync({ allowsRecording: false });

        const kayitUri = sesKaydedici.uri;
        if (!kayitUri) throw new Error("Kayıt dosyası oluşturulamadı.");
        setSesKaydiUri(kayitUri);

        let yukleme;
        try {
          yukleme = await sesKaydiniBackendYukle(kayitUri, kayitSuresi, dil);
        } finally {
          await geciciSesKaydiniSil(kayitUri);
          if (mountedRef.current) setSesKaydiUri(null);
        }
        if (!yukleme.accepted) throw new Error("Ses dosyası backend tarafından kabul edilmedi.");
        const transkript = yukleme.transcript.trim();
        if (!transkript) throw new Error("Ses kaydı metne dönüştürülemedi.");
        setSoru(transkript);
        await gonder(false, transkript);
        return;
      }

      const izinVar = await mikrofonIzniHazirla();
      if (!izinVar) return;

      setSesKaydiUri(null);
      if (geciciBbaSesiRef.current || ttsAbortRef.current || sesOynatilanMesajId) {
        await sesOynatmayiDurdur();
      }
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await sesKaydedici.prepareToRecordAsync();
      sesKaydedici.record();
      sesKaydiAktifRef.current = true;
      setSesKaydiAktif(true);
    } catch (error) {
      sesKaydiAktifRef.current = false;
      setSesKaydiAktif(false);
      void sesKaydedici.stop()
        .catch(() => undefined)
        .finally(() => geciciSesKaydiniSil(sesKaydedici.uri));
      void setAudioModeAsync({ allowsRecording: false }).catch(() => undefined);
      console.warn("[BBA] Ses kaydı işlemi başarısız:", error instanceof Error ? error.message : error);
      Alert.alert(
        dil === "tr" ? "Ses kaydı yapılamadı" : "Voice recording failed",
        error instanceof Error && error.message
          ? error.message
          : (dil === "tr"
              ? "Kayıt başlatılamadı veya durdurulamadı. Lütfen yeniden deneyin."
              : "The recording could not be started or stopped. Please try again."),
      );
    } finally {
      sesKaydiKilidiRef.current = false;
      if (mountedRef.current) setSesKaydiIsleniyor(false);
    }
  }

  // ── Sana Özel paneli ─────────────────────────────────────────────────────

  const filtrelenmisKonusmalar = useMemo(() => {
    const locale = dil === "tr" ? "tr-TR" : "en-US";
    const aranan = sohbetArama.trim().toLocaleLowerCase(locale);
    if (!aranan) return konusmalar;

    return konusmalar.filter((k) =>
      (k.baslik ?? t("sohbetBassiz")).toLocaleLowerCase(locale).includes(aranan)
    );
  }, [dil, konusmalar, sohbetArama, t]);

  async function sanaOzelAc() {
    sohbetListesiAbortRef.current?.abort();
    const controller = new AbortController();
    sohbetListesiAbortRef.current = controller;
    const timeoutId = setTimeout(() => controller.abort(), 15_000);
    setNotDefteriAcik(false);
    setFavorilerAcik(false);
    setSohbetGecmisiAcik(false);
    setSohbetArama("");
    setSohbetListeHatasi(false);
    setFavoriListeHatasi(false);
    setNotListeHatasi(false);
    setSanaOzelAcik(true);
    const authUserId = profil.id;
    const istekId = ++sohbetListesiIstekRef.current;
    if (!authUserId) {
      setKonusmalar([]);
      setFavoriler([]);
      setNotlar([]);
      setSohbetDevamVar(false);
      setSohbetListeHatasi(true);
      return;
    }
    setKonusmalarYukleniyor(true);
    setFavorilerYukleniyor(true);
    setNotlarYukleniyor(true);
    try {
      const [sayfa, favoriSonucu, notSonucu] = await Promise.all([
        sohbetlerListele(authUserId, 0, SOHBET_SAYFA_BOYUTU, controller.signal),
        favoriParagraflariListele(authUserId),
        notlariListele(authUserId),
      ]);
      if (!mountedRef.current || controller.signal.aborted ||
          istekId !== sohbetListesiIstekRef.current ||
          aktifKullaniciIdRef.current !== authUserId) return;
      setKonusmalar(sohbetleriSirala(
        sayfa.konusmalar.filter((k) => !silinenSohbetlerRef.current.has(k.id)),
      ));
      setSohbetDevamVar(sayfa.devamVar);
      setSohbetListeHatasi(sayfa.hata);
      setFavoriler(favoriSonucu.favoriler);
      setFavoriListeHatasi(favoriSonucu.hata);
      setNotlar(notSonucu.notlar);
      setNotListeHatasi(notSonucu.hata);
    } finally {
      clearTimeout(timeoutId);
      if (sohbetListesiAbortRef.current === controller) sohbetListesiAbortRef.current = null;
      if (mountedRef.current && istekId === sohbetListesiIstekRef.current) {
        setKonusmalarYukleniyor(false);
        setFavorilerYukleniyor(false);
        setNotlarYukleniyor(false);
      }
    }
  }

  function notEditorunuAc(not?: DbKullaniciNotu) {
    setNotEditoru({ id: not?.id ?? null });
    setNotBasligi(not?.title ?? "");
    setNotIcerigi(not?.content ?? "");
  }

  async function paylasimKartiniPaylas() {
    if (paylasiliyor || !paylasimKarti) return;
    setPaylasiliyor(true);
    try {
      const uri = await paylasimKartRef.current?.capture?.();
      if (!uri) throw new Error("Paylaşım kartı oluşturulamadı.");
      if (!(await Sharing.isAvailableAsync())) {
        throw new Error("Bu cihazda paylaşım menüsü kullanılamıyor.");
      }
      await Sharing.shareAsync(uri, {
        mimeType: "image/png",
        dialogTitle: dil === "tr" ? "BBA paylaşım kartını paylaş" : "Share BBA card",
        UTI: "public.png",
      });
      if (mountedRef.current) {
        setPaylasiliyor(false);
        setPaylasimKarti(null);
      }
    } catch {
      Alert.alert(
        dil === "tr" ? "Paylaşım yapılamadı" : "Could not share",
        dil === "tr" ? "Kart hazırlanamadı. Lütfen yeniden deneyin." : "The card could not be prepared. Please try again.",
      );
    } finally {
      if (mountedRef.current) setPaylasiliyor(false);
    }
  }

  async function notuKaydet() {
    if (notKaydediliyor || !notEditoru) return;
    const authUserId = profil.id;
    if (!authUserId) return;
    const baslik = notBasligi.replace(/\s+/g, " ").trim();
    const icerik = notIcerigi.trim();
    if (!baslik || !icerik) {
      Alert.alert(
        dil === "tr" ? "Eksik bilgi" : "Missing information",
        dil === "tr" ? "Not başlığı ve not metni boş bırakılamaz." : "The note title and text cannot be empty.",
      );
      return;
    }

    setNotKaydediliyor(true);
    try {
      const kaydedilen = await notKaydet(authUserId, notEditoru.id, baslik, icerik);
      if (!mountedRef.current) return;
      if (!kaydedilen) {
        Alert.alert(dil === "tr" ? "Not kaydedilemedi" : "Note could not be saved");
        return;
      }
      setNotlar((onceki) => [kaydedilen, ...onceki.filter((not) => not.id !== kaydedilen.id)]);
      setNotEditoru(null);
    } finally {
      if (mountedRef.current) setNotKaydediliyor(false);
    }
  }

  function notuSilmeOnayi(not: DbKullaniciNotu) {
    const authUserId = profil.id;
    if (!authUserId) return;
    Alert.alert(
      dil === "tr" ? "Notu sil" : "Delete note",
      dil === "tr" ? `“${not.title}” adlı not silinsin mi?` : `Delete the note “${not.title}”?`,
      [
        { text: dil === "tr" ? "İptal" : "Cancel", style: "cancel" },
        {
          text: dil === "tr" ? "Sil" : "Delete",
          style: "destructive",
          onPress: async () => {
            const basarili = await notSil(authUserId, not.id);
            if (mountedRef.current && basarili) {
              setNotlar((onceki) => onceki.filter((kayit) => kayit.id !== not.id));
            } else if (mountedRef.current) {
              Alert.alert(dil === "tr" ? "Not silinemedi" : "Note could not be deleted");
            }
          },
        },
      ],
    );
  }

  async function dahaFazlaSohbetYukle() {
    if (dahaFazlaYukleniyor || !sohbetDevamVar) return;

    const authUserId = profil.id;
    if (!authUserId) return;
    sohbetListesiAbortRef.current?.abort();
    const controller = new AbortController();
    sohbetListesiAbortRef.current = controller;
    const timeoutId = setTimeout(() => controller.abort(), 15_000);
    const istekId = sohbetListesiIstekRef.current;
    const offset = konusmalar.length;
    setDahaFazlaYukleniyor(true);
    try {
      const sayfa = await sohbetlerListele(authUserId, offset, SOHBET_SAYFA_BOYUTU, controller.signal);
      if (!mountedRef.current || controller.signal.aborted ||
          istekId !== sohbetListesiIstekRef.current ||
          aktifKullaniciIdRef.current !== authUserId) return;

      if (sayfa.hata) {
        setSohbetListeHatasi(true);
        return;
      }
      setKonusmalar((prev) => {
        const mevcutIdler = new Set(prev.map((k) => k.id));
        const yeniSohbetler = sayfa.konusmalar.filter(
          (k) => !mevcutIdler.has(k.id) && !silinenSohbetlerRef.current.has(k.id),
        );
        return sohbetleriSirala([...prev, ...yeniSohbetler]);
      });
      setSohbetDevamVar(sayfa.devamVar);
    } finally {
      clearTimeout(timeoutId);
      if (sohbetListesiAbortRef.current === controller) sohbetListesiAbortRef.current = null;
      if (mountedRef.current && istekId === sohbetListesiIstekRef.current) {
        setDahaFazlaYukleniyor(false);
      }
    }
  }

  function yeniSohbetBaslat() {
    streamAbortRef.current?.abort();
    setEskiMesajDevamVar(false);
    setEskiMesajYukleniyor(false);
    // Yalnızca aktif conversation sıfırlanır; eski sohbetler dokunulmaz
    sohbetYuklemeAbortRef.current?.abort();
    sohbetYuklemeAbortRef.current = null;
    secilenSohbetIstekRef.current = null;
    sohbetYuklemeRef.current += 1;
    isAtBottomRef.current = true;
    setConversationId(null);
    setMesajlar([]);
    setSoru("");
    setYenidenDeneGoster(false);
    yenidenDeneIstegiRef.current = null;
    setYukleniyor(false);
    setSanaOzelAcik(false);
  }

  async function sohbetiSec(convId: string) {
    if (convId === conversationId || secilenSohbetIstekRef.current === convId) return;

    streamAbortRef.current?.abort();
    sohbetYuklemeAbortRef.current?.abort();
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15_000);
    sohbetYuklemeAbortRef.current = controller;
    secilenSohbetIstekRef.current = convId;
    const istekNo = ++sohbetYuklemeRef.current;
    setYukleniyor(true);
    setMesajlar([]);
    setEskiMesajDevamVar(false);
    setEskiMesajYukleniyor(false);
    try {
      const sayfa = await sohbetiYukle(convId, 0, MESAJ_SAYFA_BOYUTU, controller.signal);
      if (!mountedRef.current ||
          sohbetYuklemeRef.current !== istekNo ||
          secilenSohbetIstekRef.current !== convId) return;
      setConversationId(convId);
      setMesajlar(sayfa.mesajlar.map(dbMesajToUi));
      setEskiMesajDevamVar(sayfa.devamVar);
      sohbetAcilisindaKaydirRef.current = sayfa.mesajlar.length > 0;
      isAtBottomRef.current = true;
    } catch {
      if (controller.signal.aborted ||
          sohbetYuklemeRef.current !== istekNo ||
          secilenSohbetIstekRef.current !== convId) return;
      setConversationId(null);
      setMesajlar([]);
      setEskiMesajDevamVar(false);
    } finally {
      clearTimeout(timeoutId);
      if (sohbetYuklemeAbortRef.current === controller) {
        sohbetYuklemeAbortRef.current = null;
      }
      if (secilenSohbetIstekRef.current === convId) {
        secilenSohbetIstekRef.current = null;
      }
      if (sohbetYuklemeRef.current === istekNo) {
        setYukleniyor(false);
      }
    }
  }

  async function dahaEskiMesajlariYukle() {
    if (!conversationId || eskiMesajYukleniyor || !eskiMesajDevamVar) return;

    const convId = conversationId;
    sohbetYuklemeAbortRef.current?.abort();
    const controller = new AbortController();
    sohbetYuklemeAbortRef.current = controller;
    const timeoutId = setTimeout(() => controller.abort(), 15_000);
    const istekNo = sohbetYuklemeRef.current;
    setEskiMesajYukleniyor(true);
    try {
      const sayfa = await sohbetiYukle(convId, mesajlar.length, MESAJ_SAYFA_BOYUTU, controller.signal);
      if (!mountedRef.current || controller.signal.aborted ||
          istekNo !== sohbetYuklemeRef.current ||
          conversationId !== convId) return;

      setMesajlar((prev) => {
        const mevcutIdler = new Set(prev.map((m) => m.id));
        const eskiMesajlar = sayfa.mesajlar.map(dbMesajToUi).filter((m) => !mevcutIdler.has(m.id));
        return [...eskiMesajlar, ...prev];
      });
      setEskiMesajDevamVar(sayfa.devamVar);
    } finally {
      clearTimeout(timeoutId);
      if (sohbetYuklemeAbortRef.current === controller) sohbetYuklemeAbortRef.current = null;
      if (mountedRef.current && istekNo === sohbetYuklemeRef.current) {
        setEskiMesajYukleniyor(false);
      }
    }
  }
  function paneldenSohbetSec(convId: string) {
    paneldenBekleyenSohbetRef.current = convId;
    setSanaOzelAcik(false);
  }

  useEffect(() => {
    if (sanaOzelAcik || !paneldenBekleyenSohbetRef.current) return;
    const convId = paneldenBekleyenSohbetRef.current;
    paneldenBekleyenSohbetRef.current = null;
    const gorev = InteractionManager.runAfterInteractions(() => {
      if (mountedRef.current) void sohbetiSec(convId);
    });
    return () => gorev.cancel();
  }, [sanaOzelAcik]);

  useEffect(() => {
    if (sanaOzelAcik) return;
    sohbetListesiAbortRef.current?.abort();
    sohbetListesiAbortRef.current = null;
  }, [sanaOzelAcik]);


  // ── Yeniden adlandırma ───────────────────────────────────────────────────

  function adlandirmaBaslat(id: string, mevcutBaslik: string) {
    setAdlandirma({ id, mevcutBaslik });
    setYenAd(mevcutBaslik);
    setAdHata(false);
  }

  async function adlandirmaKaydet() {
    if (!adlandirma || adlandirmaKilidiRef.current) return;
    const temizAd = yenAd.replace(/\s+/g, " ").trim();
    if (!temizAd) { setAdHata(true); return; }
    if (temizAd === adlandirma.mevcutBaslik) {
      setAdlandirma(null);
      return;
    }

    const sohbetId = adlandirma.id;
    adlandirmaKilidiRef.current = true;
    setAdKaydediliyor(true);
    try {
      const basari = await sohbetAdlandir(sohbetId, temizAd);
      if (!mountedRef.current) return;
      if (basari) {
        setKonusmalar((prev) =>
          prev.map((k) => k.id === sohbetId ? { ...k, baslik: temizAd } : k)
        );
        setAdlandirma(null);
      } else {
        setAdHata(true);
      }
    } finally {
      adlandirmaKilidiRef.current = false;
      if (mountedRef.current) setAdKaydediliyor(false);
    }
  }

  // ── Sabitleme ────────────────────────────────────────────────────────────

  async function sabitleToggle(id: string, mevcutDurum: boolean) {
    if (sabitlemeKilitleriRef.current.has(id)) return;
    sabitlemeKilitleriRef.current.add(id);
    const yeniDurum = !mevcutDurum;
    try {
      const basari = await sohbetSabitle(id, yeniDurum);
      if (!basari || !mountedRef.current) return;
      setKonusmalar((prev) => {
        const guncellenmis = prev.map((k) =>
          k.id === id ? { ...k, is_pinned: yeniDurum } : k
        );
        return sohbetleriSirala(guncellenmis);
      });
    } finally {
      sabitlemeKilitleriRef.current.delete(id);
    }
  }

  // ── Silme ────────────────────────────────────────────────────────────────

  function silmeBaslat(id: string, baslik: string) {
    setSilme({ id, baslik });
  }

  async function silmeOnayla() {
    if (!silme || silmeKilidiRef.current) return;

    const silinen = silme.id;
    silmeKilidiRef.current = true;
    setSiliniyor(true);
    silinenSohbetlerRef.current.add(silinen);
    sohbetListesiAbortRef.current?.abort();
    sohbetListesiAbortRef.current = null;
    sohbetListesiIstekRef.current += 1;
    setKonusmalarYukleniyor(false);
    setDahaFazlaYukleniyor(false);

    try {
      const basari = await sohbetSil(silinen);
      if (!basari) {
        silinenSohbetlerRef.current.delete(silinen);
        if (mountedRef.current) {
          Alert.alert(
            dil === "tr" ? "Sohbet silinemedi" : "Chat could not be deleted",
            dil === "tr"
              ? "Sohbet veritabanından kalıcı olarak silinemedi. Lütfen yeniden deneyin."
              : "The chat could not be permanently deleted from the database. Please try again.",
          );
        }
        return;
      }
      if (!mountedRef.current) return;

      setKonusmalar((prev) => prev.filter((k) => k.id !== silinen));
      if (conversationId === silinen) {
        sohbetYuklemeRef.current += 1;
        setConversationId(null);
        setMesajlar([]);
      }
      setSilme(null);
    } finally {
      silmeKilidiRef.current = false;
      if (mountedRef.current) setSiliniyor(false);
    }
  }

  // ── Her yeni uygulama oturumunda boş sohbetle başla ──────────────────────

  useEffect(() => {
    setConversationId(null);
    setMesajlar([]);
    setSoru("");
    setYukleniyor(false);
  }, [profil.id]);

  // ── Mesaj gönder ─────────────────────────────────────────────────────────

  async function gonder(yenidenDeneme = false, dogrudanMetin?: string) {
    const bekleyenIstek = yenidenDeneIstegiRef.current;
    const inputtakiBekleyenIstek = !yenidenDeneme
      && !dogrudanMetin
      && yenidenDeneGoster
      && bekleyenIstek?.metin === soru.trim();
    // Hata sonrası inputta korunan aynı metin gönderilirse mevcut isteği yeniden dene;
    // kullanıcı mesajını ikinci kez veritabanına kaydetme.
    const oncekiIstek = (yenidenDeneme || inputtakiBekleyenIstek) ? bekleyenIstek : null;
    if (yenidenDeneme && !oncekiIstek) return;
    const metin = oncekiIstek?.metin ?? dogrudanMetin?.trim() ?? soru.trim();
    if (!metin || gonderiliyor || gonderimKilidiRef.current) return;
    if (!profil.id) return;

    if (!oncekiIstek) setSoru("");
    gonderimKilidiRef.current = true;
    setGonderiliyor(true);
    setYenidenDeneGoster(false);

    // Yeni sohbet mi? (mesaj gönderilmeden önce conversation yoktu)
    const isIlkMesaj = !oncekiIstek && conversationId === null;

    // Conversation yoksa yeni oluştur
    let convId = oncekiIstek?.conversationId ?? conversationId;
    if (!convId) {
      convId = await yeniSohbetOlustur(profil.id);
      if (convId) setConversationId(convId);
    }
    if (!convId) {
      setSoru(metin);
      setYenidenDeneGoster(true);
      gonderimKilidiRef.current = false;
      setGonderiliyor(false);
      return;
    }

    // Kullanıcı mesajını DB'ye kaydet ve UI'a ekle
    if (!oncekiIstek) {
    const userMsgId = await mesajKaydet(convId, "user", metin);
    if (!userMsgId) {
      setSoru(metin);
      setYenidenDeneGoster(true);
      setGonderiliyor(false);
      gonderimKilidiRef.current = false;
      return;
    }

    const mesajZamani = new Date().toISOString();
    setKonusmalar((prev) => sohbetleriSirala(
      prev.map((k) => k.id === convId
        ? { ...k, updated_at: mesajZamani }
        : k
      )
    ));


    // İlk mesajdan otomatik başlık oluştur ve listeyi güncelle
    if (isIlkMesaj) {
      const baslik = otomatikSohbetBasligiOlustur(metin);
      void sohbetAdlandir(convId, baslik).then((ok) => {
        if (!ok) return;
        const now = new Date().toISOString();
        setKonusmalar((prev) => {
          const mevcutVar = prev.some((k) => k.id === convId);
          if (mevcutVar) {
            return sohbetleriSirala(
              prev.map((k) => k.id === convId ? { ...k, baslik, updated_at: now } : k)
            );
          }
          return sohbetleriSirala([
            { id: convId!, baslik, is_pinned: false, created_at: now, updated_at: now }, ...prev,
          ]);
        });
      });
    }
    isAtBottomRef.current = true; // Kullanıcı mesaj gönderdi → her zaman en alta git
    setMesajlar((prev) => [
      ...prev,
      { id: userMsgId, gonderen: "kullanici", icerik: metin },
    ]);
    if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
    scrollTimeoutRef.current = setTimeout(() => {
      scrollTimeoutRef.current = null;
      if (mountedRef.current) listRef.current?.scrollToEnd({ animated: true });
    }, 80);
    }

    // Streaming mesajını UI'a ekle (henüz boş içerik)
    let bbaMsgId = oncekiIstek?.bbaMesajId ?? null;
    if (!bbaMsgId) bbaMsgId = await mesajKaydet(convId, "bba", " ");
    if (!bbaMsgId) {
      setSoru(metin);
      setYenidenDeneGoster(true);
      yenidenDeneIstegiRef.current = { metin, conversationId: convId, bbaMesajId: null };
      gonderimKilidiRef.current = false;
      setGonderiliyor(false);
      return;
    }
    kesinlesenMesajlarRef.current.delete(bbaMsgId);
    yenidenDeneIstegiRef.current = { metin, conversationId: convId, bbaMesajId: bbaMsgId };
    const streamId = bbaMsgId;
    if (oncekiIstek?.bbaMesajId) {
      await mesajGuncelle(bbaMsgId, " ");
      setMesajlar((prev) => prev.map((m) => m.id === streamId
        ? { ...m, icerik: "", kaynaklar: [], streaming: true }
        : m));
    } else {
      setMesajlar((prev) => [
        ...prev,
        { id: streamId, gonderen: "bba", icerik: "", streaming: true },
      ]);
    }
    if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
    scrollTimeoutRef.current = setTimeout(() => {
      scrollTimeoutRef.current = null;
      if (mountedRef.current) listRef.current?.scrollToEnd({ animated: true });
    }, 100);

    // RAG API'sine sor — typing dots cevap gelene kadar gösterilir
    let bbaCevap: string;
    let bbaKaynaklar: Array<{ type: string; title: string; url: string }>;
    let yenidenDenenebilirHata = false;
    let akanMetin = "";
    let sonDbGuncelleme = 0;
    let dbGuncellemeKuyrugu: Promise<boolean> = Promise.resolve(true);
    const ayniMesajiDbdeGuncelle = (icerik: string) => {
      const simdi = Date.now();
      if (simdi - sonDbGuncelleme < 500) return;
      sonDbGuncelleme = simdi;
      dbGuncellemeKuyrugu = dbGuncellemeKuyrugu.then(() =>
        mesajGuncelle(bbaMsgId, icerik)
      );
    };

    const streamParcasiniGoster = (parca: string) => {
      akanMetin += parca;
      if (!mountedRef.current) return;
      if (streamFlushTimeoutRef.current) return;
      streamFlushTimeoutRef.current = setTimeout(() => {
        if (!mountedRef.current) return;
        const gosterilecekMetin = akanMetin;
        streamFlushTimeoutRef.current = null;
        setMesajlar((prev) =>
          prev.map((m) =>
            m.id === streamId ? { ...m, icerik: gosterilecekMetin } : m
          )
        );
        ayniMesajiDbdeGuncelle(gosterilecekMetin);
        if (isAtBottomRef.current) {
          requestAnimationFrame(() => {
            if (mountedRef.current) listRef.current?.scrollToEnd({ animated: false });
          });
        }
      }, 50);
    };

    try {
      const streamController = new AbortController();
      streamAbortRef.current = streamController;
      const ragSonuc = await ragSorgusuStream(
        metin,
        streamParcasiniGoster,
        streamController.signal,
        convId,
        dil,
      );
      bbaCevap = ragSonuc.cevap;
      bbaKaynaklar = kaynaklariTekillestir(ragSonuc.kullanilanKaynaklar.map((k) => {
        const kaynak = kaynakBilgisiniAyikla(k.source, k.title, k.source_url);
        return {
          type: kaynak.tur,
          title: kaynak.baslik,
          url: kaynak.url,
        };
      }), (kaynak) => ({ tur: kaynak.type, baslik: kaynak.title, url: kaynak.url }));
    } catch (hata: unknown) {
      const hataTuru = hata instanceof RagIstekHatasi ? hata.tur : "sunucu";
      if (hataTuru === "iptal") {
        if (mountedRef.current) setYenidenDeneGoster(false);
        yenidenDeneIstegiRef.current = null;
        bbaCevap = akanMetin.trim() || (dil === "tr" ? "Cevap oluşturma iptal edildi." : "Response generation cancelled.");
        bbaKaynaklar = [];
      } else {
      yenidenDenenebilirHata = true;
      if (mountedRef.current) {
        setSoru(metin);
        setYenidenDeneGoster(true);
      }
      let hataMesaji: string;
      if (hataTuru === "ag") {
        hataMesaji = dil === "tr"
          ? "İnternet bağlantısı kurulamadı. Bağlantınızı kontrol edip yeniden deneyin."
          : "Unable to connect. Check your internet connection and try again.";
      } else if (hataTuru === "timeout") {
        hataMesaji = dil === "tr"
          ? "İstek zaman aşımına uğradı. Lütfen yeniden deneyin."
          : "The request timed out. Please try again.";
      } else {
        hataMesaji = dil === "tr"
          ? "Sunucuda bir hata oluştu. Lütfen daha sonra yeniden deneyin."
          : "A server error occurred. Please try again later.";
      }
      bbaCevap = akanMetin.trim()
        ? `${akanMetin.trimEnd()}\n\n${hataMesaji}`
        : hataMesaji;
      bbaKaynaklar = [];
      }
    } finally {
      streamAbortRef.current = null;
    }

    // Mevcut interval varsa temizle
    if (streamFlushTimeoutRef.current) clearTimeout(streamFlushTimeoutRef.current);
    streamFlushTimeoutRef.current = null;

    const finalizeStream = async (finalText: string) => {
      // Aynı streaming cevabı ikinci kez kesinleştirilemez.
      if (kesinlesenMesajlarRef.current.has(bbaMsgId)) return;
      kesinlesenMesajlarRef.current.add(bbaMsgId);

      await dbGuncellemeKuyrugu;
      let mesajTamamlandi = await mesajVeKaynaklariKesinlestir(bbaMsgId, finalText, bbaKaynaklar);
      if (!mesajTamamlandi) {
        // Geçici bağlantı hatasında yeni kayıt açmadan aynı mesajı bir kez daha kesinleştir.
        mesajTamamlandi = await mesajVeKaynaklariKesinlestir(bbaMsgId, finalText, bbaKaynaklar);
      }
      // Kaynaklı cevap mevcut ekranda hiçbir zaman kartsız gösterilmez. DB kaydı
      // iki kez denenir; geçici ağ hatası kartın kullanıcıdan gizlenmesine yol açmaz.
      const goruntulenecekKaynaklar = bbaKaynaklar;
      if (!mesajTamamlandi) {
        console.warn("[BBA] Mesaj ve kaynakların kalıcı transaction kaydı tamamlanamadı.");
      }

      if (!mountedRef.current) return;

      // Streaming mesajını kayıtlı, tam mesajla değiştir
      setMesajlar((prev) =>
        prev.map((m) =>
          m.id === streamId
            ? {
                id: bbaMsgId,
                gonderen: "bba",
                icerik: finalText,
                streaming: false,
                kaynaklar: goruntulenecekKaynaklar.map((k, i) => ({
                  id: `${bbaMsgId}-src-${i}`,
                  tur: k.type,
                  baslik: k.title,
                  url: k.url,
                })),
              }
            : m
        )
      );
      if (isAtBottomRef.current) {
        if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
        scrollTimeoutRef.current = setTimeout(() => {
          scrollTimeoutRef.current = null;
          if (mountedRef.current) listRef.current?.scrollToEnd({ animated: true });
        }, 80);
      }
      setGonderiliyor(false);
      gonderimKilidiRef.current = false;

      if (!yenidenDenenebilirHata) {
        yenidenDeneIstegiRef.current = null;
        // Kullanıcı hata sırasında metni değiştirdiyse yeni taslağı koru.
        setSoru((mevcut) => mevcut.trim() === metin ? "" : mevcut);
      }

    };

    await finalizeStream(bbaCevap);
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
    bbaAvatarKolonu: { width: AVATAR_BOYUT, alignItems: "center", gap: 6, flexShrink: 0 },
    bbaIcerik: { flex: 1, gap: 12 },
    bbaMetin: { color: renkler.metin, fontSize: olcek(15), fontFamily: "Inter_400Regular", lineHeight: olcek(24) },
    cevapOlusturuluyor: { flexDirection: "row", alignItems: "center", gap: 8 },
    cevapOlusturuluyorMetin: { color: renkler.griMetin, fontSize: olcek(14), fontFamily: "Inter_400Regular" },
    paragrafBlok: { gap: 8 },
    paragrafSesliSatir: { position: "relative" },
    paragrafSesKontrolleri: {
      position: "absolute", left: -(AVATAR_BOYUT + 10), top: 2,
      flexDirection: "column", alignItems: "center", gap: 5, zIndex: 2,
    },
    paragrafMetinSarici: { flex: 1 },
    kaynakKartSatir: {
      width: "100%",
      height: 72,
      justifyContent: "center",
      backgroundColor: isGece ? "#142134" : "#EAF2FF",
      borderRadius: 12,
      borderWidth: 1,
      borderColor: isGece ? "#28508A" : "#8BB5F5",
      paddingHorizontal: 10,
      paddingVertical: 8,
    },
    kaynakKartSatirIcerigi: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: 6,
    },
    kaynakKartMetin: {
      flex: 1, color: MAVI, fontSize: 14,
      fontFamily: "Inter_400Regular", lineHeight: 19,
      textAlign: "left" as const,
      includeFontPadding: false,
    },
    kaynakTurEtiket: { fontFamily: "Inter_600SemiBold" },
    kaynakDisBaglantiButon: {
      width: 32, height: 40, flexShrink: 0 as const,
      alignItems: "center" as const,
      justifyContent: "center" as const,
    },
    kaynakDisBaglanti: { textAlign: "center" as const },
    aksiyonlar: { flexDirection: "row", gap: 4 },
    aksiyonButon: {
      width: 32, height: 32, alignItems: "center", justifyContent: "center", borderRadius: 9,
      borderWidth: 1, borderColor: renkler.sinir,
      backgroundColor: renkler.kart,
    },
    favoriButon: {
      width: 32, height: 32, marginTop: 4,
      alignItems: "center", justifyContent: "center", alignSelf: "flex-start",
      borderRadius: 9, borderWidth: 1, borderColor: MAVI,
      backgroundColor: renkler.kart,
    },
    favoriButonAktif: { backgroundColor: MAVI },
    inputCubugu: { position: "absolute", left: 16, right: 16, flexDirection: "row", alignItems: "center", gap: 10 },
    yenidenDeneButon: {
      position: "absolute", right: 16,
      flexDirection: "row", alignItems: "center", gap: 6,
      paddingHorizontal: 12, paddingVertical: 8,
      borderRadius: 16, backgroundColor: renkler.kart,
      borderWidth: 1, borderColor: MAVI,
    },
    yenidenDeneMetin: {
      color: MAVI, fontSize: olcek(12), fontFamily: "Inter_600SemiBold",
    },
    sesAksiyonlari: { flexDirection: "column", alignItems: "center", gap: 6 },
    sesAksiyonAktif: { borderColor: MAVI, backgroundColor: renkler.kart2 },
    inputSarici: {
      flex: 1, flexDirection: "row", alignItems: "center",
      backgroundColor: renkler.kart, borderRadius: 28,
      borderWidth: StyleSheet.hairlineWidth, borderColor: renkler.sinir,
      paddingHorizontal: 18, paddingVertical: Platform.OS === "ios" ? 13 : 10,
    },
    input: { flex: 1, color: renkler.metin, fontSize: olcek(15), fontFamily: "Inter_400Regular", padding: 0 },
    sesKaydiDurumSatiri: {
      flex: 1, flexDirection: "row", alignItems: "center", gap: 8,
    },
    sesKaydiNokta: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#EF4444" },
    sesKaydiDurumMetni: { color: "#EF4444", fontSize: olcek(13), fontFamily: "Inter_600SemiBold" },
    sesKaydiDurumSure: { color: renkler.acikMetin, fontSize: olcek(13), fontFamily: "Inter_500Medium" },
    mikrofon: { marginLeft: 8 },
    mikrofonButon: {
      width: 32, height: 32, marginLeft: 4,
      alignItems: "center", justifyContent: "center",
      borderRadius: 16,
    },
    mikrofonButonKayitta: { backgroundColor: "#DC2626" },
    mikrofonSure: { color: BEYAZ, fontSize: 10, fontFamily: "Inter_600SemiBold" },
    gonderButon: { width: 44, height: 44, borderRadius: 22, backgroundColor: MAVI, alignItems: "center", justifyContent: "center" },
    gonderBtnPasif: { opacity: 0.5 },
    iptalButon: { backgroundColor: "#DC2626" },
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

  function paragrafMetniniTemizle(metin: string): string {
    return metin
      .trim()
      .replace(/^#{1,6}\s+/, "")
      .replace(/^\s*(?:\d+[.)]|[-*])\s+/, "")
      .replace(/\*\*(.*?)\*\*/g, "$1")
      .replace(/__(.*?)__/g, "$1")
      .trim();
  }


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
      ? item.icerik.split(/\n\n+/).filter((p) =>
          p.trim().length > 0 && !/^(?:Kaynaklar?|Sources?)\s*:/i.test(p.trim())
        )
      : [];
    const kaynakListesi = item.kaynaklar ?? [];

    async function favoriDurumunuDegistir(paragraphIndex: number) {
      if (!profil.id || favoriIsleniyorMesajId || item.streaming || !item.icerik.trim()) return;
      const islemAnahtari = `${item.id}:${paragraphIndex}`;
      setFavoriIsleniyorMesajId(islemAnahtari);
      const mevcutIndeksler = item.favoriParagrafIndeksleri ?? [];
      const yeniDurum = !mevcutIndeksler.includes(paragraphIndex);
      const basarili = await mesajFavoriDurumuDegistir(profil.id, item.id, paragraphIndex, yeniDurum);
      if (basarili) {
        setMesajlar((mevcut) => mevcut.map((mesaj) =>
          mesaj.id === item.id
            ? {
                ...mesaj,
                favoriParagrafIndeksleri: yeniDurum
                  ? [...new Set([...(mesaj.favoriParagrafIndeksleri ?? []), paragraphIndex])]
                  : (mesaj.favoriParagrafIndeksleri ?? []).filter((index) => index !== paragraphIndex),
              }
            : mesaj
        ));
        if (sanaOzelAcik) {
          const sonuc = await favoriParagraflariListele(profil.id);
          if (mountedRef.current) setFavoriler(sonuc.favoriler);
        }
      } else {
        Alert.alert(
          dil === "tr" ? "İşlem tamamlanamadı" : "Action failed",
          dil === "tr"
            ? "Mesaj favorilere eklenemedi. Lütfen yeniden deneyin."
            : "The message could not be added to favorites. Please try again.",
        );
      }
      setFavoriIsleniyorMesajId(null);
    }

    function KaynakKarti({ kaynak }: { kaynak: Kaynak }) {
      const hasUrl = !!kaynak.url;
      return (
        <View style={styles.kaynakKartSatir}>
          <View style={styles.kaynakKartSatirIcerigi} pointerEvents="box-none">
            <Text
              style={styles.kaynakKartMetin}
              numberOfLines={2}
              ellipsizeMode="tail"
            >
              <Text style={styles.kaynakTurEtiket}>{kaynak.tur}: </Text>
              {kaynak.baslik}
            </Text>
            {hasUrl ? (
              <Pressable
                style={styles.kaynakDisBaglantiButon}
                onPress={() => Linking.openURL(kaynak.url)}
                hitSlop={8}
                accessibilityRole="link"
              >
                <Feather name="external-link" size={18} color={MAVI} style={styles.kaynakDisBaglanti} />
              </Pressable>
            ) : (
              <View style={styles.kaynakDisBaglantiButon} />
            )}
          </View>
        </View>
      );
    }

    return (
      <View style={styles.bbaSatir}>
        <View style={styles.bbaAvatarKolonu} />
        <View style={styles.bbaIcerik}>
          {/* Typing dots: streaming açık ve metin henüz boş */}
          {item.streaming && item.icerik === "" && (
            <View style={styles.cevapOlusturuluyor}>
              <Text style={styles.cevapOlusturuluyorMetin}>{dil === "tr" ? "Cevap oluşturuluyor…" : "Generating response…"}</Text>
              <YaziyorGostergesi renk={renkler.griMetin} />
            </View>
          )}

          {/* Streaming sırasında metin tek blok — paragraf bölmesi yapılmaz */}
          {item.streaming && item.icerik !== "" && (
            <Text style={styles.bbaMetin}>{item.icerik}</Text>
          )}

          {/* Stream tamamlandı: her paragraf + altına kaynak kartı */}
          {!item.streaming && paragraflar.map((paragraf, i) => {
            const temizParagraf = paragrafMetniniTemizle(paragraf);
            const bolumSesId = `${item.id}:bolum:${i}`;
            const buBolumOynatiliyor = sesOynatilanMesajId === bolumSesId;
            const buBolumDuraklatildi = sesDuraklatilanMesajId === bolumSesId;
            const buBolumFavori = (item.favoriParagrafIndeksleri ?? []).includes(i);
            const favoriIslemAnahtari = `${item.id}:${i}`;
            return (
            <View key={bolumSesId} style={styles.paragrafBlok}>
              <View style={styles.paragrafSesliSatir}>
                <View style={styles.paragrafSesKontrolleri}>
                  <Pressable
                    style={[styles.aksiyonButon, buBolumOynatiliyor && styles.sesAksiyonAktif]}
                    onPress={() => void bbaCevabiniSeslendir(bolumSesId, temizParagraf)}
                    disabled={sesHazirlaniyorMesajId !== null}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel={buBolumOynatiliyor && !buBolumDuraklatildi
                      ? (dil === "tr" ? `${i + 1}. bölümü duraklat` : `Pause section ${i + 1}`)
                      : (dil === "tr" ? `${i + 1}. bölümü oynat` : `Play section ${i + 1}`)}
                  >
                    {sesHazirlaniyorMesajId === bolumSesId ? (
                      <ActivityIndicator size="small" color={MAVI} />
                    ) : (
                      <Feather
                        name={buBolumOynatiliyor && !buBolumDuraklatildi ? "pause" : "play"}
                        size={16}
                        color={MAVI}
                      />
                    )}
                  </Pressable>
                  <Pressable
                    style={[styles.favoriButon, buBolumFavori && styles.favoriButonAktif]}
                    onPress={() => void favoriDurumunuDegistir(i)}
                    disabled={favoriIsleniyorMesajId !== null}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel={buBolumFavori
                      ? (dil === "tr" ? `${i + 1}. bölümü favorilerden çıkar` : `Remove section ${i + 1} from favorites`)
                      : (dil === "tr" ? `${i + 1}. bölümü favorilere ekle` : `Add section ${i + 1} to favorites`)}
                  >
                    {favoriIsleniyorMesajId === favoriIslemAnahtari ? (
                      <ActivityIndicator size="small" color={buBolumFavori ? BEYAZ : MAVI} />
                    ) : (
                      <Feather name="bookmark" size={16} color={buBolumFavori ? BEYAZ : MAVI} />
                    )}
                  </Pressable>
                  <Pressable
                    style={styles.aksiyonButon}
                    onPress={() => setPaylasimKarti({
                      metin: temizParagraf,
                      kaynak: i < kaynakListesi.length ? kaynakListesi[i] : undefined,
                    })}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel={dil === "tr" ? `${i + 1}. bölümü paylaş` : `Share section ${i + 1}`}
                  >
                    <Feather name="share-2" size={16} color={MAVI} />
                  </Pressable>
                  {buBolumOynatiliyor && (
                    <Pressable
                      style={styles.aksiyonButon}
                      onPress={() => void sesOynatmayiDurdur()}
                      hitSlop={8}
                      accessibilityRole="button"
                      accessibilityLabel={dil === "tr" ? `${i + 1}. bölümü durdur` : `Stop section ${i + 1}`}
                    >
                      <Feather name="square" size={16} color="#EF4444" />
                    </Pressable>
                  )}
                </View>
                <View style={styles.paragrafMetinSarici}>
                  <Text style={styles.bbaMetin}>{temizParagraf}</Text>
                </View>
              </View>
              {i < kaynakListesi.length && (
                <KaynakKarti
                  kaynak={kaynakListesi[i]!}
                />
              )}
            </View>
          );})}

        </View>
      </View>
    );
  }

  // ── JSX ──────────────────────────────────────────────────────────────────

  return (
    <View style={[styles.zemin, { paddingTop: insets.top }]}>

        {/* ── Header ── */}
        <View style={styles.header}>
          <Text style={styles.headerBaslik} numberOfLines={1}>{t("uygulamaAdiKisa")}</Text>
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
              style={{ flex: 1 }}
              data={mesajlar}
              keyExtractor={(m) => m.id}
              renderItem={({ item }) => <MesajSatiri item={item} />}
              contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: altBosluk, gap: 20 }}
              showsVerticalScrollIndicator={false}
              scrollEnabled
              removeClippedSubviews={false}
              initialNumToRender={8}
              maxToRenderPerBatch={6}
              windowSize={5}
              ListHeaderComponent={eskiMesajDevamVar ? (
                <TouchableOpacity
                  style={{
                    minHeight: 40, marginBottom: 12, borderRadius: 12,
                    alignItems: "center", justifyContent: "center",
                    borderWidth: 1, borderColor: renkler.sinir,
                    backgroundColor: renkler.kart,
                  }}
                  onPress={dahaEskiMesajlariYukle}
                  disabled={eskiMesajYukleniyor}
                  activeOpacity={0.8}
                >
                  {eskiMesajYukleniyor
                    ? <ActivityIndicator size="small" color={MAVI} />
                    : <Text style={{ color: MAVI, fontSize: 13, fontFamily: "Inter_600SemiBold" }}>{t("dahaEskiMesajlar")}</Text>}
                </TouchableOpacity>
              ) : null}
              keyboardDismissMode="on-drag"
              keyboardShouldPersistTaps="handled"
              scrollEventThrottle={16}
              onContentSizeChange={() => {
                if (!sohbetAcilisindaKaydirRef.current) return;
                requestAnimationFrame(() => {
                  if (!sohbetAcilisindaKaydirRef.current) return;
                  listRef.current?.scrollToEnd({ animated: false });
                  sohbetAcilisindaKaydirRef.current = false;
                });
              }}
              onScrollBeginDrag={() => {
                // Parmak hareketi her zaman önceliklidir; otomatik kaydırma yarışını durdur.
                isAtBottomRef.current = false;
                sohbetAcilisindaKaydirRef.current = false;
              }}
              onScroll={(e) => {
                const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
                const distFromBottom = contentSize.height - layoutMeasurement.height - contentOffset.y;
                isAtBottomRef.current = distFromBottom < 80;
              }}
            />
          )}

          {/* ── Input çubuğu ── */}
          {yenidenDeneGoster && !gonderiliyor && (
            <TouchableOpacity
              style={[styles.yenidenDeneButon, { bottom: inputAlttan + 58 }]}
              activeOpacity={0.8}
              onPress={() => void gonder(true)}
            >
              <Feather name="refresh-cw" size={14} color={MAVI} />
              <Text style={styles.yenidenDeneMetin}>{dil === "tr" ? "Yeniden dene" : "Try again"}</Text>
            </TouchableOpacity>
          )}
          <View style={[styles.inputCubugu, { bottom: inputAlttan }]}>
            <View style={styles.inputSarici}>
              {sesKaydiAktif ? (
                <View style={styles.sesKaydiDurumSatiri} accessibilityLiveRegion="polite">
                  <View style={styles.sesKaydiNokta} />
                  <Text style={styles.sesKaydiDurumMetni}>
                    {dil === "tr" ? "Kayıt yapılıyor" : "Recording"}
                  </Text>
                  <Text style={styles.sesKaydiDurumSure}>{sesKaydiSuresi}</Text>
                </View>
              ) : (
                <TextInput
                  style={styles.input}
                  placeholder={t("birSoruSorun")}
                  placeholderTextColor={renkler.griMetin}
                  value={soru}
                  onChangeText={setSoru}
                  multiline={false}
                  returnKeyType="send"
                  onSubmitEditing={() => void gonder(false)}
                  onFocus={odaklandi}
                  onBlur={birakti}
                  editable={!gonderiliyor}
                />
              )}
              {gonderiliyor ? (
                <ActivityIndicator size="small" color={MAVI} style={styles.mikrofon} />
              ) : (
                <TouchableOpacity
                  style={[
                    styles.mikrofonButon,
                    sesKaydiAktif && styles.mikrofonButonKayitta,
                  ]}
                  activeOpacity={0.7}
                  onPress={() => void sesKaydiniBaslatVeyaDurdur()}
                  disabled={mikrofonIzniKontrolEdiliyor || sesKaydiIsleniyor}
                  accessibilityRole="button"
                  accessibilityLabel={sesKaydiAktif
                    ? (dil === "tr" ? "Ses kaydını durdur" : "Stop voice recording")
                    : (dil === "tr" ? "Ses kaydını başlat" : "Start voice recording")}
                >
                  {mikrofonIzniKontrolEdiliyor || sesKaydiIsleniyor ? (
                    <ActivityIndicator size="small" color={MAVI} />
                  ) : sesKaydiAktif ? (
                    <Text style={styles.mikrofonSure}>
                      {Math.floor(sesKaydiDurumu.durationMillis / 1000)}s
                    </Text>
                  ) : (
                    <Feather name="mic" size={20} color={renkler.acikMetin} />
                  )}
                </TouchableOpacity>
              )}
            </View>
            {gonderiliyor ? (
              <TouchableOpacity
                style={[styles.gonderButon, styles.iptalButon]}
                activeOpacity={0.8}
                onPress={cevapOlusturmayiIptalEt}
                accessibilityLabel={dil === "tr" ? "Cevabı iptal et" : "Cancel response"}
              >
                <Feather name="square" size={16} color={BEYAZ} />
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={[styles.gonderButon, sesKaydiAktif && styles.gonderBtnPasif]}
                activeOpacity={0.8}
                onPress={() => void gonder(false)}
                disabled={sesKaydiAktif}
              >
                <Feather name="send" size={18} color={BEYAZ} />
              </TouchableOpacity>
            )}
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

        {/* ── BBA Paylaşım Kartı ── */}
        <Modal visible={paylasimKarti !== null} transparent animationType="fade" onRequestClose={() => !paylasiliyor && setPaylasimKarti(null)}>
          <View style={{ flex: 1, backgroundColor: "#000000DD", paddingHorizontal: 20, paddingTop: Math.max(insets.top, 12), paddingBottom: Math.max(insets.bottom, 12) }}>
            <ScrollView
              contentContainerStyle={{ flexGrow: 1, justifyContent: "center", alignItems: "center" }}
              showsVerticalScrollIndicator={false}
            >
              <ViewShot
                ref={paylasimKartRef}
                options={{ format: "png", quality: 1, result: "tmpfile" }}
                style={{ width: "100%", maxWidth: 390 }}
              >
                <View style={{ backgroundColor: "#05070B", borderRadius: 24, borderWidth: 1, borderColor: "#244C86", padding: 20 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 16 }}>
                    <Image
                      source={require("@/assets/bba-logo-transparent.png")}
                      style={{ width: 44, height: 44 }}
                      resizeMode="contain"
                    />
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: BEYAZ, fontSize: 17, fontFamily: "Inter_700Bold" }}>Birleşik Bilinç Alanı</Text>
                      <Text style={{ color: "#7EAEFF", fontSize: 12, fontFamily: "Inter_500Medium", marginTop: 2 }}>BBA</Text>
                    </View>
                  </View>
                  <Text style={{
                    color: BEYAZ,
                    fontSize: (paylasimKarti?.metin.length ?? 0) > 520 ? 13 : (paylasimKarti?.metin.length ?? 0) > 380 ? 14 : (paylasimKarti?.metin.length ?? 0) > 260 ? 16 : 19,
                    lineHeight: (paylasimKarti?.metin.length ?? 0) > 520 ? 19 : (paylasimKarti?.metin.length ?? 0) > 380 ? 21 : (paylasimKarti?.metin.length ?? 0) > 260 ? 24 : 29,
                    fontFamily: "Inter_400Regular",
                  }}>
                    {paylasimKarti?.metin ?? ""}
                  </Text>
                  <View style={{ height: 1, backgroundColor: "#1E293B", marginTop: 18, marginBottom: 12 }} />
                  <Text style={{ color: "#94A3B8", fontSize: 11, textAlign: "center", fontFamily: "Inter_500Medium", letterSpacing: 0.4 }}>
                    {dil === "tr" ? "Birleşik Bilinç Alanı uygulamasından paylaşıldı" : "Shared from the Unified Consciousness Field app"}
                  </Text>
                </View>
              </ViewShot>

              <View style={{ width: "100%", maxWidth: 390, flexDirection: "row", gap: 10, marginTop: 12 }}>
                <TouchableOpacity
                  style={{ flex: 1, minHeight: 48, borderRadius: 14, borderWidth: 1, borderColor: "#475569", alignItems: "center", justifyContent: "center" }}
                  onPress={() => setPaylasimKarti(null)}
                  disabled={paylasiliyor}
                >
                  <Text style={{ color: BEYAZ, fontSize: 15, fontFamily: "Inter_600SemiBold" }}>{dil === "tr" ? "Kapat" : "Close"}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={{ flex: 1, minHeight: 48, borderRadius: 14, backgroundColor: MAVI, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8 }}
                  onPress={() => void paylasimKartiniPaylas()}
                  disabled={paylasiliyor}
                >
                  {paylasiliyor ? <ActivityIndicator size="small" color={BEYAZ} /> : <Feather name="share-2" size={17} color={BEYAZ} />}
                  <Text style={{ color: BEYAZ, fontSize: 15, fontFamily: "Inter_600SemiBold" }}>{dil === "tr" ? "Paylaş" : "Share"}</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
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

        {/* ── Not Defteri Editörü ── */}
        <Modal visible={notEditoru !== null} transparent animationType="fade" onRequestClose={() => !notKaydediliyor && setNotEditoru(null)}>
          <KeyboardAvoidingView
            style={{ flex: 1 }}
            behavior={Platform.OS === "ios" ? "padding" : "height"}
            keyboardVerticalOffset={Platform.OS === "ios" ? 12 : 0}
          >
            <TouchableOpacity
              style={{ flex: 1, backgroundColor: "#000000BB", justifyContent: "center", paddingHorizontal: 24, paddingVertical: 16 }}
              activeOpacity={1}
              onPress={() => !notKaydediliyor && setNotEditoru(null)}
            >
              <TouchableWithoutFeedback>
                <View style={{ backgroundColor: renkler.kart, borderRadius: 20, padding: 22, gap: 14, maxHeight: "90%" }}>
                  <Text style={{ color: renkler.metin, fontSize: 17, fontFamily: "Inter_700Bold" }}>
                    {notEditoru?.id
                      ? (dil === "tr" ? "Notu düzenle" : "Edit note")
                      : (dil === "tr" ? "Yeni not" : "New note")}
                  </Text>
                  <ScrollView
                    style={{ flexShrink: 1 }}
                    contentContainerStyle={{ gap: 12 }}
                    keyboardShouldPersistTaps="handled"
                    showsVerticalScrollIndicator
                    nestedScrollEnabled
                  >
                    <TextInput
                      style={{ color: renkler.metin, fontSize: olcek(15), fontFamily: "Inter_500Medium", minHeight: 48, borderRadius: 12, borderWidth: 1, borderColor: renkler.sinir, backgroundColor: renkler.kart2, paddingHorizontal: 14 }}
                      value={notBasligi}
                      onChangeText={setNotBasligi}
                      placeholder={dil === "tr" ? "Not başlığı" : "Note title"}
                      placeholderTextColor={renkler.griMetin}
                      maxLength={100}
                      autoFocus
                    />
                    <TextInput
                      style={{ color: renkler.metin, fontSize: olcek(14), lineHeight: olcek(21), fontFamily: "Inter_400Regular", minHeight: 180, maxHeight: 320, borderRadius: 12, borderWidth: 1, borderColor: renkler.sinir, backgroundColor: renkler.kart2, padding: 14, textAlignVertical: "top" }}
                      value={notIcerigi}
                      onChangeText={setNotIcerigi}
                      placeholder={dil === "tr" ? "Notunuzu yazın..." : "Write your note..."}
                      placeholderTextColor={renkler.griMetin}
                      multiline
                      scrollEnabled
                      maxLength={10000}
                    />
                  </ScrollView>
                  <View style={{ flexDirection: "row", gap: 10 }}>
                    <TouchableOpacity
                      style={{ flex: 1, paddingVertical: 12, borderRadius: 12, borderWidth: 1, borderColor: renkler.sinir, alignItems: "center" }}
                      onPress={() => setNotEditoru(null)}
                      disabled={notKaydediliyor}
                    >
                      <Text style={{ color: renkler.metin, fontSize: olcek(14), fontFamily: "Inter_500Medium" }}>
                        {dil === "tr" ? "İptal" : "Cancel"}
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={{ flex: 1, paddingVertical: 12, borderRadius: 12, backgroundColor: MAVI, alignItems: "center" }}
                      onPress={notuKaydet}
                      disabled={notKaydediliyor}
                    >
                      {notKaydediliyor
                        ? <ActivityIndicator size="small" color={BEYAZ} />
                        : <Text style={{ color: BEYAZ, fontSize: olcek(14), fontFamily: "Inter_600SemiBold" }}>{dil === "tr" ? "Kaydet" : "Save"}</Text>}
                    </TouchableOpacity>
                  </View>
                </View>
              </TouchableWithoutFeedback>
            </TouchableOpacity>
          </KeyboardAvoidingView>
        </Modal>

        {/* ── Sana Özel Paneli ── */}
        {sanaOzelAcik && (
          <View
            style={[StyleSheet.absoluteFill, { justifyContent: "flex-end", zIndex: 100, elevation: 100 }]}
            pointerEvents="box-none"
          >
            {/* Backdrop: absoluteFill arkasında, panel dışı dokunuşu yakalar */}
            <Pressable
              style={[StyleSheet.absoluteFill, { backgroundColor: "#000000BB" }]}
              onPress={() => setSanaOzelAcik(false)}
            />
              <View style={{
                backgroundColor: renkler.kart,
                borderTopLeftRadius: 24, borderTopRightRadius: 24,
                // Alt sekme çubuğu mutlak konumda olduğu için güvenli alanın
                // yanında 50 px sekme yüksekliğini de panel içinde ayır.
                paddingTop: 12, paddingBottom: insets.bottom + 74,
                height: "75%",
                overflow: "hidden",
                zIndex: 1,
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

                <ScrollView
                  style={{ flex: 1 }}
                  contentContainerStyle={{ paddingBottom: 24 }}
                  showsVerticalScrollIndicator
                  keyboardShouldPersistTaps="handled"
                  keyboardDismissMode="on-drag"
                  bounces
                >

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

                <View style={{ height: 1, backgroundColor: renkler.sinir, marginHorizontal: 24, marginBottom: 8 }} />

                {/* Not Defteri: bağımsız bölüm */}
                <View style={{ marginBottom: 14 }}>
                  <TouchableOpacity
                    style={{ flexDirection: "row", alignItems: "center", minHeight: 40, marginBottom: notDefteriAcik ? 8 : 0, paddingHorizontal: 24 }}
                    onPress={() => setNotDefteriAcik((acik) => !acik)}
                    activeOpacity={0.7}
                    accessibilityRole="button"
                    accessibilityState={{ expanded: notDefteriAcik }}
                    accessibilityLabel={dil === "tr" ? "Not defteri bölümünü aç veya kapat" : "Expand or collapse notebook"}
                  >
                    <Text style={{ flex: 1, color: renkler.griMetin, fontSize: 12, fontFamily: "Inter_500Medium", textTransform: "uppercase", letterSpacing: 0.8 }}>
                      {dil === "tr" ? `Not Defteri (${notlar.length})` : `Notebook (${notlar.length})`}
                    </Text>
                    <Feather name={notDefteriAcik ? "chevron-up" : "chevron-down"} size={18} color={renkler.griMetin} />
                  </TouchableOpacity>

                  {notDefteriAcik && (
                    <View style={{ marginHorizontal: 16 }}>
                      <TouchableOpacity
                        style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, minHeight: 42, borderRadius: 12, borderWidth: 1, borderColor: MAVI, marginBottom: 8 }}
                        onPress={() => notEditorunuAc()}
                        activeOpacity={0.8}
                      >
                        <Feather name="edit-3" size={16} color={MAVI} />
                        <Text style={{ color: MAVI, fontSize: 14, fontFamily: "Inter_600SemiBold" }}>
                          {dil === "tr" ? "Yeni not yaz" : "Write a new note"}
                        </Text>
                      </TouchableOpacity>

                      {notlarYukleniyor ? (
                        <ActivityIndicator size="small" color={MAVI} style={{ paddingVertical: 12 }} />
                      ) : notListeHatasi ? (
                        <Text style={{ color: "#FF453A", fontSize: 13, paddingHorizontal: 8 }}>
                          {dil === "tr" ? "Notlar yüklenemedi." : "Notes could not be loaded."}
                        </Text>
                      ) : notlar.length === 0 ? (
                        <Text style={{ color: renkler.griMetin, fontSize: 13, paddingHorizontal: 8 }}>
                          {dil === "tr" ? "Henüz kayıtlı notunuz yok." : "You do not have any saved notes yet."}
                        </Text>
                      ) : (
                        <View>
                          {notlar.map((not) => (
                            <TouchableOpacity
                              key={not.id}
                              style={{ borderRadius: 12, backgroundColor: renkler.kart2, padding: 11, marginBottom: 6 }}
                              onPress={() => notEditorunuAc(not)}
                              activeOpacity={0.75}
                            >
                              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                                <Text style={{ flex: 1, color: renkler.metin, fontSize: 14, fontFamily: "Inter_600SemiBold" }} numberOfLines={1}>
                                  {not.title}
                                </Text>
                                <TouchableOpacity onPress={() => notEditorunuAc(not)} hitSlop={8}>
                                  <Feather name="edit-2" size={14} color={MAVI} />
                                </TouchableOpacity>
                                <TouchableOpacity onPress={() => notuSilmeOnayi(not)} hitSlop={8}>
                                  <Feather name="trash-2" size={14} color="#FF453A" />
                                </TouchableOpacity>
                              </View>
                              <Text style={{ color: renkler.griMetin, fontSize: 12, lineHeight: 17, marginTop: 5 }} numberOfLines={2}>
                                {not.content}
                              </Text>
                              <Text style={{ color: renkler.griMetin, fontSize: 11, marginTop: 7 }}>
                                {formatTarih(not.updated_at, dil)}
                              </Text>
                            </TouchableOpacity>
                          ))}
                        </View>
                      )}
                    </View>
                  )}
                </View>

                <View style={{ height: 1, backgroundColor: renkler.sinir, marginHorizontal: 24, marginBottom: 8 }} />

                {/* Favoriler: bağımsız bölüm */}
                <View style={{ marginBottom: 14 }}>
                  <TouchableOpacity
                    style={{ flexDirection: "row", alignItems: "center", minHeight: 40, marginBottom: favorilerAcik ? 8 : 0, paddingHorizontal: 24 }}
                    onPress={() => setFavorilerAcik((acik) => !acik)}
                    activeOpacity={0.7}
                    accessibilityRole="button"
                    accessibilityState={{ expanded: favorilerAcik }}
                    accessibilityLabel={dil === "tr" ? "Favoriler bölümünü aç veya kapat" : "Expand or collapse favorites"}
                  >
                    <Text style={{ flex: 1, color: renkler.griMetin, fontSize: 12, fontFamily: "Inter_500Medium", textTransform: "uppercase", letterSpacing: 0.8 }}>
                      {dil === "tr" ? `Favoriler (${favoriler.length})` : `Favorites (${favoriler.length})`}
                    </Text>
                    <Feather name={favorilerAcik ? "chevron-up" : "chevron-down"} size={18} color={renkler.griMetin} />
                  </TouchableOpacity>
                  <View style={{ marginHorizontal: 16 }}>
                  {favorilerAcik && (favorilerYukleniyor ? (
                    <ActivityIndicator size="small" color={MAVI} style={{ paddingVertical: 12 }} />
                  ) : favoriListeHatasi ? (
                    <Text style={{ color: "#FF453A", fontSize: 13, paddingHorizontal: 8 }}>
                      {dil === "tr" ? "Favoriler yüklenemedi." : "Favorites could not be loaded."}
                    </Text>
                  ) : favoriler.length === 0 ? (
                    <Text style={{ color: renkler.griMetin, fontSize: 13, paddingHorizontal: 8 }}>
                      {dil === "tr" ? "Henüz favori sohbetin yok." : "You don't have any favorite chats yet."}
                    </Text>
                  ) : (
                    <View>
                      {favoriler.map((favori) => (
                        <TouchableOpacity
                          key={favori.id}
                          style={{
                            flexDirection: "row", alignItems: "center", gap: 10,
                            minHeight: 48, paddingVertical: 9, paddingHorizontal: 10,
                            borderRadius: 11, backgroundColor: renkler.kart2, marginBottom: 5,
                          }}
                          onPress={() => paneldenSohbetSec(favori.conversation_id)}
                          activeOpacity={0.75}
                        >
                          <Feather name="bookmark" size={15} color={MAVI} />
                          <Text
                            style={{ flex: 1, color: renkler.metin, fontSize: 13, lineHeight: 18, fontFamily: "Inter_400Regular" }}
                            numberOfLines={2}
                          >
                            {paragrafMetniniTemizle(favori.paragraph_content)}
                          </Text>
                          <Feather name="chevron-right" size={16} color={renkler.griMetin} />
                        </TouchableOpacity>
                      ))}
                    </View>
                  ))}
                  </View>
                </View>

                <View style={{ height: 1, backgroundColor: renkler.sinir, marginHorizontal: 24, marginBottom: 16 }} />

                {/* Bölüm başlığı */}
                <TouchableOpacity
                  style={{ flexDirection: "row", alignItems: "center", minHeight: 40, paddingHorizontal: 24, marginBottom: sohbetGecmisiAcik ? 8 : 0 }}
                  onPress={() => setSohbetGecmisiAcik((acik) => !acik)}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityState={{ expanded: sohbetGecmisiAcik }}
                  accessibilityLabel={dil === "tr" ? "Sohbet geçmişi bölümünü aç veya kapat" : "Expand or collapse chat history"}
                >
                  <Text style={{ flex: 1, color: renkler.griMetin, fontSize: 12, fontFamily: "Inter_500Medium", textTransform: "uppercase", letterSpacing: 0.8 }}>
                    {`${t("sohbetGecmisi")} (${konusmalar.length})`}
                  </Text>
                  <Feather name={sohbetGecmisiAcik ? "chevron-up" : "chevron-down"} size={18} color={renkler.griMetin} />
                </TouchableOpacity>

                {sohbetGecmisiAcik && (<>
                <View style={{
                  flexDirection: "row", alignItems: "center", gap: 10,
                  marginHorizontal: 16, marginBottom: 10,
                  paddingHorizontal: 14, minHeight: 44,
                  borderRadius: 12, borderWidth: 1, borderColor: renkler.sinir,
                  backgroundColor: renkler.kart2,
                }}>
                  <Feather name="search" size={17} color={renkler.griMetin} />
                  <TextInput
                    style={{ flex: 1, color: renkler.metin, fontSize: 14, fontFamily: "Inter_400Regular", paddingVertical: 10 }}
                    value={sohbetArama}
                    onChangeText={setSohbetArama}
                    placeholder={t("sohbetAra")}
                    placeholderTextColor={renkler.griMetin}
                    autoCapitalize="none"
                    autoCorrect={false}
                    returnKeyType="search"
                  />
                  {sohbetArama.length > 0 && (
                    <TouchableOpacity onPress={() => setSohbetArama("")} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                      <Feather name="x-circle" size={17} color={renkler.griMetin} />
                    </TouchableOpacity>
                  )}
                </View>

                {/* Sohbet listesi */}
                {konusmalarYukleniyor ? (
                  <View style={{ alignItems: "center", paddingVertical: 28 }}>
                    <ActivityIndicator size="small" color={MAVI} />
                  </View>
                ) : sohbetListeHatasi ? (
                  <View style={{ alignItems: "center", paddingVertical: 24, paddingHorizontal: 24, gap: 12 }}>
                    <Feather name="alert-circle" size={22} color="#FF453A" />
                    <Text style={{ color: renkler.griMetin, fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center" }}>
                      {t("sohbetYuklemeHatasi")}
                    </Text>
                    <TouchableOpacity
                      style={{ paddingHorizontal: 16, paddingVertical: 9, borderRadius: 10, borderWidth: 1, borderColor: MAVI }}
                      onPress={sanaOzelAc}
                      activeOpacity={0.8}
                    >
                      <Text style={{ color: MAVI, fontSize: 13, fontFamily: "Inter_600SemiBold" }}>{t("yenidenDene")}</Text>
                    </TouchableOpacity>
                  </View>
                ) : konusmalar.length === 0 ? (
                  <Text style={{ color: renkler.griMetin, fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center", paddingVertical: 28, paddingHorizontal: 24 }}>
                    {t("sohbetYok")}
                  </Text>
                ) : filtrelenmisKonusmalar.length === 0 ? (
                  <Text style={{ color: renkler.griMetin, fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center", paddingVertical: 28, paddingHorizontal: 24 }}>
                    {t("aramaSonucuYok")}
                  </Text>
                ) : (
                  <View style={{ paddingHorizontal: 16, paddingBottom: 8, gap: 2 }}>
                    {filtrelenmisKonusmalar.map((k) => {
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
                            onPress={() => paneldenSohbetSec(k.id)}
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
                    {sohbetDevamVar && sohbetArama.trim().length === 0 && (
                      <TouchableOpacity
                        style={{
                          minHeight: 42, marginTop: 8, borderRadius: 12,
                          alignItems: "center", justifyContent: "center",
                          borderWidth: 1, borderColor: renkler.sinir,
                          backgroundColor: renkler.kart2,
                        }}
                        onPress={dahaFazlaSohbetYukle}
                        disabled={dahaFazlaYukleniyor}
                        activeOpacity={0.8}
                      >
                        {dahaFazlaYukleniyor
                          ? <ActivityIndicator size="small" color={MAVI} />
                          : <Text style={{ color: MAVI, fontSize: 14, fontFamily: "Inter_600SemiBold" }}>{t("dahaFazlaGoster")}</Text>}
                      </TouchableOpacity>
                    )}
                  </View>
                )}
                </>)}
                </ScrollView>
              </View>
          </View>
        )}

    </View>
  );
}
