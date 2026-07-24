import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Keyboard, Platform } from "react-native";

type KlavyeBaglami = {
  acik: boolean;
  yukseklik: number;
  odaklandi: () => void;
  birakti: () => void;
};

const KlavyeContext = createContext<KlavyeBaglami>({
  acik: false,
  yukseklik: 0,
  odaklandi: () => {},
  birakti: () => {},
});

export function useKlavye() {
  return useContext(KlavyeContext);
}

export function KlavyeProvider({ children }: { children: React.ReactNode }) {
  const [acik, setAcik] = useState(false);
  const [yukseklik, setYukseklik] = useState(0);
  const odakSayaci = useRef(0);

  useEffect(() => {
    if (Platform.OS === "web") return;
    const gosterOlayi = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const gizleOlayi = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const gosterSub = Keyboard.addListener(gosterOlayi, (e) => {
      setYukseklik(e.endCoordinates.height);
      setAcik(true);
    });
    const gizleSub = Keyboard.addListener(gizleOlayi, () => {
      setYukseklik(0);
      setAcik(false);
    });
    return () => {
      gosterSub.remove();
      gizleSub.remove();
    };
  }, []);

  // Web (tarayıcı) tarafında gerçek bir yazılım klavyesi/olayı olmadığından,
  // metin girişine odaklanma/odaktan çıkma üzerinden aynı davranışı simüle ederiz.
  const odaklandi = () => {
    if (Platform.OS !== "web") return;
    odakSayaci.current += 1;
    setAcik(true);
    setYukseklik(0);
  };

  const birakti = () => {
    if (Platform.OS !== "web") return;
    odakSayaci.current = Math.max(0, odakSayaci.current - 1);
    if (odakSayaci.current === 0) {
      setAcik(false);
      setYukseklik(0);
    }
  };

  const deger = useMemo(
    () => ({ acik, yukseklik, odaklandi, birakti }),
    [acik, yukseklik]
  );

  return <KlavyeContext.Provider value={deger}>{children}</KlavyeContext.Provider>;
}
