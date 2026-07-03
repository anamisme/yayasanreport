import { getGoogleAuthToken, getSheet, updateSheet, MONTH_HEADERS } from '../_utils/google-sheets.js'

const KELAS_ORDER = {
  MIS: ['Kelas I','Kelas II','Kelas III','Kelas IV','Kelas V','Kelas VI'],
  MTs: ['Kelas VII','Kelas VIII','Kelas IX'],
}

function buildHeaders(lembaga) {
  return lembaga === 'PAUD'
    ? ['Nama', 'Nominal Infaq', ...MONTH_HEADERS, 'Total']
    : ['Nama', 'Kelas', 'Nominal Infaq', ...MONTH_HEADERS, 'Total']
}

function buildRows(students, lembaga) {
  const isPaud = lembaga === 'PAUD'
  const order = KELAS_ORDER[lembaga] || []
  const emptyMonths = MONTH_HEADERS.map(() => '')

  if (isPaud) {
    const rows = students.map(s => {
      const n = String(s.nominal)
      return [s.nama, n, ...emptyMonths, n]
    })
    return rows
  }

  const sorted = [...students].sort((a, b) => {
    const ai = order.indexOf(a.kelas); const bi = order.indexOf(b.kelas)
    return (ai >= 0 ? ai : 999) - (bi >= 0 ? bi : 999)
  })

  const rows = []
  let currentKelas = null
  let kelasRows = []

  function flushKelas() {
    if (!currentKelas || kelasRows.length === 0) return
    const sum = kelasRows.reduce((s, r) => s + (parseInt(r[2]) || 0), 0)
    rows.push(['', '', '', ...emptyMonths, ''])
    rows.push([`Jumlah ${currentKelas}`, '', String(sum), ...emptyMonths, String(sum)])
    rows.push(['', '', '', ...emptyMonths, ''])
    kelasRows = []
  }

  for (const s of sorted) {
    if (currentKelas && s.kelas !== currentKelas) flushKelas()
    currentKelas = s.kelas
    const n = String(s.nominal)
    const row = [s.nama, s.kelas, n, ...emptyMonths, n]
    rows.push(row)
    kelasRows.push(row)
  }
  flushKelas()

  return rows
}

export async function onRequest(context) {
  const { env } = context
  const headers = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
  try {
    const token = await getGoogleAuthToken(env)
    const sheetId = env.GOOGLE_SHEET_ID
    const result = {}

    for (const lembaga of ['MIS', 'MTs', 'PAUD']) {
      const data = await getSheet(token, sheetId, `${lembaga}!A:ZZ`)
      const rows = data.values || []
      if (rows.length < 2) { result[lembaga] = 'no data'; continue }

      const headersRow = rows[0]
      const monthCols = MONTH_HEADERS.map(m => headersRow.indexOf(m)).filter(i => i >= 0)
      const isPaud = lembaga === 'PAUD'

      // Parse existing students preserving payments
      const students = rows.slice(1).map(row => {
        const idx = headersRow.indexOf('Nominal Infaq')
        const nominal = isPaud
          ? (parseInt(row[1]) || 0)
          : (parseInt(row[2]) || 0)
        const kelas = isPaud ? '' : (row[1] || '')
        const nama = row[0] || ''
        const payments = {}
        monthCols.forEach((ci, mi) => { payments[MONTH_HEADERS[mi]] = row[ci] || '' })
        return { nama, kelas, nominal, payments }
      }).filter(s => s.nama)

      // Merge payments back into new rows
      const newRows = buildRows(students, lembaga)
      // Map each student row in newRows to its payment data
      const newHeaders = buildHeaders(lembaga)
      const totalCol = newHeaders.length - 1
      let sIdx = 0
      const newAll = [newHeaders, ...newRows]
      // Fill in payments for actual student rows (skip summary/empty rows)
      for (let ri = 1; ri < newAll.length; ri++) {
        const row = newAll[ri]
        if (!row[0] || row[0].startsWith('Jumlah ')) continue
        if (sIdx >= students.length) continue
        const student = students[sIdx]
        // Fill month columns with saved payments
        MONTH_HEADERS.forEach((m, mi) => {
          const colIdx = isPaud ? mi + 2 : mi + 3
          if (colIdx < row.length && student.payments[m]) {
            row[colIdx] = student.payments[m]
          }
        })
        sIdx++
      }

      // Get sheet info for clearing
      const info = await (await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${sheetId}`, {
        headers: { Authorization: `Bearer ${token}` }
      })).json()
      const sheetInfo = (info.sheets || []).find(s => s.properties.title === lembaga)
      if (!sheetInfo) { result[lembaga] = 'sheet not found'; continue }
      const gid = sheetInfo.properties.sheetId

      // Clear entire sheet
      await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${sheetId}:batchUpdate`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requests: [{
            updateCells: {
              range: { sheetId: gid },
              fields: 'userEnteredValue',
            }
          }]
        })
      })

      // Write new data
      const endCol = String.fromCharCode(64 + newHeaders.length)
      await updateSheet(token, sheetId, `${lembaga}!A1:${endCol}${newAll.length}`, newAll)

      result[lembaga] = `${students.length} siswa → ${newAll.length - 1} baris`
    }

    return new Response(JSON.stringify({ ok: true, result }), { headers })
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers })
  }
}
