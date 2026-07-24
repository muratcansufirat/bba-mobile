import { Feather } from "@expo/vector-icons";
import React, { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Image,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAuth } from "@/src/contexts/AuthContext";
import { useGorunum, type Tema, type YaziBoyutu } from "@/src/contexts/GorunumContext";

const MAVI = "#3B82F6";
const BEYAZ = "#FFFFFF";
const KIRMIZI = "#FF453A";

export default function HesabimEkrani() {
  const { profil, profilGuncelle, cikisYap } = useAuth();
  const { tema, setTema, yaziBoyutu, setYaziBoyutu, renkler, olcek, t } = useGorunum();
  const insets = useSafeAreaInsets();

  const [takmaIsim, setTakmaIsim] = useState(profil.adSoyad);
  const [isimDuzenleniyor, setIsimDuzenleniyor] = useState(false);
  const [kaydediliyor, setKaydediliyor] = useState(false);

  const [gorunumAcik, setGorunumAcik] = useState(false);
  const [hakkindaAcik, setHakkindaAcik] = useState(false);
  const [gizlilikAcik, setGizlilikAcik] = useState(false);

  // Supabase'den gelen güncel profil adını input'a yansıt
  useEffect(() => {
    if (!isimDuzenleniyor) setTakmaIsim(profil.adSoyad);
  }, [profil.adSoyad]);

  const styles = useMemo(() => StyleSheet.create({
    baslik: { paddingHorizontal: 20, paddingBottom: 12, backgroundColor: renkler.zemin },
    baslikMetin: { fontSize: olcek(28), fontFamily: "Inter_700Bold", color: renkler.metin, letterSpacing: -0.5 },
    grupBasligi: {
      fontSize: olcek(11), fontFamily: "Inter_600SemiBold", color: renkler.griMetin,
      letterSpacing: 0.8, marginTop: 24, marginBottom: 6, marginHorizontal: 20,
    },
    kart: { backgroundColor: renkler.kart, marginHorizontal: 16, borderRadius: 14, overflow: "hidden" },
    satirRow: {
      flexDirection: "row", alignItems: "center", justifyContent: "space-between",
      paddingHorizontal: 16, paddingVertical: 14,
    },
    satirSol: { flexDirection: "row", alignItems: "center", flex: 1 },
    satirSag: { flexDirection: "row", alignItems: "center", gap: 6 },
    ikon: { marginRight: 12 },
    satirEtiket: { fontSize: olcek(16), fontFamily: "Inter_400Regular", color: renkler.acikMetin },
    satirDeger: { fontSize: olcek(14), fontFamily: "Inter_400Regular", color: renkler.griMetin, maxWidth: 160 },
    ayirac: { height: StyleSheet.hairlineWidth, backgroundColor: renkler.sinir, marginLeft: 44 },
    isimDuzenleRow: {
      flexDirection: "row", alignItems: "center",
      paddingHorizontal: 16, paddingVertical: 10, gap: 10,
    },
    isimInput: {
      flex: 1, fontSize: olcek(16), fontFamily: "Inter_400Regular",
      color: renkler.metin, paddingVertical: 6,
      borderBottomWidth: 1, borderBottomColor: MAVI,
    },
    kaydetBtn: { backgroundColor: MAVI, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8 },
    kaydetBtnMetin: { fontSize: olcek(14), fontFamily: "Inter_600SemiBold", color: BEYAZ },
  }), [renkler, olcek]);

  async function isimKaydet() {
    const temiz = takmaIsim.trim();
    setKaydediliyor(true);
    const { hata } = await profilGuncelle({ adSoyad: temiz });
    setKaydediliyor(false);
    if (hata) Alert.alert(t("hata"), hata);
    setIsimDuzenleniyor(false);
  }

  function cikisOnayla() {
    Alert.alert(
      t("cikisYap"),
      t("cikisOnayla"),
      [
        { text: t("iptal"), style: "cancel" },
        { text: t("cikisYap"), style: "destructive", onPress: () => cikisYap() },
      ]
    );
  }

  const isGece = renkler.zemin === "#000000";
  const temaEtiketi = tema === "gece" ? t("gece") : t("gunduz");
  const yaziEtiketi = yaziBoyutu === "kucuk" ? t("kucuk") : yaziBoyutu === "orta" ? t("orta") : t("buyuk");

  // ── Ortak Modal Sarıcı ──
  function AltModal({ visible, onClose, children }: { visible: boolean; onClose: () => void; children: React.ReactNode }) {
    return (
      <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
        <TouchableOpacity
          style={{ flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.6)" }}
          activeOpacity={1}
          onPress={onClose}
        >
          <View style={{
            backgroundColor: renkler.kart,
            borderTopLeftRadius: 20, borderTopRightRadius: 20,
            paddingBottom: insets.bottom + 24,
          }}>
            {/* Tutamak + kapat */}
            <View style={{ alignItems: "center", paddingTop: 12, paddingBottom: 4 }}>
              <View style={{ width: 36, height: 4, backgroundColor: renkler.kart2, borderRadius: 2 }} />
            </View>
            {children}
          </View>
        </TouchableOpacity>
      </Modal>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: renkler.zemin }}>
      <View style={[styles.baslik, { paddingTop: insets.top + 12 }]}>
        <Text style={styles.baslikMetin}>{t("tabHesabim")}</Text>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: 50 + insets.bottom + 24 }}
        showsVerticalScrollIndicator={false}
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
      >
        {/* ── Hitap adı ── */}
        <Text style={styles.grupBasligi}>{t("nasılHitapEdelim")}</Text>
        <View style={styles.kart}>
          {isimDuzenleniyor ? (
            <View style={styles.isimDuzenleRow}>
              <TextInput
                style={styles.isimInput}
                value={takmaIsim}
                onChangeText={setTakmaIsim}
                autoFocus
                placeholder={t("hesabimIsimPh")}
                placeholderTextColor={renkler.griMetin}
                returnKeyType="done"
                onSubmitEditing={isimKaydet}
                maxLength={40}
                editable={!kaydediliyor}
              />
              <TouchableOpacity style={[styles.kaydetBtn, kaydediliyor && { opacity: 0.6 }]} onPress={isimKaydet} disabled={kaydediliyor}>
                <Text style={styles.kaydetBtnMetin}>{t("kaydet")}</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity style={styles.satirRow} onPress={() => setIsimDuzenleniyor(true)} activeOpacity={0.7}>
              <View style={styles.satirSol}>
                <Feather name="user" size={16} color={MAVI} style={styles.ikon} />
                <Text style={styles.satirDeger} numberOfLines={1}>
                  {profil.adSoyad || t("belirlenmedi")}
                </Text>
              </View>
              <Feather name="edit-2" size={15} color={renkler.griMetin} />
            </TouchableOpacity>
          )}
        </View>

        {/* ── Ayarlar ── */}
        <Text style={styles.grupBasligi}>{t("ayarlarBaslik")}</Text>
        <View style={styles.kart}>
          <TouchableOpacity style={styles.satirRow} onPress={() => setGorunumAcik(true)} activeOpacity={0.7}>
            <View style={styles.satirSol}>
              <Feather name="sun" size={16} color={MAVI} style={styles.ikon} />
              <Text style={styles.satirEtiket}>{t("gorunumAyarlari")}</Text>
            </View>
            <View style={styles.satirSag}>
              <Text style={styles.satirDeger}>{temaEtiketi} · {yaziEtiketi}</Text>
              <Feather name="chevron-right" size={16} color={renkler.griMetin} />
            </View>
          </TouchableOpacity>
        </View>

        {/* ── Bilgi ── */}
        <Text style={styles.grupBasligi}>{t("bilgiBaslik")}</Text>
        <View style={styles.kart}>
          <TouchableOpacity style={styles.satirRow} onPress={() => setHakkindaAcik(true)} activeOpacity={0.7}>
            <View style={styles.satirSol}>
              <Feather name="info" size={16} color={MAVI} style={styles.ikon} />
              <Text style={styles.satirEtiket}>{t("uygulamaHakkinda")}</Text>
            </View>
            <Feather name="chevron-right" size={16} color={renkler.griMetin} />
          </TouchableOpacity>

          <View style={styles.ayirac} />

          <TouchableOpacity style={styles.satirRow} onPress={() => setGizlilikAcik(true)} activeOpacity={0.7}>
            <View style={styles.satirSol}>
              <Feather name="shield" size={16} color={MAVI} style={styles.ikon} />
              <Text style={styles.satirEtiket}>{t("gizlilik")}</Text>
            </View>
            <Feather name="chevron-right" size={16} color={renkler.griMetin} />
          </TouchableOpacity>
        </View>

        {/* ── Çıkış ── */}
        <View style={[styles.kart, { marginTop: 32 }]}>
          <TouchableOpacity style={styles.satirRow} onPress={cikisOnayla} activeOpacity={0.7}>
            <View style={styles.satirSol}>
              <Feather name="log-out" size={16} color={KIRMIZI} style={styles.ikon} />
              <Text style={[styles.satirEtiket, { color: KIRMIZI }]}>{t("cikisYap")}</Text>
            </View>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* ════════════════════════════════════════
          Görünüm Ayarları Modalı
      ════════════════════════════════════════ */}
      <AltModal visible={gorunumAcik} onClose={() => setGorunumAcik(false)}>
        <Text style={{ fontSize: 17, fontFamily: "Inter_600SemiBold", color: renkler.metin, textAlign: "center", paddingVertical: 12 }}>
          {t("gorunumAyarlari")}
        </Text>
        <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: renkler.sinir, marginBottom: 20 }} />

        <View style={{ paddingHorizontal: 20 }}>
          <Text style={{ fontSize: 12, fontFamily: "Inter_500Medium", color: renkler.griMetin, letterSpacing: 0.6, marginBottom: 10, textTransform: "uppercase" }}>{t("tema")}</Text>
          <View style={{ flexDirection: "row", gap: 10, marginBottom: 20 }}>
            {([
              { deger: "gece" as Tema, sembol: "☾", sembolRenk: "#FFFFFF" },
              { deger: "gunduz" as Tema, sembol: "☀", sembolRenk: "#FFD60A" },
            ] as const).map((tm) => (
              <TouchableOpacity
                key={tm.deger}
                style={{
                  flex: 1, alignItems: "center", gap: 6, paddingVertical: 14, borderRadius: 12,
                  backgroundColor: tema === tm.deger ? (isGece ? "rgba(59,130,246,0.12)" : "#E8F0FE") : renkler.kart2,
                  borderWidth: 1.5, borderColor: tema === tm.deger ? MAVI : "transparent",
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

          <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: renkler.sinir, marginBottom: 20 }} />

          <Text style={{ fontSize: 12, fontFamily: "Inter_500Medium", color: renkler.griMetin, letterSpacing: 0.6, marginBottom: 10, textTransform: "uppercase" }}>{t("yaziBoyutu")}</Text>
          <View style={{ flexDirection: "row", gap: 10 }}>
            {([
              { deger: "kucuk" as YaziBoyutu, boyut: 13 },
              { deger: "orta" as YaziBoyutu, boyut: 16 },
              { deger: "buyuk" as YaziBoyutu, boyut: 20 },
            ] as const).map((b) => (
              <TouchableOpacity
                key={b.deger}
                style={{
                  flex: 1, alignItems: "center", gap: 4, paddingVertical: 14, borderRadius: 12,
                  backgroundColor: yaziBoyutu === b.deger ? (isGece ? "rgba(59,130,246,0.12)" : "#E8F0FE") : renkler.kart2,
                  borderWidth: 1.5, borderColor: yaziBoyutu === b.deger ? MAVI : "transparent",
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
      </AltModal>

      {/* ════════════════════════════════════════
          Uygulama Hakkında Modalı
      ════════════════════════════════════════ */}
      <AltModal visible={hakkindaAcik} onClose={() => setHakkindaAcik(false)}>
        <Text style={{ fontSize: 17, fontFamily: "Inter_600SemiBold", color: renkler.metin, textAlign: "center", paddingVertical: 12 }}>
          {t("uygulamaHakkinda")}
        </Text>
        <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: renkler.sinir }} />

        <View style={{ alignItems: "center", paddingHorizontal: 24, paddingTop: 28, gap: 20 }}>
          {/* Logo */}
          <View style={{ width: 80, height: 80, borderRadius: 20, overflow: "hidden", backgroundColor: "#000" }}>
            <Image source={require("@/assets/bba-logo-transparent.png")} style={{ width: 80, height: 80 }} resizeMode="contain" />
          </View>

          <View style={{ alignItems: "center", gap: 6 }}>
            <Text style={{ fontSize: olcek(20), fontFamily: "Inter_700Bold", color: renkler.metin }}>{t("uygulamaAdi")}</Text>
            <Text style={{ fontSize: olcek(13), fontFamily: "Inter_400Regular", color: renkler.griMetin }}>{t("uygulamaSurumu")}</Text>
          </View>

          <Text style={{ fontSize: olcek(14), fontFamily: "Inter_400Regular", color: renkler.acikMetin, textAlign: "center", lineHeight: olcek(21) }}>
            {t("uygulamaAciklama")}
          </Text>

          <View style={{ width: "100%", height: StyleSheet.hairlineWidth, backgroundColor: renkler.sinir }} />

          <View style={{ width: "100%", flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 8 }}>
            <Text style={{ fontSize: olcek(13), fontFamily: "Inter_500Medium", color: renkler.griMetin }}>{t("gelistirici")}</Text>
            <Text style={{ fontSize: olcek(13), fontFamily: "Inter_500Medium", color: renkler.acikMetin }}>{t("gelistiriciAdi")}</Text>
          </View>

          <Text style={{ fontSize: olcek(12), fontFamily: "Inter_400Regular", color: renkler.griMetin, textAlign: "center", lineHeight: olcek(18), marginTop: 4 }}>
            {t("telif")}
          </Text>
        </View>
      </AltModal>

      {/* ════════════════════════════════════════
          Gizlilik Modalı
      ════════════════════════════════════════ */}
      <AltModal visible={gizlilikAcik} onClose={() => setGizlilikAcik(false)}>
        <Text style={{ fontSize: 17, fontFamily: "Inter_600SemiBold", color: renkler.metin, textAlign: "center", paddingVertical: 12 }}>
          {t("gizlilik")}
        </Text>
        <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: renkler.sinir }} />

        <ScrollView
          style={{ maxHeight: 340 }}
          contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 20, paddingBottom: 8 }}
          showsVerticalScrollIndicator={false}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 16 }}>
            <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: isGece ? "rgba(59,130,246,0.12)" : "#E8F0FE", alignItems: "center", justifyContent: "center" }}>
              <Feather name="shield" size={18} color={MAVI} />
            </View>
            <Text style={{ fontSize: olcek(15), fontFamily: "Inter_600SemiBold", color: renkler.metin }}>{t("uygulamaAdi")}</Text>
          </View>

          <Text style={{ fontSize: olcek(14), fontFamily: "Inter_400Regular", color: renkler.acikMetin, lineHeight: olcek(22) }}>
            {t("gizlilikMetin")}
          </Text>
        </ScrollView>
      </AltModal>
    </View>
  );
}
