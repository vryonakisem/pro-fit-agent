import React, { useState, useEffect, useCallback } from 'react';
import {
  Calendar, TrendingUp, Brain, Target, Plus, ChevronLeft, ChevronRight,
  X, User, Settings, LogOut, Loader, Check, AlertTriangle, Sun, Moon, Send, RefreshCw
} from 'lucide-react';
import { supabase } from './lib/supabase';

// ============================================================================
// TYPES
// ============================================================================

interface AppUser {
  id: string;
  email: string;
  user_metadata: { full_name?: string };
}

interface TrainingSession {
  id?: string;
  user_id: string;
  date: string;
  sport: string;
  type: string;
  duration: number;
  distance: number;
  rpe: number;
  notes: string;
}

interface BodyMetrics {
  id?: string;
  user_id: string;
  date: string;
  weight: number | null;
  sleep: number | null;
  fatigue: number | null;
  notes: string;
}

interface PlannedSession {
  id: string;
  user_id: string;
  date: string;
  sport: string;
  type: string;
  duration: number;
  distance: number;
  intensity: string;
  description: string;
  status: string;
  completed_session_id: string | null;
}

interface OnboardingData {
  step: number;
  completed: boolean;
  age?: number;
  weight?: number;
  height?: number;
  trainingBackground?: string;
  goalType?: string;
  raceDate?: string;
  priority?: string;
  hoursPerWeek?: number;
  poolDaysPerWeek?: number;
  gymAccess?: boolean;
  canSwim1900m?: boolean;
  fiveKTime?: number;
  ftp?: number;
}

// ============================================================================
// CAMELCASE <-> SNAKE_CASE MAPPERS
// ============================================================================

function onboardingToDb(data: OnboardingData, userId: string) {
  return {
    user_id: userId,
    step: data.step,
    completed: data.completed || false,
    age: data.age || null,
    weight: data.weight || null,
    height: data.height || null,
    training_background: data.trainingBackground || null,
    goal_type: data.goalType || null,
    race_date: data.raceDate || null,
    priority: data.priority || null,
    hours_per_week: data.hoursPerWeek || null,
    pool_days_per_week: data.poolDaysPerWeek || null,
    gym_access: data.gymAccess || false,
    can_swim_1900m: data.canSwim1900m || false,
    five_k_time: data.fiveKTime || null,
    ftp: data.ftp || null,
    updated_at: new Date().toISOString(),
  };
}

function onboardingFromDb(row: any): OnboardingData {
  return {
    step: row.step || 1,
    completed: row.completed || false,
    age: row.age,
    weight: row.weight,
    height: row.height,
    trainingBackground: row.training_background,
    goalType: row.goal_type,
    raceDate: row.race_date,
    priority: row.priority,
    hoursPerWeek: row.hours_per_week,
    poolDaysPerWeek: row.pool_days_per_week,
    gymAccess: row.gym_access,
    canSwim1900m: row.can_swim_1900m,
    fiveKTime: row.five_k_time,
    ftp: row.ftp,
  };
}

// ============================================================================
// ERROR HANDLING
// ============================================================================

async function safeQuery<T>(
  queryFn: () => Promise<{ data: T | null; error: any }>,
  context: string
): Promise<{ data: T | null; error: string | null }> {
  try {
    const { data, error } = await queryFn();
    if (error) {
      console.error(`[${context}]`, error.message || error);
      return { data: null, error: error.message || 'Something went wrong' };
    }
    return { data, error: null };
  } catch (err: any) {
    console.error(`[${context}] Unexpected:`, err);
    return { data: null, error: err.message || 'Network error' };
  }
}

// ============================================================================
// TOAST NOTIFICATION
// ============================================================================

const ToastContext = React.createContext<{
  showToast: (message: string, type?: 'success' | 'error' | 'info') => void;
}>({ showToast: () => {} });

const ToastProvider = ({ children }: { children: React.ReactNode }) => {
  const [toast, setToast] = useState<{ message: string; type: string } | null>(null);
  const showToast = useCallback((message: string, type: string = 'info') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      {toast && (
        <div className={`fixed top-4 left-4 right-4 z-[100] p-4 rounded-lg shadow-lg text-white text-sm font-medium ${
          toast.type === 'error' ? 'bg-red-600' : toast.type === 'success' ? 'bg-green-600' : 'bg-blue-600'
        }`}>
          <div className="flex items-center gap-2">
            {toast.type === 'error' && <AlertTriangle size={18} />}
            {toast.type === 'success' && <Check size={18} />}
            {toast.message}
          </div>
        </div>
      )}
    </ToastContext.Provider>
  );
};

const useToast = () => React.useContext(ToastContext);

// ============================================================================
// CALENDAR THEME CONFIG
// ============================================================================

const calThemes = {
  dark: {
    bg: 'bg-gray-950', statCard: 'bg-gray-900', statText: 'text-white', legendText: 'text-gray-400',
    weekLabel: 'text-gray-600', weekLabelActive: 'text-blue-400', dayHeader: 'text-gray-400',
    currentWeekBg: 'bg-gray-900 bg-opacity-50', dayDefault: 'text-gray-300', dayFuture: 'text-gray-500',
    dayCompleted: 'text-emerald-300', daySkipped: 'text-gray-600',
    cellCompleted: 'bg-gray-800 ring-2 ring-emerald-400', cellPartial: 'bg-gray-800 ring-2 ring-yellow-400',
    cellPlanned: 'bg-gray-800 ring-1 ring-gray-600', cellPlannedFuture: 'bg-gray-900 ring-1 ring-gray-700',
    cellSkipped: 'bg-gray-900 ring-1 ring-gray-700', cellRest: 'bg-gray-900 bg-opacity-30',
    dotSkipped: 'bg-gray-700', dotPlanned: 'bg-gray-500',
    detailBg: 'bg-gray-900', detailTitle: 'text-gray-300', detailRestText: 'text-gray-600',
    sessionBg: 'bg-gray-800', sessionText: 'text-white', sessionSkippedText: 'text-gray-500', sessionMeta: 'text-gray-400',
    badgeCompleted: 'bg-emerald-900 text-emerald-300', badgeSkipped: 'bg-gray-700 text-gray-400', badgePlanned: 'bg-blue-900 text-blue-300',
    swimIcon: 'bg-cyan-900', bikeIcon: 'bg-emerald-900', runIcon: 'bg-rose-900', strengthIcon: 'bg-violet-900',
  },
  light: {
    bg: 'bg-gray-50', statCard: 'bg-white shadow-sm', statText: 'text-gray-900', legendText: 'text-gray-500',
    weekLabel: 'text-gray-400', weekLabelActive: 'text-blue-600', dayHeader: 'text-gray-500',
    currentWeekBg: 'bg-blue-50', dayDefault: 'text-gray-700', dayFuture: 'text-gray-400',
    dayCompleted: 'text-emerald-600', daySkipped: 'text-gray-400',
    cellCompleted: 'bg-emerald-50 ring-2 ring-emerald-400', cellPartial: 'bg-yellow-50 ring-2 ring-yellow-400',
    cellPlanned: 'bg-white ring-1 ring-gray-300', cellPlannedFuture: 'bg-gray-100 ring-1 ring-gray-200',
    cellSkipped: 'bg-gray-100 ring-1 ring-gray-200', cellRest: 'bg-white bg-opacity-50',
    dotSkipped: 'bg-gray-300', dotPlanned: 'bg-gray-400',
    detailBg: 'bg-white shadow-sm', detailTitle: 'text-gray-700', detailRestText: 'text-gray-400',
    sessionBg: 'bg-gray-50', sessionText: 'text-gray-900', sessionSkippedText: 'text-gray-400', sessionMeta: 'text-gray-500',
    badgeCompleted: 'bg-emerald-100 text-emerald-700', badgeSkipped: 'bg-gray-200 text-gray-500', badgePlanned: 'bg-blue-100 text-blue-700',
    swimIcon: 'bg-cyan-100', bikeIcon: 'bg-emerald-100', runIcon: 'bg-rose-100', strengthIcon: 'bg-violet-100',
  },
};

// ============================================================================
// PLANNING ENGINE
// ============================================================================

