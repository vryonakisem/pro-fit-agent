// api/telegram-webhook.js — Telegram bot for ProFitAgent (no SDK, uses fetch)

const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

export default async function handler(req, res) {
  if (req.method === 'GET') return res.status(200).json({ status: 'ProFitAgent Telegram Bot active' });
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  try {
    const update = req.body;
    if (!update.message || !update.message.text) return res.status(200).json({ ok: true });

    const chatId = update.message.chat.id;
    const text = update.message.text.trim();
    const phone = String(chatId);

    const channel = await sbGet(supabaseUrl + '/rest/v1/user_channels?channel_type=eq.telegram&channel_identifier=eq.' + phone + '&verified=eq.true&select=user_id&limit=1', serviceKey);

    if (/^\d{6}$/.test(text)) return await handlePairing(supabaseUrl, serviceKey, chatId, phone, text, res);

    if (!channel || channel.length === 0) {
      await sendTelegram(chatId, '👋 Welcome to Pro Fit Agent!\n\nTo connect your account:\n1. Open the app → tap your avatar → Connect WhatsApp\n2. Generate a pairing code\n3. Send the 6-digit code here');
      return res.status(200).json({ ok: true });
    }

    const userId = channel[0].user_id;
    await sbPost(supabaseUrl + '/rest/v1/message_ingest', serviceKey, { user_id: userId, channel_type: 'telegram', channel_identifier: phone, incoming_text: text, status: 'received' });

    const lowerText = text.toLowerCase().replace(/^\//, '');

    if (lowerText.startsWith('log ')) return await handleLogTraining(supabaseUrl, serviceKey, userId, text, chatId, res);
    if (lowerText.startsWith('fatigue') || lowerText.startsWith('body') || lowerText.startsWith('metrics')) return await handleLogBody(supabaseUrl, serviceKey, userId, text, chatId, res);
    if (lowerText.startsWith('sleep')) {
      if (lowerText === 'sleep') { await sendTelegram(chatId, '💤 To log sleep, send:\nsleep 7.5\n\nOr: sleep 7.5 notes: slept well'); return res.status(200).json({ ok: true }); }
      return await handleLogBody(supabaseUrl, serviceKey, userId, 'fatigue 5 ' + text, chatId, res);
    }
    if (lowerText.startsWith('today') || lowerText.startsWith('plan') || lowerText.startsWith('next') || lowerText.startsWith('what') || lowerText === 'start') return await handleToday(supabaseUrl, serviceKey, userId, chatId, res);
    if (lowerText.startsWith('summary') || lowerText.startsWith('status') || lowerText.startsWith('week')) return await handleSummary(supabaseUrl, serviceKey, userId, chatId, res);
    if (lowerText === 'help' || lowerText === 'commands') {
      await sendTelegram(chatId, '🏋️ *Pro Fit Agent Commands*\n\n📋 *today* — See today\'s plan\n📊 *summary* — Weekly overview\n💤 *sleep 7.5* — Log sleep\n🏃 *log run 45min 7km rpe6* — Log workout\n🚴 *log bike 120min 40km rpe5* — Log ride\n🏊 *log swim 60min rpe7* — Log swim\n📝 *fatigue 6 sleep 7 weight 78* — Full body log\n\nJust type naturally.', 'Markdown');
      return res.status(200).json({ ok: true });
    }

    await sendTelegram(chatId, '🤔 I didn\'t catch that. Try:\n\n• today — see your plan\n• sleep 7.5 — log sleep\n• log run 45min 7km — log workout\n• summary — weekly overview\n• help — all commands');
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('Telegram webhook error:', err);
    return res.status(200).json({ ok: true });
  }
}

async function sbGet(url, key) {
  const r = await fetch(url, { headers: { 'apikey': key, 'Authorization': 'Bearer ' + key } });
  if (!r.ok) return null;
  return await r.json();
}
async function sbPost(url, key, body) {
  return await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'apikey': key, 'Authorization': 'Bearer ' + key, 'Prefer': 'return=representation' }, body: JSON.stringify(body) });
}
async function sbPatch(url, key, body) {
  return await fetch(url, { method: 'PATCH', headers: { 'Content-Type': 'application/json', 'apikey': key, 'Authorization': 'Bearer ' + key, 'Prefer': 'return=minimal' }, body: JSON.stringify(body) });
}

