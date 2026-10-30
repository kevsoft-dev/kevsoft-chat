---
title: Autentikasi dan developer mode
group: API
order: 7
desc: Cara mendapatkan dan memakai API key.
---
API kevsoft memakai **API key**. Key hanya bisa dibuat oleh akun yang sudah bergabung ke **developer mode**.

## Bergabung ke developer mode

1. Buka **Pengaturan > Developer**.
2. Baca ketentuannya, centang persetujuan, lalu pilih **Gabung developer mode**.
3. Buat key dengan memberi nama, misalnya `bot berita`.

Kamu bisa punya maksimal **5 key aktif**. Key lengkap hanya muncul satu kali saat dibuat.

## Mengirim key

Lewat header (disarankan):

~~~http
GET /api/v1/news HTTP/1.1
x-api-key: kc_live_KUNCI_KAMU
~~~

Atau lewat `Authorization`:

~~~http
Authorization: Bearer kc_live_KUNCI_KAMU
~~~

> [!WARNING]
> Jangan menaruh key di JavaScript yang berjalan di browser pengunjung, di repo publik, atau di tangkapan layar. Panggil API dari server milikmu.

## Mencabut key

Di **Pengaturan > Developer**, ketuk **Cabut** pada key. Aplikasi yang memakainya langsung mendapat `401`. **Keluar dari developer mode** mencabut semua key sekaligus.

## Key dari config server

Pemilik server juga bisa mengisi `api.keys` di `config.json` untuk key internal. Key itu dibatasi 120 permintaan per menit dan tidak bisa memanggil `/api/v1/me`. Mengisi `api.public: true` membuka API tanpa key (hanya baca, 120 per menit per IP). Secara bawaan API **membutuhkan key**.

## Akun API

`GET /api/v1/me` menampilkan pemilik key dan batasnya. Lihat [Akun API](/docs/ref-akun).
