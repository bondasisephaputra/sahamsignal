# SahamSignal

Dashboard sinyal saham Indonesia (IDX) dengan rekomendasi beli / tahan / jual,
terhitung otomatis dari analisis teknikal dan fundamental.

- **144 saham IDX** liquid, dipindai setiap siklus refresh
- **Sinyal gabungan** 60% teknikal + 40% fundamental, tujuh tingkat keluaran
- **Rencana risiko** otomatis: stop loss, take profit, dan ukuran posisi berbasis ATR
- **Watchlist** per pengguna, login dengan JWT, database lokal

> Bukan nasihat keuangan. Data berasal dari penyedia data publik dan dapat terlambat.

## Menjalankan secara lokal

Prasyarat: Node.js 20+ (dibangun dan diuji pada v24).

```bash
npm install
```

Buat file `.env.local`:

```bash
DATABASE_URL="file:./data/saham.db"
AUTH_SECRET="ganti-dengan-string-acak-yang-panjang"
```

`AUTH_SECRET` wajib diisi. Di mode production, aplikasi menolak start jika nilai ini
tidak ada. Untuk membangkitkannya:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Lalu jalankan:

```bash
npm run dev
```

Buka <http://localhost:3000>, buat akun, dan dashboard langsung terisi.

Saat start, cache warms sendiri di belakang layar (144 simbol, ±5 detik dari
database kosong), jadi halaman pertama tidak perlu menunggu ~430 permintaan ke
API pihak ketiga.

### Perintah lain

```bash
npm run build     # build produksi
npm run start     # jalankan hasil build
npm run lint      # eslint
npx tsc --noEmit  # cek tipe
```

## Deploy ke Vercel

### 1. Siapkan database

