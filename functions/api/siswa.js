import { getGoogleAuthToken, getSheet, appendSheet, updateSheet, deleteSheetRow, MONTH_HEADERS } from '../_utils/google-sheets.js'

function parseValues(rows, lembaga) {
  if (!rows || rows.length < 2) return []
  const headers = rows[0] || []
  const monthCols = MONTH_HEADERS.map((m, i) => ({ month: m, idx: headers.indexOf(m) })).filter(m => m.idx >= 0)
  const isPaud = lembaga === 'PAUD'
  const result = []
  let seq = 0
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i]
    if (!row || !row[0] || row[0].startsWith('Jumlah ')) continue
    seq++
    const kelas = isPaud ? '' : (row[1] || '')
    const nominal = isPaud ? (parseInt(row[1]) || 0) : (parseInt(row[2]) || 0)
    const payments = {}
    monthCols.forEach(mc => { payments[mc.month] = row[mc.idx] || '' })
    result.push({ id: seq, nama: row[0] || '', kelas, nominalInfaq: nominal, payments, lembaga })
  }
  return result
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
    const lembaga = (url.searchParams.get('lembaga') || 'MIS')

    if (method === 'POST') {
      const body = await request.json()
      const isPaud = lembaga === 'PAUD'
      const total = body.nominalInfaq || 0
      const row = isPaud
        ? [body.nama, total, ...MONTH_HEADERS.map(() => ''), String(total)]
        : [body.nama, body.kelas || '', total, ...MONTH_HEADERS.map(() => ''), String(total)]
      await appendSheet(token, sheetId, `${lembaga}!A:ZZ`, row)
      return new Response(JSON.stringify({ ...body }), { status: 201, headers })
    }

    if (method === 'PUT') {
      const id = parseInt(url.searchParams.get('id'))
      if (!id) { return new Response(JSON.stringify({ error: 'id diperlukan' }), { status: 400, headers }) }
      const body = await request.json()
      const data = await getSheet(token, sheetId, `${lembaga}!A:ZZ`)
      const rows = data.values || []
      let targetIdx = -1
      for (let i = 1; i < rows.length; i++) {
        if (rows[i] && rows[i][0] && !rows[i][0].startsWith('Jumlah ')) {
          if (--id === 0) { targetIdx = i; break }
        }
      }
      if (targetIdx < 0) { return new Response(JSON.stringify({ error: 'siswa tidak ditemukan' }), { status: 404, headers }) }
      const row = rows[targetIdx]
      const isPaud = lembaga === 'PAUD'
      const totalCol = row.length - 1
      if (isPaud) {
        row[0] = body.nama; row[1] = String(body.nominalInfaq || 0); row[totalCol] = String(body.nominalInfaq || 0)
      } else {
        row[0] = body.nama; row[1] = body.kelas || ''; row[2] = String(body.nominalInfaq || 0); row[totalCol] = String(body.nominalInfaq || 0)
      }
      const rowNum = targetIdx + 1
      await updateSheet(token, sheetId, `${lembaga}!A${rowNum}:ZZ${rowNum}`, row)
      return new Response(JSON.stringify({ id, ...body }), { headers })
    }

    if (method === 'DELETE') {
      const role = request.headers.get('X-User-Role')
      if (role !== 'superadmin') {
        return new Response(JSON.stringify({ error: 'Forbidden', message: 'Hanya superadmin yang dapat menghapus data' }), { status: 403, headers })
      }
      const id = parseInt(url.searchParams.get('id'))
      if (!id) { return new Response(JSON.stringify({ error: 'id diperlukan' }), { status: 400, headers }) }
      const data = await getSheet(token, sheetId, `${lembaga}!A:ZZ`)
      const rows = data.values || []
      let targetIdx = -1
      for (let i = 1; i < rows.length; i++) {
        if (rows[i] && rows[i][0] && !rows[i][0].startsWith('Jumlah ')) {
          if (--id === 0) { targetIdx = i; break }
        }
      }
      if (targetIdx < 0) { return new Response(JSON.stringify({ error: 'siswa tidak ditemukan' }), { status: 404, headers }) }
      await deleteSheetRow(token, sheetId, lembaga, targetIdx)
      return new Response(JSON.stringify({ deleted: true }), { headers })
    }

    const data = await getSheet(token, sheetId, `${lembaga}!A:ZZ`)
    let siswa = parseValues(data.values || [], lembaga)

    const search = url.searchParams.get('search')?.toLowerCase()
    const kelas = url.searchParams.get('kelas')

    if (kelas && lembaga !== 'PAUD') siswa = siswa.filter(s => s.kelas === kelas)
    if (search) siswa = siswa.filter(s => s.nama.toLowerCase().includes(search))

    return new Response(JSON.stringify(siswa), { headers })
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers })
  }
}
