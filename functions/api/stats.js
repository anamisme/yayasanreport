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

    const bulanNames = BULAN_NAMES

    // Find month columns for the given year
    const monthly = bulanNames.map((name, idx) => {
      const bulan = idx + 1
      let mi = null
      if (tahun === 2026 && bulan >= 7) mi = bulan - 7
      else if (tahun === 2027 && bulan <= 6) mi = bulan + 5
      if (mi === null || mi >= MONTH_HEADERS.length) {
        return { bulan, bulanNama: name, totalSiswa: 0, paidCount: 0, unpaidCount: 0, percentage: 0, totalBayar: 0, aktif: false }
      }
      const colIdx = headersRow.indexOf(MONTH_HEADERS[mi])
      const totalSiswa = values.length - 1
      let paidCount = 0
      let totalBayar = 0
      for (let i = 1; i < values.length; i++) {
        const val = colIdx >= 0 ? (values[i][colIdx] || '') : ''
        if (val) {
          paidCount++
          const num = parseInt(val.replace(/\D/g, '')) || 0
          totalBayar += num
        }
      }
      return {
        bulan, bulanNama: name, totalSiswa, paidCount,
        unpaidCount: totalSiswa - paidCount,
        percentage: totalSiswa > 0 ? Math.round((paidCount / totalSiswa) * 100) : 0,
        totalBayar, aktif: true,
      }
    })

    const filtered = bulanParam ? monthly.filter(m => m.bulan === parseInt(bulanParam)) : monthly
    const totalPemasukan = monthly.filter(m => m.aktif).reduce((s, m) => s + m.totalBayar, 0)

    return new Response(JSON.stringify({
      tahun, lembaga,
      totalSiswa: Math.max(0, values.length - 1),
      totalPemasukan,
      monthly: filtered,
    }), { headers })
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers })
  }
}
