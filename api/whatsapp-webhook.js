// api/whatsapp-webhook.js — Receives WhatsApp messages via n8n
// Parses structured commands and writes to Supabase
import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Webhook-Secret');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // Validate webhook secret
  const secret = req.headers['x-webhook-secret'];
  if (!secret || secret !== process.env.WEBHOOK_SECRET) {
    return res.status(403).json({ error: 'Invalid webhook secret' });
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    return res.status(500).json({ error: 'Server misconfigured' });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  try {
    const { phone, message } = req.body;
    if (!phone || !message) {
      return res.status(400).json({ error: 'Missing phone or message' });
    }

    const text = message.trim();

    // 1. Check if this is a pairing code
    const pairingMatch = text.match(/^\d{6}$/);
    if (pairingMatch) {
      return await handlePairing(supabase, phone, text, res);
    }

    // 2. Look up user by phone
    const { data: channel } = await supabase
      .from('user_channels')
      .select('user_id')
      .eq('channel_identifier', phone)
      .eq('verified', true)
      .single();

    if (!channel) {
      return res.status(200).json({
        reply: "I don't recognise this number. Please pair your account first by going to Pro Fit Agent → Menu → Connect WhatsApp."
      });
    }

    const userId = channel.user_id;

    // Log the message
    await supabase.from('message_ingest').insert({
      user_id: userId,
      channel_type: 'whatsapp',
      channel_identifier: phone,
      incoming_text: text,
      status: 'received',
    });

    // 3. Parse the command
    const lowerText = text.toLowerCase();

    if (lowerText.startsWith('log ')) {
      return await handleLogTraining(supabase, userId, text, res);
    }

    if (lowerText.startsWith('fatigue') || lowerText.startsWith('body') || lowerText.startsWith('metrics')) {
      return await handleLogBody(supabase, userId, text, res);
    }

    if (lowerText.startsWith('summary') || lowerText.startsWith('status')) {
      return await handleSummary(supabase, userId, res);
    }

    // Unknown command
    return res.status(200).json({
      reply: "I didn't understand that. Try:\n• log run 45min 7km rpe6\n• log bike 120min 40km\n• log swim 60min rpe7\n• fatigue 7 sleep 6.5 weight 78.2\n• summary"
    });

  } catch (err) {
    console.error('Webhook error:', err);
    return res.status(500).json({ error: 'Internal error' });
  }
}

// ============================================================================
// PAIRING
// ============================================================================
async function handlePairing(supabase, phone, code, res) {
  const { data: pairingRow } = await supabase
    .from('pairing_codes')
    .select('*')
    .eq('code', code)
    .is('consumed_at', null)
    .gt('expires_at', new Date().toISOString())
    .single();

  if (!pairingRow) {
    return res.status(200).json({ reply: 'Invalid or expired code. Please generate a new one in the app.' });
  }

  // Mark code consumed
  await supabase.from('pairing_codes').update({ consumed_at: new Date().toISOString() }).eq('id', pairingRow.id);

  // Upsert channel
  const { data: existing } = await supabase
    .from('user_channels')
    .select('id')
    .eq('user_id', pairingRow.user_id)
    .eq('channel_type', 'whatsapp')
    .single();

  if (existing) {
    await supabase.from('user_channels')
      .update({ channel_identifier: phone, verified: true })
      .eq('id', existing.id);
  } else {
    await supabase.from('user_channels').insert({
      user_id: pairingRow.user_id,
      channel_type: 'whatsapp',
      channel_identifier: phone,
      verified: true,
    });
  }

  return res.status(200).json({ reply: '✅ WhatsApp connected! You can now log workouts and check your training status.' });
}

// ============================================================================
// LOG TRAINING
// ============================================================================
async function handleLogTraining(supabase, userId, text, res) {
  // Parse: "log run 45min 7km rpe6 notes: felt good"
  const sportMatch = text.match(/log\s+(swim|bike|run|strength)/i);
  if (!sportMatch) {
    return res.status(200).json({ reply: 'Sport not recognised. Use: log swim/bike/run/strength' });
  }

  const sport = sportMatch[1].charAt(0).toUpperCase() + sportMatch[1].slice(1).toLowerCase();
  const durationMatch = text.match(/(\d+)\s*min/i);
  const distanceMatch = text.match(/(\d+\.?\d*)\s*km/i);
  const distanceMetersMatch = text.match(/(\d+)\s*m\b/i);
  const rpeMatch = text.match(/rpe\s*(\d+)/i);
  const notesMatch = text.match(/notes?:\s*(.+)/i);

  const duration = durationMatch ? parseInt(durationMatch[1]) : 0;
  let distance = distanceMatch ? parseFloat(distanceMatch[1]) : 0;
  if (!distance && distanceMetersMatch && sport === 'Swim') {
    distance = parseInt(distanceMetersMatch[1]);
  }
  const rpe = rpeMatch ? parseInt(rpeMatch[1]) : 5;
  const notes = notesMatch ? notesMatch[1].trim() : '';
  const today = new Date().toISOString().split('T')[0];

  if (!duration) {
    return res.status(200).json({ reply: 'Please include duration, e.g.: log run 45min 7km rpe6' });
  }

  // Insert training session
  const { data: inserted, error } = await supabase.from('training_sessions').insert({
    user_id: userId,
    date: today,
    sport,
    type: 'Z2',
    duration,
    distance,
    rpe,
    notes,
  }).select().single();

  if (error) {
    console.error('Log training error:', error);
    return res.status(200).json({ reply: 'Failed to log training. Please try again.' });
  }

  // Check for matching planned session and mark complete
  const { data: planned } = await supabase
    .from('planned_sessions')
    .select('id')
    .eq('user_id', userId)
    .eq('date', today)
    .eq('sport', sport)
    .eq('status', 'planned')
    .limit(1)
    .single();

  if (planned) {
    await supabase.from('planned_sessions').update({
      status: 'completed',
      completed_session_id: inserted.id,
    }).eq('id', planned.id);
  }

  // Check achievement milestones
  await checkAchievementMilestones(supabase, userId, { sport, duration, distance });

  const emoji = sport === 'Swim' ? '🏊' : sport === 'Bike' ? '🚴' : sport === 'Run' ? '🏃' : '💪';
  const planned_note = planned ? ' (planned session marked ✅)' : '';
  return res.status(200).json({
    reply: `${emoji} ${sport} logged! ${duration}min${distance ? `, ${distance}${sport === 'Swim' ? 'm' : 'km'}` : ''}, RPE ${rpe}${planned_note}`
  });
}

