import { Feather } from "@expo/vector-icons";
import React, { useMemo, useState } from "react";
import {
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ARR, useGorunum, type Renkler } from "@/src/contexts/GorunumContext";
import { useKlavye } from "@/src/contexts/KlavyeContext";

const MAVI = "#3B82F6";
const BEYAZ = "#FFFFFF";
const KIRMIZI = "#FF453A";

type Olcek = (n: number) => number;

function makeTm(renkler: Renkler, olcek: Olcek) {
  return StyleSheet.create({
    arka: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.6)" },
    panel: { backgroundColor: renkler.kart, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 36 },
    tutamak: { width: 36, height: 4, backgroundColor: renkler.kart2, borderRadius: 2, alignSelf: "center", marginBottom: 14 },
    baslik: { fontSize: olcek(17), fontFamily: "Inter_600SemiBold", color: renkler.metin, textAlign: "center", marginBottom: 16 },
    nav: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 },
    navBtn: { padding: 8 },
    ayYil: { fontSize: olcek(16), fontFamily: "Inter_600SemiBold", color: renkler.metin },
    hafta: { flexDirection: "row", justifyContent: "space-around", marginBottom: 2 },
    haftaBaslik: { width: 38, textAlign: "center", fontSize: olcek(11), fontFamily: "Inter_500Medium", color: renkler.griMetin, paddingBottom: 4 },
    hucre: { width: 38, height: 38, alignItems: "center", justifyContent: "center", borderRadius: 19, marginVertical: 1 },
    hucreSecili: { backgroundColor: MAVI },
    gunMetin: { fontSize: olcek(15), fontFamily: "Inter_400Regular", color: renkler.acikMetin },
    gunSecili: { color: BEYAZ, fontFamily: "Inter_700Bold" },
    gunGecmis: { color: renkler.kart2 },
  });
}

function makeS(renkler: Renkler, olcek: Olcek) {
  return StyleSheet.create({
    kapsayici: { flex: 1, backgroundColor: renkler.zemin, paddingHorizontal: 14 },
    aciklamaKart: { backgroundColor: renkler.kart, borderRadius: 12, padding: 13, marginBottom: 10 },
    aciklamaMetin: { fontSize: olcek(13), fontFamily: "Inter_400Regular", color: renkler.griMetin, lineHeight: olcek(19) },
    formKart: { backgroundColor: renkler.kart, borderRadius: 14, flex: 1, marginBottom: 10, overflow: "hidden" },
    formBaslikSatir: { flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingVertical: 11 },
    formBaslik: { fontSize: olcek(14), fontFamily: "Inter_600SemiBold", color: renkler.metin, flex: 1 },
    ayirac: { height: StyleSheet.hairlineWidth, backgroundColor: renkler.sinir },
    alanKutu: { paddingHorizontal: 14, paddingTop: 10, paddingBottom: 2, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: renkler.sinir },
    yanYana: { flexDirection: "row" },
    etiket: { fontSize: olcek(11), fontFamily: "Inter_500Medium", color: renkler.griMetin, marginBottom: 5, letterSpacing: 0.2 },
    yildiz: { color: KIRMIZI },
    giris: { backgroundColor: renkler.kart2, borderRadius: 9, paddingHorizontal: 12, paddingVertical: 9, fontSize: olcek(14), fontFamily: "Inter_400Regular", color: renkler.metin, marginBottom: 4 },
    tarihBtn: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
    tarihSecili: { fontSize: olcek(14), fontFamily: "Inter_400Regular", color: renkler.metin },
    tarihPh: { fontSize: olcek(14), fontFamily: "Inter_400Regular", color: renkler.griMetin },
    cokluGiris: { flex: 1, paddingTop: 9, minHeight: 60 },
    sayac: { fontSize: olcek(10), fontFamily: "Inter_400Regular", color: renkler.griMetin, textAlign: "right", marginBottom: 4 },
    gonderBtn: { backgroundColor: MAVI, borderRadius: 13, paddingVertical: 13, flexDirection: "row", alignItems: "center", justifyContent: "center" },
    gonderBtnMetin: { fontSize: olcek(15), fontFamily: "Inter_600SemiBold", color: BEYAZ },
  });
}

