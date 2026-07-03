import { getGoogleAuthToken, getSheet, updateSheet, MONTH_HEADERS, getMonthIdx } from '../_utils/google-sheets.js'

export async function onRequest(context) {
  const { request, env } = context
  const url = new URL(request.url)
  const method = request.method
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  }

  if (method === 'OPTIONS') return new Response(null, { headers })

  try {
    const token = await getGoogleAuthToken(env)
    const sheetId = env.GOOGLE_SHEET_ID
    const lembaga = (url.searchParams.get('lembaga') || 'MIS')

    if (method === 'POST') {
      const body = await request.json()
      const rowId = parseInt(body.siswaId)
      const bulan = parseInt(body.bulan)
      const tahun = parseInt(body.tahun)
      const jumlah = parseInt(body.jumlah) || 0

      if (!rowId || !bulan || !tahun) {
        return new Response(JSON.stringify({ error: 'siswaId, bulan, tahun diperlukan' }), { status: 400, headers })
      }

      const mi = getMonthIdx(bulan, tahun)
      if (mi < 0 || mi >= MONTH_HEADERS.length) {
        return new Response(JSON.stringify({ error: 'bulan/tahun tidak valid' }), { status: 400, headers })
      }

      const data = await getSheet(token, sheetId, `${lembaga}!A:ZZ`)
      const rows = data.values || []
      if (rowId >= rows.length) {
        return new Response(JSON.stringify({ error: 'siswa tidak ditemukan' }), { status: 404, headers })
      }

      const headersRow = rows[0] || []
      const monthColIdx = headersRow.indexOf(MONTH_HEADERS[mi])
      if (monthColIdx < 0) {
        return new Response(JSON.stringify({ error: 'kolom bulan tidak ditemukan' }), { status: 500, headers })
      }

      const value = `Lunas (Rp ${jumlah.toLocaleString('id-ID')})`
      rows[rowId - 1][monthColIdx] = value
      const colLetter = String.fromCharCode(65 + monthColIdx)
      await updateSheet(token, sheetId, `${lembaga}!${colLetter}${rowId}`, [value])

      return new Response(JSON.stringify({ success: true, rowId, bulan, tahun, jumlah }), { status: 201, headers })
    }

    if (method === 'DELETE') {
      const rowId = parseInt(url.searchParams.get('siswaId'))
      const bulan = parseInt(url.searchParams.get('bulan'))
      const tahun = parseInt(url.searchParams.get('tahun'))

      if (!rowId || !bulan || !tahun) {
        return new Response(JSON.stringify({ error: 'siswaId, bulan, tahun diperlukan' }), { status: 400, headers })
      }

      const mi = getMonthIdx(bulan, tahun)
      if (mi < 0 || mi >= MONTH_HEADERS.length) {
        return new Response(JSON.stringify({ error: 'bulan/tahun tidak valid' }), { status: 400, headers })
      }

      const data = await getSheet(token, sheetId, `${lembaga}!A:ZZ`)
      const rows = data.values || []
      if (rowId >= rows.length) {
        return new Response(JSON.stringify({ error: 'siswa tidak ditemukan' }), { status: 404, headers })
      }

      const headersRow = rows[0] || []
      const monthColIdx = headersRow.indexOf(MONTH_HEADERS[mi])
      if (monthColIdx < 0) {
        return new Response(JSON.stringify({ error: 'kolom bulan tidak ditemukan' }), { status: 500, headers })
      }

      rows[rowId - 1][monthColIdx] = ''
      const colLetter = String.fromCharCode(65 + monthColIdx)
      await updateSheet(token, sheetId, `${lembaga}!${colLetter}${rowId}`, [''])

      return new Response(JSON.stringify({ deleted: true }), { headers })
    }

    // GET
    const data = await getSheet(token, sheetId, `${lembaga}!A:ZZ`)
    const values = data.values || []
    const headersRow = values[0] || []
    const monthCols = MONTH_HEADERS.map(m => headersRow.indexOf(m))

    const bulanParam = url.searchParams.get('bulan')
    const tahunParam = url.searchParams.get('tahun')

    let payments = []
    for (let i = 1; i < values.length; i++) {
      const row = values[i]
      if (!row[0]) continue
      monthCols.forEach((ci, mi) => {
        if (ci >= 0 && row[ci]) {
          payments.push({
            id: i, siswaId: i + 1, nama: row[0],
            bulan: mi < 6 ? mi + 7 : mi - 5,
            tahun: mi < 6 ? 2026 : 2027,
            jumlah: parseInt(row[ci].replace(/\D/g, '')) || 0,
            lembaga,
            tanggal: MONTH_HEADERS[mi],
            kategori: 'Infaq',
          })
        }
      })
    }

    if (bulanParam) payments = payments.filter(p => p.bulan === parseInt(bulanParam))
    if (tahunParam) payments = payments.filter(p => p.tahun === parseInt(tahunParam))
    payments.sort((a, b) => b.tanggal.localeCompare(a.tanggal))

    return new Response(JSON.stringify(payments), { headers })
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers })
  }
}
