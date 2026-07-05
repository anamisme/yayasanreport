import { getGoogleAuthToken, getSheet, appendSheet, updateSheet, deleteSheetRow, deleteSheetTab, createSheet, MONTH_HEADERS } from '../_utils/google-sheets.js'

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

function sheetTitle(nama, lembaga) {
  const l = lembaga || 'Semua'
  return `${l} - ${nama}`
}

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

    if (method === 'POST') {
      const body = await request.json()
      const data = await getSheet(token, sheetId, `${SHEET_NAME}!A:A`)
      const nextId = (data.values?.length || 1)
      const now = new Date().toISOString().split('T')[0]
      await appendSheet(token, sheetId, `${SHEET_NAME}!A:E`, [
        nextId, body.nama, body.lembaga || '', body.jumlahDefault || 0, now,
      ])

      // Create a new sheet tab for this category
      const title = sheetTitle(body.nama, body.lembaga || '')
      await createSheet(token, sheetId, title)

      // Populate with students from the lembaga
      const l = body.lembaga || 'MIS'
      if (l) {
        try {
          const siswaData = await getSheet(token, sheetId, `${l}!A:ZZ`)
          const vals = siswaData.values || []
          if (vals.length > 0) {
            const isPaud = l === 'PAUD'
            const newHeaders = isPaud
              ? ['Nama', 'Nominal Infaq', ...MONTH_HEADERS]
              : ['Nama', 'Kelas', 'Nominal Infaq', ...MONTH_HEADERS]

            // Build rows: headers + all students (empty payment columns)
            const emptyMonths = MONTH_HEADERS.map(() => '')
            const rows = [newHeaders]
            for (let i = 1; i < vals.length; i++) {
              const r = vals[i]
              if (!r[0]) { rows.push(['', '', ...emptyMonths]); continue }
              if (isPaud) {
                rows.push([r[0], r[1] || '0', ...emptyMonths])
              } else {
                rows.push([r[0], r[1] || '', r[2] || '0', ...emptyMonths])
              }
            }
            await updateSheet(token, sheetId, `${title}!A:ZZ`, rows)
          }
        } catch (e) {
          // Sheet lembaga might not exist yet, that's OK
        }
      }

      return new Response(JSON.stringify({ id: nextId, ...body }), {
        status: 201,
        headers,
      })
    }

    if (method === 'DELETE') {
      const role = request.headers.get('X-User-Role')
      if (role !== 'superadmin') {
        return new Response(JSON.stringify({ error: 'Forbidden', message: 'Hanya superadmin yang dapat menghapus data' }), { status: 403, headers })
      }
      const id = url.searchParams.get('id')
      if (!id) {
        return new Response(JSON.stringify({ error: 'id diperlukan' }), {
          status: 400,
          headers,
        })
      }
      const data = await getSheet(token, sheetId, `${SHEET_NAME}!A:E`)
      const rows = data.values || []
      const rowIdx = rows.findIndex((r) => parseInt(r[0]) === parseInt(id))
      if (rowIdx < 0) {
        return new Response(JSON.stringify({ error: 'kategori tidak ditemukan' }), {
          status: 404,
          headers,
        })
      }
      const kategoriRow = rows[rowIdx]
      const nama = kategoriRow[1] || ''
      const lembaga = kategoriRow[2] || ''
      await deleteSheetRow(token, sheetId, SHEET_NAME, rowIdx)
      if (nama) {
        const title = `${lembaga || 'Semua'} - ${nama}`
        await deleteSheetTab(token, sheetId, title)
      }
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
