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
cp config.example.json config.json   # isi databaseUrl, pusher, firebaseDb
```

## 2. Neon
Database sudah dikonfigurasi di `config.json`. Jalankan `npm run db:setup` untuk membuat semua tabel (atau tempel `schema.sql` di SQL Editor Neon).

## 3. Firebase (login)
- Konfigurasi web Firebase sudah ada di `config.json` (`firebase`).
- Firebase Console → Authentication → Sign-in method → aktifkan **Google**.
- Authentication → Settings → **Authorized domains** → tambahkan domain deploy (mis. `kevsoft-chat.vercel.app`).
- Login email memakai OTP 6 digit lewat API email; email yang sama di OTP dan Google = satu akun.
- Sesi disimpan di cookie httpOnly yang ditandatangani server (kunci diturunkan otomatis dari `databaseUrl`, tidak perlu `otpSecret`).

## 4. Pusher (realtime)
Buat app di pusher.com Channels, isi `pusher.appId`, `pusher.secret`, `pusher.key`, `pusher.cluster`.

## 5. OTP
Tidak ada `otpSecret` yang perlu diisi: kunci sesi/OTP diturunkan otomatis dari `databaseUrl`. Email OTP dikirim server lewat `https://api-email-otp-lovat.vercel.app/api/send` dengan field `to`, `app`, `otp`, `logo` (ubah nama app dan logo di `app/api/auth/otp/send/route.ts`).

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

---

## Pembaruan v2: ringan, hapus chat, profil lengkap

**Cepat dan ringan**
- Kirim pesan **optimistik**: pesan langsung muncul (ikon jam), lalu menjadi centang saat server menjawab. Kalau gagal tampil "Gagal, ulangi" (tekan untuk kirim ulang, otomatis dicoba lagi saat online). Kirim ulang aman karena ID dibuat di klien (idempoten).
- Server membalas setelah **1 query** (cek anggota + validasi tag + simpan). Siaran realtime dan Kev-Ai dikerjakan setelah respons terkirim.
- Mengetik tidak me-render ulang daftar pesan (komposer terpisah, baris pesan `memo`). Daftar chat diperbarui lokal dari event Pusher, tidak refetch tiap pesan. Pesan chat yang pernah dibuka di-cache jadi pindah chat langsung tampil.
- Dibuang: lapisan noise layar penuh dan semua `backdrop-filter` (blur) yang berat di HP. Animasi hanya `transform`/`opacity`. Ada saklar **Animasi** di Profil dan otomatis patuh `prefers-reduced-motion`.
- Saran: pastikan region fungsi Vercel sama dengan region database Neon (Project Settings -> Functions -> Region) supaya tiap query tidak menyeberang benua.

**Hapus**
- Pesan: tekan lama (HP) / klik kanan atau panah (desktop) -> *Hapus untuk saya* atau *Hapus untuk semua orang* (hanya pesan sendiri; yang lain melihat "Pesan ini telah dihapus").
- Chat: menu titik tiga di header, tekan lama / klik kanan di daftar chat, atau panel Info -> *Bersihkan chat*, *Hapus chat* (DM; muncul lagi kalau ada pesan baru), *Keluar grup*. Chat Kev-Ai dan Komunitas hanya bisa dibersihkan.

**Profil dan pengaturan** (ketuk foto kamu di kiri atas)
- Ganti/hapus foto profil (dipotong persegi dan dikecilkan di browser, disimpan di Neon dan disajikan lewat `/api/avatar/<id>` dengan cache panjang), edit nama, edit info/bio, salin username, lihat email.
- Tema, suara pesan, Enter untuk kirim, hemat animasi.

**Migrasi database**: otomatis saat halaman pertama dibuka setelah deploy (kolom `deleted_at`, `hidden_by`, `cleared_at`, `hidden_at` dan tabel `user_avatars`). `schema.sql` sudah diperbarui kalau mau menempel manual di Neon.

---

## Pembaruan v3: role, console moderasi, login username + password

**Login**
- Pertama kali: verifikasi lewat **Google** atau **email (OTP)**, lalu wajib memilih **username dan membuat password** (halaman Onboarding).
- Berikutnya: login cukup **username + password** (tab "Masuk"). Password di-hash scrypt + salt; 5x salah = dikunci 10 menit.
- **Lupa password**: di halaman masuk pilih "Lupa password", verifikasi email/Google, lalu buat password baru. Ganti password biasa ada di Profil -> Keamanan.
- Akun lama yang belum punya password otomatis diminta membuatnya saat membuka aplikasi.

**Role**
- `owner` > `admin` > `user`. Owner utama diatur di `config.json` -> `"owners": ["kevsoft.cs@gmail.com"]`; email itu otomatis menjadi owner saat login dan **tidak bisa diubah, di-kick, atau di-ban siapa pun**.
- Owner bisa menambah owner/admin lain (Console -> Pengguna -> "Tambah owner / admin lewat email", atau menu titik tiga di panel anggota grup).
- Owner menindak admin dan user; admin hanya menindak user biasa; owner non-utama tidak bisa menindak owner lain (hanya owner utama).
- Di info grup / Komunitas, semua anggota tampil dengan badge **owner** / **admin**. Staf melihat tombol titik tiga per anggota.

