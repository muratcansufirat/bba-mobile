import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { createContext, useCallback, useContext, useEffect, useState } from "react";

import { ARR, type Dil, type StrKey, translate } from "@/src/i18n/strings";

export type { Dil };
export { ARR };

export type YaziBoyutu = "kucuk" | "orta" | "buyuk";
export type Tema = "gece" | "gunduz";

export const YAZI_KATSAYI: Record<YaziBoyutu, number> = {
  kucuk: 0.88,
  orta: 1,
  buyuk: 1.15,
};

export type Renkler = {
  zemin: string;
  kart: string;
  kart2: string;
  sinir: string;
  metin: string;
  acikMetin: string;
  griMetin: string;
  inputBg: string;
};

const GECE: Renkler = {
  zemin: "#000000",
  kart: "#1C1C1E",
  kart2: "#2C2C2E",
  sinir: "#2C2C2E",
  metin: "#FFFFFF",
  acikMetin: "#EBEBF0",
  griMetin: "#8E8E93",
  inputBg: "#111111",
};

const GUNDUZ: Renkler = {
  zemin: "#F2F2F7",
  kart: "#FFFFFF",
  kart2: "#F2F2F7",
  sinir: "#C6C6C8",
  metin: "#000000",
  acikMetin: "#1C1C1E",
  griMetin: "#6E6E73",
  inputBg: "#E5E5EA",
};

export function temaRenkleri(tema: Tema): Renkler {
  return tema === "gece" ? GECE : GUNDUZ;
}

const DEPO_TEMA = "@bba:tema";
const DEPO_YAZI = "@bba:yaziBoyutu";
const DEPO_DIL  = "@bba:dil";

export type GorunumDurumu = {
  tema: Tema;
  yaziBoyutu: YaziBoyutu;
  dil: Dil;
  renkler: Renkler;
  setTema: (t: Tema) => void;
  setYaziBoyutu: (b: YaziBoyutu) => void;
  setDil: (d: Dil) => void;
  olcek: (taban: number) => number;
  t: (key: StrKey, vars?: Record<string, string>) => string;
};

const GorunumContext = createContext<GorunumDurumu>({
  tema: "gece",
  yaziBoyutu: "orta",
  dil: "tr",
  renkler: GECE,
  setTema: () => {},
  setYaziBoyutu: () => {},
  setDil: () => {},
  olcek: (n) => n,
  t: (key) => key as string,
});

export function GorunumProvider({ children }: { children: React.ReactNode }) {
  const [tema, setTemaState] = useState<Tema>("gece");
  const [yaziBoyutu, setYaziBoyutuState] = useState<YaziBoyutu>("orta");
  const [dil, setDilState] = useState<Dil>("tr");

  useEffect(() => {
    AsyncStorage.multiGet([DEPO_TEMA, DEPO_YAZI, DEPO_DIL]).then((pairs) => {
      const [temaVal, yaziVal, dilVal] = pairs.map((p) => p[1]);
      if (temaVal === "gece" || temaVal === "gunduz") setTemaState(temaVal);
      if (yaziVal === "kucuk" || yaziVal === "orta" || yaziVal === "buyuk") setYaziBoyutuState(yaziVal);
      if (dilVal === "tr" || dilVal === "en") setDilState(dilVal);
    });
  }, []);

  const setTema = useCallback((t: Tema) => {
    setTemaState(t);
    AsyncStorage.setItem(DEPO_TEMA, t);
  }, []);

  const setYaziBoyutu = useCallback((b: YaziBoyutu) => {
    setYaziBoyutuState(b);
    AsyncStorage.setItem(DEPO_YAZI, b);
  }, []);

  const setDil = useCallback((d: Dil) => {
    setDilState(d);
    AsyncStorage.setItem(DEPO_DIL, d);
  }, []);

  const olcek = useCallback(
    (taban: number) => Math.round(taban * YAZI_KATSAYI[yaziBoyutu]),
    [yaziBoyutu]
  );

  const t = useCallback(
    (key: StrKey, vars?: Record<string, string>) => translate(key, dil, vars),
    [dil]
  );

  const renkler = temaRenkleri(tema);

  return (
    <GorunumContext.Provider value={{ tema, yaziBoyutu, dil, renkler, setTema, setYaziBoyutu, setDil, olcek, t }}>
      {children}
    </GorunumContext.Provider>
  );
}

export function useGorunum() {
  return useContext(GorunumContext);
}
