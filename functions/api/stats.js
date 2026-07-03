import { getGoogleAuthToken, getSheet, MONTH_HEADERS } from '../_utils/google-sheets.js'

const BULAN_NAMES = [
  'Januari','Februari','Maret','April','Mei','Juni',
  'Juli','Agustus','September','Oktober','November','Desember',
]

export async function onRequest(context) {
  const { request, env } = context
  const url = new URL(request.url)
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
  }

  try {
    const token = await getGoogleAuthToken(env)
    const sheetId = env.GOOGLE_SHEET_ID
    const lembaga = url.searchParams.get('lembaga') || 'MIS'
    const tahun = parseInt(url.searchParams.get('tahun')) || 2026
    const bulanParam = url.searchParams.get('bulan')

    const data = await getSheet(token, sheetId, `${lembaga}!A:ZZ`)
    const values = data.values || []
    const headersRow = values[0] || []

    // Filter out summary/separator rows (only actual student rows)
    const studentRows = values.slice(1).filter(r => r[0] && !r[0].startsWith('Jumlah '))
    const totalSiswa = studentRows.length
    let totalCash = 0, totalQris = 0
    let cashCount = 0, qrisCount = 0

    const monthly = BULAN_NAMES.map((name, idx) => {
      const bulan = idx + 1
      let mi = null
      if (tahun === 2026 && bulan >= 7) mi = bulan - 7
      else if (tahun === 2027 && bulan <= 6) mi = bulan + 5
      if (mi === null || mi >= MONTH_HEADERS.length) {
        return { bulan, bulanNama: name, totalSiswa: 0, paidCount: 0, unpaidCount: 0, percentage: 0, totalBayar: 0, cashTotal: 0, qrisTotal: 0, cashCount: 0, qrisCount: 0, aktif: false }
      }
      const colIdx = headersRow.indexOf(MONTH_HEADERS[mi])
      let paidCount = 0, totalBayar = 0
      let mCash = 0, mQris = 0, cCash = 0, cQris = 0
      for (const row of studentRows) {
        const val = colIdx >= 0 ? (row[colIdx] || '') : ''
        if (val) {
          paidCount++
          const parts = val.match(/Lunas\s*Rp(\d+)\s*(Cash|QRIS)/i)
          const num = parts ? parseInt(parts[1]) : (parseInt(val.replace(/\D/g, '')) || 0)
          const metode = parts ? parts[2] : 'Cash'
          totalBayar += num
          if (metode === 'QRIS') { mQris += num; cQris++ }
          else { mCash += num; cCash++ }
        }
      }
      totalCash += mCash; totalQris += mQris
      cashCount += cCash; qrisCount += cQris
      return {
        bulan, bulanNama: name, totalSiswa, paidCount,
        unpaidCount: totalSiswa - paidCount,
        percentage: totalSiswa > 0 ? Math.round((paidCount / totalSiswa) * 100) : 0,
        totalBayar, cashTotal: mCash, qrisTotal: mQris, cashCount: cCash, qrisCount: cQris, aktif: true,
      }
    })

    const filtered = bulanParam ? monthly.filter(m => m.bulan === parseInt(bulanParam)) : monthly
    const totalPemasukan = monthly.filter(m => m.aktif).reduce((s, m) => s + m.totalBayar, 0)

    return new Response(JSON.stringify({
      tahun, lembaga,
      totalSiswa: Math.max(0, values.length - 1),
      totalPemasukan, totalCash, totalQris, cashCount, qrisCount,
      monthly: filtered,
    }), { headers })
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers })
  }
}
