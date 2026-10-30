---
title: Perangkat tertaut
group: Sistem
order: 5
desc: Cara menautkan perangkat lain tanpa mengetik password di sana.
---
Perangkat tertaut memungkinkan kamu masuk di perangkat baru dengan bantuan perangkat yang sudah login.

## Alur

1. Di **perangkat baru**, buka halaman masuk dan pilih **Tautkan dengan perangkat lain**.
2. Layar menampilkan kode 8 karakter, misalnya `K7QM-4XPD`. Kode berlaku **3 menit**.
3. Di **perangkat lama**, buka **Pengaturan > Perangkat tertaut** dan masukkan kode.
4. Perangkat lama menampilkan nama dan IP perangkat peminta. Periksa, lalu setujui.
5. Perangkat baru yang sedang menunggu menerima sesi dan langsung masuk.

## Kenapa aman

- Kode memakai huruf dan angka yang tidak mudah tertukar (tanpa `0`, `O`, `1`, `I`).
- Perangkat peminta memegang **secret** acak yang tidak ditampilkan. Hanya pemilik secret itu yang bisa mengambil sesi, jadi orang yang sekadar melihat kodenya tidak bisa membajak.
- Sesi hanya dibuat **sekali**. Kode yang sudah dipakai tidak bisa dipakai lagi.
- Permintaan dibatasi per IP, dan persetujuan dibatasi per akun.
- Layar persetujuan menampilkan detail perangkat peminta supaya kamu tidak menyetujui kode dari orang lain.

> [!WARNING]
> Setujui kode **hanya** kalau kamu sendiri yang sedang membuka halaman masuk di perangkat itu. Orang yang meminta kodemu lewat chat kemungkinan besar sedang mencoba mengambil akunmu.

## Batas

| Hal | Nilai |
| --- | --- |
| Masa berlaku kode | 3 menit |
| Perangkat tertaut per akun | 4 |
| Perangkat tersimpan per akun | 20 terbaru |

## Mengeluarkan perangkat

Di **Pengaturan > Perangkat tertaut**, ketuk **Keluarkan** pada perangkat yang tidak dikenal. Perangkat itu langsung kehilangan akses pada permintaan berikutnya. Untuk mengeluarkan semuanya sekaligus, pakai **Keluar dari semua perangkat** di Pengaturan > Akun.

> [!NOTE]
> Login yang dibuat sebelum fitur ini ada tidak punya catatan perangkat. Sesi itu tetap berlaku sampai habis, dan hanya bisa dikeluarkan lewat "Keluar dari semua perangkat".

## Data yang disimpan

Tabel `devices`: nama (misalnya "Chrome di Windows"), platform, IP, waktu dibuat, waktu terakhir aktif, dan waktu dicabut. Tabel `link_requests`: kode, hash secret, status persetujuan, dan waktu kedaluwarsa. Kode lama dibersihkan otomatis.
