export default function handler(req, res) {
    const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
    const anonKey = process.env.VITE_SUPABASE_ANON_KEY || '';
    
    res.json({
      hasSupabaseUrl: !!url,
      hasServiceKey: !!serviceKey,
      hasAnonKey: !!anonKey,
      serviceKeyPrefix: serviceKey ? serviceKey.substring(0, 10) + '...' : 'MISSING',
      urlValue: url || 'MISSING',
      allEnvKeys: Object.keys(process.env).filter(k => k.includes('SUPA') || k.includes('VITE')).sort(),
    });
  }