async function sendTelegram(chatId, text, parseMode) {
  const body = { chat_id: chatId, text };
  if (parseMode) body.parse_mode = parseMode;
  await fetch('https://api.telegram.org/bot' + TELEGRAM_TOKEN + '/sendMessage', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
}

async function handlePairing(supabaseUrl, key, chatId, phone, code, res) {
  const rows = await sbGet(supabaseUrl + '/rest/v1/pairing_codes?code=eq.' + code + '&consumed_at=is.null&expires_at=gt.' + new Date().toISOString() + '&select=*&limit=1', key);
  if (!rows || rows.length === 0) { await sendTelegram(chatId, '❌ Invalid or expired code. Generate a new one in the app.'); return res.status(200).json({ ok: true }); }
  const row = rows[0];
  await sbPatch(supabaseUrl + '/rest/v1/pairing_codes?id=eq.' + row.id, key, { consumed_at: new Date().toISOString() });
  const existing = await sbGet(supabaseUrl + '/rest/v1/user_channels?user_id=eq.' + row.user_id + '&channel_type=eq.telegram&select=id&limit=1', key);
  if (existing && existing.length > 0) { await sbPatch(supabaseUrl + '/rest/v1/user_channels?id=eq.' + existing[0].id, key, { channel_identifier: phone, verified: true }); }
  else { await sbPost(supabaseUrl + '/rest/v1/user_channels', key, { user_id: row.user_id, channel_type: 'telegram', channel_identifier: phone, verified: true }); }
  await sendTelegram(chatId, '✅ Connected! Your Telegram is linked to Pro Fit Agent.\n\nTry: *today* or *help*', 'Markdown');
  return res.status(200).json({ ok: true });
}

async function handleLogTraining(supabaseUrl, key, userId, text, chatId, res) {
  const parts = text.replace(/^(\/)?log\s+/i, '');
  const sportMatch = parts.match(/^(run|bike|swim|strength)/i);
  if (!sportMatch) { await sendTelegram(chatId, '❓ Specify a sport: log run/bike/swim 45min 7km rpe6'); return res.status(200).json({ ok: true }); }
  const sport = sportMatch[1].charAt(0).toUpperCase() + sportMatch[1].slice(1).toLowerCase();
  const durationMatch = parts.match(/(\d+)\s*min/i);
  const distanceKmMatch = parts.match(/(\d+\.?\d*)\s*km/i);
  const distanceMMatch = parts.match(/(\d+)\s*m(?!\w)/i);
  const rpeMatch = parts.match(/rpe\s*(\d+)/i);
  const notesMatch = parts.match(/notes?:\s*(.+)/i);
  const duration = durationMatch ? parseInt(durationMatch[1]) : 0;
  const distance = distanceKmMatch ? parseFloat(distanceKmMatch[1]) : (distanceMMatch ? parseInt(distanceMMatch[1]) : 0);
  const rpe = rpeMatch ? parseInt(rpeMatch[1]) : 5;
  const notes = notesMatch ? notesMatch[1].trim() : '';
  const today = new Date().toISOString().split('T')[0];

  const insertRes = await sbPost(supabaseUrl + '/rest/v1/training_sessions', key, { user_id: userId, date: today, sport, type: 'Z2', duration, distance, rpe, notes });
  if (!insertRes.ok) { await sendTelegram(chatId, '❌ Failed to log.'); return res.status(200).json({ ok: true }); }
  const inserted = (await insertRes.json())[0];

  const planned = await sbGet(supabaseUrl + '/rest/v1/planned_sessions?user_id=eq.' + userId + '&date=eq.' + today + '&sport=eq.' + sport + '&status=eq.planned&select=id&limit=1', key);
  if (planned && planned.length > 0) { await sbPatch(supabaseUrl + '/rest/v1/planned_sessions?id=eq.' + planned[0].id, key, { status: 'completed', completed_session_id: inserted.id }); }

  await checkAchievements(supabaseUrl, key, userId, sport, duration, distance, chatId);

  const emoji = sport === 'Swim' ? '🏊' : sport === 'Bike' ? '🚴' : sport === 'Run' ? '🏃' : '💪';
  let reply = emoji + ' *' + sport + ' logged!*\n⏱ ' + duration + 'min';
  if (distance > 0) reply += ' • ' + distance + (sport === 'Swim' ? 'm' : 'km');
  reply += ' • RPE ' + rpe;
  if (notes) reply += '\n📝 ' + notes;
  if (planned && planned.length > 0) reply += '\n✅ Planned session marked complete';

  await sendTelegram(chatId, reply, 'Markdown');
  return res.status(200).json({ ok: true });
}

async function handleLogBody(supabaseUrl, key, userId, text, chatId, res) {
  const fatigueMatch = text.match(/fatigue\s+(\d+\.?\d*)/i);
  const sleepMatch = text.match(/sleep\s+(\d+\.?\d*)/i);
  const weightMatch = text.match(/weight\s+(\d+\.?\d*)/i);
  const notesMatch = text.match(/notes?:\s*(.+)/i);
  const today = new Date().toISOString().split('T')[0];
  const metrics = { user_id: userId, date: today, fatigue: fatigueMatch ? parseFloat(fatigueMatch[1]) : null, sleep: sleepMatch ? parseFloat(sleepMatch[1]) : null, weight: weightMatch ? parseFloat(weightMatch[1]) : null, notes: notesMatch ? notesMatch[1].trim() : '' };
  const r = await sbPost(supabaseUrl + '/rest/v1/body_metrics', key, metrics);
  if (!r.ok) { await sendTelegram(chatId, '❌ Failed to log metrics.'); return res.status(200).json({ ok: true }); }
  let reply = '📊 *Metrics logged!*\n';
  if (metrics.sleep) reply += '💤 Sleep: ' + metrics.sleep + 'h\n';
  if (metrics.fatigue) reply += '😓 Fatigue: ' + metrics.fatigue + '/10\n';
  if (metrics.weight) reply += '⚖️ Weight: ' + metrics.weight + 'kg\n';
  if (metrics.notes) reply += '📝 ' + metrics.notes;
  await sendTelegram(chatId, reply, 'Markdown');
  return res.status(200).json({ ok: true });
}

async function handleToday(supabaseUrl, key, userId, chatId, res) {
  const today = new Date().toISOString().split('T')[0];
  const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];
  const [todaySessions, tomorrowSessions, bodyRows] = await Promise.all([
    sbGet(supabaseUrl + '/rest/v1/planned_sessions?user_id=eq.' + userId + '&date=eq.' + today + '&order=sport', key),
    sbGet(supabaseUrl + '/rest/v1/planned_sessions?user_id=eq.' + userId + '&date=eq.' + tomorrow + '&order=sport', key),
    sbGet(supabaseUrl + '/rest/v1/body_metrics?user_id=eq.' + userId + '&order=date.desc&limit=1', key),
  ]);
  const dayName = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' });
  let reply = '📋 *Today\'s Plan* (' + dayName + ')\n\n';
  if (!todaySessions || todaySessions.length === 0) { reply += '🧘 Rest day — no sessions planned\n'; }
  else { for (const s of todaySessions) { const emoji = s.sport === 'Swim' ? '🏊' : s.sport === 'Bike' ? '🚴' : s.sport === 'Run' ? '🏃' : '💪'; const si = s.status === 'completed' ? ' ✅' : s.status === 'skipped' ? ' ⏭️' : ''; reply += emoji + ' *' + s.sport + ' – ' + s.type + '*' + si + '\n   ' + s.duration + 'min'; if (s.distance > 0) reply += ' • ' + s.distance + (s.sport === 'Swim' ? 'm' : 'km'); reply += ' • ' + s.intensity + '\n'; if (s.description) reply += '   _' + s.description + '_\n'; reply += '\n'; } }
  if (tomorrowSessions && tomorrowSessions.length > 0) { reply += '*Tomorrow:* ' + tomorrowSessions.map(s => { const e = s.sport === 'Swim' ? '🏊' : s.sport === 'Bike' ? '🚴' : s.sport === 'Run' ? '🏃' : '💪'; return e + ' ' + s.sport + ' ' + s.duration + 'min'; }).join(', ') + '\n'; }
  const lb = bodyRows?.[0]; if (lb) { reply += '\n📊 *Last check-in* (' + lb.date + '):'; if (lb.sleep) reply += ' Sleep ' + lb.sleep + 'h'; if (lb.fatigue) reply += ' • Fatigue ' + lb.fatigue + '/10'; if (lb.weight) reply += ' • ' + lb.weight + 'kg'; }
  await sendTelegram(chatId, reply, 'Markdown');
  return res.status(200).json({ ok: true });
}

