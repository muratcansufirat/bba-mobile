# BBA Sunucu Taşıma Kapanış Raporu

**Rapor tarihi:** 29 Ağustos 2026  
**Kaynak dal:** `main`  
**Doğrulanan kaynak commit:** `e1ba3f87ee67c9d8b4e832d86d79994a46ed24de`  
**Commit açıklaması:** `fix: align EAS builds with pnpm Node requirement`

## 1. Sonuç

API ve yönetim panelinin production dağıtımları çalışır durumdadır. Railway API dış internetten erişilebilir, sağlık kontrolü `200 OK` döndürmektedir. Mobil istemci preview ve production profillerinde Railway HTTPS adresini kullanacak biçimde ayrılmıştır. CORS, JWT, RLS, kullanıcı izolasyonu, admin yetkileri ve production secret taramaları tamamlanmıştır.

Sunucu taşıma teknik olarak tamamlanmıştır. Bununla birlikte Railway hesabı hâlen süreli deneme kapsamındadır; deneme sona ermeden barındırma planı hakkında kullanıcı kararı gerekecektir.

## 2. Çalışan servisler ve adresleri

| Servis | Durum | Production adresi / açıklama |
| --- | --- | --- |
| Railway API (`bba-mobile`) | Online | `https://bba-mobile-production.up.railway.app` |
| API sağlık kontrolü | `200 OK` | `https://bba-mobile-production.up.railway.app/api/healthz` |
| Yönetim paneli | Çalışıyor | `https://bba-yonetim-paneli.pages.dev` |
| Supabase | Kullanımda | Authentication, PostgreSQL, Storage ve RLS altyapısı |
| GitHub | Güncel | `muratcansufirat/bba-mobile`, otomatik dağıtım dalı `main` |
| Mobil API production profili | Yapılandırıldı | Railway HTTPS API adresi |

Railway servisi US West bölgesinde, tek replica ve Node.js `24.19.0` ile çalışmaktadır.

## 3. Dağıtılan kaynak sürümleri

- Yerel `main` ve GitHub `main`: `e1ba3f87ee67c9d8b4e832d86d79994a46ed24de`.
- Railway aktif dağıtımı aynı commit başlığını göstermektedir: `fix: align EAS builds with pnpm Node requirement`.
- Railway deployment kimliği: `9f401c02-e698-4eee-8465-dc1693f8c565`.
- Cloudflare Pages yönetim paneli Wrangler üzerinden dağıtılmıştır. Doğrudan yükleme akışı Git commit kimliğini Railway kadar açık göstermediğinden, yeniden üretilebilir kaynak referansı GitHub `main` commitidir.

## 4. Kota ve tüketim

29 Ağustos 2026 tarihinde Railway ekranında görülen durum:

- Hesap durumu: süreli deneme.
- Kalan süre/kredi: **4 gün veya 4,72 USD**.
- Son haftadaki mevcut proje kullanımı: **0,29 USD**.
- Railway tahmini kullanım: **0,29 USD**.
- Dağılım: bellek **0,29 USD**, CPU **0,00 USD**, ağ **0,00 USD**, volume **0,00 USD**.
- Herhangi bir ücretli plana otomatik geçiş yapılmamıştır.

Bu değerler anlık olup trafik ve OpenAI kullanımına göre değişebilir. Deneme bittiğinde servis devamlılığı garanti değildir.

## 5. Güvenlik doğrulaması

- Mobil preview APK ve yönetim paneli production paketi tarandı; secret sızıntısı bulunmadı.
- Railway loglarında API anahtarı, veritabanı URL'si, service-role anahtarı veya JWT sızıntısı bulunmadı.
- Railway environment değerleri maskeli görünmektedir.
- İzinli yönetim paneli origin'i CORS kontrolünden geçmektedir; izinsiz origin reddedilmektedir.
- Eksik ve geçersiz JWT istekleri `401` döndürmektedir.
- Askıya alınmış, silinmiş veya geçerli profili bulunmayan kullanıcı erişimi `403` ile reddedilmektedir.
- Kullanıcı izolasyonu ve RLS kontrolleri 49/49 başarılıdır.
- İptal edilmiş/uygunsuz erişim kontrolleri 6/6 başarılıdır.
- Admin endpointleri kimlik doğrulaması olmadan erişilememektedir.
- Git geçmişindeki eski `.env` kayıtları boş dosyalardır; secret içermemektedir.

## 6. Bilinen riskler

1. **Railway deneme süresi:** Dört gün içinde deneme sona erebilir ve API durabilir. Kullanıcının açık onayı olmadan ücretli plan seçilmeyecektir.
2. **`image-size` bağımlılığı:** Expo/Metro derleme zincirindeki `image-size 1.2.1` için iki yüksek seviyeli DoS uyarısı vardır. Düzeltme `2.0.3` olarak belirtilmiş ancak bu sürüm henüz npm'de yayımlanmamıştır. Açık production API çalışma zamanında değil, mobil derleme aracındadır.
3. **Cloudflare commit izlenebilirliği:** Wrangler doğrudan yükleme nedeniyle panel dağıtımının commit kimliği sağlayıcı arayüzünde kesin bağlı değildir.
4. **Tek Railway replica:** Bölgesel kesinti veya servis yeniden başlatmasında yedek replica yoktur.
5. **Özel alan adı tamamlanmadı:** API Railway, panel `pages.dev` alanında çalışmaktadır. `birlesikbilincalani.com` için production DNS/SSL geçişi ayrıca yapılmalıdır.
6. **Apple hesabı güvenliği:** Daha önce sohbet içinde paylaşılan Apple parolası değiştirilmelidir.