function TakvimModal({ acik, secili, onClose, onChange }: {
  acik: boolean; secili: Date | null;
  onClose: () => void; onChange: (d: Date) => void;
}) {
  const { renkler, olcek, dil, t } = useGorunum();
  const tm = useMemo(() => makeTm(renkler, olcek), [renkler, olcek]);

  const AYLAR = ARR.aylar[dil];
  const GUNLER_KISA = ARR.gunlerKisa[dil];

  const bugunSifir = (() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; })();
  const [gorunen, setGorunen] = useState(() => {
    const d = new Date(); d.setDate(1); return d;
  });
  const yil = gorunen.getFullYear();
  const ay = gorunen.getMonth();
  const ilkGun = new Date(yil, ay, 1).getDay();
  const offset = ilkGun === 0 ? 6 : ilkGun - 1;
  const ayGun = new Date(yil, ay + 1, 0).getDate();
  const hucreler: (number | null)[] = [...Array(offset).fill(null), ...Array.from({ length: ayGun }, (_, i) => i + 1)];
  while (hucreler.length % 7 !== 0) hucreler.push(null);

  return (
    <Modal visible={acik} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={tm.arka} activeOpacity={1} onPress={onClose}>
        <View style={tm.panel}>
          <View style={tm.tutamak} />
          <Text style={tm.baslik}>{t("tarihSecModal")}</Text>
          <View style={tm.nav}>
            <TouchableOpacity style={tm.navBtn} onPress={() => setGorunen(g => { const d = new Date(g); d.setMonth(d.getMonth() - 1); return d; })} activeOpacity={0.7}>
              <Feather name="chevron-left" size={20} color={renkler.acikMetin} />
            </TouchableOpacity>
            <Text style={tm.ayYil}>{AYLAR[ay]} {yil}</Text>
            <TouchableOpacity style={tm.navBtn} onPress={() => setGorunen(g => { const d = new Date(g); d.setMonth(d.getMonth() + 1); return d; })} activeOpacity={0.7}>
              <Feather name="chevron-right" size={20} color={renkler.acikMetin} />
            </TouchableOpacity>
          </View>
          <View style={tm.hafta}>
            {GUNLER_KISA.map(g => <Text key={g} style={tm.haftaBaslik}>{g}</Text>)}
          </View>
          {Array.from({ length: hucreler.length / 7 }, (_, h) => (
            <View key={h} style={tm.hafta}>
              {hucreler.slice(h * 7, h * 7 + 7).map((gun, i) => {
                if (!gun) return <View key={i} style={tm.hucre} />;
                const tarihObj = new Date(yil, ay, gun);
                const secildi = secili
                  ? secili.getFullYear() === yil && secili.getMonth() === ay && secili.getDate() === gun
                  : false;
                const gecmis = tarihObj < bugunSifir;
                return (
                  <TouchableOpacity key={i} style={[tm.hucre, secildi && tm.hucreSecili]}
                    onPress={() => { if (!gecmis) { onChange(tarihObj); onClose(); } }}
                    disabled={gecmis} activeOpacity={0.75}>
                    <Text style={[tm.gunMetin, secildi && tm.gunSecili, gecmis && tm.gunGecmis]}>
                      {gun}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          ))}
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

export default function SeansEkrani() {
  const { renkler, olcek, dil, t } = useGorunum();
  const insets = useSafeAreaInsets();
  const [adSoyad, setAdSoyad] = useState("");
  const [telefon, setTelefon] = useState("");
  const [eposta, setEposta] = useState("");
  const [tarih, setTarih] = useState<Date | null>(null);
  const [mesaj, setMesaj] = useState("");
  const [takvimAcik, setTakvimAcik] = useState(false);
  const [gonderiliyor, setGonderiliyor] = useState(false);
  const { odaklandi, birakti } = useKlavye();

  const s = useMemo(() => makeS(renkler, olcek), [renkler, olcek]);

  const AYLAR = ARR.aylar[dil];

  const tarihStr = tarih
    ? `${String(tarih.getDate()).padStart(2, "0")} ${AYLAR[tarih.getMonth()]} ${tarih.getFullYear()}`
    : "";

  async function gonder() {
    if (!adSoyad.trim()) { Alert.alert(t("eksikBilgi"), t("adSoyadZorunlu")); return; }
    if (!mesaj.trim()) { Alert.alert(t("eksikBilgi"), t("mesajZorunlu")); return; }
    setGonderiliyor(true);
    const konu = encodeURIComponent("Seans/Eğitim Talebi – " + adSoyad.trim());
    const govde = encodeURIComponent(
      `Ad Soyad: ${adSoyad.trim()}\n` +
      `Telefon: ${telefon.trim() || "–"}\n` +
      `E-posta: ${eposta.trim() || "–"}\n` +
      `Tarih: ${tarihStr || "–"}\n\n` +
      `Mesaj:\n${mesaj.trim()}`
    );
    const url = `mailto:birlesikbilincalani@gmail.com?subject=${konu}&body=${govde}`;
    const acildi = await Linking.canOpenURL(url);
    if (acildi) await Linking.openURL(url);
    else Alert.alert(t("hata"), t("mailAcilamadi"));
    setGonderiliyor(false);
  }

  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
    <View style={[s.kapsayici, { paddingTop: insets.top + 10, paddingBottom: 50 + insets.bottom + 12 }]}>

      <View style={s.aciklamaKart}>
        <Text style={s.aciklamaMetin}>{t("seansAciklama")}</Text>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
      <View style={s.formKart}>
        <View style={s.formBaslikSatir}>
          <Feather name="calendar" size={16} color={MAVI} style={{ marginRight: 7 }} />
          <Text style={s.formBaslik}>{t("seansFormBaslik")}</Text>
        </View>
        <View style={s.ayirac} />

        <View style={s.alanKutu}>
          <Text style={s.etiket}><Feather name="user" size={11} color={renkler.griMetin} /> {t("adSoyadLabel")} <Text style={s.yildiz}>*</Text></Text>
          <TextInput style={s.giris} value={adSoyad} onChangeText={setAdSoyad}
            placeholder={t("adSoyadPh")} placeholderTextColor={renkler.griMetin} returnKeyType="next"
            onFocus={odaklandi} onBlur={birakti} />
        </View>

        <View style={[s.alanKutu, s.yanYana]}>
          <View style={{ flex: 1, marginRight: 8 }}>
            <Text style={s.etiket}><Feather name="phone" size={11} color={renkler.griMetin} /> {t("telefonLabel")}</Text>
            <TextInput style={s.giris} value={telefon} onChangeText={setTelefon}
              placeholder={t("telefonPh")} placeholderTextColor={renkler.griMetin}
              keyboardType="phone-pad" returnKeyType="next"
              onFocus={odaklandi} onBlur={birakti} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.etiket}><Feather name="mail" size={11} color={renkler.griMetin} /> {t("epostaLabel")}</Text>
            <TextInput style={s.giris} value={eposta} onChangeText={setEposta}
              placeholder={t("epostaPh")} placeholderTextColor={renkler.griMetin}
              keyboardType="email-address" autoCapitalize="none" returnKeyType="next"
              onFocus={odaklandi} onBlur={birakti} />
          </View>
        </View>

        <View style={s.alanKutu}>
          <Text style={s.etiket}><Feather name="calendar" size={11} color={renkler.griMetin} /> {t("tarihSecimi")}</Text>
          <TouchableOpacity style={[s.giris, s.tarihBtn]} onPress={() => setTakvimAcik(true)} activeOpacity={0.8}>
            <Text style={tarihStr ? s.tarihSecili : s.tarihPh}>{tarihStr || t("tarihSecPh")}</Text>
            <Feather name="chevron-down" size={15} color={renkler.griMetin} />
          </TouchableOpacity>
        </View>

        <View style={[s.alanKutu, { flex: 1 }]}>
          <Text style={s.etiket}><Feather name="message-square" size={11} color={renkler.griMetin} /> {t("mesajiniz")} <Text style={s.yildiz}>*</Text></Text>
          <TextInput style={[s.giris, s.cokluGiris]} value={mesaj}
            onChangeText={m => m.length <= 500 && setMesaj(m)}
            placeholder={t("mesajPh")}
            placeholderTextColor={renkler.griMetin} multiline textAlignVertical="top"
            onFocus={odaklandi} onBlur={birakti} />
          <Text style={s.sayac}>{mesaj.length}/500</Text>
        </View>
      </View>

      <TouchableOpacity style={[s.gonderBtn, gonderiliyor && { opacity: 0.6 }]}
        onPress={gonder} disabled={gonderiliyor} activeOpacity={0.85}>
        <Feather name="send" size={16} color={BEYAZ} style={{ marginRight: 8 }} />
        <Text style={s.gonderBtnMetin}>{gonderiliyor ? t("aciliyor") : t("formuGonder")}</Text>
      </TouchableOpacity>
      </KeyboardAvoidingView>

      <TakvimModal acik={takvimAcik} secili={tarih}
        onClose={() => setTakvimAcik(false)} onChange={setTarih} />
    </View>
    </TouchableWithoutFeedback>
  );
}