**Console** (ikon perisai di header daftar chat, atau Profil -> Buka Console)
- **Pengguna**: cari, filter (staf/diblokir/dibisukan), **ban/unban** (dengan alasan), **mute** (10 menit - 7 hari), **kick** dari Komunitas / izinkan kembali, ubah role, reset password (owner), tambah staf lewat email (owner).
- **Grup**: lihat semua grup, anggotanya, kick anggota, hapus grup (owner).
- **Log**: semua tindakan moderasi tercatat.
- Admin grup biasa (pembuat grup) juga bisa mengeluarkan anggota biasa dari grupnya. Staf bisa menghapus pesan siapa pun yang role-nya di bawahnya (tekan lama pesan -> Hapus).
- Akun diblokir: sesi langsung dicabut (realtime lewat Pusher), tidak bisa login password/Google/OTP. Status blokir di-cache maksimal 8 detik per instance server.

**Migrasi database**: otomatis saat halaman pertama dibuka (kolom `role`, `password_hash`, `banned_at`, `ban_reason`, `muted_until`, `login_fails`, `locked_until`, `disappear_seconds`, `expires_at`; tabel `conversation_kicks`, `mod_logs`). `schema.sql` juga sudah diperbarui.

---

## Pembaruan v4: pesan sementara, reset data owner, profil stabil

**Profil tidak hilang**
- Panel Profil dipindah ke overlay fixed (bukan di dalam sidebar), jadi di HP tetap tampil penuh meskipun chat sedang terbuka.

**Pesan sementara (disappearing)**
- Di Info chat (bukan chat AI): pilih timer **Mati / 24 jam / 7 hari / 90 hari**.
- Pesan baru di chat itu otomatis dapat `expires_at`; pesan kedaluwarsa tidak ditampilkan lagi.
- DM: siapa pun anggota bisa ubah. Grup/Komunitas: admin grup atau staf.
- Subtitle chat menampilkan ikon ⏱ + durasi jika aktif.

**Console owner → tab Sistem**
- **Hapus semua pesan** — kosongkan semua pesan, chat tetap.
- **Hapus DM & grup** — hapus chat pribadi/grup + kosongkan komunitas.
- **Reset semua data** — pesan + DM/grup/AI chat; komunitas dikosongkan & semua user dimasukkan ulang.
- Wajib ketik `RESET` + konfirmasi dialog. Tercatat di Log moderasi.

## Centang biru (verified)

- Semua **owner** otomatis punya centang biru (`/public/verified.png`) di samping nama: pesan, daftar chat, info kontak, daftar anggota, profil publik, dan profil sendiri.
- Owner bisa **memberi / mencabut** centang biru user lain lewat:
  - Console → Pengguna → buka user → tombol **Beri centang biru** / **Cabut centang biru**
  - Menu tindakan (⋮) di daftar anggota grup/Komunitas
- Disimpan di kolom `users.verified` (dibuat otomatis oleh `ensureSchema`, atau jalankan ulang `schema.sql`).
- API: `POST /api/admin/users` `{ "action": "verify", "userId": "...", "verified": true|false }` (hanya owner; dicatat di mod log).


---

## Pembaruan v11: pengerasan keamanan

- **Konfigurasi 100% lewat `config.json`** (tanpa environment variable). Karena berisi rahasia, repo GitHub WAJIB **Private**. Aplikasi menolak jalan (503 dengan pesan jelas) jika `databaseUrl` masih kosong/placeholder.
- **Rate limit** berbasis database (`rate_limits`) untuk login, OTP, Google, kirim pesan, file, poll, foto, ganti password, pencarian user, dan aksi admin.
- **Pencabutan sesi**: `users.token_version`. Ganti/reset password, ban, dan menu "Keluar dari semua perangkat" mematikan semua token lama.
- **Anti-CSRF** (cek Origin / Sec-Fetch-Site) untuk semua API non-GET, plus **CSP** dan header keamanan tambahan. Jika ada yang terblokir di produksi, set `CSP_MODE=report` sementara lalu lihat console browser.
- **File**: isi file dicek (magic bytes) terhadap tipe yang diklaim; hanya gambar/PDF tampil inline, sisanya diunduh; nama file aman untuk karakter non-ASCII.
- **Pin** di Komunitas hanya staf, di grup hanya admin grup. **Vote poll** kini atomik (tidak saling menimpa).
- **Reaksi emoji** (tabel `message_reactions`, satu reaksi per orang per pesan) lewat `PATCH /api/messages` dengan `action: "react"`; disiarkan lewat event realtime `reaction`.
- `/api/health` publik hanya `{ok}`; diagnosis lengkap khusus owner. Reset data massal hanya owner utama (email di `OWNER_EMAILS`).
- Pesan kedaluwarsa dibersihkan otomatis.

## Fitur baru: Berita Kevsoft (slide news)