## 7. İzleme yöntemi

- Railway Observability: CPU, bellek, ağ, hata logları ve proje maliyeti.
- Railway deployment history: başarısız dağıtım ve yeniden başlatmalar.
- Sağlık kontrolü: düzenli `GET /api/healthz`; beklenen cevap `200` ve `{"status":"ok"}`.
- Railway log araması: hata seviyesi, timeout, yeniden başlatma ve olası secret kalıpları.
- Supabase: Authentication, Database, Storage ve API logları; RLS hata ve reddetmeleri.
- Günlük Railway yeterlilik izlemesi: kullanım/kredi ve servis devamlılığı kontrolü.
- Yayın sonrası mobil hata takibi için mağaza crash raporları; ileride gerekirse Sentry benzeri merkezi hata izleme.

## 8. Geri dönüş planı

1. Sağlık kontrolü, giriş veya temel RAG akışı bozulursa yeni mobil yayın durdurulur.
2. Railway Deployment History üzerinden son başarılı deployment yeniden etkinleştirilir.
3. Kod kaynaklı sorunda hatalı commit güvenli bir `git revert` commit'iyle geri alınır ve `main` dalına gönderilir.
4. Yönetim panelinde Cloudflare Pages'in önceki başarılı deployment sürümüne rollback yapılır.
5. Environment değişkenleri silinmez veya sohbet/commit içine taşınmaz; gerekirse yalnızca önceki doğrulanmış değerler Railway üzerinden geri yüklenir.
6. Veritabanı şema değişikliği varsa önce Supabase yedeği doğrulanır; veri kaybı riski olan migration otomatik geri alınmaz.
7. Rollback sonrasında health, JWT, admin girişi, RAG, kaynak kartları ve ses akışı yeniden test edilir.

## 9. Kalan manuel işlemler

- Railway deneme süresi bitmeden ücretsiz/ücretli devam kararını vermek. Ücretli işlem için ayrıca açık kullanıcı onayı gerekir.
- `birlesikbilincalani.com` alan adının API ve/veya yönetim paneli alt alan adlarını belirlemek; ardından DNS, SSL ve CORS güncellemek.
- Apple hesabı parolasını değiştirmek ve açık oturumları kontrol etmek.
- Apple Developer Program üyeliğini, iOS bağımsız build/TestFlight aşamasına geçileceği zaman etkinleştirmek.
- Google Play Console kimlik, ödeme ve geliştirici doğrulamalarını tamamlamak.
- `image-size >=2.0.3` yayımlandığında bağımlılığı güncelleyip production audit'i tekrarlamak.
- Cloudflare Pages'i mümkünse GitHub bağlantılı deployment akışına geçirmek ve commit izlenebilirliğini güçlendirmek.
- `artifacts/mobile/app.json` içindeki bekleyen iOS encryption ve Android ses izni değişikliklerini doğrulayıp ayrı commit olarak göndermek.

## 10. App Store ve Play Store geçiş hazırlığı

### Ortak hazırlıklar

- Production API adresi hazırdır.
- Mobil development, preview ve production ortamları ayrılmıştır.
- Bundle/package kimliği `com.muratcansufirat.bba` olarak tanımlıdır.
- Uygulama ikonu, splash, sürüm, build numarası ve gizlilik metinleri son kontrolden geçirilecektir.
- Mağaza açıklaması, ekran görüntüleri, destek URL'si, gizlilik politikası ve hesap silme açıklaması hazırlanacaktır.
- Mikrofon, kullanıcı içeriği, kimlik doğrulama ve yapay zekâ/veri işleme beyanları mağaza formlarına doğru girilecektir.

### iOS / App Store

- Apple Developer Program ücretli üyeliği gereklidir; şu anda tamamlanmamıştır.
- Üyelik sonrasında EAS iOS credentials, bağımsız preview build, TestFlight ve App Store Connect kayıtları hazırlanacaktır.
- Sign in with Apple gerekliliği, Google girişinin sunulduğu iOS sürümü için ayrıca değerlendirilmelidir.
- `ITSAppUsesNonExemptEncryption=false` ayarı commit edilmeden önce doğrulanacaktır.

### Android / Play Store

- Android bağımsız preview/AAB build alınacaktır.
- Play App Signing, internal testing ve production release kanalları hazırlanacaktır.
- Data Safety, içerik derecelendirme, reklam beyanı, hesap silme ve mikrofon izni açıklamaları doldurulacaktır.
- `RECORD_AUDIO` ve `MODIFY_AUDIO_SETTINGS` izinlerinin yalnızca ses özellikleri için kullanıldığı doğrulanacaktır.

## 11. Kapanış kararı

Sunucu taşıma listesi tamamlanmıştır. API ve yönetim paneli production ortamında çalışmaktadır ve temel güvenlik kontrolleri geçmiştir. Mağaza yayın sürecine geçilebilir; ancak Railway deneme süresinin sona ermesi servis sürekliliği açısından takip edilmesi gereken en yakın tarihli karardır.
