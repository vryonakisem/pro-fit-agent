// api/coach.js — Vercel Serverless Function
// Calls Claude API securely (API key stays on server)

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured' });

  try {
    const { mode, userMessage, athleteContext, chatHistory } = req.body;
    const systemPrompt = buildSystemPrompt(athleteContext, mode);

    // Build messages array with conversation history
    const messages = [];

    if (mode === 'chat' && chatHistory && chatHistory.length > 0) {
      // Include last 20 messages for context
      for (const msg of chatHistory.slice(-20)) {
        messages.push({ role: msg.role, content: msg.content });
      }
      // Add current message
      messages.push({ role: 'user', content: userMessage || 'How is my training going?' });
    } else if (mode === 'summary') {
      messages.push({ role: 'user', content: 'Generate my weekly training summary and recommendations based on my data.' });
    } else if (mode === 'nutrition') {
      messages.push({ role: 'user', content: 'Generate a detailed daily meal plan for today based on my training, weight, and goals. Include specific meals with approximate macros.' });
    } else {
      messages.push({ role: 'user', content: userMessage || 'How is my training going?' });
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1500,
        system: systemPrompt,
        messages,
      }),
    });

    if (!response.ok) {
      const errorData = await response.text();
      console.error('Claude API error:', errorData);
      return res.status(response.status).json({ error: 'Claude API error', details: errorData });
    }

    const data = await response.json();
    const text = data.content.filter(block => block.type === 'text').map(block => block.text).join('\n');

    // Parse plan changes if the AI included them
    let planChanges = [];
    const planChangeMatch = text.match(/\[PLAN_CHANGES\]([\s\S]*?)\[\/PLAN_CHANGES\]/);
    if (planChangeMatch) {
      try { planChanges = JSON.parse(planChangeMatch[1]); } catch (e) { /* ignore parse errors */ }
    }
    const cleanMessage = text.replace(/\[PLAN_CHANGES\][\s\S]*?\[\/PLAN_CHANGES\]/, '').trim();

    return res.status(200).json({ message: cleanMessage, planChanges });

  } catch (error) {
    console.error('Coach API error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

function buildSystemPrompt(ctx, mode) {
  if (!ctx) ctx = {};

  const sections = [
    `You are an expert triathlon coach and sports nutritionist AI inside the "Pro Fit Agent" app. You coach athletes preparing for Ironman 70.3 races.`,
    `Your tone is encouraging but honest — like a knowledgeable friend who happens to be a pro coach. Use short paragraphs. Use emoji sparingly (1-2 per response max).`,
    `Keep responses concise (under 250 words for chat, under 400 words for summaries, under 500 words for meal plans).`,
    `IMPORTANT: You have access to the athlete's real training data below. Always reference their actual numbers, planned sessions, and metrics. Never make up or guess data — use only what is provided.`,
  ];

  if (ctx.onboarding) {
    const o = ctx.onboarding;
    sections.push(`\n--- ATHLETE PROFILE ---`);
    if (o.age) sections.push(`Age: ${o.age}`);
    if (o.weight) sections.push(`Weight: ${o.weight}kg`);
    if (o.trainingBackground) sections.push(`Experience: ${o.trainingBackground}`);
    if (o.goalType) sections.push(`Goal: ${o.goalType}`);
    if (o.raceDate) sections.push(`Race date: ${o.raceDate}`);
    if (o.priority) sections.push(`Priority: ${o.priority}`);
    if (o.hoursPerWeek) sections.push(`Available: ${o.hoursPerWeek} hrs/week`);
    if (o.canSwim1900m !== undefined) sections.push(`Can swim 1.9km: ${o.canSwim1900m ? 'Yes' : 'No'}`);
    if (o.fiveKTime) sections.push(`5K time: ${Math.round(o.fiveKTime / 60)} minutes`);
    if (o.ftp) sections.push(`FTP: ${o.ftp}W`);
  }

  if (ctx.plan) {
    const p = ctx.plan;
    sections.push(`\n--- CURRENT PLAN ---`);
    sections.push(`Phase: ${p.phase}`);
    sections.push(`Weekly targets: ${p.weekly_swim_sessions} swims, ${p.weekly_bike_km}km bike, ${p.weekly_run_km}km run, ${p.weekly_strength_sessions} strength`);
  }

  // TODAY'S PLAN - most important context
  if (ctx.plannedSessionsList && ctx.plannedSessionsList.length > 0) {
    const today = new Date().toISOString().split('T')[0];
    const todaySessions = ctx.plannedSessionsList.filter(s => s.date === today);
    if (todaySessions.length > 0) {
      sections.push(`\n--- TODAY'S PLANNED SESSIONS (${today}) ---`);
      todaySessions.forEach(s => {
        sections.push(`ID:${s.id} | ${s.sport} ${s.type} — ${s.duration}min, ${s.distance || 0}${s.sport === 'Swim' ? 'm' : 'km'}, ${s.intensity}, status:${s.status}${s.description ? ' | ' + s.description : ''}`);
      });
    } else {
      sections.push(`\n--- TODAY (${today}) ---`);
      sections.push(`Rest day — no sessions planned for today.`);
    }
  }

  if (ctx.weekStats) {
    const w = ctx.weekStats;
    sections.push(`\n--- THIS WEEK ---`);
    sections.push(`Completed: ${w.completed}/${w.total} sessions (${w.compliancePercent}%)`);
    sections.push(`Skipped: ${w.skipped}`);
    if (w.swimDistance) sections.push(`Swim: ${w.swimDistance}m`);
    if (w.bikeDistance) sections.push(`Bike: ${w.bikeDistance}km`);
    if (w.runDistance) sections.push(`Run: ${w.runDistance}km`);
    sections.push(`Total duration: ${w.totalMinutes} minutes`);
  }

  if (ctx.recentBody && ctx.recentBody.length > 0) {
    sections.push(`\n--- RECENT BODY METRICS ---`);
    ctx.recentBody.slice(0, 5).forEach(b => {
      const parts = [b.date];
      if (b.weight) parts.push(`${b.weight}kg`);
      if (b.sleep) parts.push(`${b.sleep}h sleep`);
      if (b.fatigue) parts.push(`fatigue ${b.fatigue}/10`);
      sections.push(parts.join(' | '));
    });
  }

  if (ctx.recentSessions && ctx.recentSessions.length > 0) {
    sections.push(`\n--- RECENT WORKOUTS (last 7) ---`);
    ctx.recentSessions.slice(0, 7).forEach(s => {
      sections.push(`${s.date}: ${s.sport} ${s.type} — ${s.duration}min, ${s.distance}${s.sport === 'Swim' ? 'm' : 'km'}, RPE ${s.rpe}`);
    });
  }

  if (ctx.plannedSessionsList && ctx.plannedSessionsList.length > 0) {
    sections.push(`\n--- UPCOMING PLANNED SESSIONS ---`);
    ctx.plannedSessionsList.slice(0, 14).forEach(s => {
      sections.push(`ID:${s.id} | ${s.date}: ${s.sport} ${s.type} — ${s.duration}min, ${s.intensity}, status:${s.status}`);
    });
  }

  if (mode === 'nutrition') {
    sections.push(`\n--- NUTRITION TASK ---`);
    if (ctx.targetCalories) sections.push(`Target: ${ctx.targetCalories} kcal, ${ctx.targetProtein}g protein, ${ctx.targetCarbs}g carbs, ${ctx.targetFat}g fat`);
    sections.push(`Generate a complete daily meal plan with 5-6 meals. For each meal include:`);
    sections.push(`- Meal name (Breakfast, Snack AM, Lunch, Snack PM, Dinner, Post-Workout)`);
    sections.push(`- Specific foods with portions`);
    sections.push(`- Approximate calories and macros`);
    sections.push(`Tailor to the athlete's training day — more carbs on heavy training days, more protein on rest/recovery days.`);
    sections.push(`Focus on practical, whole-food meals. Include pre/post workout nutrition timing advice.`);
  } else if (mode === 'summary') {
    sections.push(`\n--- TASK ---`);
    sections.push(`Generate a weekly training summary with these sections:`);
    sections.push(`1. **Week Overview** — how the week went overall`);
    sections.push(`2. **What Went Well** — positive highlights`);
    sections.push(`3. **Areas to Improve** — honest but constructive feedback`);
    sections.push(`4. **Recovery Check** — based on body metrics and training load`);
    sections.push(`5. **Next Week Focus** — 2-3 specific priorities`);
    sections.push(`If data is limited, say so and give general advice for the athlete's level.`);
  } else {
    sections.push(`\n--- TASK ---`);
    sections.push(`Answer the athlete's question using their training data. Be specific and actionable. Reference their actual numbers when possible.`);
    sections.push(`CRITICAL: When the athlete asks about today's training, ONLY refer to the TODAY'S PLANNED SESSIONS section above. Do not invent sessions.`);
    if (ctx.canModifyPlan) {
      sections.push(`\nYou can modify the training plan if the athlete asks. When making changes, include a JSON block at the end:`);
      sections.push(`[PLAN_CHANGES][{"action":"cancel","sessionId":"<id>"},{"action":"add","date":"YYYY-MM-DD","sport":"Run","type":"Z2","duration":40,"distance":6,"intensity":"Easy","description":"Easy recovery run"}][/PLAN_CHANGES]`);
      sections.push(`Only include [PLAN_CHANGES] when the athlete explicitly asks to change their plan. Available actions: cancel (replaces a session - does NOT count as skipped), add, reschedule (with newDate - marks original as cancelled and creates new session).`);
      sections.push(`When replacing or rescheduling, use the session ID from the UPCOMING PLANNED SESSIONS list. Use "cancel" not "skip" — cancelled sessions appear as "Replaced" in amber color and don't count against compliance.`);
    }
  }

  return sections.join('\n');
}