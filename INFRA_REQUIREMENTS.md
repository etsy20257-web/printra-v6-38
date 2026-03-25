# Printra Altyapı Gereksinimleri

## Zorunlu Servisler
- Neon PostgreSQL veya PostgreSQL uyumlu veritabanı
- Cloudflare R2 bucket

## İleride Bağlanacak Servisler
- Mail servisi
- Ödeme servisi
- Google Drive connector
- OneDrive connector

## Gerekli Değişkenler
### Veritabanı
- `DATABASE_URL`

### Depolama
- `R2_ACCOUNT_ID`
- `R2_BUCKET`
- `R2_REGION`
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`
- `R2_PUBLIC_BASE_URL` (opsiyonel)

## Teslim Notu
Bu proje geliştirme sırasında gerçek müşteri altyapı bilgileri olmadan da çalışacak şekilde hazırlanmıştır. Gerçek anahtarlar girilmediğinde storage bölümü hata saçmak yerine müşterinin kendi hesaplarını bağlamasını bekleyen entegrasyon hazır modda kalır.
