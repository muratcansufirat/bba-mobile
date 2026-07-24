import { Feather } from "@expo/vector-icons";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  FlatList,
  Keyboard,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAuth } from "@/src/contexts/AuthContext";
import { useGorunum } from "@/src/contexts/GorunumContext";
import { useKlavye } from "@/src/contexts/KlavyeContext";

const MAVI = "#3B82F6";
const BEYAZ = "#FFFFFF";
const YESIL = "#34C759";

type Mesaj = {
  id: string;
  gonderen: string;
  icerik: string;
  zaman: Date;
};

function zamanBicimle(t: Date) {
  return t.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });
}

export default function ToplulukEkrani() {
  const { profil } = useAuth();
  const { renkler, olcek, t } = useGorunum();
  const insets = useSafeAreaInsets();
  const tabYukseklik = 50 + insets.bottom;

  const [metin, setMetin] = useState("");
  const [mesajlar, setMesajlar] = useState<Mesaj[]>([]);
  const [cevrimici, setCevrimici] = useState(1);
  const { acik: klavyeAcik, yukseklik: klavyeYuksekligi, odaklandi, birakti } = useKlavye();
  const listRef = useRef<FlatList>(null);
  const klavyeTelafi = Platform.OS === "ios" ? klavyeYuksekligi : 0;
  const inputAlttan = klavyeAcik ? klavyeTelafi : tabYukseklik;

  const styles = useMemo(() => StyleSheet.create({
    baslikSatir: {
      flexDirection: "row", alignItems: "center", justifyContent: "space-between",
      paddingHorizontal: 16, paddingBottom: 10, backgroundColor: renkler.zemin,
    },
    baslikSol: { flexDirection: "row", alignItems: "center" },
    baslikMetin: { fontSize: olcek(20), fontFamily: "Inter_700Bold", color: renkler.metin, letterSpacing: -0.3 },
    baslikSag: { flexDirection: "row", alignItems: "center" },
    cevrimiciYesil: { width: 8, height: 8, borderRadius: 4, backgroundColor: YESIL, marginRight: 6 },
    cevrimiciSayi: { fontSize: olcek(13), fontFamily: "Inter_500Medium", color: YESIL },
    ayrac: { height: StyleSheet.hairlineWidth, backgroundColor: renkler.kart2 },
    bosAlan: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 32 },
    bosMetin: { fontSize: olcek(15), fontFamily: "Inter_400Regular", color: renkler.griMetin, textAlign: "center", lineHeight: olcek(22) },
    mesajSatir: { flexDirection: "row", marginBottom: 16, gap: 10 },
    avatarDaire: { width: 36, height: 36, borderRadius: 18, backgroundColor: MAVI, alignItems: "center", justifyContent: "center", flexShrink: 0 },
    avatarHarf: { fontSize: olcek(15), fontFamily: "Inter_700Bold", color: BEYAZ },
    mesajIcerik: { flex: 1 },
    mesajUst: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 3 },
    gonderenAd: { fontSize: olcek(13), fontFamily: "Inter_600SemiBold", color: renkler.acikMetin },
    zamanMetin: { fontSize: olcek(11), fontFamily: "Inter_400Regular", color: renkler.griMetin },
    mesajMetin: { fontSize: olcek(15), fontFamily: "Inter_400Regular", color: renkler.acikMetin, lineHeight: olcek(21) },
    inputCubugu: {
      position: "absolute", left: 0, right: 0,
      flexDirection: "row", alignItems: "center",
      paddingHorizontal: 12, paddingTop: 10, gap: 10,
      backgroundColor: renkler.zemin,
      borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: renkler.kart2,
    },
    input: {
      flex: 1, backgroundColor: renkler.kart, borderRadius: 24,
      paddingHorizontal: 16, paddingVertical: 10,
      fontSize: olcek(15), fontFamily: "Inter_400Regular", color: renkler.metin, maxHeight: 100,
    },
    gonderBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: MAVI, alignItems: "center", justifyContent: "center" },
    gonderBtnPasif: { opacity: 0.45 },
  }), [renkler, olcek]);

  useEffect(() => {
    const interval = setInterval(() => {
      setCevrimici((onceki) => {
        const delta = Math.random() < 0.5 ? 1 : -1;
        return Math.max(1, onceki + delta);
      });
    }, 4000);
    return () => clearInterval(interval);
  }, []);

  function gonder() {
    const temiz = metin.trim();
    if (!temiz) return;
    const yeni: Mesaj = {
      id: Date.now().toString(),
      gonderen: profil.adSoyad || "Kullanıcı",
      icerik: temiz,
      zaman: new Date(),
    };
    setMesajlar((onceki) => [...onceki, yeni]);
    setMetin("");
    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 80);
  }

  const bos = mesajlar.length === 0;

  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
    <View style={{ flex: 1, backgroundColor: renkler.zemin }}>
      <View style={[styles.baslikSatir, { paddingTop: insets.top + 10 }]}>
        <View style={styles.baslikSol}>
          <Feather name="users" size={18} color={renkler.acikMetin} style={{ marginRight: 8 }} />
          <Text style={styles.baslikMetin}>{t("tabTopluluk")}</Text>
        </View>
        <View style={styles.baslikSag}>
          <View style={styles.cevrimiciYesil} />
          <Text style={styles.cevrimiciSayi}>{t("cevrimici", { n: String(cevrimici) })}</Text>
          <Feather name="wifi" size={16} color={YESIL} style={{ marginLeft: 8 }} />
        </View>
      </View>
      <View style={styles.ayrac} />

      {bos ? (
        <View style={styles.bosAlan}>
          <Text style={styles.bosMetin}>{t("mesajYok")}</Text>
        </View>
      ) : (
        <FlatList
          ref={listRef}
          data={mesajlar}
          keyExtractor={(m) => m.id}
          contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 16 }}
          showsVerticalScrollIndicator={false}
          keyboardDismissMode="on-drag"
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => (
            <View style={styles.mesajSatir}>
              <View style={styles.avatarDaire}>
                <Text style={styles.avatarHarf}>{item.gonderen.charAt(0).toUpperCase()}</Text>
              </View>
              <View style={styles.mesajIcerik}>
                <View style={styles.mesajUst}>
                  <Text style={styles.gonderenAd}>{item.gonderen}</Text>
                  <Text style={styles.zamanMetin}>{zamanBicimle(item.zaman)}</Text>
                </View>
                <Text style={styles.mesajMetin}>{item.icerik}</Text>
              </View>
            </View>
          )}
        />
      )}

      <View style={[styles.inputCubugu, { bottom: inputAlttan, paddingBottom: 10 }]}>
        <TextInput
          style={styles.input}
          value={metin}
          onChangeText={setMetin}
          placeholder={t("mesajYaz")}
          placeholderTextColor={renkler.griMetin}
          returnKeyType="send"
          onSubmitEditing={gonder}
          multiline={false}
          onFocus={odaklandi}
          onBlur={birakti}
        />
        <TouchableOpacity
          style={[styles.gonderBtn, !metin.trim() && styles.gonderBtnPasif]}
          onPress={gonder}
          disabled={!metin.trim()}
          activeOpacity={0.8}
        >
          <Feather name="send" size={18} color={BEYAZ} />
        </TouchableOpacity>
      </View>
    </View>
    </TouchableWithoutFeedback>
  );
}
