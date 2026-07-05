import { getGoogleAuthToken, getSheet, appendSheet, updateSheet, deleteSheetRow, getSheetId, MONTH_HEADERS } from '../_utils/google-sheets.js'

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
    result.push({ id: seq, row: i + 1, nama: row[0] || '', kelas, nominalInfaq: nominal, payments, lembaga })
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

      const existing = await getSheet(token, sheetId, `${lembaga}!A:A`)
      const allRows = existing.values || []
      let insertPos = allRows.length + 1

      if (!isPaud) {
        const kelasList = lembaga === 'MIS'
          ? ['Kelas I', 'Kelas II', 'Kelas III', 'Kelas IV', 'Kelas V', 'Kelas VI']
          : ['Kelas VII', 'Kelas VIII', 'Kelas IX']
        const targetIdx = kelasList.indexOf(body.kelas || '')

        if (targetIdx >= 0) {
          let insertAfter = -1
          for (let i = 1; i < allRows.length; i++) {
            const cell = allRows[i] && allRows[i][0]
            if (!cell) continue
            if (cell.startsWith('Jumlah ')) {
              const jk = cell.replace('Jumlah ', '')
              const jkIdx = kelasList.indexOf(jk)
              if (jkIdx >= 0 && jkIdx < targetIdx) insertAfter = i
              continue
            }
            const kIdx = kelasList.indexOf((allRows[i][1] || ''))
            if (kIdx === targetIdx) {
              insertAfter = i
            } else if (kIdx > targetIdx) {
              break
            }
          }
          if (insertAfter < 0) insertAfter = 0
          insertPos = Math.min(insertAfter + 2, allRows.length + 1)
        }

        const gid = await getSheetId(token, sheetId, lembaga)
        if (gid) {
          await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${sheetId}:batchUpdate`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              requests: [{
                insertDimension: {
                  range: { sheetId: gid, dimension: 'ROWS', startIndex: insertPos - 1, endIndex: insertPos },
                  inheritFromBefore: true
                }
              }]
            })
          })
          const colEnd = String.fromCharCode(64 + row.length)
          await updateSheet(token, sheetId, `${lembaga}!A${insertPos}:${colEnd}${insertPos}`, row)

          try {
            const kategoriRaw = await getSheet(token, sheetId, 'Kategori!A:E')
            const kategoriRows = kategoriRaw.values || []
            for (let ki = 1; ki < kategoriRows.length; ki++) {
              const kr = kategoriRows[ki]
              if (!kr[1]) continue
              const catLembaga = kr[2] || ''
              if (catLembaga && catLembaga !== lembaga) continue
              const catTitle = catLembaga ? `${catLembaga} - ${kr[1]}` : `Semua - ${kr[1]}`
              const catData = await getSheet(token, sheetId, `${catTitle}!A:A`)
              const catAllRows = catData.values || []
              let catInsertPos = catAllRows.length + 1
              if (targetIdx >= 0) {
                let insertAfter = -1
                for (let ci = 1; ci < catAllRows.length; ci++) {
                  const cell = catAllRows[ci] && catAllRows[ci][0]
                  if (!cell) continue
                  if (cell.startsWith('Jumlah ')) {
                    const jk = cell.replace('Jumlah ', '')
                    const jkIdx = kelasList.indexOf(jk)
                    if (jkIdx >= 0 && jkIdx < targetIdx) insertAfter = ci
                    continue
                  }
                  const kIdx = kelasList.indexOf((catAllRows[ci][1] || ''))
                  if (kIdx === targetIdx) {
                    insertAfter = ci
                  } else if (kIdx > targetIdx) {
                    break
                  }
                }
                if (insertAfter < 0) insertAfter = 0
                catInsertPos = Math.min(insertAfter + 2, catAllRows.length + 1)
              }
              const catGid = await getSheetId(token, sheetId, catTitle)
              if (catGid) {
                await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${sheetId}:batchUpdate`, {
                  method: 'POST',
                  headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    requests: [{
                      insertDimension: {
                        range: { sheetId: catGid, dimension: 'ROWS', startIndex: catInsertPos - 1, endIndex: catInsertPos },
                        inheritFromBefore: true
                      }
                    }]
                  })
                })
                const catRow = isPaud
                  ? [body.nama, String(total), ...MONTH_HEADERS.map(() => '')]
                  : [body.nama, body.kelas || '', String(total), ...MONTH_HEADERS.map(() => '')]
                const catColEnd = String.fromCharCode(64 + catRow.length)
                await updateSheet(token, sheetId, `${catTitle}!A${catInsertPos}:${catColEnd}${catInsertPos}`, catRow)
              }
            }
          } catch (_) {}

          return new Response(JSON.stringify({ ...body }), { status: 201, headers })
        }
      }

      await appendSheet(token, sheetId, `${lembaga}!A:${String.fromCharCode(64 + row.length)}`, row)
      return new Response(JSON.stringify({ ...body }), { status: 201, headers })
    }

    if (method === 'PUT') {
      let id = parseInt(url.searchParams.get('id'))
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
      let id = parseInt(url.searchParams.get('id'))
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
