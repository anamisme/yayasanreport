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

    if (method === 'PUT') {
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
      const body = await request.json()
      const jumlah = parseInt(body.jumlah) || 0
      const metode = body.metode || 'Cash'

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

      const kategori = body.kategori || 'Infaq'
      const value = String(jumlah)
      rows[rowId - 1][monthColIdx] = value
      const colLetter = String.fromCharCode(65 + monthColIdx)
      await updateSheet(token, sheetId, `${lembaga}!${colLetter}${rowId}`, [value])

      return new Response(JSON.stringify({ success: true, rowId, bulan, tahun, jumlah, metode, kategori }), { headers })
    }

    if (method === 'POST') {
      const body = await request.json()
      const nama = body.nama
      const bulan = parseInt(body.bulan)
      const tahun = parseInt(body.tahun)
      const jumlah = parseInt(body.jumlah) || 0
      const metode = body.metode || 'Cash'

      if (!nama || !bulan || !tahun) {
        return new Response(JSON.stringify({ error: 'nama, bulan, tahun diperlukan' }), { status: 400, headers })
      }

      const mi = getMonthIdx(bulan, tahun)
      if (mi < 0 || mi >= MONTH_HEADERS.length) {
        return new Response(JSON.stringify({ error: 'bulan/tahun tidak valid' }), { status: 400, headers })
      }

      const data = await getSheet(token, sheetId, `${lembaga}!A:ZZ`)
      const rows = data.values || []
      let targetIdx = -1
      for (let i = 1; i < rows.length; i++) {
        if (rows[i] && rows[i][0] && rows[i][0].trim() === nama) {
          targetIdx = i; break
        }
      }
      if (targetIdx < 0) {
        return new Response(JSON.stringify({ error: 'siswa tidak ditemukan', debug: { nama, totalRows: rows.length, lembaga } }), { status: 404, headers })
      }

      const headersRow = rows[0] || []
      const monthColIdx = headersRow.indexOf(MONTH_HEADERS[mi])
      if (monthColIdx < 0) {
        return new Response(JSON.stringify({ error: 'kolom bulan tidak ditemukan' }), { status: 500, headers })
      }

      const kategori = body.kategori || 'Infaq'
      const oldValue = rows[targetIdx][monthColIdx] || ''
      const value = String(jumlah)
      rows[targetIdx][monthColIdx] = value
      const colLetter = String.fromCharCode(65 + monthColIdx)
      const rowNum = targetIdx + 1
      await updateSheet(token, sheetId, `${lembaga}!${colLetter}${rowNum}`, [value])

      return new Response(JSON.stringify({ success: true, rowId: rowNum, targetName: rows[targetIdx][0], bulan, tahun, jumlah, metode, kategori, oldValue, newValue: value }), { status: 201, headers })
    }

    if (method === 'DELETE') {
      const role = request.headers.get('X-User-Role')
      if (role !== 'superadmin') {
        return new Response(JSON.stringify({ error: 'Forbidden', message: 'Hanya superadmin yang dapat menghapus data' }), { status: 403, headers })
      }
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
      let targetIdx = -1
      let count = 0
      for (let i = 1; i < rows.length; i++) {
        if (rows[i] && rows[i][0] && !rows[i][0].startsWith('Jumlah ')) {
          count++
          if (count === rowId) { targetIdx = i; break }
        }
      }
      if (targetIdx < 0) {
        return new Response(JSON.stringify({ error: 'siswa tidak ditemukan' }), { status: 404, headers })
      }

      const headersRow = rows[0] || []
      const monthColIdx = headersRow.indexOf(MONTH_HEADERS[mi])
      if (monthColIdx < 0) {
        return new Response(JSON.stringify({ error: 'kolom bulan tidak ditemukan' }), { status: 500, headers })
      }

      rows[targetIdx][monthColIdx] = ''
      const colLetter = String.fromCharCode(65 + monthColIdx)
      const rowNum = targetIdx + 1
      await updateSheet(token, sheetId, `${lembaga}!${colLetter}${rowNum}`, [''])

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
      let validCount = 0
      for (let i = 1; i < values.length; i++) {
        const row = values[i]
        if (!row[0] || row[0].startsWith('Jumlah ')) continue
        validCount++
        const sid = validCount
      monthCols.forEach((ci, mi) => {
        if (ci >= 0 && row[ci]) {
          const raw = row[ci]
          const jumlah = parseInt(raw.replace(/\D/g, '')) || 0
          if (jumlah <= 0) return
          payments.push({
            id: i, siswaId: sid, nama: row[0],
            kelas: lembaga === 'PAUD' ? '' : (row[1] || ''),
            bulan: mi < 6 ? mi + 7 : mi - 5,
            tahun: mi < 6 ? 2026 : 2027,
            jumlah, metode: 'Cash', kategori: 'Infaq',
            lembaga,
            tanggal: MONTH_HEADERS[mi],
          })
        }
      })
    }

    if (bulanParam) payments = payments.filter(p => p.bulan === parseInt(bulanParam))
    if (tahunParam) payments = payments.filter(p => p.tahun === parseInt(tahunParam))
    payments.sort((a, b) => {
      const [m1, y1] = a.tanggal.split(' ')
      const [m2, y2] = b.tanggal.split(' ')
      const months = { Jul:7,Aug:8,Sep:9,Oct:10,Nov:11,Dec:12,Jan:1,Feb:2,Mar:3,Apr:4,May:5,Jun:6 }
      return (parseInt(y2) - parseInt(y1)) || (months[m2] - months[m1])
    })

    return new Response(JSON.stringify(payments), { headers })
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers })
  }
}
