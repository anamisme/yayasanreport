import { getGoogleAuthToken, getSheet, appendSheet, updateSheet, deleteSheetRow, createSheet } from '../_utils/google-sheets.js'

const SHEET_NAME = 'Akses'
const HEADERS = ['Email', 'Role', 'AddedAt']

async function ensureSheet(token, sheetId) {
  try {
    await getSheet(token, sheetId, `${SHEET_NAME}!A1:A1`)
  } catch (e) {
    await createSheet(token, sheetId, SHEET_NAME)
    await updateSheet(token, sheetId, `${SHEET_NAME}!A1:C1`, [HEADERS])
  }
}

function parseRows(rows) {
  if (!rows || rows.length < 2) return []
  return rows.slice(1).map((row, i) => ({
    id: i + 2,
    email: (row[0] || '').toLowerCase(),
    role: row[1] || 'admin',
    addedAt: row[2] || '',
  })).filter(r => r.email)
}

const headers = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}

export async function onRequest(context) {
  const { request, env } = context
  const url = new URL(request.url)
  const method = request.method

  if (method === 'OPTIONS') return new Response(null, { headers })

  // Only superadmin (from env var) can manage access
  const role = request.headers.get('X-User-Role')
  if (role !== 'superadmin') {
    return new Response(JSON.stringify({ error: 'Forbidden', message: 'Hanya superadmin yang dapat mengelola akses' }), {
      status: 403, headers,
    })
  }

  try {
    const token = await getGoogleAuthToken(env)
    const sheetId = env.GOOGLE_SHEET_ID
    await ensureSheet(token, sheetId)

    if (method === 'POST') {
      const body = await request.json()
      const email = (body.email || '').toLowerCase().trim()
      const userRole = body.role || 'admin'
      if (!email) {
        return new Response(JSON.stringify({ error: 'Email harus diisi' }), { status: 400, headers })
      }
      if (!['admin', 'superadmin'].includes(userRole)) {
        return new Response(JSON.stringify({ error: 'Role harus admin atau superadmin' }), { status: 400, headers })
      }

      // Check if email already exists
      const existing = await getSheet(token, sheetId, `${SHEET_NAME}!A:B`)
      const rows = existing.values || []
      const dup = rows.slice(1).find(r => (r[0] || '').toLowerCase() === email)
      if (dup) {
        return new Response(JSON.stringify({ error: 'Email sudah terdaftar' }), { status: 409, headers })
      }

      const now = new Date().toISOString().split('T')[0]
      await appendSheet(token, sheetId, `${SHEET_NAME}!A:C`, [email, userRole, now])
      return new Response(JSON.stringify({ email, role: userRole, addedAt: now }), { status: 201, headers })
    }

    if (method === 'DELETE') {
      const email = (url.searchParams.get('email') || '').toLowerCase().trim()
      if (!email) {
        return new Response(JSON.stringify({ error: 'Email diperlukan' }), { status: 400, headers })
      }
      const data = await getSheet(token, sheetId, `${SHEET_NAME}!A:A`)
      const rows = data.values || []
      const rowIdx = rows.findIndex((r, i) => i > 0 && (r[0] || '').toLowerCase() === email)
      if (rowIdx < 1) {
        return new Response(JSON.stringify({ error: 'Email tidak ditemukan' }), { status: 404, headers })
      }
      await deleteSheetRow(token, sheetId, SHEET_NAME, rowIdx)
      return new Response(JSON.stringify({ deleted: true, email }), { headers })
    }

    // GET
    const data = await getSheet(token, sheetId, `${SHEET_NAME}!A:C`)
    const akses = parseRows(data.values || [])
    return new Response(JSON.stringify(akses), { headers })
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers })
  }
}
