import { readFileSync, writeFileSync, unlinkSync } from 'fs'
import { execSync } from 'child_process'
import crypto from 'crypto'

const SHEET_ID = process.env.GOOGLE_SHEET_ID
const KEY_JSON = process.env.GOOGLE_SERVICE_ACCOUNT_KEY
if (!SHEET_ID || !KEY_JSON) { console.error('Missing env'); process.exit(1) }

const MONTHS = [
  'Jul 2026','Aug 2026','Sep 2026','Oct 2026','Nov 2026','Dec 2026',
  'Jan 2027','Feb 2027','Mar 2027','Apr 2027','May 2027','Jun 2027',
]
const KELAS_ORDER = { MIS: ['Kelas I','Kelas II','Kelas III','Kelas IV','Kelas V','Kelas VI'], 'MTs': ['Kelas VII','Kelas VIII','Kelas IX'] }
const KELAS_COLORS = {
  'Kelas I':   { red:0.91, green:0.96, blue:0.92 },
  'Kelas II':  { red:0.89, green:0.95, blue:0.99 },
  'Kelas III': { red:1.0,  green:0.95, blue:0.88 },
  'Kelas IV':  { red:0.99, green:0.90, blue:0.93 },
  'Kelas V':   { red:0.95, green:0.90, blue:0.96 },
  'Kelas VI':  { red:0.88, green:0.97, blue:0.97 },
  'Kelas VII':  { red:0.95, green:0.97, blue:0.91 },
  'Kelas VIII': { red:0.98, green:0.92, blue:0.90 },
  'Kelas IX':   { red:0.93, green:0.91, blue:0.96 },
}

function writeBody(url, token, body) {
  const f = '/tmp/gs_body.json'
  writeFileSync(f, JSON.stringify(body))
  const cmd = `curl -sS -X 'PUT' '${url.replace(/'/g,"'\\''")}' -H 'Authorization: Bearer ${token}' -H 'Content-Type: application/json' -d @'${f}'`
  const r = JSON.parse(execSync(cmd, { encoding: 'utf-8', timeout: 60000 }))
  unlinkSync(f)
  if (r.error) throw new Error(`PUT failed: ${JSON.stringify(r.error)}`)
  return r
}

function curl(method, url, token, body) {
  const f = body ? '/tmp/gs_body.json' : null
  if (f) writeFileSync(f, JSON.stringify(body))
  const cmd = `curl -sS -X '${method.replace(/'/g,"'\\''")}' '${url.replace(/'/g,"'\\''")}' -H 'Authorization: Bearer ${token}' -H 'Content-Type: application/json'${f ? ` -d @'${f}'` : ''}`
  const r = execSync(cmd, { encoding: 'utf-8', timeout: 30000 })
  if (f) unlinkSync(f)
  return JSON.parse(r)
}

async function getToken() {
  const key = JSON.parse(KEY_JSON)
  const b = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
  const now = Math.floor(Date.now() / 1000)
  const payload = `${b({alg:'RS256',typ:'JWT'})}.${b({iss:key.client_email,scope:'https://www.googleapis.com/auth/spreadsheets',aud:'https://oauth2.googleapis.com/token',exp:now+3600,iat:now})}`
  const sig = crypto.sign(null, Buffer.from(payload), crypto.createPrivateKey(key.private_key))
  const jwt = `${payload}.${sig.toString('base64url')}`
  const res = execSync(`curl -sS -X POST 'https://oauth2.googleapis.com/token' -H 'Content-Type: application/x-www-form-urlencoded' -d 'grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${encodeURIComponent(jwt)}'`, { encoding: 'utf-8', timeout: 15000 })
  return JSON.parse(res).access_token
}

