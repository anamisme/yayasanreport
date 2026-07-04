const headers = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}

export async function onRequest(context) {
  const { request } = context

  if (request.method === 'OPTIONS') return new Response(null, { headers })

  const role = request.headers.get('X-User-Role') || 'admin'
  const email = request.headers.get('X-User-Email') || 'unknown'

  return new Response(JSON.stringify({ email, role }), { headers })
}