const PlanningEngine = {
  generateInitialPlan: (userId: string, onboarding: OnboardingData) => {
    const weeksToRace = Math.floor(
      (new Date(onboarding.raceDate!).getTime() - Date.now()) / (7 * 24 * 60 * 60 * 1000)
    );
    const phase = weeksToRace > 20 ? 'Base' : weeksToRace > 12 ? 'Build' : weeksToRace > 3 ? 'Peak' : 'Taper';
    let swimSessions = 3, bikeKm = 60, runKm = 25, strengthSessions = 2;
    if (onboarding.goalType === 'sub4_30') { swimSessions = 4; bikeKm = 80; runKm = 35; }
    else if (onboarding.goalType === 'sub5') { swimSessions = 3; bikeKm = 70; runKm = 30; }
    else if (onboarding.goalType === 'hybrid') { swimSessions = 3; bikeKm = 50; runKm = 20; strengthSessions = 3; }
    if (onboarding.trainingBackground === 'beginner') {
      swimSessions = Math.max(2, swimSessions - 1); bikeKm *= 0.7; runKm *= 0.7;
    }
    return {
      user_id: userId, start_date: new Date().toISOString().split('T')[0], end_date: onboarding.raceDate,
      phase, weekly_swim_sessions: swimSessions, weekly_bike_km: Math.round(bikeKm),
      weekly_run_km: Math.round(runKm), weekly_strength_sessions: strengthSessions, auto_generated: true,
    };
  },

  generate30DaySessions: (userId: string) => {
    const sessions: any[] = [];
    const startDate = new Date();
    const weekTemplate: Record<number, any[]> = {
      0: [],
      1: [{ sport: 'Swim', type: 'Skills', duration: 45, distance: 1500, intensity: 'Easy', description: 'Technique drills + easy swimming' }],
      2: [{ sport: 'Run', type: 'Z2', duration: 40, distance: 6, intensity: 'Easy', description: 'Easy aerobic run' }],
      3: [{ sport: 'Bike', type: 'Z2', duration: 60, distance: 20, intensity: 'Easy', description: 'Steady endurance ride' }],
      4: [{ sport: 'Swim', type: 'Threshold', duration: 50, distance: 2000, intensity: 'Moderate', description: '6x200m @ threshold' }],
      5: [{ sport: 'Run', type: 'Tempo', duration: 45, distance: 7, intensity: 'Moderate', description: 'Tempo run' }],
      6: [{ sport: 'Bike', type: 'Long', duration: 120, distance: 40, intensity: 'Easy', description: 'Long Z2 ride' }],
    };
    for (let day = 0; day < 30; day++) {
      const date = new Date(startDate);
      date.setDate(startDate.getDate() + day);
      const dayOfWeek = date.getDay();
      const daySessions = weekTemplate[dayOfWeek] || [];
      daySessions.forEach((s) => {
        sessions.push({ user_id: userId, date: date.toISOString().split('T')[0], ...s, status: 'planned', completed_session_id: null, created_by: 'system' });
      });
    }
    return sessions;
  },

  projectFinishTime: (onboarding: OnboardingData) => {
    const swimMins = onboarding.canSwim1900m ? 35 : 45;
    const bikeMins = onboarding.ftp ? 150 + (250 - onboarding.ftp) * 0.5 : 180;
    const runMins = onboarding.fiveKTime ? (onboarding.fiveKTime / 60) * 4.2 : 120;
    const totalMins = swimMins + bikeMins + runMins + 10;
    const hours = Math.floor(totalMins / 60);
    const mins = Math.round(totalMins % 60);
    return { time: `${hours}:${mins.toString().padStart(2, '0')}`, swim: `${Math.floor(swimMins)}min`, bike: `${Math.floor(bikeMins)}min`, run: `${Math.floor(runMins)}min` };
  },

  checkGoalRealism: (onboarding: OnboardingData) => {
    const warnings: string[] = [];
    if (onboarding.goalType === 'sub4_30') {
      if (!onboarding.canSwim1900m) warnings.push('Sub-4:30 requires 1.9km swim endurance.');
      if (onboarding.fiveKTime && onboarding.fiveKTime > 1500) warnings.push('Sub-4:30 requires faster 5K pace.');
    }
    return { realistic: warnings.length === 0, warnings, recommendation: warnings.length > 2 ? 'conservative' : warnings.length > 0 ? 'stretch' : 'achievable' };
  },
};

// ============================================================================
// MAIN APP
// ============================================================================

const ProFitAgentV5 = () => {
  const [user, setUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [onboardingData, setOnboardingData] = useState<OnboardingData>({ step: 1, completed: false });
  const [plannedSessions, setPlannedSessions] = useState<PlannedSession[]>([]);
  const [trainingSessions, setTrainingSessions] = useState<TrainingSession[]>([]);
  const [bodyMetrics, setBodyMetrics] = useState<BodyMetrics[]>([]);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [activeScreen, setActiveScreen] = useState('home');
  const [projection, setProjection] = useState<any>(null);
  const [plan, setPlan] = useState<any>(null);
  const [realism, setRealism] = useState<any>(null);

  useEffect(() => {
    checkUser();
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_IN' && session?.user) { setUser(session.user as any); await loadUserData(session.user.id); }
      else if (event === 'SIGNED_OUT') { setUser(null); setOnboardingData({ step: 1, completed: false }); }
    });
    return () => subscription.unsubscribe();
  }, []);

  const checkUser = async () => {
    const { data: { user: authUser } } = await supabase.auth.getUser();
    if (authUser) { setUser(authUser as any); await loadUserData(authUser.id); }
    setLoading(false);
  };

  const loadUserData = async (userId: string) => {
    const { data: onboardingRow } = await safeQuery(
      () => supabase.from('onboarding_data').select('*').eq('user_id', userId).maybeSingle(), 'loadOnboarding'
    );
    if (onboardingRow) {
      const onboarding = onboardingFromDb(onboardingRow);
      setOnboardingData(onboarding);
      if (onboarding.completed) {
        const [planRes, sessionsRes, trainingRes, bodyRes] = await Promise.all([
          safeQuery(() => supabase.from('training_plans').select('*').eq('user_id', userId).maybeSingle(), 'loadPlan'),
          safeQuery(() => supabase.from('planned_sessions').select('*').eq('user_id', userId).order('date', { ascending: true }), 'loadPlanned'),
          safeQuery(() => supabase.from('training_sessions').select('*').eq('user_id', userId).order('date', { ascending: false }), 'loadTraining'),
          safeQuery(() => supabase.from('body_metrics').select('*').eq('user_id', userId).order('date', { ascending: false }), 'loadBody'),
        ]);
        if (planRes.data) setPlan(planRes.data);
        if (sessionsRes.data) setPlannedSessions(sessionsRes.data as any);
        if (trainingRes.data) setTrainingSessions(trainingRes.data as any);
        if (bodyRes.data) setBodyMetrics(bodyRes.data as any);
      }
    }
  };

  const handleAuth = async (authUser: AppUser) => {
    setUser(authUser);
    await safeQuery(() => supabase.from('user_profiles').insert({ user_id: authUser.id }), 'initProfile');
    await safeQuery(() => supabase.from('user_preferences').insert({ user_id: authUser.id }), 'initPrefs');
    await safeQuery(() => supabase.from('billing_info').insert({ user_id: authUser.id, plan: 'free', status: 'active' }), 'initBilling');
  };

  const handleOnboardingComplete = async (data: OnboardingData) => {
    if (!user) return;
    setLoading(true);
    const dbData = onboardingToDb({ ...data, completed: true }, user.id);
    const { error: saveErr } = await safeQuery(
      () => supabase.from('onboarding_data').upsert(dbData, { onConflict: 'user_id' }), 'saveOnboarding'
    );
    if (saveErr) { setLoading(false); return; }

    const generatedPlan = PlanningEngine.generateInitialPlan(user.id, data);
    await safeQuery(() => supabase.from('training_plans').insert(generatedPlan), 'savePlan');
    setPlan(generatedPlan);

    const sessions = PlanningEngine.generate30DaySessions(user.id);
    await safeQuery(() => supabase.from('planned_sessions').insert(sessions), 'saveSessions');
    setPlannedSessions(sessions as any);

    setProjection(PlanningEngine.projectFinishTime(data));
    setRealism(PlanningEngine.checkGoalRealism(data));
    setOnboardingData({ ...data, completed: true });
    setLoading(false);
  };

  const handleLogTraining = async (session: TrainingSession) => {
    if (!user) return;
    const newSession = { ...session, user_id: user.id };
    const { data: inserted, error } = await safeQuery(
      () => supabase.from('training_sessions').insert(newSession).select().single(), 'logTraining'
    );
    if (error || !inserted) return;
    setTrainingSessions([inserted as any, ...trainingSessions]);
    const todayPlanned = plannedSessions.find(p => p.date === session.date && p.sport === session.sport && p.status === 'planned');
    if (todayPlanned) {
      await safeQuery(() => supabase.from('planned_sessions').update({ status: 'completed', completed_session_id: (inserted as any).id }).eq('id', todayPlanned.id), 'markCompleted');
      setPlannedSessions(plannedSessions.map(p => p.id === todayPlanned.id ? { ...p, status: 'completed' } : p));
    }
    setActiveScreen('home');
  };

  const handleLogBody = async (metrics: BodyMetrics) => {
    if (!user) return;
    const newMetrics = { ...metrics, user_id: user.id };
    const { data: inserted, error } = await safeQuery(
      () => supabase.from('body_metrics').insert(newMetrics).select().single(), 'logBody'
    );
    if (error || !inserted) return;
    setBodyMetrics([inserted as any, ...bodyMetrics]);
    setActiveScreen('home');
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setUser(null); setOnboardingData({ step: 1, completed: false });
    setPlan(null); setPlannedSessions([]); setTrainingSessions([]); setBodyMetrics([]);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center">
        <div className="text-white text-center"><Loader className="animate-spin mx-auto mb-4" size={48} /><p className="text-xl">Loading...</p></div>
      </div>
    );
  }

  if (!user) return <AuthFlow onAuth={handleAuth} />;
  if (!onboardingData.completed) return <OnboardingFlow user={user} data={onboardingData} onComplete={handleOnboardingComplete} />;

  return (
    <ToastProvider>
      <div className="min-h-screen bg-gray-50">
        <Header user={user} showMenu={showProfileMenu} setShowMenu={setShowProfileMenu} onLogout={handleLogout} onNavigate={setActiveScreen} />
        <div className="pb-20">
          {activeScreen === 'home' && (
            <HomeScreen user={user} onboarding={onboardingData} plan={plan} projection={projection}
              realism={realism} plannedSessions={plannedSessions} trainingSessions={trainingSessions} bodyMetrics={bodyMetrics} />
          )}
          {activeScreen === 'calendar' && <CalendarScreen plannedSessions={plannedSessions} />}
          {activeScreen === 'log' && <LogScreen onLogTraining={handleLogTraining} onLogBody={handleLogBody} setActiveScreen={setActiveScreen} />}
          {activeScreen === 'plan' && <PlanScreen plan={plan} plannedSessions={plannedSessions} setPlannedSessions={setPlannedSessions} onboarding={onboardingData} />}
          {activeScreen === 'coach' && <CoachScreen onboarding={onboardingData} plan={plan} plannedSessions={plannedSessions} trainingSessions={trainingSessions} bodyMetrics={bodyMetrics} />}
        </div>
        <BottomNav activeTab={activeScreen} setActiveTab={setActiveScreen} />
      </div>
    </ToastProvider>
  );
};