function buildRows(students, lembaga) {
  const order = KELAS_ORDER[lembaga], empty = MONTHS.map(() => '')

  if (lembaga === 'PAUD') {
    const rows = students.map(s => {
      const n = String(s.tarif || s.tarifInfaq || 0)
      return [s.nama, n, ...empty, n]
    })
    return { rows, ranges: [], totalBaris: rows.length }
  }

  const sorted = [...students].sort((a, b) => (order.indexOf(a.kelas) >= 0 ? order.indexOf(a.kelas) : 999) - (order.indexOf(b.kelas) >= 0 ? order.indexOf(b.kelas) : 999))

  const rows = []
  let prevKelas = null
  const ranges = []
  let currentKelas = null, rangeStart = 2, kelasRows = []

  function flushKelas() {
    if (!currentKelas || kelasRows.length === 0) return
    const sum = kelasRows.reduce((s, r) => s + (parseInt(r[2]) || 0), 0)
    // Add separator
    rows.push(['', '', '', ...empty, ''])
    // Add summary row
    const sepEmpty = MONTHS.map(() => '')
    rows.push([`Jumlah ${currentKelas}`, '', String(sum), ...sepEmpty, String(sum)])
    // Add another separator
    rows.push(['', '', '', ...sepEmpty, ''])
    ranges.push({ kelas: currentKelas, start: rangeStart, end: rows.length - 2 })
    kelasRows = []
  }

  for (const s of sorted) {
    if (prevKelas && s.kelas !== prevKelas) flushKelas()
    if (!currentKelas || s.kelas !== currentKelas) { currentKelas = s.kelas; rangeStart = rows.length + 2 }
    prevKelas = s.kelas
    const n = String(s.tarifInfaq || 0)
    const row = [s.nama, s.kelas, n, ...empty, n]
    rows.push(row)
    kelasRows.push(row)
  }
  flushKelas()

  return { rows, ranges, totalBaris: students.length }
}

async function main() {
  console.log('Getting token...')
  const token = await getToken()
  console.log('✓ Token')

  const base = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}`
  const gs = (m, p, b) => curl(m, `${base}${p}`, token, b)

  const info = gs('GET', '')
  const existing = info.sheets.map(s => s.properties.title)

  for (const name of ['Siswa','Pembayaran','Paud','Sheet1','MIS','MTs','PAUD']) {
    if (existing.includes(name)) {
      const id = info.sheets.find(s => s.properties.title === name).properties.sheetId
      gs('POST', ':batchUpdate', { requests: [{ deleteSheet: { sheetId: id } }] })
    }
  }

  const COLS = ['Nama','Kelas','Nominal Infaq', ...MONTHS, 'Total']
  const HEADERS = { MIS: COLS, 'MTs': COLS, PAUD: ['Nama','Nominal Infaq', ...MONTHS, 'Total'] }

  const siswaData = JSON.parse(readFileSync('/Users/baitulhikmah/Downloads/siswa_processed.json', 'utf-8'))
  const paudData = JSON.parse(readFileSync('/Users/baitulhikmah/Downloads/siswa_paud.json', 'utf-8'))
  const byLembaga = { MIS: [], 'MTs': [] }
  for (const s of siswaData) byLembaga[s.lembaga].push(s)

  for (const [lembaga, students] of Object.entries({ ...byLembaga, PAUD: paudData })) {
    const resp = gs('POST', ':batchUpdate', { requests: [{ addSheet: { properties: { title: lembaga } } }] })
    const gid = resp.replies[0].addSheet.properties.sheetId
    const h = HEADERS[lembaga]
    const { rows, ranges } = buildRows(students, lembaga)
    const all = [h, ...rows]
    const cols = String.fromCharCode(64 + h.length)

    writeBody(`${base}/values/${encodeURIComponent(lembaga)}!A1:${cols}${all.length}?valueInputOption=USER_ENTERED`, token, { values: all })

    // Colors per class (excluding summary rows)
    const colorReqs = ranges.map(r => ({
      repeatCell: {
        range: { sheetId: gid, startRowIndex: r.start - 1, endRowIndex: r.end - 1, startColumnIndex: 0, endColumnIndex: h.length },
        cell: { userEnteredFormat: { backgroundColor: KELAS_COLORS[r.kelas] || { red:1, green:1, blue:1 } } },
        fields: 'userEnteredFormat.backgroundColor',
      }
    }))
    if (colorReqs.length > 0) gs('POST', ':batchUpdate', { requests: colorReqs })

    console.log(`✓ ${lembaga}: ${all.length} baris (${students.length} siswa, ${ranges.length} kelas)`)
  }

  // Kategori
  const info2 = gs('GET', '')
  if (!info2.sheets.map(s => s.properties.title).includes('Kategori')) {
    gs('POST', ':batchUpdate', { requests: [{ addSheet: { properties: { title: 'Kategori' } } }] })
  }
  const now = new Date().toISOString().split('T')[0]
  writeBody(`${base}/values/Kategori!A1:E3?valueInputOption=USER_ENTERED`, token, { values: [['ID','Nama','Lembaga','JumlahDefault','CreatedAt'],[1,'Infaq','MIS',40000,now],[2,'Infaq','MTs',60000,now]] })
  console.log('✓ Kategori')

  console.log(`\n✅ Selesai!\nhttps://docs.google.com/spreadsheets/d/${SHEET_ID}`)
}

main().catch(e => { console.error(e); process.exit(1) })
