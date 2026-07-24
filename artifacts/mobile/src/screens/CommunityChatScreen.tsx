import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { useColors } from "@/hooks/useColors";

export default function CommunityChatScreen() {
  const colors = useColors();
  return (
    <View style={[styles.kapsayici, { backgroundColor: colors.background }]}>
      <Text style={[styles.baslik, { color: colors.foreground }]}>Topluluk</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  kapsayici: { flex: 1, alignItems: "center", justifyContent: "center" },
  baslik: { fontSize: 28, fontFamily: "Inter_700Bold" },
});
