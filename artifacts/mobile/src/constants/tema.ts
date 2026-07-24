const BBA_RENKLER = {
  laciverd: "#0D1B3E",
  beyaz: "#FFFFFF",
  altin: "#C9A84C",
  mor: "#A78BFA",
  acikGri: "#F0EFF4",
  koyuGri: "#4A4A5A",
} as const;

export type BbaRenk = keyof typeof BBA_RENKLER;

export default BBA_RENKLER;
