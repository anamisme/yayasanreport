import { getGoogleAuthToken, getSheet, appendSheet, updateSheet, deleteSheetRow } from '../_utils/google-sheets.js'

const SHEET_NAME = 'Kategori'
const HEADERS = ['ID', 'Nama', 'Lembaga', 'JumlahDefault', 'CreatedAt']

function parseRows(rows) {
  if (!rows || rows.length < 2) return []
  return rows.slice(1).map((row, i) => ({
    id: parseInt(row[0]) || i + 1,
    nama: row[1] || '',
    lembaga: row[2] || '',
    jumlahDefault: parseInt(row[3]) || 0,
    createdAt: row[4] || '',
  })).filter((k) => k.nama)
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
      await appendSheet(token, sheetId, `${SHEET_NAME}!A:E`, [
        nextId, body.nama, body.lembaga, body.jumlahDefault || 0, now,
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
        return new Response(JSON.stringify({ error: 'kategori tidak ditemukan' }), {
          status: 404,
          headers,
        })
      }
      await deleteSheetRow(token, sheetId, SHEET_NAME, rowIdx)
      return new Response(JSON.stringify({ deleted: true }), { headers })
    }

    const data = await getSheet(token, sheetId, `${SHEET_NAME}!A:E`)
    let kategori = parseRows(data.values || [])

    const lembaga = url.searchParams.get('lembaga')
    if (lembaga) kategori = kategori.filter((k) => k.lembaga === lembaga)

    return new Response(JSON.stringify(kategori), { headers })
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers,
    })
  }
}
