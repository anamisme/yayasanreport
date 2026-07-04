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
    const userEmail = tokenInfo.email.toLowerCase();
    if (env.ALLOWED_EMAILS) {
      const allowedEmails = env.ALLOWED_EMAILS.split(',').map(e => e.trim().toLowerCase());
      if (!allowedEmails.includes(userEmail)) {
        return new Response(JSON.stringify({ error: 'Forbidden', message: 'Email not authorized' }), {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }

    // Determine role: superadmin if in SUPERADMIN_EMAILS, otherwise admin
    let role = 'admin';
    if (env.SUPERADMIN_EMAILS) {
      const superadminEmails = env.SUPERADMIN_EMAILS.split(',').map(e => e.trim().toLowerCase());
      if (superadminEmails.includes(userEmail)) {
        role = 'superadmin';
      }
    }

    // Forward user info to downstream handlers via headers
    const newHeaders = new Headers(request.headers);
    newHeaders.set('X-User-Role', role);
    newHeaders.set('X-User-Email', userEmail);
    context.request = new Request(request, { headers: newHeaders });
    } catch (error) {
      return new Response(JSON.stringify({ error: 'Internal Server Error', message: 'Failed to verify token' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
  }
  // --- End Authentication ---

  const response = await next(context.request)
  Object.keys(corsHeaders).forEach((key) => {
    response.headers.set(key, corsHeaders[key])
  })

  return response
}
