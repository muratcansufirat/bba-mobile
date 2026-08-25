import { Feather } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useGorunum } from "@/src/contexts/GorunumContext";
import {
  hafizaDuzenle,
  hafizaPasiflestir,
  hafizalariListele,
  type KullaniciHafizasi,
} from "@/src/lib/hafizalar";
import { hafizaKullanimiAcikMi, hafizaKullaniminiAyarla } from "@/src/lib/hafizaAyarlari";

const MAVI = "#3B82F6";
const KIRMIZI = "#FF453A";

export default function HafizalarEkrani() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { renkler, olcek, t } = useGorunum();
  const [hafizalar, setHafizalar] = useState<KullaniciHafizasi[]>([]);
  const [yukleniyor, setYukleniyor] = useState(true);
  const [hata, setHata] = useState("");
  const [duzenlenen, setDuzenlenen] = useState<KullaniciHafizasi | null>(null);
  const [icerik, setIcerik] = useState("");
  const [kaydediliyor, setKaydediliyor] = useState(false);
  const [hafizaKullanimi, setHafizaKullanimi] = useState(true);

  const yukle = useCallback(async () => {
    setYukleniyor(true);
    setHata("");
    try {
      const [liste, kullanimAcik] = await Promise.all([
        hafizalariListele(),
        hafizaKullanimiAcikMi(),
      ]);
      setHafizalar(liste);
      setHafizaKullanimi(kullanimAcik);
    } catch (error) {
      setHata(error instanceof Error ? error.message : t("hafizaYuklemeHatasi"));
    } finally {
      setYukleniyor(false);
    }
  }, [t]);

  useFocusEffect(useCallback(() => { void yukle(); }, [yukle]));

  const styles = useMemo(() => StyleSheet.create({
    ekran: { flex: 1, backgroundColor: renkler.zemin },
    baslik: {
      flexDirection: "row", alignItems: "center", gap: 14,
      paddingHorizontal: 16, paddingBottom: 14,
      borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: renkler.sinir,
    },
    baslikMetin: { color: renkler.metin, fontFamily: "Inter_700Bold", fontSize: olcek(22) },
    aciklama: { color: renkler.griMetin, fontFamily: "Inter_400Regular", fontSize: olcek(13), lineHeight: olcek(19), marginHorizontal: 20, marginTop: 16, marginBottom: 10 },
    ayarKart: { backgroundColor: renkler.kart, borderRadius: 14, marginHorizontal: 16, marginTop: 16, padding: 14, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
    ayarMetinler: { flex: 1, gap: 3 },
    ayarBaslik: { color: renkler.acikMetin, fontFamily: "Inter_600SemiBold", fontSize: olcek(15) },
    ayarAciklama: { color: renkler.griMetin, fontFamily: "Inter_400Regular", fontSize: olcek(12), lineHeight: olcek(17) },
    kart: { backgroundColor: renkler.kart, borderRadius: 14, padding: 16, marginHorizontal: 16, marginVertical: 6 },
    kartUst: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 9 },
    tur: { color: MAVI, fontFamily: "Inter_600SemiBold", fontSize: olcek(12) },
    islemler: { flexDirection: "row", gap: 16 },
    icerik: { color: renkler.acikMetin, fontFamily: "Inter_400Regular", fontSize: olcek(15), lineHeight: olcek(22) },
    merkez: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24, gap: 14 },
    durum: { color: renkler.griMetin, fontFamily: "Inter_400Regular", fontSize: olcek(14), textAlign: "center" },
    tekrar: { borderWidth: 1, borderColor: MAVI, borderRadius: 10, paddingHorizontal: 16, paddingVertical: 9 },
    tekrarMetin: { color: MAVI, fontFamily: "Inter_600SemiBold", fontSize: olcek(14) },
    modalArka: { flex: 1, justifyContent: "center", backgroundColor: "rgba(0,0,0,0.65)", padding: 24 },
    modalKart: { backgroundColor: renkler.kart, borderRadius: 16, padding: 18, gap: 14 },
    modalBaslik: { color: renkler.metin, fontFamily: "Inter_700Bold", fontSize: olcek(18) },
    input: { color: renkler.metin, backgroundColor: renkler.inputBg, borderWidth: 1, borderColor: renkler.sinir, borderRadius: 12, padding: 12, minHeight: 100, fontSize: olcek(15), textAlignVertical: "top" },
    modalButonlar: { flexDirection: "row", justifyContent: "flex-end", gap: 10 },
    modalButon: { borderRadius: 9, paddingHorizontal: 16, paddingVertical: 10 },
    modalButonMetin: { fontFamily: "Inter_600SemiBold", fontSize: olcek(14) },
  }), [renkler, olcek]);

  const turEtiketi = (tur: KullaniciHafizasi["memory_type"]) =>
    tur === "nickname" ? t("hafizaTakmaAd") : tur === "preference" ? t("hafizaTercih") : t("hafizaOnemliBilgi");

  function duzenlemeyiAc(hafiza: KullaniciHafizasi) {
    setDuzenlenen(hafiza);
    setIcerik(hafiza.content);
  }

  async function kaydet() {
    if (!duzenlenen || !icerik.trim()) return;
    setKaydediliyor(true);
    try {
      const guncel = await hafizaDuzenle(duzenlenen.id, icerik.trim());
      setHafizalar((onceki) => onceki.map((h) => h.id === guncel.id ? guncel : h));
      setDuzenlenen(null);
    } catch (error) {
      Alert.alert(t("hata"), error instanceof Error ? error.message : t("hafizaDuzenlemeHatasi"));
    } finally {
      setKaydediliyor(false);
    }
  }

  function pasiflestir(hafiza: KullaniciHafizasi) {
    Alert.alert(t("hafizaKaldir"), t("hafizaKaldirOnay"), [
      { text: t("iptal"), style: "cancel" },
      {
        text: t("hafizaKaldir"), style: "destructive", onPress: async () => {
          try {
            await hafizaPasiflestir(hafiza.id);
            setHafizalar((onceki) => onceki.filter((h) => h.id !== hafiza.id));
          } catch (error) {
            Alert.alert(t("hata"), error instanceof Error ? error.message : t("hafizaSilmeHatasi"));
          }
        },
      },
    ]);
  }

  return (
    <View style={styles.ekran}>
      <View style={[styles.baslik, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity onPress={() => router.back()} accessibilityLabel={t("geri")}>
          <Feather name="chevron-left" size={28} color={renkler.metin} />
        </TouchableOpacity>
        <Text style={styles.baslikMetin}>{t("hafizalarim")}</Text>
      </View>
      <View style={styles.ayarKart}>
        <View style={styles.ayarMetinler}>
          <Text style={styles.ayarBaslik}>{t("hafizaKullanimi")}</Text>
          <Text style={styles.ayarAciklama}>{t("hafizaKullanimiAciklama")}</Text>
        </View>
        <Switch
          value={hafizaKullanimi}
          onValueChange={(deger) => {
            setHafizaKullanimi(deger);
            void hafizaKullaniminiAyarla(deger);
          }}
          trackColor={{ false: renkler.kart2, true: MAVI }}
        />
      </View>
      <Text style={styles.aciklama}>{t("hafizaAciklama")}</Text>

      {yukleniyor ? (
        <View style={styles.merkez}><ActivityIndicator color={MAVI} /><Text style={styles.durum}>{t("yukleniyor")}</Text></View>
      ) : hata ? (
        <View style={styles.merkez}>
          <Text style={styles.durum}>{hata}</Text>
          <TouchableOpacity style={styles.tekrar} onPress={() => void yukle()}><Text style={styles.tekrarMetin}>{t("yenidenDene")}</Text></TouchableOpacity>
        </View>
      ) : hafizalar.length === 0 ? (
        <View style={styles.merkez}><Feather name="database" size={32} color={renkler.griMetin} /><Text style={styles.durum}>{t("hafizaBos")}</Text></View>
      ) : (
        <FlatList
          data={hafizalar}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingBottom: insets.bottom + 90 }}
          renderItem={({ item }) => (
            <View style={styles.kart}>
              <View style={styles.kartUst}>
                <Text style={styles.tur}>{turEtiketi(item.memory_type)}</Text>
                <View style={styles.islemler}>
                  <TouchableOpacity onPress={() => duzenlemeyiAc(item)} accessibilityLabel={t("duzenle")}><Feather name="edit-2" size={18} color={MAVI} /></TouchableOpacity>
                  <TouchableOpacity onPress={() => pasiflestir(item)} accessibilityLabel={t("hafizaKaldir")}><Feather name="trash-2" size={18} color={KIRMIZI} /></TouchableOpacity>
                </View>
              </View>
              <Text style={styles.icerik}>{item.content}</Text>
            </View>
          )}
        />
      )}

      <Modal visible={duzenlenen !== null} transparent animationType="fade" onRequestClose={() => setDuzenlenen(null)}>
        <View style={styles.modalArka}>
          <View style={styles.modalKart}>
            <Text style={styles.modalBaslik}>{t("hafizaDuzenle")}</Text>
            <TextInput style={styles.input} value={icerik} onChangeText={setIcerik} multiline maxLength={500} editable={!kaydediliyor} />
            <View style={styles.modalButonlar}>
              <TouchableOpacity style={styles.modalButon} onPress={() => setDuzenlenen(null)} disabled={kaydediliyor}><Text style={[styles.modalButonMetin, { color: renkler.griMetin }]}>{t("iptal")}</Text></TouchableOpacity>
              <TouchableOpacity style={[styles.modalButon, { backgroundColor: MAVI }]} onPress={() => void kaydet()} disabled={kaydediliyor || !icerik.trim()}><Text style={[styles.modalButonMetin, { color: "#FFF" }]}>{t("kaydet")}</Text></TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}
