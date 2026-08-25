import * as Linking from "expo-linking";
import { router } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import { googleCallbackTamamla } from "@/src/lib/googleAuth";

export default function GoogleGirisDonusu() {
  const baslatildi = useRef(false);
  const [hata, setHata] = useState<string | null>(null);
  const gelenUrl = Linking.useURL();

  useEffect(() => {
    if (baslatildi.current) return;

    const callbackUrl =
      Platform.OS === "web" && typeof window !== "undefined"
        ? window.location.href
        : gelenUrl;

    if (!callbackUrl) {
      return;
    }

    baslatildi.current = true;
    googleCallbackTamamla(callbackUrl)
      .then((sonuc) => {
        if (sonuc.hata) {
          setHata(sonuc.hata);
          return;
        }
        router.replace("/(ana)/sohbet");
      })
      .catch(() => {
        setHata("Google girişi tamamlanamadı.");
      });
  }, [gelenUrl]);

  return (
    <View style={styles.container}>
      {hata ? (
        <>
          <Text style={styles.error}>{hata}</Text>
          <TouchableOpacity
            style={styles.button}
            onPress={() => router.replace("/(auth)/giris")}
          >
            <Text style={styles.buttonText}>Giriş ekranına dön</Text>
          </TouchableOpacity>
        </>
      ) : (
        <>
          <ActivityIndicator size="large" color="#3B82F6" />
          <Text style={styles.status}>Google girişi tamamlanıyor…</Text>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
    padding: 24,
    backgroundColor: "#000000",
  },
  status: {
    color: "#FFFFFF",
    fontSize: 15,
    textAlign: "center",
  },
  error: {
    color: "#FF453A",
    fontSize: 15,
    textAlign: "center",
  },
  button: {
    borderRadius: 24,
    backgroundColor: "#3B82F6",
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  buttonText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "600",
  },
});