// ============================================================================
// AUTH FLOW
// ============================================================================

const AuthFlow = ({ onAuth }: { onAuth: (user: AppUser) => void }) => {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    setError(''); setLoading(true);
    if (!email || !password) { setError('Please fill in all fields'); setLoading(false); return; }
    if (mode === 'signup' && !fullName) { setError('Please enter your full name'); setLoading(false); return; }
    if (password.length < 6) { setError('Password must be at least 6 characters'); setLoading(false); return; }
    try {
      if (mode === 'signup') {
        const { data, error: signUpErr } = await supabase.auth.signUp({ email, password, options: { data: { full_name: fullName } } });
        if (signUpErr) { setError(signUpErr.message); setLoading(false); return; }
        if (data.user) onAuth(data.user as any);
      } else {
        const { data, error: signInErr } = await supabase.auth.signInWithPassword({ email, password });
        if (signInErr) { setError(signInErr.message); setLoading(false); return; }
        if (data.user) onAuth(data.user as any);
      }
    } catch (err: any) { setError(err.message || 'Something went wrong'); }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl p-8 max-w-md w-full">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Pro Fit Agent</h1>
          <p className="text-gray-600">Cloud-Powered Training System</p>
        </div>
        <div className="flex gap-2 mb-6">
          <button onClick={() => { setMode('signin'); setError(''); }} className={`flex-1 py-2 rounded font-semibold ${mode === 'signin' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700'}`}>Sign In</button>
          <button onClick={() => { setMode('signup'); setError(''); }} className={`flex-1 py-2 rounded font-semibold ${mode === 'signup' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700'}`}>Sign Up</button>
        </div>
        {error && <div className="bg-red-50 text-red-800 p-3 rounded mb-4 text-sm flex items-center gap-2"><AlertTriangle size={16} />{error}</div>}
        <div className="space-y-4">
          {mode === 'signup' && (
            <div><label className="block text-sm font-medium text-gray-700 mb-1">Full Name</label><input type="text" value={fullName} onChange={(e) => setFullName(e.target.value)} className="w-full p-3 border rounded-lg" placeholder="John Doe" /></div>
          )}
          <div><label className="block text-sm font-medium text-gray-700 mb-1">Email</label><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full p-3 border rounded-lg" placeholder="you@example.com" /></div>
          <div><label className="block text-sm font-medium text-gray-700 mb-1">Password</label><input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="w-full p-3 border rounded-lg" placeholder="••••••••" onKeyDown={(e) => e.key === 'Enter' && handleSubmit()} /></div>
          <button onClick={handleSubmit} disabled={loading} className="w-full bg-blue-600 text-white py-3 rounded-lg font-semibold hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2">
            {loading && <Loader className="animate-spin" size={18} />}
            {loading ? 'Please wait...' : mode === 'signup' ? 'Create Account' : 'Sign In'}
          </button>
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// ONBOARDING FLOW
// ============================================================================

const OnboardingFlow = ({ user, data, onComplete }: any) => {
  const [onboarding, setOnboarding] = useState<OnboardingData>(data);
  const [saving, setSaving] = useState(false);
  const updateStep = (stepData: Partial<OnboardingData>) => setOnboarding({ ...onboarding, ...stepData });

  const nextStep = async () => {
    setSaving(true);
    if (onboarding.step < 5) {
      const dbData = onboardingToDb({ ...onboarding, step: onboarding.step + 1 }, user.id);
      await safeQuery(() => supabase.from('onboarding_data').upsert(dbData, { onConflict: 'user_id' }), 'saveOnboardingStep');
      setOnboarding({ ...onboarding, step: onboarding.step + 1 });
    } else { await onComplete(onboarding); }
    setSaving(false);
  };

  const prevStep = () => { if (onboarding.step > 1) setOnboarding({ ...onboarding, step: onboarding.step - 1 }); };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl p-8 max-w-2xl w-full">
        <div className="mb-8">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-2xl font-bold text-gray-900">Get Started</h2>
            <span className="text-sm text-gray-600">Step {onboarding.step} of 5</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div className="bg-blue-600 h-2 rounded-full transition-all" style={{ width: `${(onboarding.step / 5) * 100}%` }} />
          </div>
        </div>
        {onboarding.step === 1 && <OnboardingStep1 data={onboarding} onUpdate={updateStep} />}
        {onboarding.step === 2 && <OnboardingStep2 data={onboarding} onUpdate={updateStep} />}
        {onboarding.step === 3 && <OnboardingStep3 data={onboarding} onUpdate={updateStep} />}
        {onboarding.step === 4 && <OnboardingStep4 data={onboarding} onUpdate={updateStep} />}
        {onboarding.step === 5 && <OnboardingStep5 data={onboarding} onUpdate={updateStep} />}
        <div className="flex gap-4 mt-8">
          {onboarding.step > 1 && <button onClick={prevStep} className="px-6 py-3 border-2 border-gray-300 rounded-lg font-semibold hover:bg-gray-50">Back</button>}
          <button onClick={nextStep} disabled={saving} className="flex-1 bg-blue-600 text-white py-3 rounded-lg font-semibold hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2">
            {saving && <Loader className="animate-spin" size={18} />}
            {onboarding.step === 5 ? 'Complete Setup' : 'Continue'}
          </button>
        </div>
      </div>
    </div>
  );
};

const OnboardingStep1 = ({ data, onUpdate }: any) => (
  <div className="space-y-6">
    <h3 className="text-xl font-bold mb-2">Tell us about yourself</h3>
    <div className="grid grid-cols-3 gap-4">
      <div><label className="block text-sm font-medium mb-1">Age</label><input type="number" value={data.age || ''} onChange={(e: any) => onUpdate({ age: +e.target.value })} className="w-full p-3 border rounded-lg" /></div>
      <div><label className="block text-sm font-medium mb-1">Weight (kg)</label><input type="number" step="0.1" value={data.weight || ''} onChange={(e: any) => onUpdate({ weight: +e.target.value })} className="w-full p-3 border rounded-lg" /></div>
      <div><label className="block text-sm font-medium mb-1">Height (cm)</label><input type="number" value={data.height || ''} onChange={(e: any) => onUpdate({ height: +e.target.value })} className="w-full p-3 border rounded-lg" /></div>
    </div>
    <div>
      <label className="block text-sm font-medium mb-2">Training Background</label>
      <div className="grid grid-cols-3 gap-3">
        {['beginner', 'intermediate', 'advanced'].map((level) => (
          <button key={level} onClick={() => onUpdate({ trainingBackground: level })} className={`p-4 rounded-lg border-2 font-semibold capitalize ${data.trainingBackground === level ? 'border-blue-600 bg-blue-50 text-blue-600' : 'border-gray-200'}`}>{level}</button>
        ))}
      </div>
    </div>
  </div>
);

const OnboardingStep2 = ({ data, onUpdate }: any) => (
  <div className="space-y-6">
    <h3 className="text-xl font-bold mb-2">What's your goal?</h3>
    <div className="space-y-3">
      {[{ value: 'finish_strong', label: 'First 70.3 – Finish Strong' }, { value: 'sub5', label: 'Sub 5:00' }, { value: 'sub4_30', label: 'Sub 4:30' }, { value: 'hybrid', label: 'Hybrid Strength + Endurance' }].map((goal) => (
        <button key={goal.value} onClick={() => onUpdate({ goalType: goal.value })} className={`w-full p-4 rounded-lg border-2 text-left ${data.goalType === goal.value ? 'border-blue-600 bg-blue-50' : 'border-gray-200'}`}><div className="font-semibold">{goal.label}</div></button>
      ))}
    </div>
  </div>
);