// ============================================================================
// LOG BODY METRICS
// ============================================================================
async function handleLogBody(supabase, userId, text, res) {
  // Parse: "fatigue 7 sleep 6.5 weight 78.2 notes: sore legs"
  const fatigueMatch = text.match(/fatigue\s+(\d+\.?\d*)/i);
  const sleepMatch = text.match(/sleep\s+(\d+\.?\d*)/i);
  const weightMatch = text.match(/weight\s+(\d+\.?\d*)/i);
  const notesMatch = text.match(/notes?:\s*(.+)/i);

  const today = new Date().toISOString().split('T')[0];

  const { error } = await supabase.from('body_metrics').insert({
    user_id: userId,
    date: today,
    fatigue: fatigueMatch ? parseFloat(fatigueMatch[1]) : null,
    sleep: sleepMatch ? parseFloat(sleepMatch[1]) : null,
    weight: weightMatch ? parseFloat(weightMatch[1]) : null,
    notes: notesMatch ? notesMatch[1].trim() : '',
  });

  if (error) {
    return res.status(200).json({ reply: 'Failed to log metrics. Please try again.' });
  }

  const parts = [];
  if (fatigueMatch) parts.push(`Fatigue: ${fatigueMatch[1]}/10`);
  if (sleepMatch) parts.push(`Sleep: ${sleepMatch[1]}h`);
  if (weightMatch) parts.push(`Weight: ${weightMatch[1]}kg`);

  return res.status(200).json({
    reply: `📊 Body metrics logged!\n${parts.join(' | ')}${notesMatch ? '\nNotes: ' + notesMatch[1] : ''}`
  });
}

// ============================================================================
// SUMMARY
// ============================================================================
async function handleSummary(supabase, userId, res) {
  const weekStart = new Date();
  weekStart.setDate(weekStart.getDate() - weekStart.getDay());
  const weekStartStr = weekStart.toISOString().split('T')[0];

  const [trainingRes, plannedRes] = await Promise.all([
    supabase.from('training_sessions').select('*').eq('user_id', userId).gte('date', weekStartStr),
    supabase.from('planned_sessions').select('*').eq('user_id', userId).gte('date', weekStartStr),
  ]);

  const training = trainingRes.data || [];
  const planned = plannedRes.data || [];
  const completed = planned.filter(p => p.status === 'completed').length;
  const total = planned.length;
  const compliance = total > 0 ? Math.round((completed / total) * 100) : 0;

  const swimDist = training.filter(t => t.sport === 'Swim').reduce((s, t) => s + t.distance, 0);
  const bikeDist = training.filter(t => t.sport === 'Bike').reduce((s, t) => s + t.distance, 0);
  const runDist = training.filter(t => t.sport === 'Run').reduce((s, t) => s + t.distance, 0);
  const totalMins = training.reduce((s, t) => s + t.duration, 0);

  // Find next planned session
  const today = new Date().toISOString().split('T')[0];
  const nextSession = planned.find(p => p.date >= today && p.status === 'planned');

  let reply = `📋 *Weekly Summary*\n`;
  reply += `Sessions: ${completed}/${total} (${compliance}%)\n`;
  reply += `Total: ${Math.round(totalMins / 60 * 10) / 10}h\n`;
  if (swimDist) reply += `🏊 Swim: ${swimDist}m\n`;
  if (bikeDist) reply += `🚴 Bike: ${bikeDist}km\n`;
  if (runDist) reply += `🏃 Run: ${runDist}km\n`;
  if (nextSession) {
    reply += `\n*Next:* ${nextSession.sport} ${nextSession.type} (${nextSession.date})`;
  }

  return res.status(200).json({ reply });
}

// ============================================================================
// ACHIEVEMENT MILESTONES
// ============================================================================
async function checkAchievementMilestones(supabase, userId, session) {
  const { data: milestones } = await supabase
    .from('milestones')
    .select('*')
    .eq('user_id', userId)
    .eq('rule_type', 'achievement_based')
    .eq('status', 'upcoming');

  if (!milestones || milestones.length === 0) return;

  for (const milestone of milestones) {
    const rule = milestone.rule_json || {};
    let achieved = false;

    if (rule.sport && rule.sport.toLowerCase() === session.sport.toLowerCase()) {
      if (rule.min_duration && session.duration >= rule.min_duration) achieved = true;
      if (rule.min_distance && session.distance >= rule.min_distance) achieved = true;
    }

    if (achieved) {
      await supabase.from('milestones').update({
        status: 'achieved',
        achieved_at: new Date().toISOString(),
      }).eq('id', milestone.id);
    }
  }
}