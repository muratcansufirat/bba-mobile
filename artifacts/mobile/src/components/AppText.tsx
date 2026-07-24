import React from "react";
import { StyleSheet, Text, TextProps } from "react-native";

import BBA_RENKLER from "@/src/constants/tema";

type Varyant = "baslik" | "altBaslik" | "normal" | "kucuk" | "etiket";

type AppTextProps = TextProps & {
  varyant?: Varyant;
  renk?: string;
  children: React.ReactNode;
};

export default function AppText({
  varyant = "normal",
  renk,
  style,
  children,
  ...props
}: AppTextProps) {
  return (
    <Text
      style={[styles.temel, styles[varyant], { color: renk ?? varsayilanRenk(varyant) }, style]}
      {...props}
    >
      {children}
    </Text>
  );
}

function varsayilanRenk(varyant: Varyant): string {
  switch (varyant) {
    case "baslik":
      return BBA_RENKLER.beyaz;
    case "altBaslik":
      return BBA_RENKLER.altin;
    case "normal":
      return BBA_RENKLER.acikGri;
    case "kucuk":
      return BBA_RENKLER.koyuGri;
    case "etiket":
      return BBA_RENKLER.mor;
  }
}

const styles = StyleSheet.create({
  temel: {
    includeFontPadding: false,
  },
  baslik: {
    fontSize: 26,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.2,
    lineHeight: 32,
  },
  altBaslik: {
    fontSize: 18,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 0.1,
    lineHeight: 24,
  },
  normal: {
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    lineHeight: 22,
  },
  kucuk: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    lineHeight: 18,
  },
  etiket: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 0.6,
    textTransform: "uppercase",
    lineHeight: 16,
  },
});
