import { createClient } from '@supabase/supabase-js';

const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_API = `https://api.telegram.org/bot${TELEGRAM_TOKEN}`;

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

export default async function handler(req, res) {
  if (req.method === 'GET') {
    return res.status(200).json({ status: 'ProFitAgent Telegram Bot active' });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const update = req.body;

    // Only handle text messages
    if (!update.message || !update.message.text) {
      return res.status(200).json({ ok: true });
    }

    const chatId = update.message.chat.id;
    const text = update.message.text.trim();
    const phone = String(chatId); // Use chat ID as identifier

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Check if user is paired
    const { data: channel } = await supabase
      .from('user_channels')
      .select('user_id')
      .eq('channel_type', 'telegram')
      .eq('channel_identifier', phone)
      .eq('verified', true)
      .maybeSingle();

    // Handle pairing code (6-digit number)
    if (/^\d{6}$/.test(text)) {
      return await handlePairing(supabase, chatId, phone, text, res);
    }

    if (!channel) {
      await sendTelegram(chatId, '👋 Welcome to Pro Fit Agent!\n\nTo connect your account:\n1. Open the app → tap your avatar → Connect WhatsApp\n2. Generate a pairing code\n3. Send the 6-digit code here');
      return res.status(200).json({ ok: true });
    }

    const userId = channel.user_id;

    // Log the message
    await supabase.from('message_ingest').insert({
      user_id: userId,
      channel_type: 'telegram',
      channel_identifier: phone,
      incoming_text: text,
      status: 'received',
    });

    // Parse command
    const lowerText = text.toLowerCase().replace(/^\//, ''); // strip leading /

    if (lowerText.startsWith('log ')) {
      return await handleLogTraining(supabase, userId, text, chatId, res);
    }

    if (lowerText.startsWith('fatigue') || lowerText.startsWith('body') || lowerText.startsWith('metrics')) {
      return await handleLogBody(supabase, userId, text, chatId, res);
    }

    if (lowerText.startsWith('sleep ') || lowerText === 'sleep') {
      if (lowerText === 'sleep') {
        await sendTelegram(chatId, '💤 To log sleep, send:\nsleep 7.5\n\nOr with more detail:\nsleep 7.5 notes: slept well');
        return res.status(200).json({ ok: true });
      }
      const rewritten = 'fatigue 5 ' + text;
      return await handleLogBody(supabase, userId, rewritten, chatId, res);
    }

    if (lowerText.startsWith('today') || lowerText.startsWith('plan') || lowerText.startsWith('next') || lowerText.startsWith('what') || lowerText === 'start') {
      return await handleToday(supabase, userId, chatId, res);
    }

    if (lowerText.startsWith('summary') || lowerText.startsWith('status') || lowerText.startsWith('week')) {
      return await handleSummary(supabase, userId, chatId, res);
    }

    if (lowerText === 'help' || lowerText === 'commands') {
      await sendTelegram(chatId,
        '🏋️ *Pro Fit Agent Commands*\n\n' +
        '📋 *today* — See today\'s plan\n' +
        '📊 *summary* — Weekly overview\n' +
        '💤 *sleep 7.5* — Log sleep\n' +
        '🏃 *log run 45min 7km rpe6* — Log workout\n' +
        '🚴 *log bike 120min 40km rpe5* — Log ride\n' +
        '🏊 *log swim 60min rpe7* — Log swim\n' +
        '📝 *fatigue 6 sleep 7 weight 78* — Full body log\n\n' +
        'That\'s it! Just type naturally.',
        'Markdown'
      );
      return res.status(200).json({ ok: true });
    }

    // Unknown command — friendly response
    await sendTelegram(chatId,
      '🤔 I didn\'t catch that. Try:\n\n' +
      '• today — see your plan\n' +
      '• sleep 7.5 — log sleep\n' +
      '• log run 45min 7km — log workout\n' +
      '• summary — weekly overview\n' +
      '• help — all commands'
    );
    return res.status(200).json({ ok: true });

  } catch (err) {
    console.error('Telegram webhook error:', err);
    return res.status(200).json({ ok: true }); // Always 200 so Telegram doesn't retry
  }
}

// ============================================================================
// SEND TELEGRAM MESSAGE
// ============================================================================
async function sendTelegram(chatId, text, parseMode) {
  const body = {
    chat_id: chatId,
    text: text,
  };
  if (parseMode) body.parse_mode = parseMode;

  await fetch(`${TELEGRAM_API}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

// ============================================================================
// PAIRING
// ============================================================================
async function handlePairing(supabase, chatId, phone, code, res) {
  const { data: pairingRow } = await supabase
    .from('pairing_codes')
    .select('*')
    .eq('code', code)
    .is('consumed_at', null)
    .gt('expires_at', new Date().toISOString())
    .maybeSingle();

  if (!pairingRow) {
    await sendTelegram(chatId, '❌ Invalid or expired code. Please generate a new one in the app.');
    return res.status(200).json({ ok: true });
  }

  // Mark code as consumed
  await supabase
    .from('pairing_codes')
    .update({ consumed_at: new Date().toISOString() })
    .eq('id', pairingRow.id);

  // Upsert channel
  await supabase
    .from('user_channels')
    .upsert({
      user_id: pairingRow.user_id,
      channel_type: 'telegram',
      channel_identifier: phone,
      verified: true,
    }, { onConflict: 'user_id,channel_type' });

  await sendTelegram(chatId, '✅ Connected! Your Telegram is now linked to Pro Fit Agent.\n\nTry: *today* or *help*', 'Markdown');
  return res.status(200).json({ ok: true });
}

// ============================================================================
// LOG TRAINING
// ============================================================================
async function handleLogTraining(supabase, userId, text, chatId, res) {
  // Parse: "log run 45min 7km rpe6 notes: felt good"
  const parts = text.replace(/^(\/)?log\s+/i, '');
  const sportMatch = parts.match(/^(run|bike|swim|strength)/i);
  if (!sportMatch) {
    await sendTelegram(chatId, '❓ Specify a sport: log *run/bike/swim* 45min 7km rpe6', 'Markdown');
    return res.status(200).json({ ok: true });
  }

  const sport = sportMatch[1].charAt(0).toUpperCase() + sportMatch[1].slice(1).toLowerCase();
  const durationMatch = parts.match(/(\d+)\s*min/i);
  const distanceMatch = parts.match(/(\d+\.?\d*)\s*km/i) || parts.match(/(\d+)\s*m(?!\w)/i);
  const rpeMatch = parts.match(/rpe\s*(\d+)/i);
  const notesMatch = parts.match(/notes?:\s*(.+)/i);

  const duration = durationMatch ? parseInt(durationMatch[1]) : 0;
  let distance = 0;
  if (distanceMatch) {
    distance = parseFloat(distanceMatch[1]);
    if (parts.match(/(\d+)\s*m(?!\w)/i) && !parts.match(/(\d+\.?\d*)\s*km/i)) {
      // It's in meters (for swim)
    }
  }
  const rpe = rpeMatch ? parseInt(rpeMatch[1]) : 5;
  const notes = notesMatch ? notesMatch[1].trim() : '';

  const today = new Date().toISOString().split('T')[0];

  const { data: inserted, error } = await supabase
    .from('training_sessions')
    .insert({
      user_id: userId,
      date: today,
      sport,
      type: 'Z2',
      duration,
      distance,
      rpe,
      notes,
    })
    .select()
    .single();

  if (error) {
    await sendTelegram(chatId, '❌ Failed to log. Please try again.');
    return res.status(200).json({ ok: true });
  }

  // Mark planned session as completed
  const { data: planned } = await supabase
    .from('planned_sessions')
    .select('id')
    .eq('user_id', userId)
    .eq('date', today)
    .eq('sport', sport)
    .eq('status', 'planned')
    .limit(1)
    .maybeSingle();

  if (planned) {
    await supabase
      .from('planned_sessions')
      .update({ status: 'completed', completed_session_id: inserted.id })
      .eq('id', planned.id);
  }

  // Check achievement milestones
  await checkAchievementMilestones(supabase, userId, sport, duration, distance, chatId);

  const emoji = sport === 'Swim' ? '🏊' : sport === 'Bike' ? '🚴' : sport === 'Run' ? '🏃' : '💪';
  let reply = `${emoji} *${sport} logged!*\n`;
  reply += `⏱ ${duration}min`;
  if (distance > 0) reply += ` • ${distance}${sport === 'Swim' ? 'm' : 'km'}`;
  reply += ` • RPE ${rpe}`;
  if (notes) reply += `\n📝 ${notes}`;
  if (planned) reply += `\n✅ Planned session marked complete`;

  await sendTelegram(chatId, reply, 'Markdown');
  return res.status(200).json({ ok: true });
}

// ============================================================================
// LOG BODY METRICS
// ============================================================================
async function handleLogBody(supabase, userId, text, chatId, res) {
  const fatigueMatch = text.match(/fatigue\s+(\d+\.?\d*)/i);
  const sleepMatch = text.match(/sleep\s+(\d+\.?\d*)/i);
  const weightMatch = text.match(/weight\s+(\d+\.?\d*)/i);
  const notesMatch = text.match(/notes?:\s*(.+)/i);

  const today = new Date().toISOString().split('T')[0];

  const metrics = {
    user_id: userId,
    date: today,
    fatigue: fatigueMatch ? parseFloat(fatigueMatch[1]) : null,
    sleep: sleepMatch ? parseFloat(sleepMatch[1]) : null,
    weight: weightMatch ? parseFloat(weightMatch[1]) : null,
    notes: notesMatch ? notesMatch[1].trim() : '',
  };

  const { error } = await supabase.from('body_metrics').insert(metrics);

  if (error) {
    await sendTelegram(chatId, '❌ Failed to log metrics. Please try again.');
    return res.status(200).json({ ok: true });
  }

  let reply = '📊 *Metrics logged!*\n';
  if (metrics.sleep) reply += `💤 Sleep: ${metrics.sleep}h\n`;
  if (metrics.fatigue) reply += `😓 Fatigue: ${metrics.fatigue}/10\n`;
  if (metrics.weight) reply += `⚖️ Weight: ${metrics.weight}kg\n`;
  if (metrics.notes) reply += `📝 ${metrics.notes}`;

  await sendTelegram(chatId, reply, 'Markdown');
  return res.status(200).json({ ok: true });
}

// ============================================================================
// TODAY'S PLAN
// ============================================================================
async function handleToday(supabase, userId, chatId, res) {
  const today = new Date().toISOString().split('T')[0];
  const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];

  const [todayRes, tomorrowRes, bodyRes] = await Promise.all([
    supabase.from('planned_sessions').select('*').eq('user_id', userId).eq('date', today).order('sport'),
    supabase.from('planned_sessions').select('*').eq('user_id', userId).eq('date', tomorrow).order('sport'),
    supabase.from('body_metrics').select('*').eq('user_id', userId).order('date', { ascending: false }).limit(1),
  ]);

  const todaySessions = todayRes.data || [];
  const tomorrowSessions = tomorrowRes.data || [];
  const lastBody = bodyRes.data?.[0];

  const dayName = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' });
  let reply = `📋 *Today's Plan* (${dayName})\n\n`;

  if (todaySessions.length === 0) {
    reply += '🧘 Rest day — no sessions planned\n';
  } else {
    for (const s of todaySessions) {
      const emoji = s.sport === 'Swim' ? '🏊' : s.sport === 'Bike' ? '🚴' : s.sport === 'Run' ? '🏃' : '💪';
      const statusIcon = s.status === 'completed' ? ' ✅' : s.status === 'skipped' ? ' ⏭️' : '';
      reply += `${emoji} *${s.sport} – ${s.type}*${statusIcon}\n`;
      reply += `   ${s.duration}min`;
      if (s.distance > 0) reply += ` • ${s.distance}${s.sport === 'Swim' ? 'm' : 'km'}`;
      reply += ` • ${s.intensity}\n`;
      if (s.description) reply += `   _${s.description}_\n`;
      reply += '\n';
    }
  }

  if (tomorrowSessions.length > 0) {
    reply += '*Tomorrow:* ';
    reply += tomorrowSessions.map(s => {
      const emoji = s.sport === 'Swim' ? '🏊' : s.sport === 'Bike' ? '🚴' : s.sport === 'Run' ? '🏃' : '💪';
      return `${emoji} ${s.sport} ${s.duration}min`;
    }).join(', ');
    reply += '\n';
  }

  if (lastBody) {
    reply += `\n📊 *Last check-in* (${lastBody.date}):`;
    if (lastBody.sleep) reply += ` Sleep ${lastBody.sleep}h`;
    if (lastBody.fatigue) reply += ` • Fatigue ${lastBody.fatigue}/10`;
    if (lastBody.weight) reply += ` • ${lastBody.weight}kg`;
  }

  await sendTelegram(chatId, reply, 'Markdown');
  return res.status(200).json({ ok: true });
}

// ============================================================================
// WEEKLY SUMMARY
// ============================================================================
async function handleSummary(supabase, userId, chatId, res) {
  const weekStart = new Date();
  weekStart.setDate(weekStart.getDate() - weekStart.getDay());
  const weekStartStr = weekStart.toISOString().split('T')[0];

  const [plannedRes, trainingRes] = await Promise.all([
    supabase.from('planned_sessions').select('*').eq('user_id', userId).gte('date', weekStartStr),
    supabase.from('training_sessions').select('*').eq('user_id', userId).gte('date', weekStartStr),
  ]);

  const planned = plannedRes.data || [];
  const training = trainingRes.data || [];

  const completed = planned.filter(p => p.status === 'completed').length;
  const total = planned.length;
  const compliance = total > 0 ? Math.round((completed / total) * 100) : 0;

  const swimDist = training.filter(t => t.sport === 'Swim').reduce((s, t) => s + t.distance, 0);
  const bikeDist = training.filter(t => t.sport === 'Bike').reduce((s, t) => s + t.distance, 0);
  const runDist = training.filter(t => t.sport === 'Run').reduce((s, t) => s + t.distance, 0);
  const totalMins = training.reduce((s, t) => s + t.duration, 0);

  let reply = '📊 *Weekly Summary*\n\n';
  reply += `✅ Sessions: ${completed}/${total} (${compliance}%)\n`;
  reply += `⏱ Total: ${Math.round(totalMins / 60 * 10) / 10}h\n\n`;
  reply += `🏊 Swim: ${swimDist}m\n`;
  reply += `🚴 Bike: ${bikeDist}km\n`;
  reply += `🏃 Run: ${runDist}km\n`;

  // Next planned session
  const today = new Date().toISOString().split('T')[0];
  const nextSession = planned
    .filter(p => p.status === 'planned' && p.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date))[0];

  if (nextSession) {
    const emoji = nextSession.sport === 'Swim' ? '🏊' : nextSession.sport === 'Bike' ? '🚴' : nextSession.sport === 'Run' ? '🏃' : '💪';
    reply += `\n*Next up:* ${emoji} ${nextSession.sport} – ${nextSession.type} (${nextSession.date})`;
  }

  await sendTelegram(chatId, reply, 'Markdown');
  return res.status(200).json({ ok: true });
}

// ============================================================================
// ACHIEVEMENT MILESTONES
// ============================================================================
async function checkAchievementMilestones(supabase, userId, sport, duration, distance, chatId) {
  const { data: milestones } = await supabase
    .from('milestones')
    .select('*')
    .eq('user_id', userId)
    .eq('rule_type', 'achievement_based')
    .eq('status', 'upcoming');

  if (!milestones) return;

  for (const m of milestones) {
    const rule = m.rule_json;
    if (!rule || rule.sport !== sport) continue;

    let achieved = false;
    if (rule.min_duration && duration >= rule.min_duration) achieved = true;
    if (rule.min_distance && distance >= rule.min_distance) achieved = true;

    if (achieved) {
      await supabase
        .from('milestones')
        .update({ status: 'achieved', achieved_at: new Date().toISOString() })
        .eq('id', m.id);

      await sendTelegram(chatId, `🏆 *Milestone Achieved!*\n${m.icon} ${m.title}`, 'Markdown');
    }
  }
}