const OnboardingStep3 = ({ data, onUpdate }: any) => (
  <div className="space-y-6">
    <h3 className="text-xl font-bold mb-2">Race Setup</h3>
    <div><label className="block text-sm font-medium mb-1">Race Date</label><input type="date" value={data.raceDate || ''} onChange={(e: any) => onUpdate({ raceDate: e.target.value })} className="w-full p-3 border rounded-lg" /></div>
    <div>
      <label className="block text-sm font-medium mb-2">Priority</label>
      <div className="grid grid-cols-3 gap-3">
        {[{ value: 'performance', label: 'Performance' }, { value: 'balanced', label: 'Balanced' }, { value: 'physique', label: 'Physique' }].map((p) => (
          <button key={p.value} onClick={() => onUpdate({ priority: p.value })} className={`p-4 rounded-lg border-2 ${data.priority === p.value ? 'border-blue-600 bg-blue-50' : 'border-gray-200'}`}><div className="font-semibold text-sm">{p.label}</div></button>
        ))}
      </div>
    </div>
  </div>
);

const OnboardingStep4 = ({ data, onUpdate }: any) => (
  <div className="space-y-6">
    <h3 className="text-xl font-bold mb-2">Availability</h3>
    <div><label className="block text-sm font-medium mb-1">Hours per week</label><input type="number" value={data.hoursPerWeek || ''} onChange={(e: any) => onUpdate({ hoursPerWeek: +e.target.value })} className="w-full p-3 border rounded-lg" /></div>
    <div className="grid grid-cols-2 gap-4">
      <div><label className="block text-sm font-medium mb-1">Pool (days/week)</label><input type="number" value={data.poolDaysPerWeek || ''} onChange={(e: any) => onUpdate({ poolDaysPerWeek: +e.target.value })} className="w-full p-3 border rounded-lg" /></div>
      <div className="pt-6"><label className="flex items-center gap-2"><input type="checkbox" checked={data.gymAccess || false} onChange={(e: any) => onUpdate({ gymAccess: e.target.checked })} className="w-4 h-4" /><span className="text-sm">Gym access</span></label></div>
    </div>
  </div>
);

const OnboardingStep5 = ({ data, onUpdate }: any) => (
  <div className="space-y-6">
    <h3 className="text-xl font-bold mb-2">Baseline Fitness</h3>
    <div><label className="flex items-center gap-2"><input type="checkbox" checked={data.canSwim1900m || false} onChange={(e: any) => onUpdate({ canSwim1900m: e.target.checked })} className="w-4 h-4" /><span className="text-sm font-medium">I can swim 1.9km continuously</span></label></div>
    <div className="grid grid-cols-2 gap-4">
      <div><label className="block text-sm font-medium mb-1">5K time (min)</label><input type="number" value={data.fiveKTime ? data.fiveKTime / 60 : ''} onChange={(e: any) => onUpdate({ fiveKTime: +e.target.value * 60 })} className="w-full p-3 border rounded-lg" /></div>
      <div><label className="block text-sm font-medium mb-1">FTP (watts)</label><input type="number" value={data.ftp || ''} onChange={(e: any) => onUpdate({ ftp: +e.target.value })} className="w-full p-3 border rounded-lg" /></div>
    </div>
  </div>
);

// ============================================================================
// HEADER
// ============================================================================

const Header = ({ user, showMenu, setShowMenu, onLogout, onNavigate }: any) => {
  const initials = (user.user_metadata?.full_name || user.email || '?').split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2);
  return (
    <>
      <div className="bg-gradient-to-r from-blue-600 to-purple-600 text-white p-4 shadow-lg">
        <div className="flex items-center justify-between">
          <div><h1 className="text-2xl font-bold">Pro Fit Agent</h1><p className="text-sm opacity-90">Cloud Training System</p></div>
          <button onClick={() => setShowMenu(!showMenu)} className="w-10 h-10 rounded-full bg-white bg-opacity-20 flex items-center justify-center font-bold hover:bg-opacity-30 text-sm">{initials}</button>
        </div>
      </div>
      {showMenu && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50" onClick={() => setShowMenu(false)}>
          <div className="absolute right-4 top-16 bg-white rounded-lg shadow-xl w-64 py-2" onClick={(e: any) => e.stopPropagation()}>
            <div className="px-4 py-3 border-b"><div className="font-semibold">{user.user_metadata?.full_name || user.email}</div><div className="text-sm text-gray-600">{user.email}</div></div>
            <button onClick={() => { onNavigate('account'); setShowMenu(false); }} className="w-full px-4 py-3 text-left hover:bg-gray-50 flex items-center gap-3"><User size={18} /><span>Account</span></button>
            <div className="border-t my-2"></div>
            <button onClick={onLogout} className="w-full px-4 py-3 text-left hover:bg-gray-50 flex items-center gap-3 text-red-600"><LogOut size={18} /><span>Log Out</span></button>
          </div>
        </div>
      )}
    </>
  );
};

// ============================================================================
// HOME SCREEN
// ============================================================================

