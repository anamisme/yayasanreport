const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}

export async function onRequest(context) {
  const { request, next, env } = context

  // Handle CORS preflight
  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  // --- Authentication ---
  const url = new URL(request.url);
  
  // HANYA proteksi endpoint yang berawalan /api/
  // Biarkan aset statis (HTML, gambar, CSS) lewat
  if (url.pathname.startsWith('/api/')) {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized', message: 'Missing or invalid Authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const token = authHeader.split(' ')[1];
    
    try {
      // Verify token with Google
    const verifyRes = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${token}`);
    if (!verifyRes.ok) {
      return new Response(JSON.stringify({ error: 'Unauthorized', message: 'Invalid token' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const tokenInfo = await verifyRes.json();
    
    // Check ALLOWED_EMAILS if configured
    if (env.ALLOWED_EMAILS) {
      const allowedEmails = env.ALLOWED_EMAILS.split(',').map(e => e.trim().toLowerCase());
      if (!allowedEmails.includes(tokenInfo.email.toLowerCase())) {
        return new Response(JSON.stringify({ error: 'Forbidden', message: 'Email not authorized' }), {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }

    // You could theoretically attach tokenInfo to the request here if downstream functions need it
    // request.user = tokenInfo; // Not easily done in standard fetch Request, but can pass via headers if needed.
    } catch (error) {
      return new Response(JSON.stringify({ error: 'Internal Server Error', message: 'Failed to verify token' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
  }
  // --- End Authentication ---

  const response = await next()
  Object.keys(corsHeaders).forEach((key) => {
    response.headers.set(key, corsHeaders[key])
  })

  return response
}
