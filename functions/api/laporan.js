import { getGoogleAuthToken, getSheet, SHEET_NAMES, MONTH_HEADERS } from '../_utils/google-sheets.js'

export async function onRequest(context) {
  const { request, env } = context
  const url = new URL(request.url)
  const headers = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
  try {
    const token = await getGoogleAuthToken(env)
    const sheetId = env.GOOGLE_SHEET_ID
    const lembaga = url.searchParams.get('lembaga') || 'MIS'
    if (!SHEET_NAMES.includes(lembaga)) {
      return new Response(JSON.stringify({ error: `lembaga tidak valid: ${lembaga}` }), { headers, status: 400 })
    }
    const kelasFilter = url.searchParams.get('kelas') || ''
    const bulanAwal = parseInt(url.searchParams.get('bulanAwal')) || 7
    const bulanAkhir = parseInt(url.searchParams.get('bulanAkhir')) || 12
    const tahun = parseInt(url.searchParams.get('tahun')) || 2026

    const data = await getSheet(token, sheetId, `${lembaga}!A:ZZ`)
    const rows = data.values || []
    if (rows.length < 2) return new Response(JSON.stringify([]), { headers })

    const headersRow = rows[0] || []
    const isPaud = lembaga === 'PAUD'
    const monthCols = MONTH_HEADERS.map(m => ({ header: m, colIdx: headersRow.indexOf(m) }))
      .filter(m => m.colIdx >= 0)

    // Filter months in range
    const filterMonths = monthCols.filter(m => {
      const parts = m.header.split(' ')
      const mBulan = MONTH_HEADERS.indexOf(m.header)
      if (tahun === 2026) return mBulan >= bulanAwal - 7 && mBulan <= bulanAkhir - 7
      if (tahun === 2027) return mBulan >= bulanAwal + 5 && mBulan <= bulanAkhir + 5
      return false
    })

    const students = rows.slice(1).map((row, i) => {
      if (!row[0] || row[0].startsWith('Jumlah ')) return null
      const nama = row[0] || ''
      const kelas = isPaud ? '' : (row[1] || '')
      const nominal = isPaud ? (parseInt(row[1]) || 0) : (parseInt(row[2]) || 0)

      const payments = {}
      let unpaidCount = 0
      let totalUnpaidNominal = 0
      filterMonths.forEach(m => {
        const val = row[m.colIdx] || ''
        const paid = !!val
        payments[m.header] = paid
        if (!paid) { unpaidCount++; totalUnpaidNominal += nominal }
      })

      return { nama, kelas, nominalInfaq: nominal, payments, unpaidCount, totalUnpaidNominal }
    }).filter(s => s !== null)

    let filtered = students
    if (kelasFilter && lembaga !== 'PAUD') filtered = filtered.filter(s => s.kelas === kelasFilter)
    if (url.searchParams.get('unpaidOnly') !== 'false') filtered = filtered.filter(s => s.unpaidCount > 0)

    return new Response(JSON.stringify({
      lembaga, kelas: kelasFilter,
      bulanAwal, bulanAkhir, tahun,
      totalSiswa: students.length,
      unpaidSiswa: filtered.length,
      months: filterMonths.map(m => m.header),
      siswa: filtered,
    }), { headers })
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers })
  }
}
