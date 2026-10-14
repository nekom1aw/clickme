# Clickme

Aplikasi manajemen tugas tim berbasis Next.js. Clickme menggabungkan workspace,
project, dan task dengan form publik, sinkronisasi Google Sheets, notifikasi
WhatsApp, serta link publik agar pihak luar bisa memantau dan berdiskusi lewat task.

## Fitur

- **Workspace & project** — anggota dengan peran (administrator, manager,
  collaborator), undangan lewat email dan menu Messages, project privat, pin.
- **Task** — tampilan **List**, **Board** (drag antar status), dan **Timeline**
  (bulanan/mingguan, dikelompokkan per status). Status kustom, multi-assignee,
  tag, prioritas, tanggal mulai/jatuh tempo, deskripsi rich text (Tiptap), dan lampiran.
- **Activity & komentar** — riwayat perubahan dan chat per task.
- **Publish task** — buat link publik per task; orang luar bisa melihat status,
  tanggal, deskripsi, dan percakapan, lalu mengirim pesan tanpa login. Link bisa
  dicabut kapan saja.
- **Clickme Forms** — form publik di `/f/[token]` yang otomatis membuat task.
- **Google Sheets → task** — worker membaca jawaban Google Form/Sheets, membuat
  task, dan mengirim notifikasi ke grup WhatsApp (WAHA) beserta link monitoring.
- **Progres publik** — workspace/project yang di-publish tampil di `/index`.
- **Akun** — verifikasi email dengan OTP, foto profil, tema terang/gelap.

## Teknologi

Next.js 16 (App Router, Turbopack) · React 19 · TypeScript · Tailwind CSS 4 ·
PostgreSQL 17 (`pg`) · MinIO (S3) · WAHA (WhatsApp HTTP API) · Nodemailer ·
Tiptap 3 · sharp · bcryptjs

## Memulai

Kebutuhan: Node.js 24+, Docker (untuk PostgreSQL), serta opsional MinIO, WAHA,
dan akun SMTP.

```sh
npm install
cp .env.example .env.local     # lalu isi nilainya
docker compose --env-file .env.local -f compose.postgres.yaml up -d
npm run dev
```

