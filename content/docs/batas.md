---
title: Batas dan error
group: API
order: 8
desc: Rate limit, kode error, dan pagination.
---
## Batas permintaan

| Jenis akses | Batas |
| --- | --- |
| Key developer | 300 permintaan per menit per key |
| Key config server | 120 permintaan per menit per key |
| Tanpa key (jika `api.public` aktif) | 120 permintaan per menit per IP |

Saat batas terlampaui kamu mendapat `429` dan header `Retry-After` berisi jumlah detik menunggu.

## Kode error

:::errors

Semua error berbentuk:

~~~json
{ "error": "Pesan yang bisa dibaca manusia" }
~~~

## Pagination

Daftar berita memakai cursor. Kirim `next_cursor` dari respons sebelumnya sebagai `before`. Kalau `next_cursor` bernilai `null`, itu halaman terakhir.

## Cache

Respons memakai `Cache-Control: no-store` karena isinya bergantung pada key. Simpan hasil di sisi aplikasimu kalau datanya jarang berubah.
