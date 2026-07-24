import React from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  TouchableOpacityProps,
} from "react-native";

import BBA_RENKLER from "@/src/constants/tema";

type SecondaryButtonProps = TouchableOpacityProps & {
  baslik: string;
  yukleniyor?: boolean;
};

export default function SecondaryButton({
  baslik,
  yukleniyor = false,
  disabled,
  style,
  ...props
}: SecondaryButtonProps) {
  const pasif = disabled || yukleniyor;

  return (
    <TouchableOpacity
      activeOpacity={0.75}
      disabled={pasif}
      style={[
        styles.buton,
        {
          borderColor: BBA_RENKLER.mor,
          opacity: pasif ? 0.55 : 1,
        },
        style,
      ]}
      {...props}
    >
      {yukleniyor ? (
        <ActivityIndicator color={BBA_RENKLER.mor} size="small" />
      ) : (
        <Text style={[styles.metin, { color: BBA_RENKLER.mor }]}>
          {baslik}
        </Text>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  buton: {
    borderWidth: 1.5,
    borderRadius: 14,
    paddingVertical: 15,
    paddingHorizontal: 24,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 52,
    backgroundColor: "transparent",
  },
  metin: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 0.2,
  },
});