Carousel berita di atas daftar chat (auto-slide 6 detik, bisa digeser). Klik kartu untuk membuka berita penuh.

- **Owner**: tambah berita (judul, isi, hingga 6 **URL gambar**, hingga 3 **URL video** YouTube/.mp4/.webm, hingga 3 tombol link) dan hapus berita. Tidak ada upload file; semua media berupa URL `https://`.
- **Semua user**: lihat, **like**, **share** (Web Share / salin link `/?news=<id>`), **komentar** (bisa dibalas dan di-**tag** `@username`, yang di-tag/dibalas dapat notifikasi realtime).
- **Penyimpanan: Firebase Realtime Database** (bukan Neon). Node: `news`, `news_comments`, `user_likes`. Profil penulis komentar tetap diambil dari Neon.

### Setup Firebase (sekali saja)
1. Firebase Console > Realtime Database > **Rules**, isi lalu Publish: `{ "rules": { ".read": false, ".write": false } }`. Server memakai kredensial admin sehingga tetap bisa baca/tulis; orang luar tidak bisa.
2. Project settings > Service accounts > **Generate new private key**, lalu jalankan `node scripts/firebase-config.mjs file-kunci.json`. Kunci masuk ke `config.json` (`firebaseDb.serviceAccount`). Hapus file JSON aslinya setelahnya.

## API publik (berita + komentar + kritik & saran)

API **read-only** di `/api/v1`. Dokumentasi lengkap (dengan contoh respons dan "Coba langsung") ada di halaman **`/docs`** (publik, tanpa login). Daftar endpoint-nya diatur di `lib/apiDocs.ts`; ringkasan JSON: `GET /api/v1`.

Aktifkan dengan mengisi `config.json`:

```json
"api": { "keys": ["KUNCI_ACAK_MIN_16_KARAKTER"], "public": false }
```

- `keys`: satu atau lebih API key (min. 16 karakter, pakai string acak panjang). Kirim lewat header `x-api-key: <key>` (atau `Authorization: Bearer <key>`).
- `public: true` membuka API tanpa key (tetap hanya baca, dibatasi 120 permintaan/menit per IP).
- Tanpa `keys` dan `public: false`, API menjawab 503 "belum diaktifkan".

| Endpoint | Isi |
| --- | --- |
| `GET /api/v1/news?limit=&before=&q=` | Daftar berita (halaman berikutnya: `before=<next_cursor>`) |
| `GET /api/v1/news/{id}` | Satu berita |
| `GET /api/v1/news/{id}/comments?tree=1` | Komentar berita (datar, atau bersarang dengan `tree=1`) |
| `GET /api/v1/cas?type=&status=&sort=&limit=` | Komentar Kritik & Saran yang lolos peninjauan AI (LIKE paling atas) |
| `GET /api/v1/cas/{id}` | Satu komentar Kritik & Saran |

```bash
curl -H "x-api-key: KUNCI_KAMU" https://domainmu.com/api/v1/news?limit=5
```

Keamanan: tidak ada id internal user atau email di respons (hanya username, nama, foto, centang), komentar yang masih ditinjau tidak pernah keluar, CORS terbuka untuk GET, dan percobaan key salah dibatasi per IP.

## Animasi

Gerak aplikasi dibuat lembut ala Notion: fade + geser 4-8px, 150-300 ms, kurva ease-out tanpa pantulan; hover hanya mengganti warna; tidak ada animasi yang berulang sendiri. Semua ada di blok "MOTION LEMBUT ALA NOTION" di akhir `app/globals.css`. Ubah `--ease` di blok itu untuk menyetel karakter geraknya, atau hapus blok itu untuk kembali ke animasi lama. Pengguna dengan "kurangi gerakan" di perangkatnya tidak melihat animasi sama sekali.

## Halaman

| Alamat | Isi |
| --- | --- |
| `/home` | Beranda publik (tanpa login): ringkasan fitur, berita terbaru, kritik & saran pilihan, tautan ke semua halaman |
| `/news` | Berita Kevsoft |
| `/cas` | Kritik & Saran |
| `/docs` | Dokumentasi API publik |
| `/sign-in` | Masuk / daftar (setelah masuk, default ke `/chat`) |
| `/` | Hanya penghubung: sudah login ke `/chat`, belum login ke `/home`; tautan lama `/?open=`, `/?dm=`, `/?reset=1`, `/?news=` diteruskan ke `/chat` |
| `/chat` | Daftar chat. `/chat/dm` dan `/chat/grup` = daftar dengan tab Pribadi / Grup |
| `/chat/dm/{username}` | Chat pribadi |
| `/chat/grup/{id}` | Grup atau Komunitas (id percakapan; handle grup juga diterima) |
| `/chat/ai` | Chat dengan Kev-Ai |

Menambah halaman baru: buat `app/<nama>/page.tsx`, lalu tambahkan `<nama>` ke `RESERVED_PATH` di `middleware.ts` dan `RESERVED` di `lib/mentions.ts` supaya tidak dianggap username.
