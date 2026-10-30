---
title: Mulai cepat
group: Mulai
order: 2
desc: Dari daftar sampai memanggil API pertamamu.
---
## Sebagai pengguna

1. **Daftar** dengan email (kode OTP dikirim ke kotak masukmu) atau lewat akun Google.
2. **Lengkapi profil**: nama, username, foto. Username dipakai untuk mencarimu dan men-tag kamu.
3. Kamu otomatis masuk ke **Komunitas Kevsoft** dan punya chat **Kev-Ai** sendiri.
4. Buka **Pengaturan** dari panel profil untuk mengatur tema, pesan otomatis, dan perangkat tertaut.

## Sebagai pengembang

1. Buka **Pengaturan > Developer** dan bergabung ke developer mode.
2. Buat API key. Salin saat muncul, key lengkap tidak ditampilkan lagi.
3. Coba panggilan pertama:

~~~bash
curl -H "x-api-key: kc_live_KUNCI_KAMU" https://domainmu.com/api/v1/me
~~~

4. Ambil data berita:

~~~bash
curl -H "x-api-key: kc_live_KUNCI_KAMU" "https://domainmu.com/api/v1/news?limit=5"
~~~

> [!TIP]
> Kalau jawabannya `401`, cek tiga hal: developer mode masih aktif, key belum dicabut, dan key dikirim lewat header `x-api-key`.
