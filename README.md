# Aplikasi SPP & Infaq - MIS & MTs Baitul Hikmah

Aplikasi pencatatan SPP/Infaq untuk MIS dan MTs, terintegrasi dengan Google Sheets, di-deploy ke Cloudflare Pages.

## Fitur

- Catat pembayaran dengan pencarian nama siswa
- Dashboard persentase pembayaran per bulan (chart)
- Kelola data siswa & kategori pembayaran
- Pisah lembaga MIS dan MTs dalam satu aplikasi
- Data tersimpan di Google Sheets (real-time)

## Struktur Google Sheet

Buat Google Sheet dengan 3 tab:

1. **Siswa** — ID, Nama, Lembaga, Kelas, TarifInfaq, CreatedAt
2. **Pembayaran** — ID, SiswaID, Bulan, Tahun, Jumlah, Kategori, Tanggal, Lembaga, Keterangan
3. **Kategori** — ID, Nama, Lembaga, JumlahDefault, CreatedAt

## Setup Deployment

### 1. Google Cloud Setup

1. Buka https://console.cloud.google.com
2. Buat project baru (atau pilih existing)
3. Enable **Google Sheets API**
4. Buat **Service Account** → buat key JSON → download
5. Copy `client_email` dan `private_key` dari file JSON
6. Share Google Sheet kamu dengan `client_email` (role: Editor)

### 2. Deploy ke Cloudflare Pages

```bash
# Install wrangler
npm install

# Login ke Cloudflare
npx wrangler login

# Deploy
npx wrangler pages deploy public --project-name spp-infaq
```

### 3. Set Environment Variables (Secrets)

```bash
npx wrangler pages secret put GOOGLE_SHEET_ID
# Masukkan ID Google Sheet (dari URL)

npx wrangler pages secret put GOOGLE_SERVICE_ACCOUNT_EMAIL
# Masukkan client_email dari service account

npx wrangler pages secret put GOOGLE_SERVICE_ACCOUNT_KEY
# Masukkan FULL JSON key dari service account (paste seluruh JSON)
```

### 4. Seed Data Siswa

```bash
# Install dependencies untuk seed script
npm install googleapis

# Jalankan seed
GOOGLE_SHEET_ID="your-sheet-id" \
GOOGLE_SERVICE_ACCOUNT_KEY='{"type":"service_account",...}' \
node seed.js
```

Atau upload manual data siswa ke sheet via Google Sheets UI.

## Development Lokal

```bash
npx wrangler pages dev public --binding
```

## Data Siswa

File `siswa_processed.json` berisi data siswa yang sudah diproses:
- Kelas naik: V→VI, IV→V, III→IV, II→III, I→II (MIS)
- Kelas naik: VIII→IX, VII→VIII (MTs)
- Duplikat di Kelas VII sudah dibersihkan
- Siswa kelas 6 dan 9 (lulus) sudah dihapus
