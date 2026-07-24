import React from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  TouchableOpacityProps,
} from "react-native";

import BBA_RENKLER from "@/src/constants/tema";

type PrimaryButtonProps = TouchableOpacityProps & {
  baslik: string;
  yukleniyor?: boolean;
};

export default function PrimaryButton({
  baslik,
  yukleniyor = false,
  disabled,
  style,
  ...props
}: PrimaryButtonProps) {
  const pasif = disabled || yukleniyor;

  return (
    <TouchableOpacity
      activeOpacity={0.82}
      disabled={pasif}
      style={[
        styles.buton,
        { backgroundColor: BBA_RENKLER.altin, opacity: pasif ? 0.55 : 1 },
        style,
      ]}
      {...props}
    >
      {yukleniyor ? (
        <ActivityIndicator color={BBA_RENKLER.laciverd} size="small" />
      ) : (
        <Text style={[styles.metin, { color: BBA_RENKLER.laciverd }]}>
          {baslik}
        </Text>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  buton: {
    borderRadius: 14,
    paddingVertical: 15,
    paddingHorizontal: 24,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 52,
  },
  metin: {
    fontSize: 15,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.2,
  },
});
