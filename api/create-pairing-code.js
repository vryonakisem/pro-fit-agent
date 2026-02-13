// api/create-pairing-code.js — Generate a 6-digit pairing code (no SDK, uses fetch)

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing auth token' });
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !serviceRoleKey || !anonKey) {
    return res.status(500).json({ error: 'Server misconfigured' });
  }

  const jwt = authHeader.replace('Bearer ', '');

  try {
    // 1. Verify the user's JWT
    const userRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: {
        'Authorization': `Bearer ${jwt}`,
        'apikey': anonKey,
      },
    });
    if (!userRes.ok) return res.status(401).json({ error: 'Invalid token' });
    const user = await userRes.json();
    const userId = user.id;

    // 2. Invalidate any existing unused codes
    await fetch(`${supabaseUrl}/rest/v1/pairing_codes?user_id=eq.${userId}&consumed_at=is.null`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'apikey': serviceRoleKey,
        'Authorization': `Bearer ${serviceRoleKey}`,
        'Prefer': 'return=minimal',
      },
      body: JSON.stringify({ consumed_at: new Date().toISOString() }),
    });

    // 3. Generate new 6-digit code
    const code = String(Math.floor(100000 + Math.random() * 900000));
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

    // 4. Insert new code
    const insertRes = await fetch(`${supabaseUrl}/rest/v1/pairing_codes`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': serviceRoleKey,
        'Authorization': `Bearer ${serviceRoleKey}`,
        'Prefer': 'return=minimal',
      },
      body: JSON.stringify({
        user_id: userId,
        code,
        expires_at: expiresAt,
      }),
    });

    if (!insertRes.ok) {
      const err = await insertRes.text();
      console.error('Insert error:', err);
      return res.status(500).json({ error: 'Failed to create code' });
    }

    return res.status(200).json({ code, expires_at: expiresAt });
  } catch (err) {
    console.error('Pairing code error:', err);
    return res.status(500).json({ error: 'Internal error' });
  }
}