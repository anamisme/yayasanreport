import { getGoogleAuthToken, getSheet, appendSheet, updateSheet, deleteSheetRow } from '../_utils/google-sheets.js'

const SHEET_NAME = 'Siswa'
const HEADERS = ['ID', 'Nama', 'Lembaga', 'Kelas', 'TarifInfaq', 'CreatedAt']

function parseRows(rows) {
  if (!rows || rows.length < 2) return []
  return rows.slice(1).map((row, i) => ({
    id: parseInt(row[0]) || i + 1,
    nama: row[1] || '',
    lembaga: row[2] || '',
    kelas: row[3] || '',
    tarifInfaq: parseInt(row[4]) || 0,
    createdAt: row[5] || '',
  })).filter((s) => s.nama)
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
      await appendSheet(token, sheetId, `${SHEET_NAME}!A:F`, [
        nextId, body.nama, body.lembaga, body.kelas, body.tarifInfaq, now,
      ])
      return new Response(JSON.stringify({ id: nextId, ...body }), {
        status: 201,
        headers,
      })
    }

    if (method === 'PUT') {
      const id = url.searchParams.get('id')
      const body = await request.json()
      const data = await getSheet(token, sheetId, `${SHEET_NAME}!A:F`)
      const rows = data.values || []
      const rowIdx = rows.findIndex((r) => parseInt(r[0]) === parseInt(id))
      if (rowIdx < 0) {
        return new Response(JSON.stringify({ error: 'siswa tidak ditemukan' }), {
          status: 404,
          headers,
        })
      }
      await updateSheet(token, sheetId, `${SHEET_NAME}!A${rowIdx + 1}:F${rowIdx + 1}`, [
        parseInt(id), body.nama, body.lembaga, body.kelas, body.tarifInfaq, rows[rowIdx][5] || new Date().toISOString().split('T')[0],
      ])
      return new Response(JSON.stringify({ id: parseInt(id), ...body }), { headers })
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
        return new Response(JSON.stringify({ error: 'siswa tidak ditemukan' }), {
          status: 404,
          headers,
        })
      }
      await deleteSheetRow(token, sheetId, SHEET_NAME, rowIdx)
      return new Response(JSON.stringify({ deleted: true }), { headers })
    }

    const data = await getSheet(token, sheetId, `${SHEET_NAME}!A:F`)
    let siswa = parseRows(data.values || [])

    const lembaga = url.searchParams.get('lembaga')
    const kelas = url.searchParams.get('kelas')
    const search = url.searchParams.get('search')?.toLowerCase()

    if (lembaga) siswa = siswa.filter((s) => s.lembaga === lembaga)
    if (kelas) siswa = siswa.filter((s) => s.kelas === kelas)
    if (search) {
      siswa = siswa.filter(
        (s) => s.nama.toLowerCase().includes(search) || s.kelas.toLowerCase().includes(search)
      )
    }

    return new Response(JSON.stringify(siswa), { headers })
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers,
    })
  }
}
