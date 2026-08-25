export type Dil = "tr" | "en";

export const S = {
  // ── Genel ──
  uygulamaAdi:        { tr: "Birleşik Bilinç Alanı",   en: "Unified Consciousness Field" },
  gorunumAyarlari:    { tr: "Görünüm Ayarları",         en: "Display Settings" },
  tema:               { tr: "Tema",                     en: "Theme" },
  gece:               { tr: "Gece",                     en: "Dark" },
  gunduz:             { tr: "Gündüz",                   en: "Light" },
  yaziBoyutu:         { tr: "Yazı Boyutu",               en: "Font Size" },
  kucuk:              { tr: "Küçük",                    en: "Small" },
  orta:               { tr: "Orta",                     en: "Medium" },
  buyuk:              { tr: "Büyük",                    en: "Large" },
  iptal:              { tr: "İptal",                    en: "Cancel" },
  tamam:              { tr: "Tamam",                    en: "OK" },
  hata:               { tr: "Hata",                     en: "Error" },
  veya:               { tr: "veya",                     en: "or" },

  // ── Auth / Giriş ──
  girisBaslik:        { tr: "Hesabınıza giriş yapın",   en: "Sign in to your account" },
  googleGiris:        { tr: "Google ile giriş yapın",   en: "Sign in with Google" },
  epostaAdresi:       { tr: "E-posta adresi",           en: "Email address" },
  sifre:              { tr: "Şifre",                    en: "Password" },
  girisYap:           { tr: "Giriş Yap",                en: "Sign In" },
  hesapYokMu:         { tr: "Hesabınız yok mu? ",       en: "Don't have an account? " },
  kayitOlLink:        { tr: "Kayıt ol",                 en: "Sign up" },
  lutfenGirin:        { tr: "Lütfen e-posta ve şifrenizi girin.", en: "Please enter your email and password." },

  // ── Auth / Kayıt ──
  kayitBaslik:        { tr: "Yeni bir hesap oluşturarak başla", en: "Get started with a new account" },
  googleKayit:        { tr: "Google ile Kayıt Ol",      en: "Sign up with Google" },
  nasılHitap:         { tr: "Sana nasıl hitap edelim?", en: "What shall we call you?" },
  isimPh:             { tr: "Örn: Ahmet, Zeynep...",    en: "E.g. John, Jane..." },
  sifrePh:            { tr: "En az 6 karakter",         en: "At least 6 characters" },
  kayitOlBtn:         { tr: "Kayıt Ol",                 en: "Sign Up" },
  hesapVarMi:         { tr: "Zaten hesabınız var mı? ", en: "Already have an account? " },
  girisYapLink:       { tr: "Giriş Yap",                en: "Sign In" },
  lutfenDoldurun:     { tr: "Lütfen tüm alanları doldurun.", en: "Please fill in all fields." },
  sifreBoyut:         { tr: "Şifre en az 6 karakter olmalıdır.", en: "Password must be at least 6 characters." },
  epostaDogrulaBaslik:{ tr: "E-postanızı Doğrulayın",   en: "Verify Your Email" },
  epostaDogrulaMesaj: { tr: "Hesabınızı etkinleştirmek için e-posta adresinize gönderilen bağlantıya tıklayın.", en: "Click the link sent to your email to activate your account." },

  // ── Tab bar ──
  tabBBA:             { tr: "BBA",                      en: "BBA" },
  tabTopluluk:        { tr: "Topluluk",                 en: "Community" },
  tabSeans:           { tr: "Seans",                    en: "Session" },
  tabIletisim:        { tr: "İletişim",                 en: "Contact" },
  tabHesabim:         { tr: "Hesabım",                  en: "Account" },

  // ── Sohbet ──
  sanaOzel:           { tr: "Sana Özel",                en: "For You" },
  birSoruSorun:       { tr: "Bir soru sorun...",        en: "Ask a question..." },
  merhabaAd:          { tr: "Merhaba {ad},\nnasıl yardımcı olabilirim?", en: "Hello {ad},\nhow can I help you?" },
  makale:             { tr: "Makale",                   en: "Article" },
  kitap:              { tr: "Kitap",                    en: "Book" },
  yeniSohbet:         { tr: "Yeni Sohbet",               en: "New Chat" },
  sohbetGecmisi:      { tr: "Sohbet Geçmişi",          en: "Chat History" },
  sohbetYok:          { tr: "Henüz sohbet yok.",        en: "No conversations yet." },
  sohbetAra:          { tr: "Sohbetlerde ara...",       en: "Search conversations..." },
  aramaSonucuYok:     { tr: "Eşleşen sohbet bulunamadı.", en: "No matching conversations." },
  dahaFazlaGoster:    { tr: "Daha fazla göster",         en: "Show more" },
  dahaEskiMesajlar:   { tr: "Daha eski mesajları göster", en: "Show older messages" },
  sohbetYuklemeHatasi:{ tr: "Sohbetler yüklenemedi.",     en: "Conversations could not be loaded." },
  yenidenDene:        { tr: "Yeniden dene",              en: "Try again" },
  sohbetBassiz:       { tr: "Sohbet",                  en: "Chat" },
  bugun:              { tr: "Bugün",                    en: "Today" },
  dun:                { tr: "Dün",                      en: "Yesterday" },
  yenidenAdlandir:    { tr: "Yeniden Adlandır",         en: "Rename" },
  baslikPh:           { tr: "Sohbet başlığı...",        en: "Conversation title..." },
  baslikBos:          { tr: "Başlık boş bırakılamaz.", en: "Title cannot be empty." },
  sabitle:            { tr: "Sabitle",                   en: "Pin" },
  sabitlemeKaldir:    { tr: "Sabitlemeyi Kaldır",        en: "Unpin" },
  sohbetiSil:         { tr: "Sohbeti Sil",              en: "Delete Chat" },
  silOnayMesaj:       { tr: "Bu sohbet kalıcı olarak silinecek.",  en: "This chat will be permanently deleted." },
  sil:                { tr: "Sil",                      en: "Delete" },

  // ── Topluluk ──
  cevrimici:          { tr: "{n} çevrimiçi",            en: "{n} online" },
  mesajYok:           { tr: "Henüz mesaj yok. İlk mesajı sen gönder!", en: "No messages yet. Be the first to send one!" },
  mesajYaz:           { tr: "Mesajınızı yazın...",      en: "Type your message..." },

  // ── İletişim ──
  bizeUlasin:         { tr: "Bize ulaşın",              en: "Get in touch" },
  iletisimBilgileri:  { tr: "İletişim Bilgileri",       en: "Contact Information" },
  isimEtiket:         { tr: "İSİM",                     en: "NAME" },
  telefonEtiket:      { tr: "TELEFON",                  en: "PHONE" },
  whatsappEtiket:     { tr: "WHATSAPP",                 en: "WHATSAPP" },
  epostaEtiket:       { tr: "E-POSTA",                  en: "EMAIL" },
  youtubeEtiket:      { tr: "YOUTUBE",                  en: "YOUTUBE" },
  instagramEtiket:    { tr: "INSTAGRAM",                en: "INSTAGRAM" },
  whatsappYaz:        { tr: "WhatsApp ile yaz",         en: "Message on WhatsApp" },

  // ── Seans ──
  seansAciklama:      { tr: "Seans ve eğitim talepleriniz için aşağıdaki form üzerinden bana ulaşabilirsiniz. En kısa sürede dönüş sağlayacağım.", en: "You can reach me through the form below for session and training requests. I will get back to you as soon as possible." },
  seansFormBaslik:    { tr: "Randevu / Seans ve Eğitim Talebi", en: "Session / Training Appointment Request" },
  adSoyadLabel:       { tr: "Adınız Soyadınız",         en: "Full Name" },
  adSoyadPh:          { tr: "Adınız Soyadınız",         en: "Full Name" },
  telefonLabel:       { tr: "Telefon",                  en: "Phone" },
  telefonPh:          { tr: "0500 000 00 00",            en: "0500 000 00 00" },
  epostaLabel:        { tr: "E-posta",                  en: "Email" },
  epostaPh:           { tr: "ornek@mail.com",            en: "example@mail.com" },
  tarihSecimi:        { tr: "Tarih Seçimi",              en: "Date Selection" },
  tarihSecPh:         { tr: "Tarih seçin",              en: "Select a date" },
  mesajiniz:          { tr: "Mesajınız",                 en: "Your Message" },
  mesajPh:            { tr: "Seans veya eğitim hakkında kısa bir not bırakın...", en: "Leave a brief note about the session or training..." },
  formuGonder:        { tr: "Formu Gönder",             en: "Send Form" },
  aciliyor:           { tr: "Açılıyor...",              en: "Opening..." },
  eksikBilgi:         { tr: "Eksik Bilgi",              en: "Missing Information" },
  adSoyadZorunlu:     { tr: "Adınız Soyadınız zorunludur.", en: "Full name is required." },
  mesajZorunlu:       { tr: "Mesaj alanı zorunludur.",  en: "Message field is required." },
  mailAcilamadi:      { tr: "Mail uygulaması açılamadı.", en: "Could not open mail app." },
  tarihSecModal:      { tr: "Tarih Seç",                en: "Select Date" },

  // ── Hesabım ──
  nasılHitapEdelim:   { tr: "SANA NASIL HİTAP EDELİM?", en: "WHAT SHALL WE CALL YOU?" },
  belirlenmedi:       { tr: "Belirlenmedi",             en: "Not set" },
  hesabimIsimPh:      { tr: "Örn: Ahmet, Zeynep...",   en: "E.g. John, Jane..." },
  kaydet:             { tr: "Kaydet",                   en: "Save" },
  ayarlarBaslik:      { tr: "AYARLAR",                  en: "SETTINGS" },
  bilgiBaslik:        { tr: "BİLGİ",                    en: "INFO" },
  uygulamaHakkinda:   { tr: "Uygulama Hakkında",        en: "About App" },
  gizlilik:           { tr: "Gizlilik",                 en: "Privacy" },
  cikisYap:           { tr: "Çıkış Yap",               en: "Sign Out" },
  cikisOnayla:        { tr: "Hesabınızdan çıkmak istediğinize emin misiniz?", en: "Are you sure you want to sign out?" },
  hesabimiSil:        { tr: "Hesabımı Sil",             en: "Delete My Account" },
  hesapSilmeUyari:    { tr: "Bu işlem hesabınızı, sohbetlerinizi, mesajlarınızı, favorilerinizi, notlarınızı ve hafızalarınızı kalıcı olarak siler. İşlem geri alınamaz.", en: "This permanently deletes your account, conversations, messages, favorites, notes, and memories. This action cannot be undone." },
  hesapSilmeDevam:    { tr: "Devam Et",                 en: "Continue" },
  hesapSilmeSonOnay:  { tr: "Hesabınızı ve size ait tüm verileri kalıcı olarak silmek istediğinize kesinlikle emin misiniz?", en: "Are you absolutely sure you want to permanently delete your account and all of your data?" },
  hesapSiliniyor:     { tr: "Hesap siliniyor...",        en: "Deleting account..." },
  hafizalarim:        { tr: "Hafızalarım",              en: "My Memories" },
  hafizaAciklama:     { tr: "BBA'nın sizi tanımak için hatırladığı aktif bilgileri buradan yönetebilirsiniz.", en: "Manage the active information BBA remembers about you." },
  hafizaTakmaAd:      { tr: "Hitap adı",                en: "Preferred name" },
  hafizaTercih:       { tr: "Tercih",                   en: "Preference" },
  hafizaOnemliBilgi:  { tr: "Önemli bilgi",             en: "Important information" },
  hafizaDuzenle:      { tr: "Hafızayı Düzenle",          en: "Edit Memory" },
  duzenle:            { tr: "Düzenle",                  en: "Edit" },
  hafizaKaldir:       { tr: "Hafızadan Kaldır",          en: "Remove from Memory" },
  hafizaKaldirOnay:   { tr: "Bu bilgi silinmeyecek, pasif duruma alınacak.", en: "This information will be deactivated, not permanently deleted." },
  hafizaBos:          { tr: "Henüz aktif hafıza bulunmuyor.", en: "There are no active memories yet." },
  hafizaYuklemeHatasi:{ tr: "Hafızalar yüklenemedi.",     en: "Memories could not be loaded." },
  hafizaDuzenlemeHatasi:{ tr: "Hafıza düzenlenemedi.",    en: "Memory could not be updated." },
  hafizaSilmeHatasi:  { tr: "Hafıza pasifleştirilemedi.", en: "Memory could not be deactivated." },
  yukleniyor:         { tr: "Yükleniyor...",             en: "Loading..." },
  geri:               { tr: "Geri",                     en: "Back" },
  hafizaKullanimi:    { tr: "Hafıza kullanımı",          en: "Memory usage" },
  hafizaKullanimiAciklama:{ tr: "Kapattığınızda hafızalar cevaplarda kullanılmaz ve yeni hafıza oluşturulmaz.", en: "When disabled, memories are not used in answers and no new memories are created." },

  // ── Uygulama Hakkında ──
  uygulamaAdiKisa:    { tr: "BBA",                                    en: "BBA" },
  uygulamaSurumu:     { tr: "Sürüm 1.0.0",                           en: "Version 1.0.0" },
  uygulamaAciklama:   { tr: "Birleşik Bilinç Alanı, bireylerin kendi iç dünyalarını keşfetmelerine ve kolektif bilinçle bağlantı kurmalarına yardımcı olan bütünleşik bir platform.", en: "Unified Consciousness Field is an integrative platform that helps individuals explore their inner worlds and connect with collective consciousness." },
  gelistirici:        { tr: "Geliştirici",                            en: "Developer" },
  gelistiriciAdi:     { tr: "Murat Cansu Fırat",                     en: "Murat Cansu Fırat" },
  telif:              { tr: "© 2025 Birleşik Bilinç Alanı.\nTüm hakları saklıdır.", en: "© 2025 Unified Consciousness Field.\nAll rights reserved." },

  // ── Gizlilik ──
  gizlilikMetin:      { tr: "Kişisel verileriniz yalnızca uygulama deneyiminizi iyileştirmek amacıyla kullanılır. Verileriniz üçüncü taraflarla paylaşılmaz ve satılmaz.\n\nUygulama, kimliğinizi doğrulamak için e-posta adresinizi ve profil adınızı güvenli biçimde saklar.\n\nHerhangi bir sorunuz için birlesikbilincalani@gmail.com adresine ulaşabilirsiniz.", en: "Your personal data is used solely to improve your app experience. Your data is never shared with or sold to third parties.\n\nThe app securely stores your email address and display name for authentication purposes.\n\nFor any questions, please contact us at birlesikbilincalani@gmail.com." },
} as const;

export type StrKey = keyof typeof S;

export const ARR = {
  aylar: {
    tr: ["Ocak","Şubat","Mart","Nisan","Mayıs","Haziran","Temmuz","Ağustos","Eylül","Ekim","Kasım","Aralık"],
    en: ["January","February","March","April","May","June","July","August","September","October","November","December"],
  },
  gunlerKisa: {
    tr: ["Pzt","Sal","Çar","Per","Cum","Cmt","Paz"],
    en: ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"],
  },
} as const;

export function translate(key: StrKey, dil: Dil, vars?: Record<string, string>): string {
  let str: string = S[key][dil];
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      str = str.replace(`{${k}}`, v);
    }
  }
  return str;
}
