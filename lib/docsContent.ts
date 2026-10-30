// DIHASILKAN oleh scripts/build-docs.mjs dari content/docs/*.md. Jangan edit manual.
export type DocPage = { id: string; title: string; group: string; order: number; desc: string; body: string };
export const DOC_PAGES: DocPage[] = [
 {
  "id": "pengantar",
  "title": "Pengantar",
  "group": "Mulai",
  "order": 1,
  "desc": "Apa itu kevsoft-chat dan di mana menemukan apa.",
  "body": "kevsoft-chat adalah aplikasi chat dengan pesan pribadi, grup, ruang komunitas, asisten **Kev-Ai**, halaman berita, kotak Kritik & Saran, dan API publik. Dokumentasi ini menjelaskan cara kerjanya dari sisi pengguna maupun pengembang.\n\n## Isi dokumentasi\n\n| Bagian | Halaman | Untuk siapa |\n| --- | --- | --- |\n| Mulai | [Mulai cepat](/docs/mulai-cepat) | Semua orang |\n| Sistem | [Arsitektur](/docs/arsitektur), [Pesan dan grup](/docs/pesan), [Perangkat tertaut](/docs/perangkat-tertaut), [Keamanan](/docs/keamanan) | Pengguna yang penasaran, pengembang |\n| API | [Autentikasi](/docs/autentikasi), [Batas dan error](/docs/batas), referensi [Berita](/docs/ref-berita), [Kritik & Saran](/docs/ref-cas), [Akun API](/docs/ref-akun), [Contoh kode](/docs/contoh-kode) | Pengembang |\n| Lainnya | [FAQ](/docs/faq), [Catatan perubahan](/docs/changelog) | Semua orang |\n\n## Istilah yang dipakai\n\n- **Perangkat tertaut**: login tambahan yang disetujui lewat kode, mirip fitur di aplikasi chat besar lain.\n- **Developer mode**: status akun yang dibutuhkan untuk membuat API key.\n- **API key**: kunci berawalan `kc_live_` untuk memanggil API.\n- **Kev-Ai**: asisten AI. Di grup dipanggil dengan `@kev-ai`.\n\n> [!NOTE]\n> Semua contoh memakai `https://domainmu.com` sebagai alamat. Di halaman ini alamat itu otomatis diganti dengan alamat server yang sedang kamu buka."
 },
 {
  "id": "mulai-cepat",
  "title": "Mulai cepat",
  "group": "Mulai",
  "order": 2,
  "desc": "Dari daftar sampai memanggil API pertamamu.",
  "body": "## Sebagai pengguna\n\n1. **Daftar** dengan email (kode OTP dikirim ke kotak masukmu) atau lewat akun Google.\n2. **Lengkapi profil**: nama, username, foto. Username dipakai untuk mencarimu dan men-tag kamu.\n3. Kamu otomatis masuk ke **Komunitas Kevsoft** dan punya chat **Kev-Ai** sendiri.\n4. Buka **Pengaturan** dari panel profil untuk mengatur tema, pesan otomatis, dan perangkat tertaut.\n\n## Sebagai pengembang\n\n1. Buka **Pengaturan > Developer** dan bergabung ke developer mode.\n2. Buat API key. Salin saat muncul, key lengkap tidak ditampilkan lagi.\n3. Coba panggilan pertama:\n\n~~~bash\ncurl -H \"x-api-key: kc_live_KUNCI_KAMU\" https://domainmu.com/api/v1/me\n~~~\n\n4. Ambil data berita:\n\n~~~bash\ncurl -H \"x-api-key: kc_live_KUNCI_KAMU\" \"https://domainmu.com/api/v1/news?limit=5\"\n~~~\n\n> [!TIP]\n> Kalau jawabannya `401`, cek tiga hal: developer mode masih aktif, key belum dicabut, dan key dikirim lewat header `x-api-key`."
 },
 {
  "id": "arsitektur",
  "title": "Arsitektur sistem",
  "group": "Sistem",
  "order": 3,
  "desc": "Strategi di balik kevsoft-chat: komponen, alur pesan, dan keputusan desain.",
  "body": "Halaman ini menjelaskan *kenapa* sistemnya disusun seperti ini, bukan hanya apa saja isinya.\n\n## Komponen\n\n| Lapisan | Dipakai untuk |\n| --- | --- |\n| Next.js (App Router) | Halaman, route API, dan middleware |\n| Postgres (Neon) | Pengguna, percakapan, pesan, perangkat, API key, batas permintaan |\n| Pusher | Memberi tahu perangkat lain bahwa ada pesan baru |\n| Firebase Realtime Database | Berita dan Kritik & Saran (terpisah dari Postgres, hanya diakses dari server) |\n| Email (OTP) dan Google | Cara membuktikan kepemilikan email saat daftar atau reset |\n\n## Alur sebuah pesan\n\n1. Klien mengirim pesan ke server. Identitas pengirim **selalu** diambil dari cookie sesi yang ditandatangani, tidak pernah dari isi permintaan.\n2. Server memeriksa: sesi valid, akun tidak diblokir, perangkat belum dikeluarkan, pengirim memang anggota percakapan, dan pesan tidak lebih dari 4000 karakter.\n3. Pesan disimpan di tabel `messages`. Inilah sumber kebenaran: perangkat mana pun yang membuka percakapan membaca dari sini.\n4. Server memberi sinyal lewat Pusher. Perangkat lain memuat pesan baru.\n5. Penanda terbaca disimpan per anggota (`last_read_at`), sehingga status baca ikut ke perangkat mana pun.\n\n## Keputusan desain\n\n**Satu sumber kebenaran di server.** Pesan tidak hidup di satu ponsel. Itu sebabnya login dari perangkat baru langsung melihat riwayat, dan kenapa pesan sementara bisa hilang di semua perangkat sekaligus.\n\n**Sesi per perangkat.** Setiap login membuat satu baris di tabel `devices`, dan id-nya ikut di dalam token. Mengeluarkan satu perangkat berarti menandai barisnya dicabut. Token lain tidak terganggu. \"Keluar dari semua perangkat\" memakai cara berbeda: menaikkan `token_version` akun.\n\n**Tautan perangkat dengan kode, bukan password.** Perangkat baru meminta kode, perangkat lama menyetujuinya. Password tidak pernah diketik di perangkat yang tidak kamu percaya. Lihat [Perangkat tertaut](/docs/perangkat-tertaut).\n\n**Batas di database.** Pembatasan permintaan memakai tabel `rate_limits` dengan satu query atomik per pengecekan, jadi tetap benar saat server berjalan di banyak instance serverless.\n\n**API terpisah dari sesi.** API publik memakai key, bukan cookie. Key hanya bisa dibuat oleh akun yang bergabung ke developer mode, dan hanya hash-nya yang disimpan.\n\n## Perbandingan dengan aplikasi chat besar\n\n| Hal | kevsoft-chat | Aplikasi seperti WhatsApp |\n| --- | --- | --- |\n| Identitas | Username dan email | Nomor telepon |\n| Perangkat tambahan | Kode tautan, maksimal 4 | Kode atau QR, beberapa perangkat |\n| Penyimpanan pesan | Di server | Di perangkat, cadangan terpisah |\n| Enkripsi end-to-end | **Belum ada** | Ada |\n| Pesan sementara | Ada, per percakapan | Ada |\n| Undangan grup | Link berkode acak, bisa direset | Link undangan |\n\n> [!WARNING]\n> Pesan di kevsoft-chat **tidak** terenkripsi end-to-end. Koneksi dilindungi HTTPS, tetapi pesan tersimpan di server agar bisa muncul di semua perangkat. Jangan kirim rahasia yang tidak boleh dibaca pengelola server."
 },
 {
  "id": "pesan",
  "title": "Pesan dan grup",
  "group": "Sistem",
  "order": 4,
  "desc": "Jenis percakapan, fitur pesan, dan aturan grup.",
  "body": "## Jenis percakapan\n\n| Jenis | Keterangan |\n| --- | --- |\n| DM | Percakapan dua orang |\n| Grup | Banyak anggota, punya deskripsi, rules, dan link undangan |\n| Komunitas | Ruang publik \"Komunitas Kevsoft\", semua pengguna otomatis masuk (kecuali sedang dikeluarkan) |\n| Kev-Ai | Satu chat AI pribadi per pengguna |\n\n## Fitur pesan\n\n- **Balasan**: mengutip pesan sebelumnya.\n- **Mention**: `@username` membuat tag dan menandai orangnya. Di grup, `@kev-ai` memanggil asisten.\n- **Sematkan**: pesan penting bisa disematkan di atas percakapan.\n- **Media dan polling**: gambar, berkas, dan jajak pendapat.\n- **Hapus**: pesan bisa dihapus, ditandai di database.\n- **Pesan sementara**: durasi diatur per percakapan. Pesan yang melewati waktunya dihapus dari server.\n- **Batas panjang**: 4000 karakter per pesan.\n\n## Grup\n\n- Pembuat grup menjadi **owner** grup.\n- **Link undangan** berisi kode acak. Reset dari info grup membuat kode baru dan kode lama berhenti berlaku.\n- **Rules grup** ditulis admin dan bisa dibaca anggota lewat menu titik tiga di pojok kanan atas grup.\n- Anggota yang dikeluarkan dicatat, sehingga tidak bisa langsung masuk lagi lewat link yang sama.\n\n## Penanda terbaca\n\nSetiap anggota punya `last_read_at` per percakapan. Karena disimpan di server, jumlah pesan belum dibaca konsisten di semua perangkatmu."
 },
 {
  "id": "perangkat-tertaut",
  "title": "Perangkat tertaut",
  "group": "Sistem",
  "order": 5,
  "desc": "Cara menautkan perangkat lain tanpa mengetik password di sana.",
  "body": "Perangkat tertaut memungkinkan kamu masuk di perangkat baru dengan bantuan perangkat yang sudah login.\n\n## Alur\n\n1. Di **perangkat baru**, buka halaman masuk dan pilih **Tautkan dengan perangkat lain**.\n2. Layar menampilkan kode 8 karakter, misalnya `K7QM-4XPD`. Kode berlaku **3 menit**.\n3. Di **perangkat lama**, buka **Pengaturan > Perangkat tertaut** dan masukkan kode.\n4. Perangkat lama menampilkan nama dan IP perangkat peminta. Periksa, lalu setujui.\n5. Perangkat baru yang sedang menunggu menerima sesi dan langsung masuk.\n\n## Kenapa aman\n\n- Kode memakai huruf dan angka yang tidak mudah tertukar (tanpa `0`, `O`, `1`, `I`).\n- Perangkat peminta memegang **secret** acak yang tidak ditampilkan. Hanya pemilik secret itu yang bisa mengambil sesi, jadi orang yang sekadar melihat kodenya tidak bisa membajak.\n- Sesi hanya dibuat **sekali**. Kode yang sudah dipakai tidak bisa dipakai lagi.\n- Permintaan dibatasi per IP, dan persetujuan dibatasi per akun.\n- Layar persetujuan menampilkan detail perangkat peminta supaya kamu tidak menyetujui kode dari orang lain.\n\n> [!WARNING]\n> Setujui kode **hanya** kalau kamu sendiri yang sedang membuka halaman masuk di perangkat itu. Orang yang meminta kodemu lewat chat kemungkinan besar sedang mencoba mengambil akunmu.\n\n## Batas\n\n| Hal | Nilai |\n| --- | --- |\n| Masa berlaku kode | 3 menit |\n| Perangkat tertaut per akun | 4 |\n| Perangkat tersimpan per akun | 20 terbaru |\n\n## Mengeluarkan perangkat\n\nDi **Pengaturan > Perangkat tertaut**, ketuk **Keluarkan** pada perangkat yang tidak dikenal. Perangkat itu langsung kehilangan akses pada permintaan berikutnya. Untuk mengeluarkan semuanya sekaligus, pakai **Keluar dari semua perangkat** di Pengaturan > Akun.\n\n> [!NOTE]\n> Login yang dibuat sebelum fitur ini ada tidak punya catatan perangkat. Sesi itu tetap berlaku sampai habis, dan hanya bisa dikeluarkan lewat \"Keluar dari semua perangkat\".\n\n## Data yang disimpan\n\nTabel `devices`: nama (misalnya \"Chrome di Windows\"), platform, IP, waktu dibuat, waktu terakhir aktif, dan waktu dicabut. Tabel `link_requests`: kode, hash secret, status persetujuan, dan waktu kedaluwarsa. Kode lama dibersihkan otomatis."
 },
 {
  "id": "keamanan",
  "title": "Keamanan",
  "group": "Sistem",
  "order": 6,
  "desc": "Sesi, password, batas permintaan, dan hal yang belum ada.",
  "body": "## Sesi\n\n- Login membuat cookie `kc_session`: token JWT (HS256), `httpOnly`, `sameSite=lax`, berlaku 30 hari.\n- Token memuat id pengguna, versi sesi (`sv`), dan id perangkat (`did`).\n- Di setiap permintaan server memeriksa: tanda tangan, akun tidak diblokir, `sv` masih cocok, dan perangkat belum dicabut.\n- Mengganti atau mereset password menaikkan `sv`, sehingga semua token lama langsung mati.\n\n## Perlindungan lain\n\n- **Anti-CSRF**: permintaan yang mengubah data harus berasal dari origin yang sama.\n- **Batas permintaan** untuk login, OTP, pembuatan kode tautan, pembuatan key, dan API.\n- **Kunci akun** setelah terlalu banyak percobaan login gagal.\n- **Blokir akun** oleh staf berlaku langsung dan dicatat di log moderasi.\n\n## API key\n\n- Format `kc_live_` diikuti 32 karakter acak.\n- Hanya **hash SHA-256** yang disimpan. Pengelola server pun tidak bisa melihat key lengkapmu.\n- Key berhenti berlaku saat dicabut, saat akunmu keluar dari developer mode, atau saat akun diblokir.\n\n## Yang belum ada\n\n- Enkripsi end-to-end.\n- Autentikasi dua langkah di luar OTP email.\n\n> [!TIP]\n> Temukan celah? Laporkan lewat halaman [Kritik & Saran](/cas) dan jangan menguji pada akun orang lain."
 },
 {
  "id": "autentikasi",
  "title": "Autentikasi dan developer mode",
  "group": "API",
  "order": 7,
  "desc": "Cara mendapatkan dan memakai API key.",
  "body": "API kevsoft memakai **API key**. Key hanya bisa dibuat oleh akun yang sudah bergabung ke **developer mode**.\n\n## Bergabung ke developer mode\n\n1. Buka **Pengaturan > Developer**.\n2. Baca ketentuannya, centang persetujuan, lalu pilih **Gabung developer mode**.\n3. Buat key dengan memberi nama, misalnya `bot berita`.\n\nKamu bisa punya maksimal **5 key aktif**. Key lengkap hanya muncul satu kali saat dibuat.\n\n## Mengirim key\n\nLewat header (disarankan):\n\n~~~http\nGET /api/v1/news HTTP/1.1\nx-api-key: kc_live_KUNCI_KAMU\n~~~\n\nAtau lewat `Authorization`:\n\n~~~http\nAuthorization: Bearer kc_live_KUNCI_KAMU\n~~~\n\n> [!WARNING]\n> Jangan menaruh key di JavaScript yang berjalan di browser pengunjung, di repo publik, atau di tangkapan layar. Panggil API dari server milikmu.\n\n## Mencabut key\n\nDi **Pengaturan > Developer**, ketuk **Cabut** pada key. Aplikasi yang memakainya langsung mendapat `401`. **Keluar dari developer mode** mencabut semua key sekaligus.\n\n## Key dari config server\n\nPemilik server juga bisa mengisi `api.keys` di `config.json` untuk key internal. Key itu dibatasi 120 permintaan per menit dan tidak bisa memanggil `/api/v1/me`. Mengisi `api.public: true` membuka API tanpa key (hanya baca, 120 per menit per IP). Secara bawaan API **membutuhkan key**.\n\n## Akun API\n\n`GET /api/v1/me` menampilkan pemilik key dan batasnya. Lihat [Akun API](/docs/ref-akun)."
 },
 {
  "id": "batas",
  "title": "Batas dan error",
  "group": "API",
  "order": 8,
  "desc": "Rate limit, kode error, dan pagination.",
  "body": "## Batas permintaan\n\n| Jenis akses | Batas |\n| --- | --- |\n| Key developer | 300 permintaan per menit per key |\n| Key config server | 120 permintaan per menit per key |\n| Tanpa key (jika `api.public` aktif) | 120 permintaan per menit per IP |\n\nSaat batas terlampaui kamu mendapat `429` dan header `Retry-After` berisi jumlah detik menunggu.\n\n## Kode error\n\n:::errors\n\nSemua error berbentuk:\n\n~~~json\n{ \"error\": \"Pesan yang bisa dibaca manusia\" }\n~~~\n\n## Pagination\n\nDaftar berita memakai cursor. Kirim `next_cursor` dari respons sebelumnya sebagai `before`. Kalau `next_cursor` bernilai `null`, itu halaman terakhir.\n\n## Cache\n\nRespons memakai `Cache-Control: no-store` karena isinya bergantung pada key. Simpan hasil di sisi aplikasimu kalau datanya jarang berubah."
 },
 {
  "id": "ref-berita",
  "title": "Referensi Berita",
  "group": "API",
  "order": 9,
  "desc": "Endpoint daftar berita, detail, dan komentar.",
  "body": "Semua endpoint butuh key. Coba langsung dengan memasukkan key di panel **Coba** pada tiap endpoint.\n\n:::endpoints news"
 },
 {
  "id": "ref-cas",
  "title": "Referensi Kritik & Saran",
  "group": "API",
  "order": 10,
  "desc": "Komentar Kritik & Saran yang lolos peninjauan AI.",
  "body": "Hanya komentar berstatus `acc` atau `like` yang bisa dibaca lewat API. Komentar yang masih ditinjau atau ditolak (`RM`) tidak pernah muncul.\n\n:::endpoints cas"
 },
 {
  "id": "ref-akun",
  "title": "Referensi Akun API",
  "group": "API",
  "order": 11,
  "desc": "Informasi key dan indeks API.",
  "body": "`/api/v1/me` hanya menerima **key developer**. Key dari config server mendapat `403`.\n\n:::endpoints me"
 },
 {
  "id": "contoh-kode",
  "title": "Contoh kode",
  "group": "API",
  "order": 12,
  "desc": "curl, JavaScript, dan Python.",
  "body": "## curl\n\n~~~bash\ncurl -H \"x-api-key: $KEVSOFT_KEY\" \"https://domainmu.com/api/v1/news?limit=3\"\n~~~\n\n## JavaScript (Node.js)\n\n~~~js\nconst res = await fetch(\"https://domainmu.com/api/v1/news?limit=5\", {\n  headers: { \"x-api-key\": process.env.KEVSOFT_KEY },\n});\nif (!res.ok) throw new Error((await res.json()).error);\nconst { data } = await res.json();\nfor (const n of data) console.log(n.title);\n~~~\n\n## Python\n\n~~~python\nimport os, requests\n\nr = requests.get(\n    \"https://domainmu.com/api/v1/cas\",\n    params={\"sort\": \"best\", \"limit\": 10},\n    headers={\"x-api-key\": os.environ[\"KEVSOFT_KEY\"]},\n    timeout=10,\n)\nr.raise_for_status()\nfor c in r.json()[\"data\"]:\n    print(c[\"status\"], c[\"body\"])\n~~~\n\n## Mengambil semua berita\n\n~~~js\nlet before = undefined, all = [];\ndo {\n  const url = new URL(\"https://domainmu.com/api/v1/news\");\n  url.searchParams.set(\"limit\", \"50\");\n  if (before) url.searchParams.set(\"before\", before);\n  const res = await fetch(url, { headers: { \"x-api-key\": process.env.KEVSOFT_KEY } });\n  const page = await res.json();\n  all.push(...page.data);\n  before = page.next_cursor;\n} while (before);\n~~~\n\n> [!TIP]\n> Simpan key di environment variable seperti `KEVSOFT_KEY`, bukan langsung di kode."
 },
 {
  "id": "faq",
  "title": "FAQ",
  "group": "Lainnya",
  "order": 13,
  "desc": "Pertanyaan yang sering muncul.",
  "body": "## Apakah developer mode berbayar?\n\nTidak ada biaya. Syaratnya hanya menyetujui ketentuan penggunaan di Pengaturan > Developer.\n\n## Kenapa key saya tiba-tiba `401`?\n\nKemungkinannya: key sudah dicabut, kamu keluar dari developer mode, akunmu diblokir, atau key salah ketik. Buat key baru di Pengaturan > Developer.\n\n## Bisakah API dipakai untuk mengirim pesan?\n\nBelum. API v1 bersifat read-only: berita, komentar berita, dan Kritik & Saran.\n\n## Berapa perangkat yang bisa ditautkan?\n\nMaksimal 4 perangkat tertaut. Keluarkan salah satu kalau sudah penuh.\n\n## Kode tautan saya kedaluwarsa\n\nKode berlaku 3 menit. Pilih **Kode baru** di perangkat yang sedang menunggu.\n\n## Apakah pesan terenkripsi end-to-end?\n\nBelum. Lihat bagian perbandingan di [Arsitektur](/docs/arsitektur).\n\n## Bagaimana melaporkan bug?\n\nLewat halaman [Kritik & Saran](/cas)."
 },
 {
  "id": "changelog",
  "title": "Catatan perubahan",
  "group": "Lainnya",
  "order": 14,
  "desc": "Apa yang baru di tiap versi.",
  "body": "## v32\n\n- **Perangkat tertaut**: masuk di perangkat baru dengan kode 8 karakter, daftar perangkat, dan keluarkan per perangkat.\n- **Developer mode** dan **API key** per akun, batas 300 permintaan per menit.\n- Endpoint baru `GET /api/v1/me`.\n- **Pengaturan** lengkap dengan 8 halaman: Profil, Akun, Obrolan, Pesan otomatis, Perangkat tertaut, Developer, Bantuan, Tentang.\n- Dokumentasi baru bergaya GitHub dengan banyak halaman, pencarian, dan daftar isi.\n\n## v31\n\n- Beranda `/home` interaktif: dock aplikasi, jendela yang bisa digeser, kamus kecil, dan FAQ.\n\n## v30\n\n- Tema terpadu untuk seluruh aplikasi."
 }
];
