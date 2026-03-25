# Printra Kurulum Rehberi

Bu proje, müşteri sahipli altyapı modeliyle teslim edilmek üzere hazırlanmıştır.

## Teslim Mantığı
- Kod içinde Neon, Cloudflare R2, mail ve ödeme entegrasyon bağlantı noktaları hazırdır.
- Geliştirme sırasında gerçek müşteri hesapları projeye gömülmez.
- Ürünü alan müşteri kendi servis hesaplarını açar.
- Gerekli bilgiler `.env` veya ileride açılacak panel alanları üzerinden girilir.
- Canlı aktivasyon ve son testler müşteri altyapısı üzerinde yapılır.

## İlk Kurulum
1. `apps/api/.env.example` dosyasını kopyalayıp `apps/api/.env` oluştur.
2. `apps/web/.env.example` dosyasını kopyalayıp `apps/web/.env.local` oluştur.
3. `DATABASE_URL` alanına müşteri Neon bağlantısını gir.
4. `R2_*` alanlarına müşteri Cloudflare R2 bilgilerini gir.
5. `pnpm install`
6. `pnpm dev:api`
7. `pnpm dev:web`
8. `POST /setup/bootstrap-database`
9. `POST /setup/bootstrap-organization`
10. `GET /storage/foundation`
11. `GET /storage/sections?organizationId=...&kind=mockup`
12. `GET /storage/assets?organizationId=...&type=mockup`

## Library / Storage Yönetim Özeti
- Library sayfası artık gerçek storage backend endpoint'lerine bağlıdır.
- Mockup ve design section kayıtları PostgreSQL'de tutulur.
- Asset listesi gerçek `assets` ve `asset_variants` tablolarından okunur.
- Duplicate ve delete işlemleri API üzerinden yapılır.
- Canlı upload için müşteri kendi R2 hesabını bağlar; bağlanmadan önce sistem güvenli biçimde integration-ready modda kalır.

## Önemli Not
`R2_*` alanları placeholder veya boş bırakılırsa API crash vermez. Storage health bu durumda sistemi `integration-ready` olarak gösterir. Bu bilinçli davranıştır; amaç canlı müşteri hesabı bağlanana kadar projeyi güvenli şekilde ayakta tutmaktır.


## Create a List AI Modu
- `OPENAI_API_KEY` girilirse Create a List bölümü AI-assisted moda geçer.
- `OPENAI_MODEL` alanı ile model seçimi yapılabilir.
- Anahtar girilmezse sistem rule-based modda çalışmaya devam eder.
- AI çıktısı her durumda title / description / keyword kuralları ve SEO-GEO-AEO skor motoru tarafından yeniden denetlenir.