async function handleSummary(supabaseUrl, key, userId, chatId, res) {
  const ws = new Date(); ws.setDate(ws.getDate() - ws.getDay()); const wss = ws.toISOString().split('T')[0]; const today = new Date().toISOString().split('T')[0];
  const [planned, training] = await Promise.all([ sbGet(supabaseUrl + '/rest/v1/planned_sessions?user_id=eq.' + userId + '&date=gte.' + wss + '&select=*', key), sbGet(supabaseUrl + '/rest/v1/training_sessions?user_id=eq.' + userId + '&date=gte.' + wss + '&select=*', key) ]);
  const pl = planned || []; const tr = training || [];
  const completed = pl.filter(p => p.status === 'completed').length; const total = pl.length; const compliance = total > 0 ? Math.round((completed / total) * 100) : 0;
  const swimDist = tr.filter(t => t.sport === 'Swim').reduce((s, t) => s + t.distance, 0);
  const bikeDist = tr.filter(t => t.sport === 'Bike').reduce((s, t) => s + t.distance, 0);
  const runDist = tr.filter(t => t.sport === 'Run').reduce((s, t) => s + t.distance, 0);
  const totalMins = tr.reduce((s, t) => s + t.duration, 0);
  let reply = '📊 *Weekly Summary*\n\n✅ Sessions: ' + completed + '/' + total + ' (' + compliance + '%)\n⏱ Total: ' + (Math.round(totalMins / 60 * 10) / 10) + 'h\n\n🏊 Swim: ' + swimDist + 'm\n🚴 Bike: ' + bikeDist + 'km\n🏃 Run: ' + runDist + 'km\n';
  const ns = pl.filter(p => p.status === 'planned' && p.date >= today).sort((a, b) => a.date.localeCompare(b.date))[0];
  if (ns) { const e = ns.sport === 'Swim' ? '🏊' : ns.sport === 'Bike' ? '🚴' : ns.sport === 'Run' ? '🏃' : '💪'; reply += '\n*Next up:* ' + e + ' ' + ns.sport + ' – ' + ns.type + ' (' + ns.date + ')'; }
  await sendTelegram(chatId, reply, 'Markdown');
  return res.status(200).json({ ok: true });
}

async function checkAchievements(supabaseUrl, key, userId, sport, duration, distance, chatId) {
  const milestones = await sbGet(supabaseUrl + '/rest/v1/milestones?user_id=eq.' + userId + '&rule_type=eq.achievement_based&status=eq.upcoming&select=*', key);
  if (!milestones) return;
  for (const m of milestones) { const rule = m.rule_json; if (!rule || rule.sport !== sport) continue; let achieved = false; if (rule.min_duration && duration >= rule.min_duration) achieved = true; if (rule.min_distance && distance >= rule.min_distance) achieved = true; if (achieved) { await sbPatch(supabaseUrl + '/rest/v1/milestones?id=eq.' + m.id, key, { status: 'achieved', achieved_at: new Date().toISOString() }); await sendTelegram(chatId, '🏆 *Milestone Achieved!*\n' + m.icon + ' ' + m.title, 'Markdown'); } }
}