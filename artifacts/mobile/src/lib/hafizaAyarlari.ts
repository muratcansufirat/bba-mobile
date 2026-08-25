import AsyncStorage from "@react-native-async-storage/async-storage";

const HAFIZA_KULLANIMI_KEY = "@bba:hafizaKullanimi";

export async function hafizaKullanimiAcikMi(): Promise<boolean> {
  return (await AsyncStorage.getItem(HAFIZA_KULLANIMI_KEY)) !== "false";
}

export async function hafizaKullaniminiAyarla(acik: boolean): Promise<void> {
  await AsyncStorage.setItem(HAFIZA_KULLANIMI_KEY, acik ? "true" : "false");
}
