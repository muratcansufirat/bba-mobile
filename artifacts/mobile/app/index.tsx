import { Redirect } from "expo-router";
import { useAuth } from "@/src/contexts/AuthContext";

export default function Giris() {
  const { girisYapildi, yukleniyor } = useAuth();
  if (yukleniyor) return null;
  return <Redirect href={girisYapildi ? "/(ana)/sohbet" : "/(auth)/giris"} />;
}
