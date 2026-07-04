const headers = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}

export async function onRequest(context) {
  const { request, env } = context

  if (request.method === 'OPTIONS') return new Response(null, { headers })

  const role = request.headers.get('X-User-Role') || 'admin'
  if (role !== 'superadmin') {
    return new Response(JSON.stringify({ error: 'Forbidden' }), {
      status: 403, headers,
    })
  }

  const sheetId = env.GOOGLE_SHEET_ID
  if (!sheetId) {
    return new Response(JSON.stringify({ error: 'Sheet ID not configured' }), {
      status: 500, headers,
    })
  }

  const url = `https://docs.google.com/spreadsheets/d/${sheetId}`
  return new Response(JSON.stringify({ url }), { headers })
}