Vercel tidak punya filesystem persisten, jadi SQLite lokal tidak bisa dipakai.
Gunakan [Turso](https://turso.tech) (libSQL, protokol SQLite yang di-host):

```bash
npm install -g @turso/cli
turso login
turso db create saham-signal
turso db tokens create --type jwt
```

### 2. Set environment variable di Vercel

| Variable             | Nilai                                |
| -------------------- | ------------------------------------ |
| `DATABASE_URL`       | `libsql://<nama-db>.turso.io`         |
| `DATABASE_AUTH_TOKEN`| Token JWT dari `turso db tokens`      |
| `AUTH_SECRET`        | String acak ≥ 32 karakter             |

Isi ketiganya di **Settings → Environment Variables**. `AUTH_SECRET` di production
wajib ada, aplikasi akan menolak start tanpanya.

### 3. Deploy

```bash
npm install -g vercel
vercel        # preview
vercel --prod # production
```

Tidak ada build step khusus dan tidak perlu adapter runtime tambahan. `libsql`
sudah didaftarkan di `serverExternalPackages` pada `next.config.ts` supaya
binding native-nya tidak ikut di-bundle.

## Cara kerja

### Alur data

```
Yahoo Finance  →  lib/yahoo.ts  →  data_cache (SQLite)  →  lib/analysis.ts
                                    TTL sadar pasar              ↓
                                                          lib/signal.ts
                                                               ↓
                                                    7 tier + rencana risiko
```

Yahoo tidak menyediakan endpoint bulk yang gratis, jadi data ditarik per simbol
dan disimpan di tabel `data_cache` dengan TTL yang menyesuaikan sesi bursa:

| Data            | Bursa buka  | Bursa tutup |
| --------------- | ----------- | ----------- |
| Intraday 5 m    | 45 detik    | 1 jam       |
| Harian 1 tahun  | 5 menit     | 30 menit    |
| Fundamental     | 12 jam      | 12 jam      |

Halaman di-streaming lewat `<Suspense>`: shell langsung tampil, bagian berat
mengalir di belakang skeleton.

### Mesin sinyal

Bobot gabungan **60% teknikal / 40% fundamental**. Kalau laporan keuangan tidak
tersedia, skor fundamental diabaikan dan bobot bergeser penuh ke teknikal —
bukan dianggap nol, supaya saham dengan cakupan tipis tidak dihukum dua kali.

**Teknikal** — MA 20/50/200 (tren, cross), RSI 14, MACD 12/26/9, Bollinger 20/2,
Stochastic 14/3/3, ADX 14 + DMI, ATR 14, volume relatif, support/resistance.

**Fundamental** — pertumbuhan pendapatan & laba YoY, ROE/ROA, margin, PER/PBV/PSR,
DER, current ratio.

Tujuh tingkat keluaran, dari `STRONG_BUY` sampai `STRONG_SELL`. Divergensi antara
arah teknikal dan fundamental diberi penalti, karena saat keduanya bertentangan,
tingkat keberhasilan cenderung lebih rendah.

Rencana risiko diturunkan dari ATR(14) sehingga stop loss dan ukuran posisi
mengikuti volatilitas aktual saham, bukan persentase tetap.

### Catatan akurasi data

Beberapa hal yang perlu diketahui karena memengaruhi angka yang tampil:

- **Pelaporan dalam USD.** ADRO, ITMG, dan TKIM menyajikan laporan keuangan dalam
  dolar AS sementara sahamnya diperdagangkan dalam rupiah. Yahoo tidak menandai
  mata uang pelaporan, sehingga membagi kapitalisasi pasar (IDR) dengan laba (USD)
  menghasilkan PER puluhan ribu kali. `lib/fundamental.ts` mendeteksi kasus ini
  lewat dua syarat sekaligus — PER mentah melampaui batas mana pun yang masuk akal,
  **dan** dibagi kurs USD/IDR aktual langsung masuk ke rentang yang masuk akal —
  lalu mengonversinya. Laporan dalam IDR tidak pernah tersentuh.
- **PER dan kapitalisasi pasar** dihitung ulang dari harga terkini × jumlah saham,
  bukan dari nilai trailing Yahoo yang bisa tertinggal satu kuartal.
- **Pertumbuhan YoY** membandingkan 12 bulan terakhir dengan tahun fiskal
  sebelumnya. Menjumlahkan empat kuartal yang kebetulan tersedia menghasilkan
  angka seperti +309%, karena banyak emiten IDX hanya mengembalikan tiga kuartal.
- **Cakupan tidak seragam.** ALKA dan ASPI tidak punya laporan fundamental sama
  sekali; keduanya tetap dianalisis secara teknikal.

## Struktur

```
app/
  api/            route handlers: auth, account, signals, quotes, saham, search,
                  watchlist, market
  dashboard/      overview, sinyal, saham/[symbol], watchlist, profil
components/       UI (client), termasuk grafik lilin SVG tulisan tangan
lib/
  db.ts           koneksi libSQL + DDL
  auth.ts         JWT httpOnly + bcrypt, sesi yang bisa dicabut
  yahoo.ts        adapter upstream + cache SQLite
  technical.ts    indikator + skor terbobot
  fundamental.ts  TTM, pertumbuhan, valuasi, kesehatan
  signal.ts       tier, rencana risiko ATR, narasi
  analysis.ts     orkestrasi + proyeksi SignalRow
instrumentation.ts   pemanasan cache saat boot
```

##-API

Semua route di bawah `/api` kecuali auth memerlukan sesi yang valid.

| Endpoint                | Method     | Keterangan                              |
| ----------------------- | ---------- | ---------------------------------------- |
| `/api/signals`          | GET        | Sinyal gabungan untuk seluruh universe   |
| `/api/saham/[symbol]`   | GET        | Analisis lengkap satu saham              |
| `/api/quotes`           | GET        | Kursor harga untuk polling ringan        |
| `/api/market`           | GET        | Status IHSG dan jam bursa               |
| `/api/search`           | GET        | Pencarian simbol                         |
| `/api/watchlist`        | GET/POST   | Watchlist pengguna                       |
| `/api/auth/register`    | POST       | Pendaftaran                              |
| `/api/auth/login`       | POST       | Login                                    |
| `/api/auth/logout`      | POST       | Logout                                   |
| `/api/account/profile`  | PATCH      | Ubah nama tampilan                       |
| `/api/account/password` | PATCH      | Ganti password                           |

## Membersihkan cache

Setelah mengubah cara respons upstream di-parse, cache lama harus dibuang —
kunci cache menyimpan bentuk permintaan, bukan versi kode:

```bash
node --experimental-strip-types scripts/clear-cache.ts
```