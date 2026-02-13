// api/create-pairing-code.js — Generate a 6-digit pairing code for WhatsApp linking
import { createClient } from '@supabase/supabase-js';

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

  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    return res.status(500).json({ error: 'Server misconfigured' });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);
  const anonSupabase = createClient(supabaseUrl, process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY);

  try {
    // Verify the user's JWT
    const { data: { user }, error: authError } = await anonSupabase.auth.getUser(authHeader.replace('Bearer ', ''));
    if (authError || !user) return res.status(401).json({ error: 'Invalid token' });

    // Generate 6-digit code
    const code = String(Math.floor(100000 + Math.random() * 900000));
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString(); // 10 minutes

    // Invalidate any existing unused codes for this user
    await supabase.from('pairing_codes')
      .update({ consumed_at: new Date().toISOString() })
      .eq('user_id', user.id)
      .is('consumed_at', null);

    // Insert new code
    const { error: insertErr } = await supabase.from('pairing_codes').insert({
      user_id: user.id,
      code,
      expires_at: expiresAt,
    });

    if (insertErr) {
      console.error('Insert error:', insertErr);
      return res.status(500).json({ error: 'Failed to create code' });
    }

    return res.status(200).json({ code, expires_at: expiresAt });
  } catch (err) {
    console.error('Pairing code error:', err);
    return res.status(500).json({ error: 'Internal error' });
  }
}