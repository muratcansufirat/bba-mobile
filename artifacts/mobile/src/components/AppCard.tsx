import React from "react";
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  TouchableOpacityProps,
  View,
  ViewProps,
} from "react-native";

import BBA_RENKLER from "@/src/constants/tema";

type AppCardProps = ViewProps & {
  baslik?: string;
  aciklama?: string;
  onPress?: TouchableOpacityProps["onPress"];
  children?: React.ReactNode;
};

export default function AppCard({
  baslik,
  aciklama,
  onPress,
  children,
  style,
  ...props
}: AppCardProps) {
  const Sarmalayici = onPress ? TouchableOpacity : View;
  const sarmalayiciProps = onPress
    ? { activeOpacity: 0.8, onPress }
    : {};

  return (
    <Sarmalayici
      {...(sarmalayiciProps as any)}
      style={[
        styles.kart,
        {
          backgroundColor: BBA_RENKLER.laciverd,
          borderColor: BBA_RENKLER.acikGri + "18",
        },
        style,
      ]}
      {...(props as any)}
    >
      {(baslik || aciklama) && (
        <View style={styles.baslikAlani}>
          {baslik && (
            <Text style={[styles.baslik, { color: BBA_RENKLER.beyaz }]}>
              {baslik}
            </Text>
          )}
          {aciklama && (
            <Text style={[styles.aciklama, { color: BBA_RENKLER.koyuGri }]}>
              {aciklama}
            </Text>
          )}
        </View>
      )}
      {children}
    </Sarmalayici>
  );
}

const styles = StyleSheet.create({
  kart: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 20,
  },
  baslikAlani: {
    gap: 6,
    marginBottom: 4,
  },
  baslik: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
  },
  aciklama: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    lineHeight: 18,
  },
});
