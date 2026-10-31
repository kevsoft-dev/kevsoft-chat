---
title: Catatan perubahan
group: Lainnya
order: 14
desc: Apa yang baru di tiap versi.
---
## v38

- **Reaksi emoji ala WhatsApp**: tekan lama pesan atau klik kanan untuk membuka bar reaksi (👍 ❤️ 😂 😮 😢 🙏) dan tombol **+** untuk emoji lengkap. Di desktop ada tombol senyum di samping gelembung.
- Reaksi tampil sebagai chip di bawah gelembung dengan jumlahnya. Ketuk chip untuk melihat siapa saja yang bereaksi, dengan tab per emoji.
- Satu reaksi per orang per pesan. Memilih emoji lain menggantikan, memilih yang sama mencabut.
- Tampil langsung di layar, sinkron realtime ke semua anggota, dan ikut ter-load saat membuka ulang chat.
- Tabel baru `message_reactions` dibuat otomatis saat server pertama berjalan (atau jalankan `npm run db:setup`).

## v35

- **Geser untuk membalas**: di HP, geser pesan ke kanan lalu lepas untuk membalas. Ikon balas muncul, membal dan bergetar singkat saat sudah cukup jauh, lalu pesan kembali dengan gerakan lembut.
- Kolom "Membalas ..." di atas kolom ketik muncul dengan animasi pop tiap target balasan berganti.

## v34

- **Halaman per chat**: `/chat` (daftar), `/chat/dm/{username}` (chat pribadi), `/chat/grup/{id}` (grup dan Komunitas), `/chat/ai` (Kev-Ai). `/chat/dm` dan `/chat/grup` membuka daftar dengan tab Pribadi atau Grup.
- Tombol Kembali di HP (dan geser dari tepi layar) kembali dari chat ke daftar. Tautan bisa dibagikan dan tetap benar saat halaman dimuat ulang.
- Sudah login, membuka `/` langsung masuk ke chat, tidak lagi ke beranda.
- Tautan lama `/chat?open=`, `/chat?dm=`, `/dm/{username}`, `/g/{handle}`, dan `/join/{kode}` otomatis diteruskan ke alamat baru.
- Tampilan HP: area sentuh lebih nyaman, tab bisa digeser, kolom ketik tidak tertutup keyboard di iPhone, dan layar landscape lebih rapat.

## v32

- **Perangkat tertaut**: masuk di perangkat baru dengan kode 8 karakter, daftar perangkat, dan keluarkan per perangkat.
- **Developer mode** dan **API key** per akun, batas 300 permintaan per menit.
- Endpoint baru `GET /api/v1/me`.
- **Pengaturan** lengkap dengan 8 halaman: Profil, Akun, Obrolan, Pesan otomatis, Perangkat tertaut, Developer, Bantuan, Tentang.
- Dokumentasi baru bergaya GitHub dengan banyak halaman, pencarian, dan daftar isi.

## v31

- Beranda `/home` interaktif: dock aplikasi, jendela yang bisa digeser, kamus kecil, dan FAQ.

## v30

- Tema terpadu untuk seluruh aplikasi.
