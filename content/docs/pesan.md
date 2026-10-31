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
- **Reaksi emoji**: tekan lama pesan (HP) atau klik kanan / tombol senyum di samping gelembung (desktop), lalu pilih emoji. Tombol **+** membuka pilihan emoji lengkap. Satu orang punya satu reaksi per pesan: memilih emoji lain menggantikan yang lama, memilih emoji yang sama mencabutnya. Ketuk reaksi di bawah gelembung untuk melihat siapa saja yang bereaksi.
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

## Reaksi lewat API

Reaksi dikirim dengan `PATCH /api/messages`:

```json
{ "id": "<id pesan>", "action": "react", "emoji": "👍" }
```

Kirim `"emoji": null` untuk mencabut reaksi. Emoji harus tepat satu karakter emoji. Batasnya 60 reaksi per menit per akun, dan akun yang sedang dibisukan tidak bisa bereaksi. Perubahan dikirim ke semua anggota lewat event realtime `reaction`, tanpa memicu suara atau penanda pesan baru.
