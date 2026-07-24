import { Stack, Redirect } from "expo-router";
import { useAuth } from "@/src/contexts/AuthContext";

export default function AuthLayout() {
  const { girisYapildi, yukleniyor } = useAuth();
  if (yukleniyor) return null;
  if (girisYapildi) return <Redirect href="/(ana)/sohbet" />;

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="giris" />
      <Stack.Screen name="kayit" />
    </Stack>
  );
}
