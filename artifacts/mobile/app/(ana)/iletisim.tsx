import { Feather } from "@expo/vector-icons";
import React, { useMemo } from "react";
import {
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useGorunum, type Renkler } from "@/src/contexts/GorunumContext";

const MAVI = "#3B82F6";

const TELEFON = "05358356559";
const WHATSAPP_TEL = "905358356559";
const EPOSTA = "birlesikbilincalani@gmail.com";
const YOUTUBE = "https://www.youtube.com/@muratcansufirat";
const INSTAGRAM = "https://www.instagram.com/muratcansufirat/";

type Olcek = (n: number) => number;

function makeStyles(renkler: Renkler, olcek: Olcek) {
  return StyleSheet.create({
    baslikKutu: { paddingHorizontal: 20, paddingBottom: 16, backgroundColor: renkler.zemin },
    baslikBuyuk: { fontSize: olcek(28), fontFamily: "Inter_700Bold", color: renkler.metin, letterSpacing: -0.5 },
    baslikKucuk: { fontSize: olcek(14), fontFamily: "Inter_400Regular", color: renkler.griMetin, marginTop: 2 },
    kart: { backgroundColor: renkler.kart, marginHorizontal: 16, borderRadius: 16, overflow: "hidden", marginTop: 8 },
    kartBaslik: { fontSize: olcek(15), fontFamily: "Inter_600SemiBold", color: renkler.acikMetin, paddingHorizontal: 16, paddingTop: 16, paddingBottom: 12 },
    kalinCizgi: { height: StyleSheet.hairlineWidth, backgroundColor: renkler.sinir },
    satir: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 14, gap: 14 },
    ikonDaire: { width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center", flexShrink: 0 },
    satirIcerik: { flex: 1, gap: 2 },
    etiket: { fontSize: olcek(11), fontFamily: "Inter_500Medium", color: renkler.griMetin, letterSpacing: 0.7 },
    deger: { fontSize: olcek(15), fontFamily: "Inter_400Regular", color: renkler.acikMetin },
    degerLink: { color: MAVI },
    ayirac: { height: StyleSheet.hairlineWidth, backgroundColor: renkler.sinir, marginLeft: 72 },
  });
}

type KalemProps = {
  ikonBg: string;
  ikonRenk: string;
  ikonAdi: string;
  etiket: string;
  deger: string;
  onPress?: () => void;
  sonSatir?: boolean;
  styles: ReturnType<typeof makeStyles>;
  griMetin: string;
};

function Kalem({ ikonBg, ikonRenk, ikonAdi, etiket, deger, onPress, sonSatir, styles, griMetin }: KalemProps) {
  const Sarici = onPress ? TouchableOpacity : View;
  return (
    <>
      <Sarici style={styles.satir} onPress={onPress} activeOpacity={0.65}>
        <View style={[styles.ikonDaire, { backgroundColor: ikonBg }]}>
          <Feather name={ikonAdi as any} size={18} color={ikonRenk} />
        </View>
        <View style={styles.satirIcerik}>
          <Text style={styles.etiket}>{etiket}</Text>
          <Text style={[styles.deger, onPress && styles.degerLink]}>{deger}</Text>
        </View>
        {onPress && <Feather name="chevron-right" size={16} color={griMetin} />}
      </Sarici>
      {!sonSatir && <View style={styles.ayirac} />}
    </>
  );
}

export default function IletisimEkrani() {
  const { renkler, olcek, t } = useGorunum();
  const insets = useSafeAreaInsets();
  const tabYukseklik = 50 + insets.bottom;

  const styles = useMemo(() => makeStyles(renkler, olcek), [renkler, olcek]);

  return (
    <View style={{ flex: 1, backgroundColor: renkler.zemin }}>
      <View style={[styles.baslikKutu, { paddingTop: insets.top + 12 }]}>
        <Text style={styles.baslikBuyuk}>{t("tabIletisim")}</Text>
        <Text style={styles.baslikKucuk}>{t("bizeUlasin")}</Text>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingBottom: tabYukseklik + 24 }}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.kart}>
          <Text style={styles.kartBaslik}>{t("iletisimBilgileri")}</Text>
          <View style={styles.kalinCizgi} />

          <Kalem ikonBg="#1E3A5F" ikonRenk="#60A5FA" ikonAdi="user"
            etiket={t("isimEtiket")} deger="Murat Cansu Fırat"
            styles={styles} griMetin={renkler.griMetin} />

          <Kalem ikonBg="#1E3A5F" ikonRenk="#60A5FA" ikonAdi="phone"
            etiket={t("telefonEtiket")} deger="0535 835 65 59"
            onPress={() => Linking.openURL(`tel:${TELEFON}`)}
            styles={styles} griMetin={renkler.griMetin} />

          <Kalem ikonBg="#0A3D23" ikonRenk="#25D366" ikonAdi="message-circle"
            etiket={t("whatsappEtiket")} deger={t("whatsappYaz")}
            onPress={() => Linking.openURL(`https://wa.me/${WHATSAPP_TEL}`)}
            styles={styles} griMetin={renkler.griMetin} />

          <Kalem ikonBg="#1E2E5F" ikonRenk="#818CF8" ikonAdi="mail"
            etiket={t("epostaEtiket")} deger={EPOSTA}
            onPress={() => Linking.openURL(`mailto:${EPOSTA}`)}
            styles={styles} griMetin={renkler.griMetin} />

          <Kalem ikonBg="#3D0A0A" ikonRenk="#FF3B30" ikonAdi="youtube"
            etiket={t("youtubeEtiket")} deger="@muratcansufirat"
            onPress={() => Linking.openURL(YOUTUBE)}
            styles={styles} griMetin={renkler.griMetin} />

          <Kalem ikonBg="#3D1040" ikonRenk="#E040FB" ikonAdi="instagram"
            etiket={t("instagramEtiket")} deger="@muratcansufirat"
            onPress={() => Linking.openURL(INSTAGRAM)}
            sonSatir styles={styles} griMetin={renkler.griMetin} />
        </View>
      </ScrollView>
    </View>
  );
}
