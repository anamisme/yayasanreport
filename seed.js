/**
 * Seed script to initialize Google Sheet with student data.
 *
 * Usage:
 *   GOOGLE_SHEET_ID="xxx" \
 *   GOOGLE_SERVICE_ACCOUNT_EMAIL="xxx@xxx.iam.gserviceaccount.com" \
 *   GOOGLE_PRIVATE_KEY="$(cat key.json)" \
 *   node seed.js
 *
 * Requires: GOOGLE_SERVICE_ACCOUNT_KEY env var (JSON string of service account key)
 */

const STUDENTS_FILE = '/Users/baitulhikmah/Downloads/siswa_processed.json'
const fs = require('fs')
const { google } = require('googleapis')

async function main() {
  const sheetId = process.env.GOOGLE_SHEET_ID
  if (!sheetId) throw new Error('GOOGLE_SHEET_ID required')

  const keyData = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY || '{}')
  if (!keyData.client_email) throw new Error('GOOGLE_SERVICE_ACCOUNT_KEY required')

  const auth = new google.auth.JWT({
    email: keyData.client_email,
    key: keyData.private_key,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  })

  const sheets = google.sheets({ version: 'v4', auth })

  // Initialize sheet tabs
  const sheetsConfig = [
    { title: 'Siswa', headers: ['ID', 'Nama', 'Lembaga', 'Kelas', 'TarifInfaq', 'CreatedAt'] },
    { title: 'Pembayaran', headers: ['ID', 'SiswaID', 'Bulan', 'Tahun', 'Jumlah', 'Kategori', 'Tanggal', 'Lembaga', 'Keterangan'] },
    { title: 'Kategori', headers: ['ID', 'Nama', 'Lembaga', 'JumlahDefault', 'CreatedAt'] },
    { title: 'Paud', headers: ['ID', 'Nama', 'Tarif', 'CreatedAt'] },
  ]

  // Get existing sheets
  const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId: sheetId })
  const existingTitles = spreadsheet.data.sheets.map((s) => s.properties.title)

  // Create missing sheets
  for (const config of sheetsConfig) {
    if (!existingTitles.includes(config.title)) {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: sheetId,
        requestBody: {
          requests: [{
            addSheet: { properties: { title: config.title } },
          }],
        },
      })
      // Add headers
      await sheets.spreadsheets.values.update({
        spreadsheetId: sheetId,
        range: `${config.title}!A1`,
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: [config.headers] },
      })
      console.log(`Created sheet: ${config.title}`)
    }
  }

  // Seed students
  const siswaData = JSON.parse(fs.readFileSync(STUDENTS_FILE, 'utf-8'))
  const now = new Date().toISOString().split('T')[0]

  const rows = siswaData.map((s, i) => [
    i + 1, s.nama, s.lembaga, s.kelas, s.tarifInfaq, now,
  ])

  // Clear existing data (keep header)
  await sheets.spreadsheets.values.clear({
    spreadsheetId: sheetId,
    range: 'Siswa!A2:F',
  })

  // Upload in batches of 100
  for (let i = 0; i < rows.length; i += 100) {
    const batch = rows.slice(i, i + 100)
    await sheets.spreadsheets.values.append({
      spreadsheetId: sheetId,
      range: 'Siswa!A:F',
      valueInputOption: 'USER_ENTERED',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values: batch },
    })
  }

  console.log(`Seeded ${siswaData.length} students`)

  // Seed default categories
  const kategoriData = [
    [1, 'Infaq', 'MIS', 40000, now],
    [2, 'Infaq', 'MTs', 60000, now],
  ]

  const katExisting = await sheets.spreadsheets.values.get({
    spreadsheetId: sheetId,
    range: 'Kategori!A:A',
  })

  if (!katExisting.data.values || katExisting.data.values.length <= 1) {
    await sheets.spreadsheets.values.clear({
      spreadsheetId: sheetId,
      range: 'Kategori!A2:E',
    })
    await sheets.spreadsheets.values.append({
      spreadsheetId: sheetId,
      range: 'Kategori!A:E',
      valueInputOption: 'USER_ENTERED',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values: kategoriData },
    })
    console.log('Seeded default categories')
  }

  console.log('\n✅ Seed selesai!')
  console.log(`Sheet: https://docs.google.com/spreadsheets/d/${sheetId}`)
}

main().catch(console.error)
