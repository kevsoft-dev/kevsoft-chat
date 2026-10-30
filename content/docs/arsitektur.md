---
title: Arsitektur sistem
group: Sistem
order: 3
desc: Strategi di balik kevsoft-chat: komponen, alur pesan, dan keputusan desain.
---
Halaman ini menjelaskan *kenapa* sistemnya disusun seperti ini, bukan hanya apa saja isinya.

## Komponen

| Lapisan | Dipakai untuk |
| --- | --- |
| Next.js (App Router) | Halaman, route API, dan middleware |
| Postgres (Neon) | Pengguna, percakapan, pesan, perangkat, API key, batas permintaan |
| Pusher | Memberi tahu perangkat lain bahwa ada pesan baru |
| Firebase Realtime Database | Berita dan Kritik & Saran (terpisah dari Postgres, hanya diakses dari server) |
| Email (OTP) dan Google | Cara membuktikan kepemilikan email saat daftar atau reset |

## Alur sebuah pesan

1. Klien mengirim pesan ke server. Identitas pengirim **selalu** diambil dari cookie sesi yang ditandatangani, tidak pernah dari isi permintaan.
2. Server memeriksa: sesi valid, akun tidak diblokir, perangkat belum dikeluarkan, pengirim memang anggota percakapan, dan pesan tidak lebih dari 4000 karakter.
3. Pesan disimpan di tabel `messages`. Inilah sumber kebenaran: perangkat mana pun yang membuka percakapan membaca dari sini.
4. Server memberi sinyal lewat Pusher. Perangkat lain memuat pesan baru.
5. Penanda terbaca disimpan per anggota (`last_read_at`), sehingga status baca ikut ke perangkat mana pun.

## Keputusan desain

**Satu sumber kebenaran di server.** Pesan tidak hidup di satu ponsel. Itu sebabnya login dari perangkat baru langsung melihat riwayat, dan kenapa pesan sementara bisa hilang di semua perangkat sekaligus.

**Sesi per perangkat.** Setiap login membuat satu baris di tabel `devices`, dan id-nya ikut di dalam token. Mengeluarkan satu perangkat berarti menandai barisnya dicabut. Token lain tidak terganggu. "Keluar dari semua perangkat" memakai cara berbeda: menaikkan `token_version` akun.

**Tautan perangkat dengan kode, bukan password.** Perangkat baru meminta kode, perangkat lama menyetujuinya. Password tidak pernah diketik di perangkat yang tidak kamu percaya. Lihat [Perangkat tertaut](/docs/perangkat-tertaut).

**Batas di database.** Pembatasan permintaan memakai tabel `rate_limits` dengan satu query atomik per pengecekan, jadi tetap benar saat server berjalan di banyak instance serverless.

**API terpisah dari sesi.** API publik memakai key, bukan cookie. Key hanya bisa dibuat oleh akun yang bergabung ke developer mode, dan hanya hash-nya yang disimpan.

## Perbandingan dengan aplikasi chat besar

| Hal | kevsoft-chat | Aplikasi seperti WhatsApp |
| --- | --- | --- |
| Identitas | Username dan email | Nomor telepon |
| Perangkat tambahan | Kode tautan, maksimal 4 | Kode atau QR, beberapa perangkat |
| Penyimpanan pesan | Di server | Di perangkat, cadangan terpisah |
| Enkripsi end-to-end | **Belum ada** | Ada |
| Pesan sementara | Ada, per percakapan | Ada |
| Undangan grup | Link berkode acak, bisa direset | Link undangan |

> [!WARNING]
> Pesan di kevsoft-chat **tidak** terenkripsi end-to-end. Koneksi dilindungi HTTPS, tetapi pesan tersimpan di server agar bisa muncul di semua perangkat. Jangan kirim rahasia yang tidak boleh dibaca pengelola server.
