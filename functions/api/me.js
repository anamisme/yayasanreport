import { getGoogleAuthToken, getSheet } from '../_utils/google-sheets.js'

const headers = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}

export async function onRequest(context) {
  const { request, env } = context

  if (request.method === 'OPTIONS') return new Response(null, { headers })

  const email = request.headers.get('X-User-Email') || ''
  // Role from middleware (env var SUPERADMIN_EMAILS takes precedence)
  let role = request.headers.get('X-User-Role') || 'admin'

  // If not superadmin by env var, check Akses sheet
  if (role !== 'superadmin' && email) {
    try {
      const token = await getGoogleAuthToken(env)
      const data = await getSheet(token, env.GOOGLE_SHEET_ID, 'Akses!A:B')
      const rows = data.values || []
      const match = rows.slice(1).find(r => (r[0] || '').toLowerCase() === email)
      if (match && match[1]) {
        role = match[1].toLowerCase()
      }
    } catch (e) {
      // Sheet Akses might not exist yet
    }
  }

  return new Response(JSON.stringify({ email, role }), { headers })
}
