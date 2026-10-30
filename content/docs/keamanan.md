---
title: Keamanan
group: Sistem
order: 6
desc: Sesi, password, batas permintaan, dan hal yang belum ada.
---
## Sesi

- Login membuat cookie `kc_session`: token JWT (HS256), `httpOnly`, `sameSite=lax`, berlaku 30 hari.
- Token memuat id pengguna, versi sesi (`sv`), dan id perangkat (`did`).
- Di setiap permintaan server memeriksa: tanda tangan, akun tidak diblokir, `sv` masih cocok, dan perangkat belum dicabut.
- Mengganti atau mereset password menaikkan `sv`, sehingga semua token lama langsung mati.

## Perlindungan lain

- **Anti-CSRF**: permintaan yang mengubah data harus berasal dari origin yang sama.
- **Batas permintaan** untuk login, OTP, pembuatan kode tautan, pembuatan key, dan API.
- **Kunci akun** setelah terlalu banyak percobaan login gagal.
- **Blokir akun** oleh staf berlaku langsung dan dicatat di log moderasi.

## API key

- Format `kc_live_` diikuti 32 karakter acak.
- Hanya **hash SHA-256** yang disimpan. Pengelola server pun tidak bisa melihat key lengkapmu.
- Key berhenti berlaku saat dicabut, saat akunmu keluar dari developer mode, atau saat akun diblokir.

## Yang belum ada

- Enkripsi end-to-end.
- Autentikasi dua langkah di luar OTP email.

> [!TIP]
> Temukan celah? Laporkan lewat halaman [Kritik & Saran](/cas) dan jangan menguji pada akun orang lain.
