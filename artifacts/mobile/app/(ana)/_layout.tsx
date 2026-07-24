import { Feather } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import { Redirect, Tabs } from "expo-router";
import React from "react";
import { Platform, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAuth } from "@/src/contexts/AuthContext";
import { useGorunum } from "@/src/contexts/GorunumContext";
import { KlavyeProvider, useKlavye } from "@/src/contexts/KlavyeContext";

const MAVI = "#3B82F6";
const PASIF = "#636366";

type FeatherIcon =
  | "message-circle"
  | "users"
  | "book-open"
  | "phone"
  | "user";

function TabIkon({ name, color, size }: { name: FeatherIcon; color: string; size: number }) {
  return <Feather name={name} size={size} color={color} />;
}

export default function AnaLayout() {
  const { girisYapildi, yukleniyor } = useAuth();

  if (yukleniyor) return null;
  if (!girisYapildi) return <Redirect href="/(auth)/giris" />;

  return (
    <KlavyeProvider>
      <AnaSekmeler />
    </KlavyeProvider>
  );
}

function AnaSekmeler() {
  const insets = useSafeAreaInsets();
  const isIOS = Platform.OS === "ios";
  const { acik: klavyeAcik } = useKlavye();
  const { tema, renkler, t } = useGorunum();

  const tabBarHeight = 50 + insets.bottom;
  const blurTint = tema === "gece" ? "dark" : "light";

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: MAVI,
        tabBarInactiveTintColor: PASIF,
        tabBarStyle: {
          position: "absolute",
          backgroundColor: isIOS ? "transparent" : renkler.kart,
          borderTopWidth: StyleSheet.hairlineWidth,
          borderTopColor: renkler.sinir,
          elevation: 0,
          height: tabBarHeight,
          paddingTop: 8,
          paddingBottom: insets.bottom > 0 ? insets.bottom : 8,
          display: klavyeAcik ? "none" : "flex",
        },
        tabBarLabelStyle: {
          fontFamily: "Inter_500Medium",
          fontSize: 10,
          letterSpacing: 0.2,
        },
        tabBarBackground: () =>
          isIOS ? (
            <BlurView
              intensity={90}
              tint={blurTint}
              style={StyleSheet.absoluteFill}
            />
          ) : null,
      }}
    >
      <Tabs.Screen
        name="sohbet"
        options={{
          title: t("tabBBA"),
          tabBarIcon: ({ color, size }) => (
            <TabIkon name="message-circle" color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="topluluk"
        options={{
          title: t("tabTopluluk"),
          tabBarIcon: ({ color, size }) => (
            <TabIkon name="users" color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="seans"
        options={{
          title: t("tabSeans"),
          tabBarIcon: ({ color, size }) => (
            <TabIkon name="book-open" color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="iletisim"
        options={{
          title: t("tabIletisim"),
          tabBarIcon: ({ color, size }) => (
            <TabIkon name="phone" color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="hesabim"
        options={{
          title: t("tabHesabim"),
          tabBarIcon: ({ color, size }) => (
            <TabIkon name="user" color={color} size={size} />
          ),
        }}
      />
    </Tabs>
  );
}
