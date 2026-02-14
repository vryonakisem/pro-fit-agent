// api/telegram.js — Telegram Bot Webhook Handler
// Commands: /start, /sleep, /fatigue, /weight, /today, /tomorrow, /summary, /help

export default async function handler(req, res) {
    // GET = health check
    if (req.method === 'GET') {
      return res.status(200).json({ status: 'ProFitAgent Telegram Bot active', ok: true });
    }
  
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  
    const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
    const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
  
    if (!SUPABASE_URL || !SERVICE_KEY || !BOT_TOKEN) {
      console.error('Missing env vars:', { url: !!SUPABASE_URL, key: !!SERVICE_KEY, bot: !!BOT_TOKEN });
      return res.status(200).json({ ok: true }); // Return 200 so Telegram doesn't retry
    }
  
    try {
      const update = req.body;
      const message = update?.message;
      if (!message?.text) return res.status(200).json({ ok: true });
  
      const chatId = message.chat.id;
      const telegramId = message.from.id;
      const username = message.from.username || '';
      const text = message.text.trim();
  
      // Parse command
      const parts = text.split(/\s+/);
      const command = parts[0].toLowerCase().replace('@profitagent_bot', '');
  
      // /start — pair with Pro Fit Agent
      if (command === '/start') {
        const code = parts[1];
        if (!code) {
          await sendTelegram(BOT_TOKEN, chatId,
            `👋 Welcome to *Pro Fit Agent*!\n\nTo connect your account:\n1\\. Open the app → Settings\n2\\. Tap "Connect Telegram"\n3\\. Send me: \`/start YOUR_CODE\`\n\nExample: \`/start 482913\``,
            'MarkdownV2'
          );
          return res.status(200).json({ ok: true });
        }
  
        // Look up pairing code
        const codeRes = await supabaseGet(SUPABASE_URL, SERVICE_KEY,
          `pairing_codes?code=eq.${code}&consumed_at=is.null&select=*&order=created_at.desc&limit=1`
        );
  
        if (!codeRes || codeRes.length === 0) {
          await sendTelegram(BOT_TOKEN, chatId, '❌ Invalid or expired code. Please generate a new one in the app.');
          return res.status(200).json({ ok: true });
        }
  
        const pairing = codeRes[0];
        if (new Date(pairing.expires_at) < new Date()) {
          await sendTelegram(BOT_TOKEN, chatId, '⏰ This code has expired. Please generate a new one in the app.');
          return res.status(200).json({ ok: true });
        }
  
        // Upsert telegram_users
        await supabasePost(SUPABASE_URL, SERVICE_KEY, 'telegram_users', {
          telegram_id: telegramId,
          user_id: pairing.user_id,
          telegram_username: username,
        }, 'on_conflict=telegram_id');
  
        // Mark code as consumed
        await supabasePatch(SUPABASE_URL, SERVICE_KEY,
          `pairing_codes?id=eq.${pairing.id}`,
          { consumed_at: new Date().toISOString() }
        );
  
        await sendTelegram(BOT_TOKEN, chatId,
          `✅ *Account paired successfully\\!*\n\nYou can now log your metrics:\n\n📊 /sleep 7\\.5 — Log sleep hours\n😓 /fatigue 6 — Log tiredness \\(1\\-10\\)\n⚖️ /weight 67\\.2 — Log body weight\n🏋️ /today — See today's plan\n📅 /tomorrow — See tomorrow's plan\n📈 /summary — Weekly stats\n❓ /help — All commands`,
          'MarkdownV2'
        );
        return res.status(200).json({ ok: true });
      }
  
      // All other commands require pairing
      const userId = await getUserId(SUPABASE_URL, SERVICE_KEY, telegramId);
      if (!userId) {
        await sendTelegram(BOT_TOKEN, chatId,
          '🔗 You haven\'t connected your account yet.\nUse /start YOUR_CODE to pair.\n\nGet a code from the Pro Fit Agent app → Settings → Connect Telegram.'
        );
        return res.status(200).json({ ok: true });
      }
  
      // /sleep — log sleep hours
      if (command === '/sleep') {
        const hours = parseFloat(parts[1]);
        if (isNaN(hours) || hours < 0 || hours > 24) {
          await sendTelegram(BOT_TOKEN, chatId, '💤 Usage: /sleep 7.5\n\nEnter hours between 0-24.');
          return res.status(200).json({ ok: true });
        }
        await upsertBodyMetric(SUPABASE_URL, SERVICE_KEY, userId, { sleep: hours });
        await sendTelegram(BOT_TOKEN, chatId, `💤 Sleep logged: *${hours}h*\n\nGood ${hours >= 7 ? '✅ Solid rest!' : hours >= 5 ? '⚠️ A bit low — aim for 7-8h' : '🚨 Very low — prioritise recovery today'}`, 'Markdown');
        return res.status(200).json({ ok: true });
      }
  
      // /fatigue — log tiredness
      if (command === '/fatigue') {
        const level = parseInt(parts[1]);
        if (isNaN(level) || level < 1 || level > 10) {
          await sendTelegram(BOT_TOKEN, chatId, '😓 Usage: /fatigue 6\n\nEnter a number from 1 (fresh) to 10 (exhausted).');
          return res.status(200).json({ ok: true });
        }
        await upsertBodyMetric(SUPABASE_URL, SERVICE_KEY, userId, { fatigue: level });
        const emoji = level <= 3 ? '💪 Fresh!' : level <= 5 ? '👍 Moderate' : level <= 7 ? '⚠️ Getting tired' : '🚨 Very fatigued — consider rest';
        await sendTelegram(BOT_TOKEN, chatId, `😓 Fatigue logged: *${level}/10*\n\n${emoji}`, 'Markdown');
        return res.status(200).json({ ok: true });
      }
  
      // /weight — log body weight
      if (command === '/weight') {
        const weight = parseFloat(parts[1]);
        if (isNaN(weight) || weight < 30 || weight > 200) {
          await sendTelegram(BOT_TOKEN, chatId, '⚖️ Usage: /weight 67.2\n\nEnter weight in kg (30-200).');
          return res.status(200).json({ ok: true });
        }
        await upsertBodyMetric(SUPABASE_URL, SERVICE_KEY, userId, { weight });
        await sendTelegram(BOT_TOKEN, chatId, `⚖️ Weight logged: *${weight}kg*`, 'Markdown');
        return res.status(200).json({ ok: true });
      }
  
      // /today — show today's planned sessions
      if (command === '/today') {
        const today = new Date().toISOString().split('T')[0];
        const sessions = await supabaseGet(SUPABASE_URL, SERVICE_KEY,
          `planned_sessions?user_id=eq.${userId}&date=eq.${today}&status=neq.cancelled&select=*&order=created_at`
        );
  
        if (!sessions || sessions.length === 0) {
          await sendTelegram(BOT_TOKEN, chatId, '🧘 *Rest day* — no sessions planned for today.\n\nFocus on recovery, hydration, and good nutrition!', 'Markdown');
        } else {
          let msg = `📋 *Today's Training* (${formatDate(today)})\n\n`;
          sessions.forEach((s, i) => {
            const sportEmoji = { Swim: '🏊', Bike: '🚴', Run: '🏃', Strength: '💪' };
            const statusEmoji = s.status === 'completed' ? '✅' : '⬜';
            msg += `${statusEmoji} ${sportEmoji[s.sport] || '🏋️'} *${s.sport} — ${s.type}*\n`;
            msg += `   ${s.duration}min • ${s.distance || 0}${s.sport === 'Swim' ? 'm' : 'km'} • ${s.intensity}\n`;
            if (s.description) msg += `   _${s.description}_\n`;
            msg += '\n';
          });
          await sendTelegram(BOT_TOKEN, chatId, msg, 'Markdown');
        }
        return res.status(200).json({ ok: true });
      }
  
      // /tomorrow — show tomorrow's plan
      if (command === '/tomorrow') {
        const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];
        const sessions = await supabaseGet(SUPABASE_URL, SERVICE_KEY,
          `planned_sessions?user_id=eq.${userId}&date=eq.${tomorrow}&status=neq.cancelled&select=*&order=created_at`
        );
  
        if (!sessions || sessions.length === 0) {
          await sendTelegram(BOT_TOKEN, chatId, `🧘 *Tomorrow* (${formatDate(tomorrow)}) — Rest day\n\nNo sessions planned.`, 'Markdown');
        } else {
          let msg = `📅 *Tomorrow's Training* (${formatDate(tomorrow)})\n\n`;
          sessions.forEach(s => {
            const sportEmoji = { Swim: '🏊', Bike: '🚴', Run: '🏃', Strength: '💪' };
            msg += `${sportEmoji[s.sport] || '🏋️'} *${s.sport} — ${s.type}*\n`;
            msg += `   ${s.duration}min • ${s.distance || 0}${s.sport === 'Swim' ? 'm' : 'km'} • ${s.intensity}\n`;
            if (s.description) msg += `   _${s.description}_\n`;
            msg += '\n';
          });
          await sendTelegram(BOT_TOKEN, chatId, msg, 'Markdown');
        }
        return res.status(200).json({ ok: true });
      }
  
      // /summary — weekly stats
      if (command === '/summary') {
        const weekStart = new Date();
        weekStart.setDate(weekStart.getDate() - weekStart.getDay());
        const weekStartStr = weekStart.toISOString().split('T')[0];
  
        const planned = await supabaseGet(SUPABASE_URL, SERVICE_KEY,
          `planned_sessions?user_id=eq.${userId}&date=gte.${weekStartStr}&status=neq.cancelled&select=*`
        );
        const training = await supabaseGet(SUPABASE_URL, SERVICE_KEY,
          `training_sessions?user_id=eq.${userId}&date=gte.${weekStartStr}&select=*`
        );
        const body = await supabaseGet(SUPABASE_URL, SERVICE_KEY,
          `body_metrics?user_id=eq.${userId}&select=*&order=date.desc&limit=3`
        );
  
        const completed = (planned || []).filter(s => s.status === 'completed').length;
        const total = (planned || []).length;
        const compliance = total > 0 ? Math.round((completed / total) * 100) : 0;
  
        const swim = (training || []).filter(t => t.sport === 'Swim').reduce((s, t) => s + (t.distance || 0), 0);
        const bike = (training || []).filter(t => t.sport === 'Bike').reduce((s, t) => s + (t.distance || 0), 0);
        const run = (training || []).filter(t => t.sport === 'Run').reduce((s, t) => s + (t.distance || 0), 0);
        const totalMins = (training || []).reduce((s, t) => s + (t.duration || 0), 0);
  
        let msg = `📊 *This Week's Summary*\n\n`;
        msg += `✅ Compliance: *${compliance}%* (${completed}/${total} sessions)\n\n`;
        if (swim) msg += `🏊 Swim: *${swim}m*\n`;
        if (bike) msg += `🚴 Bike: *${bike.toFixed(1)}km*\n`;
        if (run) msg += `🏃 Run: *${run.toFixed(1)}km*\n`;
        msg += `⏱ Total: *${Math.round(totalMins / 60 * 10) / 10}hrs*\n`;
  
        if (body && body.length > 0) {
          const latest = body[0];
          msg += `\n📏 *Latest Metrics*\n`;
          if (latest.weight) msg += `⚖️ Weight: ${latest.weight}kg\n`;
          if (latest.sleep) msg += `💤 Sleep: ${latest.sleep}h\n`;
          if (latest.fatigue) msg += `😓 Fatigue: ${latest.fatigue}/10\n`;
        }
  
        await sendTelegram(BOT_TOKEN, chatId, msg, 'Markdown');
        return res.status(200).json({ ok: true });
      }
  
      // /help
      if (command === '/help') {
        await sendTelegram(BOT_TOKEN, chatId,
          `🏋️ *Pro Fit Agent Commands*\n\n` +
          `💤 /sleep 7.5 — Log sleep hours\n` +
          `😓 /fatigue 6 — Log tiredness (1-10)\n` +
          `⚖️ /weight 67.2 — Log body weight\n` +
          `📋 /today — Today's training plan\n` +
          `📅 /tomorrow — Tomorrow's plan\n` +
          `📊 /summary — Weekly stats\n` +
          `❓ /help — This message\n\n` +
          `_You can also combine: just send multiple commands one after another!_`,
          'Markdown'
        );
        return res.status(200).json({ ok: true });
      }
  
      // Unknown command — try to be helpful
      if (text.startsWith('/')) {
        await sendTelegram(BOT_TOKEN, chatId, `🤔 Unknown command. Try /help to see available commands.`);
      }
  
      return res.status(200).json({ ok: true });
  
    } catch (err) {
      console.error('Telegram webhook error:', err);
      return res.status(200).json({ ok: true }); // Always 200 to prevent Telegram retries
    }
  }
  
  
  // ============================================================================
  // HELPER FUNCTIONS
  // ============================================================================
  
  async function sendTelegram(token, chatId, text, parseMode) {
    const body = { chat_id: chatId, text };
    if (parseMode) body.parse_mode = parseMode;
    try {
      const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        // If Markdown fails, retry without parse mode
        if (parseMode) {
          const plainBody = { chat_id: chatId, text: text.replace(/[*_`\\]/g, '') };
          await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(plainBody),
          });
        }
      }
    } catch (e) {
      console.error('sendTelegram error:', e);
    }
  }
  
  async function supabaseGet(url, key, path) {
    try {
      const res = await fetch(`${url}/rest/v1/${path}`, {
        headers: { 'apikey': key, 'Authorization': `Bearer ${key}` },
      });
      if (!res.ok) { console.error('supabaseGet error:', await res.text()); return null; }
      return await res.json();
    } catch (e) { console.error('supabaseGet exception:', e); return null; }
  }
  
  async function supabasePost(url, key, table, data, onConflict) {
    try {
      const headers = {
        'Content-Type': 'application/json',
        'apikey': key,
        'Authorization': `Bearer ${key}`,
        'Prefer': 'return=minimal',
      };
      if (onConflict) headers['Prefer'] = `resolution=merge-duplicates,return=minimal`;
      const endpoint = onConflict ? `${url}/rest/v1/${table}?${onConflict}` : `${url}/rest/v1/${table}`;
      const res = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(data),
      });
      if (!res.ok) console.error('supabasePost error:', await res.text());
      return res.ok;
    } catch (e) { console.error('supabasePost exception:', e); return false; }
  }
  
  async function supabasePatch(url, key, path, data) {
    try {
      const res = await fetch(`${url}/rest/v1/${path}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'apikey': key,
          'Authorization': `Bearer ${key}`,
          'Prefer': 'return=minimal',
        },
        body: JSON.stringify(data),
      });
      if (!res.ok) console.error('supabasePatch error:', await res.text());
      return res.ok;
    } catch (e) { console.error('supabasePatch exception:', e); return false; }
  }
  
  async function getUserId(supabaseUrl, serviceKey, telegramId) {
    const rows = await supabaseGet(supabaseUrl, serviceKey,
      `telegram_users?telegram_id=eq.${telegramId}&select=user_id&limit=1`
    );
    return rows && rows.length > 0 ? rows[0].user_id : null;
  }
  
  async function upsertBodyMetric(supabaseUrl, serviceKey, userId, fields) {
    const today = new Date().toISOString().split('T')[0];
    
    // Check if today's entry exists
    const existing = await supabaseGet(supabaseUrl, serviceKey,
      `body_metrics?user_id=eq.${userId}&date=eq.${today}&select=*&limit=1`
    );
  
    if (existing && existing.length > 0) {
      // Update existing record
      await supabasePatch(supabaseUrl, serviceKey,
        `body_metrics?id=eq.${existing[0].id}`,
        fields
      );
    } else {
      // Insert new record
      await supabasePost(supabaseUrl, serviceKey, 'body_metrics', {
        user_id: userId,
        date: today,
        ...fields,
      });
    }
  }
  
  function formatDate(dateStr) {
    const d = new Date(dateStr + 'T00:00:00');
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    return `${days[d.getDay()]} ${d.getDate()} ${months[d.getMonth()]}`;
  }