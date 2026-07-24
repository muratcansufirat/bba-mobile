import React, { useState } from "react";
import {
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  TouchableOpacity,
  View,
  ViewStyle,
} from "react-native";
import { Feather } from "@expo/vector-icons";

import BBA_RENKLER from "@/src/constants/tema";

type AppInputProps = TextInputProps & {
  etiket?: string;
  hata?: string;
  konteynerStili?: ViewStyle;
  sifre?: boolean;
};

export default function AppInput({
  etiket,
  hata,
  konteynerStili,
  sifre = false,
  style,
  ...props
}: AppInputProps) {
  const [odakta, setOdakta] = useState(false);
  const [sifreGoster, setSifreGoster] = useState(false);

  const kenarlıkRengi = hata
    ? "#E53E3E"
    : odakta
    ? BBA_RENKLER.altin
    : BBA_RENKLER.acikGri + "33";

  return (
    <View style={[styles.konteyner, konteynerStili]}>
      {etiket && (
        <Text style={[styles.etiket, { color: BBA_RENKLER.acikGri }]}>
          {etiket}
        </Text>
      )}

      <View
        style={[
          styles.girisAlani,
          {
            backgroundColor: BBA_RENKLER.laciverd,
            borderColor: kenarlıkRengi,
          },
        ]}
      >
        <TextInput
          style={[styles.giris, { color: BBA_RENKLER.beyaz }, style]}
          placeholderTextColor={BBA_RENKLER.koyuGri}
          secureTextEntry={sifre && !sifreGoster}
          onFocus={() => setOdakta(true)}
          onBlur={() => setOdakta(false)}
          {...props}
        />
        {sifre && (
          <TouchableOpacity
            onPress={() => setSifreGoster((g) => !g)}
            style={styles.gozonuButon}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Feather
              name={sifreGoster ? "eye-off" : "eye"}
              size={18}
              color={BBA_RENKLER.koyuGri}
            />
          </TouchableOpacity>
        )}
      </View>

      {hata && (
        <Text style={styles.hataMetin}>{hata}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  konteyner: {
    gap: 6,
  },
  etiket: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    letterSpacing: 0.2,
  },
  girisAlani: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1.5,
    borderRadius: 14,
    paddingHorizontal: 16,
    minHeight: 52,
  },
  giris: {
    flex: 1,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    paddingVertical: 14,
  },
  gozonuButon: {
    paddingLeft: 8,
  },
  hataMetin: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: "#E53E3E",
  },
});