const HomeScreen = ({ user, onboarding, plan, projection, realism, plannedSessions, trainingSessions, bodyMetrics }: any) => {
  const weeksToRace = Math.max(0, Math.floor((new Date(onboarding.raceDate).getTime() - Date.now()) / (7 * 24 * 60 * 60 * 1000)));
  const today = new Date().toISOString().split('T')[0];
  const todaySessions = plannedSessions.filter((s: PlannedSession) => s.date === today);
  const weekStart = new Date(); weekStart.setDate(weekStart.getDate() - weekStart.getDay());
  const thisWeekTraining = trainingSessions.filter((t: TrainingSession) => new Date(t.date) >= weekStart);
  const actualSwim = thisWeekTraining.filter((t: TrainingSession) => t.sport === 'Swim').reduce((s: number, t: TrainingSession) => s + t.distance, 0);
  const actualBike = thisWeekTraining.filter((t: TrainingSession) => t.sport === 'Bike').reduce((s: number, t: TrainingSession) => s + t.distance, 0);
  const actualRun = thisWeekTraining.filter((t: TrainingSession) => t.sport === 'Run').reduce((s: number, t: TrainingSession) => s + t.distance, 0);
  const thisWeekPlanned = plannedSessions.filter((p: PlannedSession) => new Date(p.date) >= weekStart);
  const completed = thisWeekPlanned.filter((p: PlannedSession) => p.status === 'completed').length;
  const total = thisWeekPlanned.length;
  const compliance = total > 0 ? Math.round((completed / total) * 100) : 0;

  return (
    <div className="p-4 space-y-4">
      <div className="bg-gradient-to-r from-green-500 to-blue-500 text-white rounded-lg shadow p-6">
        <div className="flex items-center justify-between mb-3"><h2 className="font-bold text-xl">Race Goal Progress</h2><Target size={28} /></div>
        <div className="text-4xl font-bold mb-1">{weeksToRace} weeks</div>
        <div className="text-sm opacity-90 mb-3">Ironman 70.3 • {onboarding.raceDate}</div>
        {projection && <div className="bg-white bg-opacity-20 rounded px-3 py-2 text-sm mb-2">📊 Projected: {projection.time}</div>}
        <div className="flex gap-2">
          <div className="bg-white bg-opacity-20 rounded px-3 py-1 text-xs">{plan?.phase || 'Base'} Phase</div>
          <div className="bg-white bg-opacity-20 rounded px-3 py-1 text-xs">📈 {compliance}% Compliance</div>
        </div>
      </div>
      <div className="bg-white rounded-lg shadow p-4">
        <h3 className="font-bold text-lg mb-3">This Week</h3>
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-blue-50 p-3 rounded"><div className="text-xs text-gray-600">Swim</div><div className="text-xl font-bold text-blue-600">{actualSwim}m</div></div>
          <div className="bg-green-50 p-3 rounded"><div className="text-xs text-gray-600">Bike</div><div className="text-xl font-bold text-green-600">{actualBike.toFixed(1)}km</div></div>
          <div className="bg-orange-50 p-3 rounded"><div className="text-xs text-gray-600">Run</div><div className="text-xl font-bold text-orange-600">{actualRun.toFixed(1)}km</div></div>
          <div className="bg-purple-50 p-3 rounded"><div className="text-xs text-gray-600">Compliance</div><div className="text-xl font-bold text-purple-600">{compliance}%</div><div className="text-xs text-gray-500">{completed}/{total}</div></div>
        </div>
      </div>
      {todaySessions.length > 0 && (
        <div className="bg-white rounded-lg shadow p-4">
          <h3 className="font-bold text-lg mb-3">Today's Plan</h3>
          {todaySessions.map((s: PlannedSession) => (
            <div key={s.id} className="border-l-4 border-blue-500 pl-3 py-2 mb-2">
              <div className="flex justify-between items-start">
                <div><div className="font-semibold">{s.sport} - {s.type}</div><div className="text-sm text-gray-600">{s.description}</div><div className="text-xs text-gray-500">{s.duration}min • {s.intensity}</div></div>
                {s.status === 'completed' ? <Check className="text-green-600" size={20} /> : <div className="text-xs bg-gray-100 px-2 py-1 rounded">Planned</div>}
              </div>
            </div>
          ))}
        </div>
      )}
      {trainingSessions.length > 0 && (
        <div className="bg-white rounded-lg shadow p-4">
          <h3 className="font-bold text-lg mb-3">Recent Activity</h3>
          {trainingSessions.slice(0, 3).map((t: TrainingSession) => (
            <div key={t.id} className="border-l-4 border-green-500 pl-3 py-2 text-sm mb-2">
              <div className="flex justify-between"><span className="font-semibold">{t.sport} - {t.type}</span><span className="text-xs text-gray-500">{t.date}</span></div>
              <div className="text-gray-600">{t.distance}{t.sport === 'Swim' ? 'm' : 'km'} • {t.duration}min • RPE {t.rpe}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// ============================================================================
// CALENDAR SCREEN — Dark/Light theme, 4-week grid
// ============================================================================

const CalendarScreen = ({ plannedSessions }: any) => {
  const today = new Date().toISOString().split('T')[0];
  const [selectedDate, setSelectedDate] = useState(today);
  const [isDark, setIsDark] = useState(false);
  const t = isDark ? calThemes.dark : calThemes.light;

  const getWeekStart = (date: Date) => { const d = new Date(date); d.setDate(d.getDate() - d.getDay()); return d; };
  const currentWeekStart = getWeekStart(new Date());
  const calendarStart = new Date(currentWeekStart);
  calendarStart.setDate(calendarStart.getDate() - 1 * 7);

  const weeks: string[][] = [];
  for (let w = 0; w < 4; w++) {
    const weekStart = new Date(calendarStart);
    weekStart.setDate(calendarStart.getDate() + w * 7);
    const days: string[] = [];
    for (let d = 0; d < 7; d++) { const day = new Date(weekStart); day.setDate(weekStart.getDate() + d); days.push(day.toISOString().split('T')[0]); }
    weeks.push(days);
  }

  const getDayStatus = (dateStr: string) => {
    const sessions = plannedSessions.filter((s: PlannedSession) => s.date === dateStr);
    if (sessions.length === 0) return { type: 'rest', sessions: [], sports: [] as string[] };
    const allCompleted = sessions.every((s: PlannedSession) => s.status === 'completed');
    const allSkipped = sessions.every((s: PlannedSession) => s.status === 'skipped');
    const someCompleted = sessions.some((s: PlannedSession) => s.status === 'completed');
    const sports = [...new Set(sessions.map((s: PlannedSession) => s.sport))] as string[];
    if (allCompleted) return { type: 'completed', sports, sessions };
    if (allSkipped) return { type: 'skipped', sports, sessions };
    if (someCompleted) return { type: 'partial', sports, sessions };
    return { type: 'planned', sports, sessions };
  };

  const sportDotColor: Record<string, string> = { Swim: 'bg-cyan-400', Bike: 'bg-emerald-400', Run: 'bg-rose-400', Strength: 'bg-violet-400' };

  const selectedSessions = plannedSessions.filter((s: PlannedSession) => s.date === selectedDate);
  const selectedDayName = new Date(selectedDate + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

  const totalPlanned = plannedSessions.filter((s: PlannedSession) => new Date(s.date) <= new Date()).length;
  const totalCompleted = plannedSessions.filter((s: PlannedSession) => s.status === 'completed').length;
  const totalSkipped = plannedSessions.filter((s: PlannedSession) => s.status === 'skipped').length;
  const streakDays = (() => {
    let streak = 0; const d = new Date(); d.setDate(d.getDate() - 1);
    for (let i = 0; i < 60; i++) {
      const dateStr = d.toISOString().split('T')[0];
      const daySessions = plannedSessions.filter((s: PlannedSession) => s.date === dateStr);
      d.setDate(d.getDate() - 1);
      if (daySessions.length === 0) continue;
      if (daySessions.every((s: PlannedSession) => s.status === 'completed')) streak++; else break;
    }
    return streak;
  })();

  return (
    <div className={`${t.bg} min-h-screen transition-colors duration-300`}>
      <div className="px-4 pt-4 pb-2 flex justify-between items-center">
        <h2 className={`font-bold text-lg ${t.statText}`}>Training Calendar</h2>
        <button onClick={() => setIsDark(!isDark)} className={`flex items-center gap-2 px-3 py-1.5 rounded-full ${isDark ? 'bg-gray-800' : 'bg-gray-200'} transition-colors duration-300`}>
          <Sun size={14} className={`${isDark ? 'text-gray-500' : 'text-yellow-500'} transition-colors`} />
          <div className={`w-10 h-5 rounded-full relative ${isDark ? 'bg-blue-600' : 'bg-gray-300'} transition-colors duration-300`}>
            <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all duration-300 ${isDark ? 'left-5' : 'left-0.5'}`} />
          </div>
          <Moon size={14} className={`${isDark ? 'text-blue-400' : 'text-gray-400'} transition-colors`} />
        </button>
      </div>

      <div className="px-4 pb-2">
        <div className="grid grid-cols-4 gap-2">
          <div className={`${t.statCard} rounded-lg p-3 text-center transition-colors duration-300`}><div className="text-xl font-bold text-emerald-400">{totalCompleted}</div><div className={`text-xs ${t.legendText}`}>Done</div></div>
          <div className={`${t.statCard} rounded-lg p-3 text-center transition-colors duration-300`}><div className="text-xl font-bold text-rose-400">{totalSkipped}</div><div className={`text-xs ${t.legendText}`}>Skipped</div></div>
          <div className={`${t.statCard} rounded-lg p-3 text-center transition-colors duration-300`}><div className="text-xl font-bold text-cyan-400">{totalPlanned > 0 ? Math.round((totalCompleted / totalPlanned) * 100) : 0}%</div><div className={`text-xs ${t.legendText}`}>Rate</div></div>
          <div className={`${t.statCard} rounded-lg p-3 text-center transition-colors duration-300`}><div className="text-xl font-bold text-yellow-400">🔥 {streakDays}</div><div className={`text-xs ${t.legendText}`}>Streak</div></div>
        </div>
      </div>

      <div className={`px-4 py-2 flex gap-3 text-xs ${t.legendText} flex-wrap`}>
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-cyan-400"></span> Swim</span>
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-emerald-400"></span> Bike</span>
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-rose-400"></span> Run</span>
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-violet-400"></span> Strength</span>
      </div>

      <div className="px-3 py-2">
        <div className="grid grid-cols-8 gap-1 mb-2">
          <div></div>
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (<div key={d} className={`text-xs ${t.dayHeader} text-center py-1 font-semibold`}>{d}</div>))}
        </div>
        {weeks.map((week, weekIdx) => {
          const isCurrentWeek = week.includes(today);
          return (
            <div key={weekIdx} className={`grid grid-cols-8 gap-1 mb-1.5 ${isCurrentWeek ? `${t.currentWeekBg} rounded-lg` : ''} transition-colors duration-300`}>
              <div className="flex items-center justify-center"><span className={`text-xs font-bold ${isCurrentWeek ? t.weekLabelActive : t.weekLabel}`}>W{weekIdx + 1}</span></div>
              {week.map(dateStr => {
                const dayNum = new Date(dateStr + 'T12:00:00').getDate();
                const isToday = dateStr === today;
                const isSelected = dateStr === selectedDate;
                const isFuture = new Date(dateStr) > new Date();
                const { type, sports } = getDayStatus(dateStr);
                const cellClass = type === 'completed' ? t.cellCompleted : type === 'partial' ? t.cellPartial : type === 'skipped' ? t.cellSkipped : type === 'planned' && isFuture ? t.cellPlannedFuture : type === 'planned' ? t.cellPlanned : t.cellRest;
                const textClass = isToday ? (isDark ? 'text-white' : 'text-blue-600 font-black') : type === 'completed' ? t.dayCompleted : type === 'skipped' ? t.daySkipped : isFuture ? t.dayFuture : t.dayDefault;

                return (
                  <button key={dateStr} onClick={() => setSelectedDate(dateStr)}
                    className={`relative w-full aspect-square rounded-full flex flex-col items-center justify-center transition-all duration-200 ${cellClass} ${isSelected ? 'ring-2 ring-blue-400 scale-110 z-10' : ''} ${isToday && !isSelected ? (isDark ? 'ring-2 ring-white ring-opacity-40' : 'ring-2 ring-blue-500') : ''} hover:scale-105`}>
                    <span className={`text-xs font-bold ${textClass}`}>{dayNum}</span>
                    {sports && sports.length > 0 && (
                      <div className="flex gap-0.5 mt-0.5">
                        {sports.slice(0, 3).map((sport: string, i: number) => (
                          <div key={i} className={`w-1.5 h-1.5 rounded-full ${type === 'skipped' ? t.dotSkipped : type === 'completed' ? sportDotColor[sport] : t.dotPlanned}`} />
                        ))}
                      </div>
                    )}
                    {type === 'completed' && (
                      <div className="absolute -top-0.5 -right-0.5 bg-emerald-500 rounded-full w-3.5 h-3.5 flex items-center justify-center"><Check size={8} className="text-white" /></div>
                    )}
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>

      <div className="px-4 pb-4">
        <div className={`${t.detailBg} rounded-xl p-4 transition-colors duration-300`}>
          <h3 className={`font-bold text-sm ${t.detailTitle} mb-3`}>{selectedDayName}</h3>
          {selectedSessions.length === 0 ? (
            <div className={`text-center py-4 ${t.detailRestText}`}><p className="text-sm">Rest day — no sessions planned</p></div>
          ) : (
            <div className="space-y-2">
              {selectedSessions.map((session: PlannedSession) => (
                <div key={session.id} className={`flex items-center gap-3 p-3 rounded-lg ${t.sessionBg} ${session.status === 'skipped' ? 'opacity-40' : ''} transition-colors duration-300`}>
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center text-lg ${session.sport === 'Swim' ? t.swimIcon : session.sport === 'Bike' ? t.bikeIcon : session.sport === 'Run' ? t.runIcon : t.strengthIcon}`}>
                    {session.sport === 'Swim' ? '🏊' : session.sport === 'Bike' ? '🚴' : session.sport === 'Run' ? '🏃' : '💪'}
                  </div>
                  <div className="flex-1">
                    <div className={`font-semibold text-sm ${session.status === 'skipped' ? t.sessionSkippedText + ' line-through' : t.sessionText}`}>{session.sport} – {session.type}</div>
                    <div className={`text-xs ${t.sessionMeta}`}>{session.duration}min{session.distance > 0 ? ` • ${session.distance}${session.sport === 'Swim' ? 'm' : 'km'}` : ''} • {session.intensity}</div>
                  </div>
                  <div>
                    {session.status === 'completed' && <div className={`${t.badgeCompleted} text-xs px-2 py-1 rounded-full font-semibold`}>Done</div>}
                    {session.status === 'skipped' && <div className={`${t.badgeSkipped} text-xs px-2 py-1 rounded-full`}>Skipped</div>}
                    {session.status === 'planned' && <div className={`${t.badgePlanned} text-xs px-2 py-1 rounded-full`}>Planned</div>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// LOG SCREEN
// ============================================================================

const LogScreen = ({ onLogTraining, onLogBody, setActiveScreen }: any) => {
  const { showToast } = useToast();
  const [logType, setLogType] = useState<'training' | 'body'>('training');
  const [saving, setSaving] = useState(false);
  const [trainingForm, setTrainingForm] = useState({ date: new Date().toISOString().split('T')[0], sport: 'Run', type: 'Z2', duration: 0, distance: 0, rpe: 5, notes: '' });
  const [bodyForm, setBodyForm] = useState({ date: new Date().toISOString().split('T')[0], weight: null as number | null, sleep: null as number | null, fatigue: null as number | null, notes: '' });

  const handleSaveTraining = async () => {
    if (!trainingForm.duration && !trainingForm.distance) { showToast('Enter duration or distance', 'error'); return; }
    setSaving(true); await onLogTraining(trainingForm); showToast('Training logged!', 'success'); setSaving(false);
  };

  const handleSaveBody = async () => { setSaving(true); await onLogBody(bodyForm); showToast('Body metrics logged!', 'success'); setSaving(false); };

  return (
    <div className="p-4 space-y-4">
      <div className="flex gap-2">
        <button onClick={() => setLogType('training')} className={`flex-1 py-2 rounded font-semibold ${logType === 'training' ? 'bg-blue-600 text-white' : 'bg-gray-200'}`}>Training</button>
        <button onClick={() => setLogType('body')} className={`flex-1 py-2 rounded font-semibold ${logType === 'body' ? 'bg-orange-600 text-white' : 'bg-gray-200'}`}>Body Metrics</button>
      </div>
      {logType === 'training' && (
        <div className="bg-white rounded-lg shadow p-4 space-y-3">
          <h2 className="font-bold text-lg">Log Training</h2>
          <div><label className="block text-sm font-medium mb-1">Date</label><input type="date" value={trainingForm.date} onChange={(e) => setTrainingForm({ ...trainingForm, date: e.target.value })} className="w-full p-3 border rounded-lg" /></div>
          <div><label className="block text-sm font-medium mb-1">Sport</label><select value={trainingForm.sport} onChange={(e) => setTrainingForm({ ...trainingForm, sport: e.target.value })} className="w-full p-3 border rounded-lg"><option>Swim</option><option>Bike</option><option>Run</option></select></div>
          <div><label className="block text-sm font-medium mb-1">Type</label><select value={trainingForm.type} onChange={(e) => setTrainingForm({ ...trainingForm, type: e.target.value })} className="w-full p-3 border rounded-lg"><option>Z2</option><option>Tempo</option><option>Threshold</option><option>VO2</option><option>Long</option><option>Recovery</option></select></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="block text-sm font-medium mb-1">Duration (min)</label><input type="number" value={trainingForm.duration || ''} onChange={(e) => setTrainingForm({ ...trainingForm, duration: +e.target.value })} className="w-full p-3 border rounded-lg" /></div>
            <div><label className="block text-sm font-medium mb-1">Distance {trainingForm.sport === 'Swim' ? '(m)' : '(km)'}</label><input type="number" step="0.1" value={trainingForm.distance || ''} onChange={(e) => setTrainingForm({ ...trainingForm, distance: +e.target.value })} className="w-full p-3 border rounded-lg" /></div>
          </div>
          <div><label className="block text-sm font-medium mb-1">RPE (1-10)</label><input type="number" min="1" max="10" value={trainingForm.rpe} onChange={(e) => setTrainingForm({ ...trainingForm, rpe: +e.target.value })} className="w-full p-3 border rounded-lg" /></div>
          <div><label className="block text-sm font-medium mb-1">Notes</label><textarea value={trainingForm.notes} onChange={(e) => setTrainingForm({ ...trainingForm, notes: e.target.value })} className="w-full p-3 border rounded-lg" rows={2} /></div>
          <button onClick={handleSaveTraining} disabled={saving} className="w-full bg-blue-600 text-white py-3 rounded-lg font-semibold disabled:opacity-50 flex items-center justify-center gap-2">{saving ? <Loader className="animate-spin" size={18} /> : <Check size={18} />} Log Training</button>
        </div>
      )}
      {logType === 'body' && (
        <div className="bg-white rounded-lg shadow p-4 space-y-3">
          <h2 className="font-bold text-lg">Log Body Metrics</h2>
          <div><label className="block text-sm font-medium mb-1">Date</label><input type="date" value={bodyForm.date} onChange={(e) => setBodyForm({ ...bodyForm, date: e.target.value })} className="w-full p-3 border rounded-lg" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="block text-sm font-medium mb-1">Weight (kg)</label><input type="number" step="0.1" value={bodyForm.weight || ''} onChange={(e) => setBodyForm({ ...bodyForm, weight: e.target.value ? +e.target.value : null })} className="w-full p-3 border rounded-lg" /></div>
            <div><label className="block text-sm font-medium mb-1">Sleep (hrs)</label><input type="number" step="0.5" value={bodyForm.sleep || ''} onChange={(e) => setBodyForm({ ...bodyForm, sleep: e.target.value ? +e.target.value : null })} className="w-full p-3 border rounded-lg" /></div>
          </div>
          <div><label className="block text-sm font-medium mb-1">Fatigue (1-10)</label><input type="number" min="1" max="10" value={bodyForm.fatigue || ''} onChange={(e) => setBodyForm({ ...bodyForm, fatigue: e.target.value ? +e.target.value : null })} className="w-full p-3 border rounded-lg" /></div>
          <div><label className="block text-sm font-medium mb-1">Notes</label><textarea value={bodyForm.notes} onChange={(e) => setBodyForm({ ...bodyForm, notes: e.target.value })} className="w-full p-3 border rounded-lg" rows={2} /></div>
          <button onClick={handleSaveBody} disabled={saving} className="w-full bg-orange-600 text-white py-3 rounded-lg font-semibold disabled:opacity-50 flex items-center justify-center gap-2">{saving ? <Loader className="animate-spin" size={18} /> : <Check size={18} />} Log Metrics</button>
        </div>
      )}
    </div>
  );
};

// ============================================================================
// PLAN SCREEN
// ============================================================================

const PlanScreen = ({ plan, plannedSessions, setPlannedSessions, onboarding }: any) => {
  const [weekOffset, setWeekOffset] = useState(0);
  const getWeekDates = (offset: number) => {
    const now = new Date(); const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay() + (offset * 7));
    const dates: string[] = [];
    for (let i = 0; i < 7; i++) { const d = new Date(startOfWeek); d.setDate(startOfWeek.getDate() + i); dates.push(d.toISOString().split('T')[0]); }
    return dates;
  };

  const weekDates = getWeekDates(weekOffset);
  const weekStart = new Date(weekDates[0]);
  const weekEnd = new Date(weekDates[6]);
  const weekSessions = plannedSessions.filter((s: PlannedSession) => weekDates.includes(s.date));
  const completed = weekSessions.filter((s: PlannedSession) => s.status === 'completed').length;
  const skipped = weekSessions.filter((s: PlannedSession) => s.status === 'skipped').length;
  const planned = weekSessions.filter((s: PlannedSession) => s.status === 'planned').length;
  const total = weekSessions.length;
  const totalHours = (weekSessions.reduce((sum: number, s: PlannedSession) => sum + s.duration, 0) / 60).toFixed(1);

  const sportColor: Record<string, string> = { Swim: 'border-blue-500 bg-blue-50', Bike: 'border-green-500 bg-green-50', Run: 'border-orange-500 bg-orange-50', Strength: 'border-purple-500 bg-purple-50' };
  const sportEmoji: Record<string, string> = { Swim: '🏊', Bike: '🚴', Run: '🏃', Strength: '💪' };
  const intensityColor: Record<string, string> = { Easy: 'bg-green-100 text-green-700', Moderate: 'bg-yellow-100 text-yellow-700', Hard: 'bg-red-100 text-red-700' };

  const handleSkipSession = async (session: PlannedSession) => {
    const newStatus = session.status === 'skipped' ? 'planned' : 'skipped';
    await safeQuery(() => supabase.from('planned_sessions').update({ status: newStatus }).eq('id', session.id), 'skipSession');
    setPlannedSessions(plannedSessions.map((p: PlannedSession) => p.id === session.id ? { ...p, status: newStatus } : p));
  };

  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const today = new Date().toISOString().split('T')[0];

  return (
    <div className="p-4 space-y-4">
      <div className="bg-gradient-to-r from-indigo-500 to-purple-500 text-white rounded-lg shadow p-5">
        <div className="flex items-center justify-between mb-2"><h2 className="font-bold text-xl">Training Plan</h2><Target size={28} /></div>
        <div className="text-sm opacity-90 mb-3">{plan?.phase || 'Base'} Phase • Race: {onboarding.raceDate}</div>
        <div className="grid grid-cols-4 gap-2 text-center">
          <div className="bg-white bg-opacity-20 rounded p-2"><div className="text-lg font-bold">{plan?.weekly_swim_sessions || 3}</div><div className="text-xs opacity-80">Swims/wk</div></div>
          <div className="bg-white bg-opacity-20 rounded p-2"><div className="text-lg font-bold">{plan?.weekly_bike_km || 60}</div><div className="text-xs opacity-80">Bike km/wk</div></div>
          <div className="bg-white bg-opacity-20 rounded p-2"><div className="text-lg font-bold">{plan?.weekly_run_km || 25}</div><div className="text-xs opacity-80">Run km/wk</div></div>
          <div className="bg-white bg-opacity-20 rounded p-2"><div className="text-lg font-bold">{plan?.weekly_strength_sessions || 2}</div><div className="text-xs opacity-80">Str/wk</div></div>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow p-4">
        <div className="flex items-center justify-between mb-3">
          <button onClick={() => setWeekOffset(weekOffset - 1)} className="p-2 hover:bg-gray-100 rounded"><ChevronLeft size={20} /></button>
          <div className="text-center">
            <h3 className="font-bold">{weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – {weekEnd.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</h3>
            <div className="text-xs text-gray-500">{weekOffset === 0 ? 'This Week' : weekOffset === 1 ? 'Next Week' : weekOffset === -1 ? 'Last Week' : ''}</div>
          </div>
          <button onClick={() => setWeekOffset(weekOffset + 1)} className="p-2 hover:bg-gray-100 rounded"><ChevronRight size={20} /></button>
        </div>
        <div className="flex gap-3 mb-4 text-xs">
          <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-green-500"></div>{completed} done</div>
          <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-blue-500"></div>{planned} planned</div>
          <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-gray-400"></div>{skipped} skipped</div>
          <div className="ml-auto font-semibold">{totalHours}h</div>
        </div>
        {total > 0 && <div className="w-full bg-gray-200 rounded-full h-2 mb-4"><div className="bg-green-500 h-2 rounded-full transition-all" style={{ width: `${(completed / total) * 100}%` }} /></div>}

        {weekDates.map((date, dayIdx) => {
          const daySessions = weekSessions.filter((s: PlannedSession) => s.date === date);
          const isToday = date === today;
          return (
            <div key={date} className={`mb-3 ${isToday ? 'ring-2 ring-blue-400 rounded-lg' : ''}`}>
              <div className={`flex items-center gap-2 px-2 py-1 rounded-t ${isToday ? 'bg-blue-50' : 'bg-gray-50'}`}>
                <span className={`text-xs font-bold ${isToday ? 'text-blue-600' : 'text-gray-600'}`}>{dayNames[dayIdx]} {new Date(date + 'T12:00:00').getDate()}</span>
                {isToday && <span className="text-xs bg-blue-600 text-white px-2 py-0.5 rounded-full">Today</span>}
                {daySessions.length === 0 && <span className="text-xs text-gray-400 ml-auto">Rest day</span>}
              </div>
              {daySessions.map((session: PlannedSession) => (
                <div key={session.id} className={`border-l-4 ${sportColor[session.sport] || 'border-gray-300 bg-gray-50'} p-3 mb-1 rounded-r ${session.status === 'skipped' ? 'opacity-50' : ''}`}>
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span>{sportEmoji[session.sport] || '🏋️'}</span>
                        <span className={`font-semibold ${session.status === 'skipped' ? 'line-through' : ''}`}>{session.sport} – {session.type}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full ${intensityColor[session.intensity] || 'bg-gray-100'}`}>{session.intensity}</span>
                      </div>
                      <div className="text-sm text-gray-600 mt-1">{session.description}</div>
                      <div className="text-xs text-gray-500 mt-1">{session.duration}min • {session.distance}{session.sport === 'Swim' ? 'm' : 'km'}</div>
                    </div>
                    <div className="ml-2">
                      {session.status === 'completed' ? (
                        <div className="flex items-center gap-1 text-green-600"><Check size={16} /><span className="text-xs font-semibold">Done</span></div>
                      ) : session.status === 'skipped' ? (
                        <button onClick={() => handleSkipSession(session)} className="text-xs bg-gray-200 text-gray-600 px-2 py-1 rounded hover:bg-gray-300">Undo</button>
                      ) : (
                        <button onClick={() => handleSkipSession(session)} className="text-xs bg-gray-100 text-gray-500 px-2 py-1 rounded hover:bg-red-50 hover:text-red-500">Skip</button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
};

// ============================================================================
// COACH PLACEHOLDER
// ============================================================================

// ============================================================================
// COACH SCREEN — AI Chat + Weekly Summary
// ============================================================================

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

const CoachScreen = ({ onboarding, plan, plannedSessions, trainingSessions, bodyMetrics }: any) => {
  const [activeTab, setActiveTab] = useState<'chat' | 'summary'>('summary');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState<string | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const chatEndRef = React.useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => { scrollToBottom(); }, [messages]);

  const buildAthleteContext = () => {
    const today = new Date();
    const weekStart = new Date(today);
    weekStart.setDate(today.getDate() - today.getDay());

    const thisWeekPlanned = plannedSessions.filter((p: PlannedSession) => new Date(p.date) >= weekStart);
    const completed = thisWeekPlanned.filter((p: PlannedSession) => p.status === 'completed').length;
    const skipped = thisWeekPlanned.filter((p: PlannedSession) => p.status === 'skipped').length;
    const total = thisWeekPlanned.length;

    const thisWeekTraining = trainingSessions.filter((t: TrainingSession) => new Date(t.date) >= weekStart);
    const swimDistance = thisWeekTraining.filter((t: TrainingSession) => t.sport === 'Swim').reduce((s: number, t: TrainingSession) => s + t.distance, 0);
    const bikeDistance = thisWeekTraining.filter((t: TrainingSession) => t.sport === 'Bike').reduce((s: number, t: TrainingSession) => s + t.distance, 0);
    const runDistance = thisWeekTraining.filter((t: TrainingSession) => t.sport === 'Run').reduce((s: number, t: TrainingSession) => s + t.distance, 0);
    const totalMinutes = thisWeekTraining.reduce((s: number, t: TrainingSession) => s + t.duration, 0);

    return {
      onboarding,
      plan,
      weekStats: {
        completed, skipped, total,
        compliancePercent: total > 0 ? Math.round((completed / total) * 100) : 0,
        swimDistance, bikeDistance, runDistance, totalMinutes,
      },
      recentBody: bodyMetrics.slice(0, 5),
      recentSessions: trainingSessions.slice(0, 7),
    };
  };

  const callCoachAPI = async (mode: 'chat' | 'summary', userMessage?: string) => {
    const context = buildAthleteContext();
    try {
      const response = await fetch('/api/coach', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode, userMessage, athleteContext: context }),
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Failed to get coach response');
      }

      const data = await response.json();
      return data.message;
    } catch (err: any) {
      console.error('Coach API error:', err);
      throw err;
    }
  };

  const handleSendMessage = async () => {
    if (!input.trim() || loading) return;
    const userMsg: ChatMessage = { role: 'user', content: input.trim(), timestamp: new Date().toISOString() };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    try {
      const reply = await callCoachAPI('chat', userMsg.content);
      const assistantMsg: ChatMessage = { role: 'assistant', content: reply, timestamp: new Date().toISOString() };
      setMessages(prev => [...prev, assistantMsg]);
    } catch (err: any) {
      const errorMsg: ChatMessage = { role: 'assistant', content: `Sorry, I couldn\u2019t connect right now. ${err.message || 'Please try again.'}`, timestamp: new Date().toISOString() };
      setMessages(prev => [...prev, errorMsg]);
    }
    setLoading(false);
  };

  const handleGenerateSummary = async () => {
    setSummaryLoading(true);
    setSummary(null);
    try {
      const result = await callCoachAPI('summary');
      setSummary(result);
    } catch (err: any) {
      setSummary(`Could not generate summary: ${err.message || 'Please try again.'}`);
    }
    setSummaryLoading(false);
  };

  const quickQuestions = [
    "How is my training going?",
    "Am I on track for my race goal?",
    "What should I focus on this week?",
    "Should I take a rest day?",
    "How can I improve my swim?",
  ];

  return (
    <div className="flex flex-col" style={{ height: 'calc(100vh - 140px)' }}>
      {/* Tab Switcher */}
      <div className="px-4 pt-4 pb-2">
        <div className="flex gap-2">
          <button onClick={() => setActiveTab('summary')}
            className={`flex-1 py-2 rounded-lg font-semibold text-sm flex items-center justify-center gap-2 ${activeTab === 'summary' ? 'bg-purple-600 text-white' : 'bg-gray-200 text-gray-700'}`}>
            <TrendingUp size={16} /> Weekly Summary
          </button>
          <button onClick={() => setActiveTab('chat')}
            className={`flex-1 py-2 rounded-lg font-semibold text-sm flex items-center justify-center gap-2 ${activeTab === 'chat' ? 'bg-purple-600 text-white' : 'bg-gray-200 text-gray-700'}`}>
            <Brain size={16} /> Chat with Coach
          </button>
        </div>
      </div>

      {/* Summary Tab */}
      {activeTab === 'summary' && (
        <div className="flex-1 overflow-y-auto px-4 pb-4">
          <div className="bg-white rounded-lg shadow p-4 mb-3">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-bold text-lg flex items-center gap-2"><Brain size={20} className="text-purple-500" /> AI Coach Summary</h3>
              <button onClick={handleGenerateSummary} disabled={summaryLoading}
                className="flex items-center gap-1 px-3 py-1.5 bg-purple-600 text-white rounded-lg text-sm font-semibold hover:bg-purple-700 disabled:opacity-50">
                {summaryLoading ? <Loader className="animate-spin" size={14} /> : <RefreshCw size={14} />}
                {summaryLoading ? 'Generating...' : summary ? 'Refresh' : 'Generate'}
              </button>
            </div>

            {!summary && !summaryLoading && (
              <div className="text-center py-8 text-gray-400">
                <Brain className="mx-auto mb-3 text-purple-300" size={40} />
                <p className="text-sm mb-1">Click "Generate" to get your personalised weekly summary</p>
                <p className="text-xs text-gray-400">The AI coach will analyse your training data and give recommendations</p>
              </div>
            )}

            {summaryLoading && (
              <div className="text-center py-8">
                <Loader className="animate-spin mx-auto mb-3 text-purple-400" size={32} />
                <p className="text-sm text-gray-500">Analysing your training data...</p>
              </div>
            )}

            {summary && !summaryLoading && (
              <div className="prose prose-sm max-w-none">
                {summary.split('\n').map((line: string, i: number) => {
                  if (line.startsWith('**') && line.endsWith('**')) {
                    return <h4 key={i} className="font-bold text-gray-900 mt-3 mb-1">{line.replace(/\*\*/g, '')}</h4>;
                  }
                  if (line.startsWith('- ')) {
                    return <p key={i} className="text-sm text-gray-700 ml-3 mb-1">\u2022 {line.slice(2)}</p>;
                  }
                  if (line.trim() === '') return <div key={i} className="h-2" />;
                  // Handle inline bold
                  const parts = line.split(/(\*\*.*?\*\*)/g);
                  return (
                    <p key={i} className="text-sm text-gray-700 mb-1">
                      {parts.map((part: string, j: number) =>
                        part.startsWith('**') && part.endsWith('**')
                          ? <strong key={j}>{part.replace(/\*\*/g, '')}</strong>
                          : part
                      )}
                    </p>
                  );
                })}
              </div>
            )}
          </div>

          {/* Quick Stats Card */}
          <div className="bg-purple-50 rounded-lg p-4">
            <h4 className="font-semibold text-sm text-purple-800 mb-2">Your Data Snapshot</h4>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="bg-white rounded p-2"><span className="text-gray-500">Sessions logged:</span> <span className="font-bold">{trainingSessions.length}</span></div>
              <div className="bg-white rounded p-2"><span className="text-gray-500">Planned:</span> <span className="font-bold">{plannedSessions.length}</span></div>
              <div className="bg-white rounded p-2"><span className="text-gray-500">Body entries:</span> <span className="font-bold">{bodyMetrics.length}</span></div>
              <div className="bg-white rounded p-2"><span className="text-gray-500">Phase:</span> <span className="font-bold">{plan?.phase || 'N/A'}</span></div>
            </div>
          </div>
        </div>
      )}

      {/* Chat Tab */}
      {activeTab === 'chat' && (
        <>
          <div className="flex-1 overflow-y-auto px-4 pb-2">
            {messages.length === 0 && (
              <div className="text-center py-6">
                <Brain className="mx-auto mb-3 text-purple-300" size={40} />
                <p className="text-sm text-gray-500 mb-4">Ask your AI coach anything about your training</p>
                <div className="space-y-2">
                  {quickQuestions.map((q, i) => (
                    <button key={i} onClick={() => { setInput(q); }}
                      className="w-full text-left px-3 py-2 bg-purple-50 rounded-lg text-sm text-purple-700 hover:bg-purple-100 transition-colors">
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((msg, i) => (
              <div key={i} className={`mb-3 flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] rounded-lg px-3 py-2 ${
                  msg.role === 'user'
                    ? 'bg-purple-600 text-white'
                    : 'bg-white shadow text-gray-800'
                }`}>
                  {msg.role === 'assistant' ? (
                    <div className="text-sm">
                      {msg.content.split('\n').map((line: string, j: number) => {
                        if (line.trim() === '') return <div key={j} className="h-1" />;
                        const parts = line.split(/(\*\*.*?\*\*)/g);
                        return (
                          <p key={j} className="mb-1">
                            {parts.map((part: string, k: number) =>
                              part.startsWith('**') && part.endsWith('**')
                                ? <strong key={k}>{part.replace(/\*\*/g, '')}</strong>
                                : part
                            )}
                          </p>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-sm">{msg.content}</p>
                  )}
                  <div className={`text-xs mt-1 ${msg.role === 'user' ? 'text-purple-200' : 'text-gray-400'}`}>
                    {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
              </div>
            ))}

            {loading && (
              <div className="flex justify-start mb-3">
                <div className="bg-white shadow rounded-lg px-4 py-3 flex items-center gap-2">
                  <Loader className="animate-spin text-purple-400" size={16} />
                  <span className="text-sm text-gray-500">Coach is thinking...</span>
                </div>
              </div>
            )}

            <div ref={chatEndRef} />
          </div>

          {/* Chat Input */}
          <div className="px-4 pb-3 pt-2 border-t bg-white">
            <div className="flex gap-2">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                placeholder="Ask your coach..."
                className="flex-1 p-3 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-400"
                disabled={loading}
              />
              <button onClick={handleSendMessage} disabled={loading || !input.trim()}
                className="bg-purple-600 text-white px-4 rounded-lg hover:bg-purple-700 disabled:opacity-50 flex items-center">
                <Send size={18} />
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

// ============================================================================
// BOTTOM NAV
// ============================================================================

const BottomNav = ({ activeTab, setActiveTab }: { activeTab: string; setActiveTab: (t: string) => void }) => (
  <div className="fixed bottom-0 left-0 right-0 bg-white border-t shadow-lg">
    <div className="grid grid-cols-5 gap-1 p-2">
      {[
        { id: 'home', icon: TrendingUp, label: 'Home' },
        { id: 'calendar', icon: Calendar, label: 'Calendar' },
        { id: 'log', icon: Plus, label: 'Log' },
        { id: 'plan', icon: Target, label: 'Plan' },
        { id: 'coach', icon: Brain, label: 'Coach' },
      ].map(({ id, icon: Icon, label }) => (
        <button key={id} onClick={() => setActiveTab(id)}
          className={`flex flex-col items-center p-2 rounded ${activeTab === id ? 'bg-blue-100 text-blue-600' : 'text-gray-600'}`}>
          <Icon size={id === 'log' ? 24 : 20} />
          <span className="text-xs mt-1">{label}</span>
        </button>
      ))}
    </div>
  </div>
);

export default ProFitAgentV5;
