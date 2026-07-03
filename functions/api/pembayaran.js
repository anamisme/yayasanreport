import { getGoogleAuthToken, getSheet, appendSheet, deleteSheetRow } from '../_utils/google-sheets.js'

const SHEET_NAME = 'Pembayaran'
const HEADERS = ['ID', 'SiswaID', 'Bulan', 'Tahun', 'Jumlah', 'Kategori', 'Tanggal', 'Lembaga', 'Keterangan']

function parseRows(rows) {
  if (!rows || rows.length < 2) return []
  return rows.slice(1).map((row, i) => ({
    id: parseInt(row[0]) || i + 1,
    siswaId: parseInt(row[1]) || 0,
    bulan: parseInt(row[2]) || 0,
    tahun: parseInt(row[3]) || 0,
    jumlah: parseInt(row[4]) || 0,
    kategori: row[5] || 'Infaq',
    tanggal: row[6] || '',
    lembaga: row[7] || '',
    keterangan: row[8] || '',
  }))
}

export async function onRequest(context) {
  const { request, env } = context
  const url = new URL(request.url)
  const method = request.method
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  }

  if (method === 'OPTIONS') return new Response(null, { headers })

  try {
    const token = await getGoogleAuthToken(env)
    const sheetId = env.GOOGLE_SHEET_ID

    if (method === 'POST') {
      const body = await request.json()
      const data = await getSheet(token, sheetId, `${SHEET_NAME}!A:A`)
      const nextId = (data.values?.length || 1)
      const now = new Date().toISOString().split('T')[0]
      await appendSheet(token, sheetId, `${SHEET_NAME}!A:I`, [
        nextId,
        body.siswaId,
        body.bulan,
        body.tahun || new Date().getFullYear(),
        body.jumlah,
        body.kategori || 'Infaq',
        now,
        body.lembaga,
        body.keterangan || '',
      ])
      return new Response(JSON.stringify({ id: nextId, ...body }), {
        status: 201,
        headers,
      })
    }

    if (method === 'DELETE') {
      const id = url.searchParams.get('id')
      if (!id) {
        return new Response(JSON.stringify({ error: 'id diperlukan' }), {
          status: 400,
          headers,
        })
      }
      const data = await getSheet(token, sheetId, `${SHEET_NAME}!A:A`)
      const rows = data.values || []
      const rowIdx = rows.findIndex((r) => parseInt(r[0]) === parseInt(id))
      if (rowIdx < 0) {
        return new Response(JSON.stringify({ error: 'pembayaran tidak ditemukan' }), {
          status: 404,
          headers,
        })
      }
      await deleteSheetRow(token, sheetId, SHEET_NAME, rowIdx)
      return new Response(JSON.stringify({ deleted: true }), { headers })
    }

    const data = await getSheet(token, sheetId, `${SHEET_NAME}!A:I`)
    let payments = parseRows(data.values || [])

    const siswaId = url.searchParams.get('siswaId')
    const bulan = url.searchParams.get('bulan')
    const tahun = url.searchParams.get('tahun')
    const lembaga = url.searchParams.get('lembaga')

    if (siswaId) payments = payments.filter((p) => p.siswaId === parseInt(siswaId))
    if (bulan) payments = payments.filter((p) => p.bulan === parseInt(bulan))
    if (tahun) payments = payments.filter((p) => p.tahun === parseInt(tahun))
    if (lembaga) payments = payments.filter((p) => p.lembaga === lembaga)

    payments.sort((a, b) => b.tanggal.localeCompare(a.tanggal))

    return new Response(JSON.stringify(payments), { headers })
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers,
    })
  }
}
