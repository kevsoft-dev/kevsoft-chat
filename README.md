# Obrolan, web chat ala WhatsApp (Next.js + Firebase Auth + Neon + Pusher)


## Fitur kevsoft-chat
- **Username** wajib dipilih setelah login pertama (tidak bisa diganti).
- **Komunitas Kevsoft**: chat publik, semua user otomatis masuk.
- **Chat pribadi & grup** ala WhatsApp, nama pengirim (username) tampil di grup.
- **Tag `@username`**: ketik `@` untuk memunculkan daftar anggota, yang ditag disorot.
- **Kev-Ai**: chat paling atas, atau panggil di mana saja dengan `@kev-ai pertanyaanmu` (endpoint `https://kev-ai.vercel.app/ai?text=`).
- Balas pesan (reply), penanda belum dibaca dan badge `@`, info grup/anggota.

## 1. Install
```bash
npm install
cp config.example.json config.json   # lalu isi semua nilainya (config.json sudah berisi database Neon)
```

## 2. Neon
Database sudah dikonfigurasi di `config.json`. Jalankan `npm run db:setup` untuk membuat semua tabel (atau tempel `schema.sql` di SQL Editor Neon).

## 3. Firebase (login)
- Konfigurasi web Firebase sudah ada di `config.json` (`firebase`).
- Firebase Console → Authentication → Sign-in method → aktifkan **Google**.
- Authentication → Settings → **Authorized domains** → tambahkan domain deploy (mis. `kevsoft-chat.vercel.app`).
- Login email memakai OTP 6 digit lewat API email; email yang sama di OTP dan Google = satu akun.
- Sesi disimpan di cookie httpOnly yang ditandatangani server (`otpSecret`).

## 4. Pusher (realtime)
Buat app di pusher.com Channels, isi `pusher.appId`, `pusher.secret`, `pusher.key`, `pusher.cluster`.

## 5. OTP
Isi `otpSecret` dengan string acak panjang (`openssl rand -hex 32`). Email OTP dikirim server lewat `https://api-email-otp-lovat.vercel.app/api/send` dengan field `to`, `app`, `otp`, `logo` (ubah nama app dan logo di `app/api/auth/otp/send/route.ts`).

## 6. Jalankan / deploy
```bash
npm run dev          # http://localhost:3000
```
Deploy ke Vercel: import repo, sertakan `config.json` (file ini di-gitignore, jadi tambahkan lewat deploy langsung/CLI atau hapus dari .gitignore untuk repo privat).

## Keamanan yang sudah ada
- Semua route dilindungi middleware sesi; `userId` selalu dari cookie sesi server.
- Setiap query pesan memeriksa keanggotaan percakapan.
- Query Neon parameterized, input divalidasi Zod, pesan dirender sebagai teks (anti-XSS).
- OTP: di-hash (HMAC), berlaku 5 menit, maks 5 percobaan, sekali pakai, perbandingan constant-time, jeda kirim ulang 60 detik.
- Channel Pusher private: user hanya bisa subscribe ke channel miliknya.
- Header keamanan (HSTS, X-Frame-Options, dll.) di `next.config.mjs`.

## Langkah lanjutan yang disarankan
- Rate limit per IP (mis. Upstash Ratelimit) di endpoint OTP dan kirim pesan.
- Content-Security-Policy (perlu disesuaikan dengan domain Firebase dan Pusher).
- Status dibaca/centang, indikator mengetik, grup, kirim gambar (storage + signed URL).
- E2EE (Web Crypto / libsodium) jika dibutuhkan; saat ini pesan terenkripsi TLS dan at-rest di Neon, tetapi tidak E2EE.
