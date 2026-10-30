---
title: Pesan dan grup
group: Sistem
order: 4
desc: Jenis percakapan, fitur pesan, dan aturan grup.
---
## Jenis percakapan

| Jenis | Keterangan |
| --- | --- |
| DM | Percakapan dua orang |
| Grup | Banyak anggota, punya deskripsi, rules, dan link undangan |
| Komunitas | Ruang publik "Komunitas Kevsoft", semua pengguna otomatis masuk (kecuali sedang dikeluarkan) |
| Kev-Ai | Satu chat AI pribadi per pengguna |

## Fitur pesan

- **Balasan**: mengutip pesan sebelumnya.
- **Mention**: `@username` membuat tag dan menandai orangnya. Di grup, `@kev-ai` memanggil asisten.
- **Sematkan**: pesan penting bisa disematkan di atas percakapan.
- **Media dan polling**: gambar, berkas, dan jajak pendapat.
- **Hapus**: pesan bisa dihapus, ditandai di database.
- **Pesan sementara**: durasi diatur per percakapan. Pesan yang melewati waktunya dihapus dari server.
- **Batas panjang**: 4000 karakter per pesan.

## Grup

- Pembuat grup menjadi **owner** grup.
- **Link undangan** berisi kode acak. Reset dari info grup membuat kode baru dan kode lama berhenti berlaku.
- **Rules grup** ditulis admin dan bisa dibaca anggota lewat menu titik tiga di pojok kanan atas grup.
- Anggota yang dikeluarkan dicatat, sehingga tidak bisa langsung masuk lagi lewat link yang sama.

## Penanda terbaca

Setiap anggota punya `last_read_at` per percakapan. Karena disimpan di server, jumlah pesan belum dibaca konsisten di semua perangkatmu.