Buka [http://localhost:3002](http://localhost:3002). Port 3000 dipakai WAHA dan
3001 dipakai Media Scraper, jadi Clickme memakai 3002.

### Variabel lingkungan

Semua contoh ada di [`.env.example`](.env.example). Jangan commit `.env.local`.

| Variabel | Keterangan |
| --- | --- |
| `POSTGRES_*` | Koneksi PostgreSQL (container `clickme-postgres`, port 5433). |
| `APP_URL` | Origin publik aplikasi. Dipakai di link WhatsApp; awali `https://` di produksi agar cookie `Secure` dan HSTS aktif. |
| `SMTP_*` | Pengiriman kode verifikasi dan notifikasi akun. |
| `OTP_SECRET` | Kunci HMAC kode OTP. Wajib diisi dengan nilai acak panjang. |
| `MINIO_*` | Penyimpanan lampiran task. Tanpa MinIO, lampiran disimpan di `storage/`. |
| `WAHA_API_URL`, `WAHA_API_KEY`, `WAHA_SESSION` | Koneksi WAHA untuk notifikasi WhatsApp. |
| `WAHA_WEBHOOK_SECRET` | **Wajib** untuk `/api/webhooks/waha`; tanpa nilai ini semua request ditolak. |
| `WAHA_DIRECT_RECIPIENTS` | Nomor yang boleh dikirimi langsung oleh Clickme Forms (pisahkan dengan koma). Kosong = mode nomor langsung nonaktif; notifikasi hanya ke grup yang terhubung via `/connect`. |
| `REGISTRATION_ALLOWED_DOMAINS` | Opsional. Domain email yang boleh mendaftar, mis. `example.org`. Kosong = pendaftaran terbuka. |
| `SHEET_SYNC_MODE` | Isi `external` bila worker berjalan lewat Docker. |

Restart `npm run dev` setelah mengubah `.env.local`.

## Database PostgreSQL

Struktur tabel ada di [`db/postgres/schema.sql`](db/postgres/schema.sql) dan aman
dijalankan ulang. Untuk database baru yang masih kosong:

```sh
docker exec -i clickme-postgres psql -U clickme -d clickme < db/postgres/schema.sql
```

Data lama dari MySQL/MariaDB XAMPP dipindahkan dengan `npm run db:migrate-mysql`
(membaca `MYSQL_*`, bawaan `root@127.0.0.1:3306/clickme`). Skrip menolak menulis
ke tabel yang sudah berisi; `npm run db:migrate-mysql -- --reset` menghapus dan
mengisi ulang seluruh tabel PostgreSQL dari MySQL. Hentikan worker sinkronisasi
selama migrasi agar tidak ada data baru yang tertinggal di MySQL.

## Lampiran task (MinIO)

MinIO berjalan sebagai service terpisah. Lampiran disimpan di bucket MinIO pada
prefix `task-attachments/`; tanpa MinIO, file disimpan di `storage/task-attachments`
(di luar `public/`). File selalu disajikan lewat `/api/storage/task-attachments/*`
yang memeriksa akses task.

```env
# S3 API, bukan MinIO Console di port 9001
MINIO_ENDPOINT=localhost
MINIO_PORT=9000
MINIO_USE_SSL=false
MINIO_ACCESS_KEY=your-access-key
MINIO_SECRET_KEY=your-secret-key
MINIO_BUCKET=minio-server-testing
```

Pada server produksi, ganti `localhost` dengan hostname internal MinIO dan
aktifkan SSL bila endpoint MinIO memakai HTTPS. Tipe file yang diterima: gambar,
PDF, dokumen Office, CSV/TXT, ZIP, dan video/audio, maksimal 25 MB per file.

## Publish task

Di detail task, klik **Publish → Publish & buat link** (hanya owner project,
owner workspace, atau anggota dengan akses Full akses/Manage). Link
`/monitoring/[token]` menampilkan judul, status, tanggal, deskripsi, dan
percakapan task. Pengunjung mengisi nama sekali, lalu bisa mengirim pesan;
pesan mereka tampil dengan label **Guest** di Activity tim. **Stop publish**
langsung mematikan link.

> Seluruh komentar task, termasuk komentar sebelum task di-publish, terlihat di
> halaman publik.

## Sinkronisasi Google Sheets dan WhatsApp

Server Clickme memulai worker melalui `instrumentation.ts` saat `npm run dev`
atau `npm start` berjalan. Worker memeriksa seluruh sumber Google Sheets yang
terhubung setiap 5 detik setelah siklus sebelumnya selesai; browser tidak perlu
terbuka. Server, PostgreSQL, koneksi internet, dan WAHA tetap harus berjalan.

Task baru dan antrean notifikasinya disimpan dalam transaksi yang sama.
Notifikasi gagal dicoba ulang setelah 60 detik. Pengiriman yang sudah mendapat
respons berhasil dicatat per task dan grup, sehingga sinkronisasi berikutnya
melewati penerima tersebut. Jika koneksi terputus tepat setelah WAHA menerima
pesan tetapi sebelum konfirmasi diterima, percobaan ulang masih bisa menduplikasi
pesan. Advisory lock PostgreSQL mencegah worker dan impor manual mengimpor bersamaan.

Log `[Sheet sync]` menampilkan jumlah task baru dan hasil pengiriman tanpa isi
jawaban atau kredensial. Worker ini untuk server Node yang terus berjalan;
deployment serverless memerlukan scheduler/worker terpisah. Hanya URL
`https://docs.google.com/spreadsheets/...` yang diterima sebagai sumber.

### Pemetaan kolom dan template per sumber

> Kartu **Google Form / Sheets** saat ini disembunyikan dari pengaturan
> workspace. Sumber yang sudah terhubung tetap tersinkron; komponen
> pengaturannya ada di `components/google-form-connection.tsx`.

Masukkan URL tab atau ID spreadsheet, klik **Baca kolom**, pilih judul task,
identitas jawaban, kategori/project tujuan, kolom deskripsi, dan template WA.
Gunakan placeholder `{{Nama kolom}}`, lalu **Periksa dan pratinjau** sebelum
**Simpan dan aktifkan**. Link monitoring ditambahkan otomatis pada pesan.

Response ID menjadi identitas utama bila dipilih. Alternatifnya adalah waktu
jawaban ditambah email/nama pemohon; nilai identitas harus unik dan tidak diubah.
Sheet/tab baru menjalani sinkronisasi awal tanpa notifikasi. Jawaban baru setelah
itu mengantrekan pesan. Kolom yang dipakai hilang, identitas kosong, atau ID ganda
menjeda sumber dan menampilkan alasan di pengaturan. Simpan pemetaan yang valid
untuk melanjutkan. Kolom tambahan dan perubahan urutan tidak menjeda sumber.
Koneksi lama tetap menggunakan format Permintaan Data sampai dikonfigurasi.

### Worker Docker (tanpa menjalankan website)

Worker terpisah menjalankan sinkronisasi Sheets dan antrean WhatsApp setiap
5 detik setelah siklus sebelumnya selesai. Tidak perlu `npm run dev`, tab
browser, atau server web Clickme. Docker, database PostgreSQL, WAHA, dan internet
harus tetap tersedia. Untuk berjalan ketika komputer mati, pindahkan seluruh
layanan yang diperlukan ke server yang terus menyala.

```sh
docker compose --env-file .env.local -f compose.worker.yaml up -d --build
docker compose --env-file .env.local -f compose.worker.yaml ps
docker compose --env-file .env.local -f compose.worker.yaml logs --tail 30 sheet-worker
```

Set `SHEET_SYNC_MODE=external` di `.env.local` setelah Docker worker aktif agar
Next.js tidak menjalankan worker kedua. Restart `npm run dev` jika sedang
berjalan. Hapus pengaturan itu untuk kembali memakai worker bawaan Next.js.
Container memakai `restart: unless-stopped` dan tidak membuka port baru.

Database pada Mac diakses melalui `host.docker.internal:5433`, WAHA melalui
`host.docker.internal:3000`. Gunakan `WORKER_POSTGRES_HOST` dan
`WORKER_WAHA_API_URL` di `.env.local` untuk mengganti alamat khusus Docker.
Nama sesi, API key, database, dan kredensial diambil dari `.env.local` saat
container dibuat. File env, upload, dan data pengguna tidak disalin ke image.
Sesudah perubahan kode atau env, jalankan kembali perintah `up -d --build`.

Status `healthy` menunjukkan siklus worker berhasil berjalan; penerimaan pesan
WhatsApp tetap bergantung pada WAHA dan koneksi grup. Pesan gagal tetap berada
di antrean untuk dicoba ulang. Halaman monitoring dan pengaturan grup baru tetap
memerlukan web Clickme aktif. Link dalam pesan mengikuti `APP_URL`.

## Keamanan

- **Pendaftaran** — kode OTP terikat ke tujuan dan alamat email, maksimal 5
  percobaan per kode (dihitung atomik) dan 10 kode per akun per hari.
  Verifikasi akun baru juga meminta password, sehingga orang yang mendaftarkan
  email orang lain lebih dulu tidak bisa mempertahankan password-nya.
  Untuk aplikasi internal, isi `REGISTRATION_ALLOWED_DOMAINS`.
- **Session** — login membuat token acak di cookie `clickme_session`
  (`httpOnly`, `SameSite=Lax`, `Secure` bila `APP_URL` HTTPS). Database hanya
  menyimpan hash-nya (`user_sessions`), berlaku 30 hari, dan dihapus saat logout.
  Mengganti password atau email mengeluarkan session di perangkat lain.
- **Rate limit** — login (8 percobaan per email+IP dan 30 per email / 15 menit),
  register, OTP, undangan, form publik (per IP dan per form), chat publik, dan
  pengecekan password profil (`rate_limit_events`). Setiap percobaan dicatat
  sebelum dihitung sehingga request paralel tidak lolos bersamaan.
- **Akses** — setiap API memeriksa session dan hak atas workspace/project/task;
  collaborator hanya melihat task yang ditugaskan kepadanya, dan akses itu hilang
  saat ia dikeluarkan dari project. Anggota project hanya bisa ditambahkan dari
  anggota workspace; orang luar lewat undangan.
- **WhatsApp** — notifikasi hanya ke grup yang terhubung lewat `/connect` atau ke
  nomor di `WAHA_DIRECT_RECIPIENTS`, sehingga nomor organisasi tidak bisa dipakai
  untuk mengirim pesan ke sembarang orang.
- **Email** — akun baru dan perubahan email wajib diverifikasi lewat OTP; email
  baru disimpan di `pending_email` sampai kodenya dikonfirmasi.
- **Header** — `X-Frame-Options: DENY`, `frame-ancestors 'none'`, `nosniff`,
  dan `Referrer-Policy` untuk seluruh halaman (lihat `next.config.ts`).

### Deployment produksi

- Jalankan di belakang reverse proxy (mis. nginx) yang **menimpa**
  `X-Forwarded-For` dengan IP klien (`proxy_set_header X-Forwarded-For $remote_addr;`)
  dan membatasi ukuran body (`client_max_body_size 260m;`). Tanpa itu, batas per IP
  bisa diakali; batas per akun dan per resource tetap berlaku.
- Set `APP_URL` ke alamat `https://` agar cookie `Secure` dan HSTS aktif.
- Isi `OTP_SECRET` dengan nilai acak panjang dan jangan pakai ulang password SMTP.

## Pengujian

Tes memakai Node dengan dukungan `registerHooks` dan `stripTypeScriptTypes`.

```sh
npm run lint
npx tsc --noEmit
node --import ./tests/typescript-loader.mjs --test tests/*.test.mjs
node --env-file=.env.local --import ./tests/typescript-loader.mjs tests/sheet-sync.integration.mjs
```

Sebagian besar tes integrasi membuat database sementara dari
`db/postgres/schema.sql`, memakai jawaban buatan dan WAHA tiruan, lalu
menghapusnya; akun PostgreSQL memerlukan izin membuat dan menghapus database.
`tests/native-forms.integration.mjs` menguji server yang sedang berjalan
(`FORMS_TEST_URL`, bawaan `http://localhost:3002`) dan membersihkan datanya sendiri.

## Struktur

```
app/
  api/            Route handler (auth, project, task, form, monitoring, webhook)
  team/           Aplikasi utama setelah login (workspace, project, profil)
  monitoring/     Halaman publik task yang di-publish
  f/              Form publik Clickme Forms
  index/          Progres project yang di-publish
components/       Komponen bersama (editor Tiptap, form, koneksi integrasi)
lib/              Akses data, session, rate limit, sinkronisasi, WAHA, email
db/postgres/      Skema database
docker/worker/    Image worker sinkronisasi
tests/            Tes unit dan integrasi
proxy.ts          Redirect ke /login untuk halaman /team tanpa session
```
