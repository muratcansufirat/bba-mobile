import { AntDesign, Feather } from "@expo/vector-icons";
import { Link } from "expo-router";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAuth } from "@/src/contexts/AuthContext";
import { useGorunum } from "@/src/contexts/GorunumContext";

function GoogleG() {
  return (
    <View style={googleG.sarici}>
      <Text style={googleG.g}>G</Text>
    </View>
  );
}
const googleG = StyleSheet.create({
  sarici: {
    width: 20, height: 20,
    borderRadius: 10,
    backgroundColor: "#fff",
    alignItems: "center", justifyContent: "center",
  },
  g: {
    fontSize: 13, fontWeight: "700",
    color: "#4285F4",
    lineHeight: 18,
    includeFontPadding: false,
  },
});

export default function GirisEkrani() {
  const { girisYapEposta, googleIleGiris } = useAuth();
  const { t } = useGorunum();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const [eposta, setEposta] = useState("");
  const [sifre, setSifre] = useState("");
  const [sifreGorunur, setSifreGorunur] = useState(false);
  const [hata, setHata] = useState<string | null>(null);
  const [girisYukleniyor, setGirisYukleniyor] = useState(false);
  const [googleYukleniyor, setGoogleYukleniyor] = useState(false);

  const net = height - insets.top - insets.bottom;
  const logoBoyu = Math.min(Math.round(net * 0.155), 130);

  async function girisYapTikla() {
    setHata(null);
    if (!eposta.trim() || !sifre) {
      setHata(t("lutfenGirin"));
      return;
    }
    setGirisYukleniyor(true);
    const { hata: girisHatasi } = await girisYapEposta(eposta, sifre);
    setGirisYukleniyor(false);
    if (girisHatasi) setHata(girisHatasi);
  }

  async function googleTikla() {
    setHata(null);
    setGoogleYukleniyor(true);
    const { hata: googleHatasi } = await googleIleGiris();
    setGoogleYukleniyor(false);
    if (googleHatasi) setHata(googleHatasi);
  }

  return (
    <View style={[styles.zemin, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <View style={styles.dis}>

          <View style={styles.ust}>
            <Image
              source={require("@/assets/bba-logo-transparent.png")}
              style={{ width: logoBoyu, height: logoBoyu }}
              resizeMode="contain"
            />
            <Text style={styles.baslik}>{t("uygulamaAdi")}</Text>
            <Text style={styles.altBaslik}>{t("girisBaslik")}</Text>
          </View>

          <View style={styles.kart}>

            <TouchableOpacity
              style={[styles.googleButon, googleYukleniyor && styles.pasif]}
              onPress={googleTikla}
              disabled={googleYukleniyor || girisYukleniyor}
              activeOpacity={0.75}
            >
              {googleYukleniyor ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <GoogleG />
                  <Text style={styles.googleMetin}>{t("googleGiris")}</Text>
                </>
              )}
            </TouchableOpacity>

            <View style={styles.ayrac}>
              <View style={styles.cizgi} />
              <Text style={styles.ayracMetin}>{t("veya")}</Text>
              <View style={styles.cizgi} />
            </View>

            <View style={styles.inputGrup}>
              <Text style={styles.inputLabel}>{t("epostaAdresi")}</Text>
              <TextInput
                style={styles.input}
                placeholder="email@example.com"
                placeholderTextColor="#6B7280"
                value={eposta}
                onChangeText={setEposta}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>

            <View style={styles.inputGrup}>
              <Text style={styles.inputLabel}>{t("sifre")}</Text>
              <View style={styles.sifreAlani}>
                <TextInput
                  style={styles.sifreInput}
                  placeholder="••••••••"
                  placeholderTextColor="#6B7280"
                  value={sifre}
                  onChangeText={setSifre}
                  secureTextEntry={!sifreGorunur}
                  autoCapitalize="none"
                  autoCorrect={false}
                  returnKeyType="go"
                  onSubmitEditing={girisYapTikla}
                />
                <TouchableOpacity
                  onPress={() => setSifreGorunur((gorunur) => !gorunur)}
                  style={styles.gozButon}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  accessibilityRole="button"
                  accessibilityLabel={sifreGorunur ? "Şifreyi gizle" : "Şifreyi göster"}
                >
                  <Feather
                    name={sifreGorunur ? "eye-off" : "eye"}
                    size={18}
                    color="#8E8E93"
                  />
                </TouchableOpacity>
              </View>
            </View>

            {hata ? <Text style={styles.hataMetin}>{hata}</Text> : null}

            <TouchableOpacity
              style={[styles.ileriButon, girisYukleniyor && styles.pasif]}
              onPress={girisYapTikla}
              disabled={girisYukleniyor || googleYukleniyor}
              activeOpacity={0.85}
            >
              {girisYukleniyor ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <Text style={styles.ileriMetin}>{t("girisYap")}</Text>
                  <Feather name="chevron-right" size={16} color="#fff" style={{ marginTop: 1 }} />
                </>
              )}
            </TouchableOpacity>

            <View style={styles.kartAyrac} />

            <View style={styles.altSatir}>
              <Text style={styles.altMetin}>{t("hesapYokMu")}</Text>
              <Link href="/(auth)/kayit" asChild>
                <TouchableOpacity>
                  <Text style={styles.kayitLink}>{t("kayitOlLink")}</Text>
                </TouchableOpacity>
              </Link>
            </View>

          </View>

        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const KART_BG   = "#1A1A1A";
const SINIR     = "#2E2E2E";
const BEYAZ     = "#FFFFFF";
const GRI_METIN = "#8E8E93";
const MAVI      = "#3B82F6";
const KIRMIZI   = "#FF453A";

const styles = StyleSheet.create({
  zemin: { flex: 1, backgroundColor: "#000000" },
  dis: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 20, gap: 24 },
  ust: { alignItems: "center", gap: 10 },
  baslik: { color: BEYAZ, fontSize: 22, fontFamily: "Inter_700Bold", letterSpacing: 0.2, textAlign: "center", marginTop: 4 },
  altBaslik: { color: GRI_METIN, fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center" },
  kart: { width: "100%", backgroundColor: KART_BG, borderWidth: 1, borderColor: SINIR, borderRadius: 18, paddingHorizontal: 20, paddingTop: 20, paddingBottom: 16, gap: 14 },
  pasif: { opacity: 0.6 },
  googleButon: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, borderWidth: 1, borderColor: "#3A3A3A", borderRadius: 50, backgroundColor: "#111111", paddingVertical: 13 },
  googleMetin: { color: BEYAZ, fontSize: 15, fontFamily: "Inter_500Medium" },
  ayrac: { flexDirection: "row", alignItems: "center", gap: 10 },
  cizgi: { flex: 1, height: 1, backgroundColor: SINIR },
  ayracMetin: { color: GRI_METIN, fontSize: 13, fontFamily: "Inter_400Regular" },
  inputGrup: { gap: 6 },
  inputLabel: { color: BEYAZ, fontSize: 13, fontFamily: "Inter_500Medium", marginLeft: 2 },
  input: { backgroundColor: "#111111", borderWidth: 1, borderColor: "#3A3A3A", borderRadius: 10, paddingHorizontal: 14, paddingVertical: 13, color: BEYAZ, fontSize: 15, fontFamily: "Inter_400Regular" },
  sifreAlani: { flexDirection: "row", alignItems: "center", backgroundColor: "#111111", borderWidth: 1, borderColor: "#3A3A3A", borderRadius: 10 },
  sifreInput: { flex: 1, paddingLeft: 14, paddingRight: 6, paddingVertical: 13, color: BEYAZ, fontSize: 15, fontFamily: "Inter_400Regular" },
  gozButon: { alignItems: "center", justifyContent: "center", alignSelf: "stretch", paddingHorizontal: 14 },
  hataMetin: { color: KIRMIZI, fontSize: 13, fontFamily: "Inter_500Medium", marginTop: -4 },
  ileriButon: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: MAVI, borderRadius: 50, paddingVertical: 14 },
  ileriMetin: { color: BEYAZ, fontSize: 16, fontFamily: "Inter_600SemiBold", letterSpacing: 0.2 },
  kartAyrac: { height: 1, backgroundColor: SINIR, marginHorizontal: -20 },
  altSatir: { flexDirection: "row", alignItems: "center", justifyContent: "center" },
  altMetin: { color: GRI_METIN, fontSize: 13, fontFamily: "Inter_400Regular" },
  kayitLink: { color: MAVI, fontSize: 13, fontFamily: "Inter_600SemiBold" },
});
