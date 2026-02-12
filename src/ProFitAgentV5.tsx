import React, { useState, useEffect, useCallback } from 'react';
import {
  Calendar,
  TrendingUp,
  Brain,
  Target,
  Plus,
  ChevronLeft,
  ChevronRight,
  X,
  User,
  Settings,
  LogOut,
  Loader,
  Check,
  AlertTriangle,
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

/** Convert onboarding data from app (camelCase) to database (snake_case) */
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

/** Convert onboarding data from database (snake_case) to app (camelCase) */
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
// ERROR HANDLING UTILITIES
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
  const [toast, setToast] = useState<{ message: string; type: string } | null>(
    null
  );

  const showToast = useCallback((message: string, type: string = 'info') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      {toast && (
        <div
          className={`fixed top-4 left-4 right-4 z-[100] p-4 rounded-lg shadow-lg text-white text-sm font-medium animate-slide-down ${
            toast.type === 'error'
              ? 'bg-red-600'
              : toast.type === 'success'
              ? 'bg-green-600'
              : 'bg-blue-600'
          }`}
        >
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
// PLANNING ENGINE
// ============================================================================

const PlanningEngine = {
  generateInitialPlan: (userId: string, onboarding: OnboardingData) => {
    const weeksToRace = Math.floor(
      (new Date(onboarding.raceDate!).getTime() - Date.now()) /
        (7 * 24 * 60 * 60 * 1000)
    );
    const phase =
      weeksToRace > 20
        ? 'Base'
        : weeksToRace > 12
        ? 'Build'
        : weeksToRace > 3
        ? 'Peak'
        : 'Taper';

    let swimSessions = 3,
      bikeKm = 60,
      runKm = 25,
      strengthSessions = 2;

    if (onboarding.goalType === 'sub4_30') {
      swimSessions = 4;
      bikeKm = 80;
      runKm = 35;
    } else if (onboarding.goalType === 'sub5') {
      swimSessions = 3;
      bikeKm = 70;
      runKm = 30;
    } else if (onboarding.goalType === 'hybrid') {
      swimSessions = 3;
      bikeKm = 50;
      runKm = 20;
      strengthSessions = 3;
    }

    if (onboarding.trainingBackground === 'beginner') {
      swimSessions = Math.max(2, swimSessions - 1);
      bikeKm *= 0.7;
      runKm *= 0.7;
    }

    return {
      user_id: userId,
      start_date: new Date().toISOString().split('T')[0],
      end_date: onboarding.raceDate,
      phase,
      weekly_swim_sessions: swimSessions,
      weekly_bike_km: Math.round(bikeKm),
      weekly_run_km: Math.round(runKm),
      weekly_strength_sessions: strengthSessions,
      auto_generated: true,
    };
  },

  generate30DaySessions: (userId: string) => {
    const sessions: any[] = [];
    const startDate = new Date();
    const weekTemplate: Record<number, any[]> = {
      0: [],
      1: [
        {
          sport: 'Swim',
          type: 'Skills',
          duration: 45,
          distance: 1500,
          intensity: 'Easy',
          description: 'Technique drills + easy swimming',
        },
      ],
      2: [
        {
          sport: 'Run',
          type: 'Z2',
          duration: 40,
          distance: 6,
          intensity: 'Easy',
          description: 'Easy aerobic run',
        },
      ],
      3: [
        {
          sport: 'Bike',
          type: 'Z2',
          duration: 60,
          distance: 20,
          intensity: 'Easy',
          description: 'Steady endurance ride',
        },
      ],
      4: [
        {
          sport: 'Swim',
          type: 'Threshold',
          duration: 50,
          distance: 2000,
          intensity: 'Moderate',
          description: '6x200m @ threshold',
        },
      ],
      5: [
        {
          sport: 'Run',
          type: 'Tempo',
          duration: 45,
          distance: 7,
          intensity: 'Moderate',
          description: 'Tempo run',
        },
      ],
      6: [
        {
          sport: 'Bike',
          type: 'Long',
          duration: 120,
          distance: 40,
          intensity: 'Easy',
          description: 'Long Z2 ride',
        },
      ],
    };

    for (let day = 0; day < 30; day++) {
      const date = new Date(startDate);
      date.setDate(startDate.getDate() + day);
      const dayOfWeek = date.getDay();
      const daySessions = weekTemplate[dayOfWeek] || [];
      daySessions.forEach((s) => {
        sessions.push({
          user_id: userId,
          date: date.toISOString().split('T')[0],
          ...s,
          status: 'planned',
          completed_session_id: null,
          created_by: 'system',
        });
      });
    }
    return sessions;
  },

  projectFinishTime: (onboarding: OnboardingData) => {
    const swimMins = onboarding.canSwim1900m ? 35 : 45;
    const bikeMins = onboarding.ftp ? 150 + (250 - onboarding.ftp) * 0.5 : 180;
    const runMins = onboarding.fiveKTime
      ? (onboarding.fiveKTime / 60) * 4.2
      : 120;
    const totalMins = swimMins + bikeMins + runMins + 10;
    const hours = Math.floor(totalMins / 60);
    const mins = Math.round(totalMins % 60);
    return {
      time: `${hours}:${mins.toString().padStart(2, '0')}`,
      swim: `${Math.floor(swimMins)}min`,
      bike: `${Math.floor(bikeMins)}min`,
      run: `${Math.floor(runMins)}min`,
    };
  },

  checkGoalRealism: (onboarding: OnboardingData) => {
    const warnings: string[] = [];
    if (onboarding.goalType === 'sub4_30') {
      if (!onboarding.canSwim1900m)
        warnings.push('Sub-4:30 requires 1.9km swim endurance.');
      if (onboarding.fiveKTime && onboarding.fiveKTime > 1500)
        warnings.push('Sub-4:30 requires faster 5K pace.');
    }
    return {
      realistic: warnings.length === 0,
      warnings,
      recommendation:
        warnings.length > 2
          ? 'conservative'
          : warnings.length > 0
          ? 'stretch'
          : 'achievable',
    };
  },
};

// ============================================================================
// MAIN APP
// ============================================================================

const ProFitAgentV5 = () => {
  const [user, setUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [onboardingData, setOnboardingData] = useState<OnboardingData>({
    step: 1,
    completed: false,
  });
  const [plannedSessions, setPlannedSessions] = useState<PlannedSession[]>([]);
  const [trainingSessions, setTrainingSessions] = useState<TrainingSession[]>(
    []
  );
  const [bodyMetrics, setBodyMetrics] = useState<BodyMetrics[]>([]);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [activeScreen, setActiveScreen] = useState('home');
  const [projection, setProjection] = useState<any>(null);
  const [plan, setPlan] = useState<any>(null);
  const [realism, setRealism] = useState<any>(null);

  useEffect(() => {
    checkUser();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_IN' && session?.user) {
        setUser(session.user as any);
        await loadUserData(session.user.id);
      } else if (event === 'SIGNED_OUT') {
        setUser(null);
        setOnboardingData({ step: 1, completed: false });
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const checkUser = async () => {
    const {
      data: { user: authUser },
    } = await supabase.auth.getUser();
    if (authUser) {
      setUser(authUser as any);
      await loadUserData(authUser.id);
    }
    setLoading(false);
  };

  const loadUserData = async (userId: string) => {
    const { data: onboardingRow } = await safeQuery(
      () =>
        supabase
          .from('onboarding_data')
          .select('*')
          .eq('user_id', userId)
          .maybeSingle(),
      'loadOnboarding'
    );

    if (onboardingRow) {
      // Convert snake_case DB row to camelCase app data
      const onboarding = onboardingFromDb(onboardingRow);
      setOnboardingData(onboarding);

      if (onboarding.completed) {
        const [planRes, sessionsRes, trainingRes, bodyRes] = await Promise.all([
          safeQuery(
            () =>
              supabase
                .from('training_plans')
                .select('*')
                .eq('user_id', userId)
                .maybeSingle(),
            'loadPlan'
          ),
          safeQuery(
            () =>
              supabase
                .from('planned_sessions')
                .select('*')
                .eq('user_id', userId)
                .order('date', { ascending: true }),
            'loadPlanned'
          ),
          safeQuery(
            () =>
              supabase
                .from('training_sessions')
                .select('*')
                .eq('user_id', userId)
                .order('date', { ascending: false }),
            'loadTraining'
          ),
          safeQuery(
            () =>
              supabase
                .from('body_metrics')
                .select('*')
                .eq('user_id', userId)
                .order('date', { ascending: false }),
            'loadBody'
          ),
        ]);

        if (planRes.data) setPlan(planRes.data);
        if (sessionsRes.data) setPlannedSessions(sessionsRes.data);
        if (trainingRes.data) setTrainingSessions(trainingRes.data);
        if (bodyRes.data) setBodyMetrics(bodyRes.data);
      }
    }
  };

  const handleAuth = async (authUser: AppUser) => {
    setUser(authUser);
    await safeQuery(
      () => supabase.from('user_profiles').insert({ user_id: authUser.id }),
      'initProfile'
    );
    await safeQuery(
      () => supabase.from('user_preferences').insert({ user_id: authUser.id }),
      'initPrefs'
    );
    await safeQuery(
      () =>
        supabase
          .from('billing_info')
          .insert({ user_id: authUser.id, plan: 'free', status: 'active' }),
      'initBilling'
    );
  };

  const handleOnboardingComplete = async (data: OnboardingData) => {
    if (!user) return;
    setLoading(true);

    // Convert camelCase to snake_case for database
    const dbData = onboardingToDb({ ...data, completed: true }, user.id);

    const { error: saveErr } = await safeQuery(
      () =>
        supabase
          .from('onboarding_data')
          .upsert(dbData, { onConflict: 'user_id' }),
      'saveOnboarding'
    );
    if (saveErr) {
      console.error('Onboarding save failed:', saveErr);
      setLoading(false);
      return;
    }

    const generatedPlan = PlanningEngine.generateInitialPlan(user.id, data);
    await safeQuery(
      () => supabase.from('training_plans').insert(generatedPlan),
      'savePlan'
    );
    setPlan(generatedPlan);

    const sessions = PlanningEngine.generate30DaySessions(user.id);
    await safeQuery(
      () => supabase.from('planned_sessions').insert(sessions),
      'saveSessions'
    );
    setPlannedSessions(sessions);

    setProjection(PlanningEngine.projectFinishTime(data));
    setRealism(PlanningEngine.checkGoalRealism(data));
    setOnboardingData({ ...data, completed: true });
    setLoading(false);
  };

  const handleLogTraining = async (session: TrainingSession) => {
    if (!user) return;
    const newSession = { ...session, user_id: user.id };

    const { data: inserted, error } = await safeQuery(
      () =>
        supabase.from('training_sessions').insert(newSession).select().single(),
      'logTraining'
    );

    if (error || !inserted) return;

    setTrainingSessions([inserted, ...trainingSessions]);

    const todayPlanned = plannedSessions.find(
      (p) =>
        p.date === session.date &&
        p.sport === session.sport &&
        p.status === 'planned'
    );
    if (todayPlanned) {
      await safeQuery(
        () =>
          supabase
            .from('planned_sessions')
            .update({ status: 'completed', completed_session_id: inserted.id })
            .eq('id', todayPlanned.id),
        'markCompleted'
      );
      setPlannedSessions(
        plannedSessions.map((p) =>
          p.id === todayPlanned.id ? { ...p, status: 'completed' } : p
        )
      );
    }

    setActiveScreen('home');
  };

  const handleLogBody = async (metrics: BodyMetrics) => {
    if (!user) return;
    const newMetrics = { ...metrics, user_id: user.id };

    const { data: inserted, error } = await safeQuery(
      () => supabase.from('body_metrics').insert(newMetrics).select().single(),
      'logBody'
    );

    if (error || !inserted) return;

    setBodyMetrics([inserted, ...bodyMetrics]);
    setActiveScreen('home');
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setOnboardingData({ step: 1, completed: false });
    setPlan(null);
    setPlannedSessions([]);
    setTrainingSessions([]);
    setBodyMetrics([]);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center">
        <div className="text-white text-center">
          <Loader className="animate-spin mx-auto mb-4" size={48} />
          <p className="text-xl">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user) return <AuthFlow onAuth={handleAuth} />;
  if (!onboardingData.completed)
    return (
      <OnboardingFlow
        user={user}
        data={onboardingData}
        onComplete={handleOnboardingComplete}
      />
    );

  return (
    <ToastProvider>
      <div className="min-h-screen bg-gray-50">
        <Header
          user={user}
          showMenu={showProfileMenu}
          setShowMenu={setShowProfileMenu}
          onLogout={handleLogout}
          onNavigate={setActiveScreen}
        />
        <div className="pb-20">
          {activeScreen === 'home' && (
            <HomeScreen
              user={user}
              onboarding={onboardingData}
              plan={plan}
              projection={projection}
              realism={realism}
              plannedSessions={plannedSessions}
              trainingSessions={trainingSessions}
              bodyMetrics={bodyMetrics}
            />
          )}
          {activeScreen === 'calendar' && (
            <CalendarScreen
              plannedSessions={plannedSessions}
              trainingSessions={trainingSessions}
            />
          )}
          {activeScreen === 'log' && (
            <LogScreen
              onLogTraining={handleLogTraining}
              onLogBody={handleLogBody}
              setActiveScreen={setActiveScreen}
            />
          )}
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
    setError('');
    setLoading(true);

    if (!email || !password) {
      setError('Please fill in all fields');
      setLoading(false);
      return;
    }
    if (mode === 'signup' && !fullName) {
      setError('Please enter your full name');
      setLoading(false);
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      setLoading(false);
      return;
    }

    try {
      if (mode === 'signup') {
        const { data, error: signUpErr } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { full_name: fullName } },
        });
        if (signUpErr) {
          setError(signUpErr.message);
          setLoading(false);
          return;
        }
        if (data.user) onAuth(data.user as any);
      } else {
        const { data, error: signInErr } =
          await supabase.auth.signInWithPassword({ email, password });
        if (signInErr) {
          setError(signInErr.message);
          setLoading(false);
          return;
        }
        if (data.user) onAuth(data.user as any);
      }
    } catch (err: any) {
      setError(err.message || 'Something went wrong');
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl p-8 max-w-md w-full">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Pro Fit Agent
          </h1>
          <p className="text-gray-600">Cloud-Powered Training System</p>
        </div>

        <div className="flex gap-2 mb-6">
          <button
            onClick={() => {
              setMode('signin');
              setError('');
            }}
            className={`flex-1 py-2 rounded font-semibold ${
              mode === 'signin'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-700'
            }`}
          >
            Sign In
          </button>
          <button
            onClick={() => {
              setMode('signup');
              setError('');
            }}
            className={`flex-1 py-2 rounded font-semibold ${
              mode === 'signup'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-700'
            }`}
          >
            Sign Up
          </button>
        </div>

        {error && (
          <div className="bg-red-50 text-red-800 p-3 rounded mb-4 text-sm flex items-center gap-2">
            <AlertTriangle size={16} />
            {error}
          </div>
        )}

        <div className="space-y-4">
          {mode === 'signup' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Full Name
              </label>
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="w-full p-3 border rounded-lg"
                placeholder="John Doe"
              />
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full p-3 border rounded-lg"
              placeholder="you@example.com"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full p-3 border rounded-lg"
              placeholder="••••••••"
              onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
            />
          </div>
          <button
            onClick={handleSubmit}
            disabled={loading}
            className="w-full bg-blue-600 text-white py-3 rounded-lg font-semibold hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {loading && <Loader className="animate-spin" size={18} />}
            {loading
              ? 'Please wait...'
              : mode === 'signup'
              ? 'Create Account'
              : 'Sign In'}
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

  const updateStep = (stepData: Partial<OnboardingData>) =>
    setOnboarding({ ...onboarding, ...stepData });

  const nextStep = async () => {
    setSaving(true);
    if (onboarding.step < 5) {
      // Save progress to DB in snake_case
      const dbData = onboardingToDb(
        { ...onboarding, step: onboarding.step + 1 },
        user.id
      );
      await safeQuery(
        () =>
          supabase
            .from('onboarding_data')
            .upsert(dbData, { onConflict: 'user_id' }),
        'saveOnboardingStep'
      );
      setOnboarding({ ...onboarding, step: onboarding.step + 1 });
    } else {
      await onComplete(onboarding);
    }
    setSaving(false);
  };

  const prevStep = () => {
    if (onboarding.step > 1)
      setOnboarding({ ...onboarding, step: onboarding.step - 1 });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl p-8 max-w-2xl w-full">
        <div className="mb-8">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-2xl font-bold text-gray-900">Get Started</h2>
            <span className="text-sm text-gray-600">
              Step {onboarding.step} of 5
            </span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className="bg-blue-600 h-2 rounded-full transition-all"
              style={{ width: `${(onboarding.step / 5) * 100}%` }}
            />
          </div>
        </div>

        {onboarding.step === 1 && (
          <OnboardingStep1 data={onboarding} onUpdate={updateStep} />
        )}
        {onboarding.step === 2 && (
          <OnboardingStep2 data={onboarding} onUpdate={updateStep} />
        )}
        {onboarding.step === 3 && (
          <OnboardingStep3 data={onboarding} onUpdate={updateStep} />
        )}
        {onboarding.step === 4 && (
          <OnboardingStep4 data={onboarding} onUpdate={updateStep} />
        )}
        {onboarding.step === 5 && (
          <OnboardingStep5 data={onboarding} onUpdate={updateStep} />
        )}

        <div className="flex gap-4 mt-8">
          {onboarding.step > 1 && (
            <button
              onClick={prevStep}
              className="px-6 py-3 border-2 border-gray-300 rounded-lg font-semibold hover:bg-gray-50"
            >
              Back
            </button>
          )}
          <button
            onClick={nextStep}
            disabled={saving}
            className="flex-1 bg-blue-600 text-white py-3 rounded-lg font-semibold hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {saving && <Loader className="animate-spin" size={18} />}
            {onboarding.step === 5 ? 'Complete Setup' : 'Continue'}
          </button>
        </div>
      </div>
    </div>
  );
};

// Onboarding Steps
const OnboardingStep1 = ({
  data,
  onUpdate,
}: {
  data: OnboardingData;
  onUpdate: (d: Partial<OnboardingData>) => void;
}) => (
  <div className="space-y-6">
    <h3 className="text-xl font-bold mb-2">Tell us about yourself</h3>
    <div className="grid grid-cols-3 gap-4">
      <div>
        <label className="block text-sm font-medium mb-1">Age</label>
        <input
          type="number"
          value={data.age || ''}
          onChange={(e) => onUpdate({ age: +e.target.value })}
          className="w-full p-3 border rounded-lg"
        />
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">Weight (kg)</label>
        <input
          type="number"
          step="0.1"
          value={data.weight || ''}
          onChange={(e) => onUpdate({ weight: +e.target.value })}
          className="w-full p-3 border rounded-lg"
        />
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">Height (cm)</label>
        <input
          type="number"
          value={data.height || ''}
          onChange={(e) => onUpdate({ height: +e.target.value })}
          className="w-full p-3 border rounded-lg"
        />
      </div>
    </div>
    <div>
      <label className="block text-sm font-medium mb-2">
        Training Background
      </label>
      <div className="grid grid-cols-3 gap-3">
        {['beginner', 'intermediate', 'advanced'].map((level) => (
          <button
            key={level}
            onClick={() => onUpdate({ trainingBackground: level })}
            className={`p-4 rounded-lg border-2 font-semibold capitalize ${
              data.trainingBackground === level
                ? 'border-blue-600 bg-blue-50 text-blue-600'
                : 'border-gray-200'
            }`}
          >
            {level}
          </button>
        ))}
      </div>
    </div>
  </div>
);

const OnboardingStep2 = ({
  data,
  onUpdate,
}: {
  data: OnboardingData;
  onUpdate: (d: Partial<OnboardingData>) => void;
}) => (
  <div className="space-y-6">
    <h3 className="text-xl font-bold mb-2">What's your goal?</h3>
    <div className="space-y-3">
      {[
        { value: 'finish_strong', label: 'First 70.3 – Finish Strong' },
        { value: 'sub5', label: 'Sub 5:00' },
        { value: 'sub4_30', label: 'Sub 4:30' },
        { value: 'hybrid', label: 'Hybrid Strength + Endurance' },
      ].map((goal) => (
        <button
          key={goal.value}
          onClick={() => onUpdate({ goalType: goal.value })}
          className={`w-full p-4 rounded-lg border-2 text-left ${
            data.goalType === goal.value
              ? 'border-blue-600 bg-blue-50'
              : 'border-gray-200'
          }`}
        >
          <div className="font-semibold">{goal.label}</div>
        </button>
      ))}
    </div>
  </div>
);

const OnboardingStep3 = ({
  data,
  onUpdate,
}: {
  data: OnboardingData;
  onUpdate: (d: Partial<OnboardingData>) => void;
}) => (
  <div className="space-y-6">
    <h3 className="text-xl font-bold mb-2">Race Setup</h3>
    <div>
      <label className="block text-sm font-medium mb-1">Race Date</label>
      <input
        type="date"
        value={data.raceDate || ''}
        onChange={(e) => onUpdate({ raceDate: e.target.value })}
        className="w-full p-3 border rounded-lg"
      />
    </div>
    <div>
      <label className="block text-sm font-medium mb-2">Priority</label>
      <div className="grid grid-cols-3 gap-3">
        {[
          { value: 'performance', label: 'Performance' },
          { value: 'balanced', label: 'Balanced' },
          { value: 'physique', label: 'Physique' },
        ].map((p) => (
          <button
            key={p.value}
            onClick={() => onUpdate({ priority: p.value })}
            className={`p-4 rounded-lg border-2 ${
              data.priority === p.value
                ? 'border-blue-600 bg-blue-50'
                : 'border-gray-200'
            }`}
          >
            <div className="font-semibold text-sm">{p.label}</div>
          </button>
        ))}
      </div>
    </div>
  </div>
);

const OnboardingStep4 = ({
  data,
  onUpdate,
}: {
  data: OnboardingData;
  onUpdate: (d: Partial<OnboardingData>) => void;
}) => (
  <div className="space-y-6">
    <h3 className="text-xl font-bold mb-2">Availability</h3>
    <div>
      <label className="block text-sm font-medium mb-1">Hours per week</label>
      <input
        type="number"
        value={data.hoursPerWeek || ''}
        onChange={(e) => onUpdate({ hoursPerWeek: +e.target.value })}
        className="w-full p-3 border rounded-lg"
      />
    </div>
    <div className="grid grid-cols-2 gap-4">
      <div>
        <label className="block text-sm font-medium mb-1">
          Pool (days/week)
        </label>
        <input
          type="number"
          value={data.poolDaysPerWeek || ''}
          onChange={(e) => onUpdate({ poolDaysPerWeek: +e.target.value })}
          className="w-full p-3 border rounded-lg"
        />
      </div>
      <div className="pt-6">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={data.gymAccess || false}
            onChange={(e) => onUpdate({ gymAccess: e.target.checked })}
            className="w-4 h-4"
          />
          <span className="text-sm">Gym access</span>
        </label>
      </div>
    </div>
  </div>
);

const OnboardingStep5 = ({
  data,
  onUpdate,
}: {
  data: OnboardingData;
  onUpdate: (d: Partial<OnboardingData>) => void;
}) => (
  <div className="space-y-6">
    <h3 className="text-xl font-bold mb-2">Baseline Fitness</h3>
    <div>
      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={data.canSwim1900m || false}
          onChange={(e) => onUpdate({ canSwim1900m: e.target.checked })}
          className="w-4 h-4"
        />
        <span className="text-sm font-medium">
          I can swim 1.9km continuously
        </span>
      </label>
    </div>
    <div className="grid grid-cols-2 gap-4">
      <div>
        <label className="block text-sm font-medium mb-1">5K time (min)</label>
        <input
          type="number"
          value={data.fiveKTime ? data.fiveKTime / 60 : ''}
          onChange={(e) => onUpdate({ fiveKTime: +e.target.value * 60 })}
          className="w-full p-3 border rounded-lg"
        />
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">FTP (watts)</label>
        <input
          type="number"
          value={data.ftp || ''}
          onChange={(e) => onUpdate({ ftp: +e.target.value })}
          className="w-full p-3 border rounded-lg"
        />
      </div>
    </div>
  </div>
);

// ============================================================================
// HEADER
// ============================================================================

const Header = ({ user, showMenu, setShowMenu, onLogout, onNavigate }: any) => {
  const initials = (user.user_metadata?.full_name || user.email || '?')
    .split(' ')
    .map((n: string) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  return (
    <>
      <div className="bg-gradient-to-r from-blue-600 to-purple-600 text-white p-4 shadow-lg">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Pro Fit Agent</h1>
            <p className="text-sm opacity-90">Cloud Training System</p>
          </div>
          <button
            onClick={() => setShowMenu(!showMenu)}
            className="w-10 h-10 rounded-full bg-white bg-opacity-20 flex items-center justify-center font-bold hover:bg-opacity-30 text-sm"
          >
            {initials}
          </button>
        </div>
      </div>
      {showMenu && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 z-50"
          onClick={() => setShowMenu(false)}
        >
          <div
            className="absolute right-4 top-16 bg-white rounded-lg shadow-xl w-64 py-2"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-4 py-3 border-b">
              <div className="font-semibold">
                {user.user_metadata?.full_name || user.email}
              </div>
              <div className="text-sm text-gray-600">{user.email}</div>
            </div>
            <button
              onClick={() => {
                onNavigate('account');
                setShowMenu(false);
              }}
              className="w-full px-4 py-3 text-left hover:bg-gray-50 flex items-center gap-3"
            >
              <User size={18} />
              <span>Account</span>
            </button>
            <div className="border-t my-2"></div>
            <button
              onClick={onLogout}
              className="w-full px-4 py-3 text-left hover:bg-gray-50 flex items-center gap-3 text-red-600"
            >
              <LogOut size={18} />
              <span>Log Out</span>
            </button>
          </div>
        </div>
      )}
    </>
  );
};

// ============================================================================
// HOME SCREEN
// ============================================================================

const HomeScreen = ({
  user,
  onboarding,
  plan,
  projection,
  realism,
  plannedSessions,
  trainingSessions,
  bodyMetrics,
}: any) => {
  const weeksToRace = Math.max(
    0,
    Math.floor(
      (new Date(onboarding.raceDate).getTime() - Date.now()) /
        (7 * 24 * 60 * 60 * 1000)
    )
  );
  const today = new Date().toISOString().split('T')[0];
  const todaySessions = plannedSessions.filter(
    (s: PlannedSession) => s.date === today
  );

  const weekStart = new Date();
  weekStart.setDate(weekStart.getDate() - weekStart.getDay());
  const thisWeekTraining = trainingSessions.filter(
    (t: TrainingSession) => new Date(t.date) >= weekStart
  );

  const actualSwim = thisWeekTraining
    .filter((t: TrainingSession) => t.sport === 'Swim')
    .reduce((s: number, t: TrainingSession) => s + t.distance, 0);
  const actualBike = thisWeekTraining
    .filter((t: TrainingSession) => t.sport === 'Bike')
    .reduce((s: number, t: TrainingSession) => s + t.distance, 0);
  const actualRun = thisWeekTraining
    .filter((t: TrainingSession) => t.sport === 'Run')
    .reduce((s: number, t: TrainingSession) => s + t.distance, 0);

  const thisWeekPlanned = plannedSessions.filter(
    (p: PlannedSession) => new Date(p.date) >= weekStart
  );
  const completed = thisWeekPlanned.filter(
    (p: PlannedSession) => p.status === 'completed'
  ).length;
  const total = thisWeekPlanned.length;
  const compliance = total > 0 ? Math.round((completed / total) * 100) : 0;

  return (
    <div className="p-4 space-y-4">
      <div className="bg-gradient-to-r from-green-500 to-blue-500 text-white rounded-lg shadow p-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-bold text-xl">Race Goal Progress</h2>
          <Target size={28} />
        </div>
        <div className="text-4xl font-bold mb-1">{weeksToRace} weeks</div>
        <div className="text-sm opacity-90 mb-3">
          Ironman 70.3 • {onboarding.raceDate}
        </div>
        {projection && (
          <div className="bg-white bg-opacity-20 rounded px-3 py-2 text-sm mb-2">
            📊 Projected: {projection.time}
          </div>
        )}
        <div className="flex gap-2">
          <div className="bg-white bg-opacity-20 rounded px-3 py-1 text-xs">
            {plan?.phase || 'Base'} Phase
          </div>
          <div className="bg-white bg-opacity-20 rounded px-3 py-1 text-xs">
            📈 {compliance}% Compliance
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow p-4">
        <h3 className="font-bold text-lg mb-3">This Week</h3>
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-blue-50 p-3 rounded">
            <div className="text-xs text-gray-600">Swim</div>
            <div className="text-xl font-bold text-blue-600">{actualSwim}m</div>
          </div>
          <div className="bg-green-50 p-3 rounded">
            <div className="text-xs text-gray-600">Bike</div>
            <div className="text-xl font-bold text-green-600">
              {actualBike.toFixed(1)}km
            </div>
          </div>
          <div className="bg-orange-50 p-3 rounded">
            <div className="text-xs text-gray-600">Run</div>
            <div className="text-xl font-bold text-orange-600">
              {actualRun.toFixed(1)}km
            </div>
          </div>
          <div className="bg-purple-50 p-3 rounded">
            <div className="text-xs text-gray-600">Compliance</div>
            <div className="text-xl font-bold text-purple-600">
              {compliance}%
            </div>
            <div className="text-xs text-gray-500">
              {completed}/{total}
            </div>
          </div>
        </div>
      </div>

      {todaySessions.length > 0 && (
        <div className="bg-white rounded-lg shadow p-4">
          <h3 className="font-bold text-lg mb-3">Today's Plan</h3>
          {todaySessions.map((s: PlannedSession) => (
            <div
              key={s.id}
              className="border-l-4 border-blue-500 pl-3 py-2 mb-2"
            >
              <div className="flex justify-between items-start">
                <div>
                  <div className="font-semibold">
                    {s.sport} - {s.type}
                  </div>
                  <div className="text-sm text-gray-600">{s.description}</div>
                  <div className="text-xs text-gray-500">
                    {s.duration}min • {s.intensity}
                  </div>
                </div>
                {s.status === 'completed' ? (
                  <Check className="text-green-600" size={20} />
                ) : (
                  <div className="text-xs bg-gray-100 px-2 py-1 rounded">
                    Planned
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {trainingSessions.length > 0 && (
        <div className="bg-white rounded-lg shadow p-4">
          <h3 className="font-bold text-lg mb-3">Recent Activity</h3>
          <div className="space-y-2">
            {trainingSessions.slice(0, 3).map((t: TrainingSession) => (
              <div
                key={t.id}
                className="border-l-4 border-green-500 pl-3 py-2 text-sm"
              >
                <div className="flex justify-between">
                  <span className="font-semibold">
                    {t.sport} - {t.type}
                  </span>
                  <span className="text-xs text-gray-500">{t.date}</span>
                </div>
                <div className="text-gray-600">
                  {t.distance}
                  {t.sport === 'Swim' ? 'm' : 'km'} • {t.duration}min • RPE{' '}
                  {t.rpe}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
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
  const [trainingForm, setTrainingForm] = useState({
    date: new Date().toISOString().split('T')[0],
    sport: 'Run',
    type: 'Z2',
    duration: 0,
    distance: 0,
    rpe: 5,
    notes: '',
  });
  const [bodyForm, setBodyForm] = useState({
    date: new Date().toISOString().split('T')[0],
    weight: null as number | null,
    sleep: null as number | null,
    fatigue: null as number | null,
    notes: '',
  });

  const handleSaveTraining = async () => {
    if (!trainingForm.duration && !trainingForm.distance) {
      showToast('Enter duration or distance', 'error');
      return;
    }
    setSaving(true);
    await onLogTraining(trainingForm);
    showToast('Training logged!', 'success');
    setSaving(false);
  };

  const handleSaveBody = async () => {
    setSaving(true);
    await onLogBody(bodyForm);
    showToast('Body metrics logged!', 'success');
    setSaving(false);
  };

  return (
    <div className="p-4 space-y-4">
      <div className="flex gap-2">
        <button
          onClick={() => setLogType('training')}
          className={`flex-1 py-2 rounded font-semibold ${
            logType === 'training' ? 'bg-blue-600 text-white' : 'bg-gray-200'
          }`}
        >
          Training
        </button>
        <button
          onClick={() => setLogType('body')}
          className={`flex-1 py-2 rounded font-semibold ${
            logType === 'body' ? 'bg-orange-600 text-white' : 'bg-gray-200'
          }`}
        >
          Body Metrics
        </button>
      </div>

      {logType === 'training' && (
        <div className="bg-white rounded-lg shadow p-4 space-y-3">
          <h2 className="font-bold text-lg">Log Training</h2>
          <div>
            <label className="block text-sm font-medium mb-1">Date</label>
            <input
              type="date"
              value={trainingForm.date}
              onChange={(e) =>
                setTrainingForm({ ...trainingForm, date: e.target.value })
              }
              className="w-full p-3 border rounded-lg"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Sport</label>
            <select
              value={trainingForm.sport}
              onChange={(e) =>
                setTrainingForm({ ...trainingForm, sport: e.target.value })
              }
              className="w-full p-3 border rounded-lg"
            >
              <option>Swim</option>
              <option>Bike</option>
              <option>Run</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Type</label>
            <select
              value={trainingForm.type}
              onChange={(e) =>
                setTrainingForm({ ...trainingForm, type: e.target.value })
              }
              className="w-full p-3 border rounded-lg"
            >
              <option>Z2</option>
              <option>Tempo</option>
              <option>Threshold</option>
              <option>VO2</option>
              <option>Long</option>
              <option>Recovery</option>
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium mb-1">
                Duration (min)
              </label>
              <input
                type="number"
                value={trainingForm.duration || ''}
                onChange={(e) =>
                  setTrainingForm({
                    ...trainingForm,
                    duration: +e.target.value,
                  })
                }
                className="w-full p-3 border rounded-lg"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">
                Distance {trainingForm.sport === 'Swim' ? '(m)' : '(km)'}
              </label>
              <input
                type="number"
                step="0.1"
                value={trainingForm.distance || ''}
                onChange={(e) =>
                  setTrainingForm({
                    ...trainingForm,
                    distance: +e.target.value,
                  })
                }
                className="w-full p-3 border rounded-lg"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">RPE (1-10)</label>
            <input
              type="number"
              min="1"
              max="10"
              value={trainingForm.rpe}
              onChange={(e) =>
                setTrainingForm({ ...trainingForm, rpe: +e.target.value })
              }
              className="w-full p-3 border rounded-lg"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Notes</label>
            <textarea
              value={trainingForm.notes}
              onChange={(e) =>
                setTrainingForm({ ...trainingForm, notes: e.target.value })
              }
              className="w-full p-3 border rounded-lg"
              rows={2}
            />
          </div>
          <button
            onClick={handleSaveTraining}
            disabled={saving}
            className="w-full bg-blue-600 text-white py-3 rounded-lg font-semibold disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {saving ? (
              <Loader className="animate-spin" size={18} />
            ) : (
              <Check size={18} />
            )}
            Log Training
          </button>
        </div>
      )}

      {logType === 'body' && (
        <div className="bg-white rounded-lg shadow p-4 space-y-3">
          <h2 className="font-bold text-lg">Log Body Metrics</h2>
          <div>
            <label className="block text-sm font-medium mb-1">Date</label>
            <input
              type="date"
              value={bodyForm.date}
              onChange={(e) =>
                setBodyForm({ ...bodyForm, date: e.target.value })
              }
              className="w-full p-3 border rounded-lg"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium mb-1">
                Weight (kg)
              </label>
              <input
                type="number"
                step="0.1"
                value={bodyForm.weight || ''}
                onChange={(e) =>
                  setBodyForm({
                    ...bodyForm,
                    weight: e.target.value ? +e.target.value : null,
                  })
                }
                className="w-full p-3 border rounded-lg"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">
                Sleep (hrs)
              </label>
              <input
                type="number"
                step="0.5"
                value={bodyForm.sleep || ''}
                onChange={(e) =>
                  setBodyForm({
                    ...bodyForm,
                    sleep: e.target.value ? +e.target.value : null,
                  })
                }
                className="w-full p-3 border rounded-lg"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">
              Fatigue (1-10)
            </label>
            <input
              type="number"
              min="1"
              max="10"
              value={bodyForm.fatigue || ''}
              onChange={(e) =>
                setBodyForm({
                  ...bodyForm,
                  fatigue: e.target.value ? +e.target.value : null,
                })
              }
              className="w-full p-3 border rounded-lg"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Notes</label>
            <textarea
              value={bodyForm.notes}
              onChange={(e) =>
                setBodyForm({ ...bodyForm, notes: e.target.value })
              }
              className="w-full p-3 border rounded-lg"
              rows={2}
            />
          </div>
          <button
            onClick={handleSaveBody}
            disabled={saving}
            className="w-full bg-orange-600 text-white py-3 rounded-lg font-semibold disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {saving ? (
              <Loader className="animate-spin" size={18} />
            ) : (
              <Check size={18} />
            )}
            Log Metrics
          </button>
        </div>
      )}
    </div>
  );
};

// ============================================================================
// CALENDAR SCREEN
// ============================================================================

const CalendarScreen = ({ plannedSessions, trainingSessions }: any) => {
  const [month, setMonth] = useState(new Date());
  const year = month.getFullYear();
  const monthIdx = month.getMonth();
  const daysInMonth = new Date(year, monthIdx + 1, 0).getDate();
  const firstDay = new Date(year, monthIdx, 1).getDay();

  const days: (number | null)[] = [];
  for (let i = 0; i < firstDay; i++) days.push(null);
  for (let d = 1; d <= daysInMonth; d++) days.push(d);

  const getDayData = (day: number) => {
    const dateStr = `${year}-${String(monthIdx + 1).padStart(2, '0')}-${String(
      day
    ).padStart(2, '0')}`;
    return {
      planned: plannedSessions.filter(
        (s: PlannedSession) => s.date === dateStr
      ),
      actual: trainingSessions.filter(
        (t: TrainingSession) => t.date === dateStr
      ),
    };
  };

  return (
    <div className="p-4">
      <div className="bg-white rounded-lg shadow p-4">
        <div className="flex items-center justify-between mb-4">
          <button
            onClick={() => setMonth(new Date(year, monthIdx - 1, 1))}
            className="p-2"
          >
            <ChevronLeft />
          </button>
          <h2 className="font-bold text-lg">
            {month.toLocaleDateString('en-US', {
              month: 'long',
              year: 'numeric',
            })}
          </h2>
          <button
            onClick={() => setMonth(new Date(year, monthIdx + 1, 1))}
            className="p-2"
          >
            <ChevronRight />
          </button>
        </div>
        <div className="mb-3 flex gap-2 text-xs flex-wrap">
          <span>🔵 Swim</span>
          <span>🟢 Bike</span>
          <span>🔴 Run</span>
          <span>✅ Done</span>
          <span>⚫ Planned</span>
        </div>
        <div className="grid grid-cols-7 gap-1">
          {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
            <div
              key={i}
              className="text-center text-xs font-semibold text-gray-500 p-1"
            >
              {d}
            </div>
          ))}
          {days.map((day, idx) => {
            if (!day) return <div key={idx} />;
            const { planned } = getDayData(day);
            return (
              <div key={idx} className="border rounded p-1 min-h-16">
                <div className="text-xs font-semibold mb-1">{day}</div>
                {planned.map((s: PlannedSession) => (
                  <div key={s.id} className="text-xs mb-0.5">
                    {s.status === 'completed' ? '✅' : '⚫'}
                    {s.sport === 'Swim'
                      ? '🔵'
                      : s.sport === 'Bike'
                      ? '🟢'
                      : '🔴'}
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// BOTTOM NAV
// ============================================================================

const BottomNav = ({
  activeTab,
  setActiveTab,
}: {
  activeTab: string;
  setActiveTab: (t: string) => void;
}) => (
  <div className="fixed bottom-0 left-0 right-0 bg-white border-t shadow-lg">
    <div className="grid grid-cols-5 gap-1 p-2">
      {[
        { id: 'home', icon: TrendingUp, label: 'Home' },
        { id: 'calendar', icon: Calendar, label: 'Calendar' },
        { id: 'log', icon: Plus, label: 'Log' },
        { id: 'plan', icon: Target, label: 'Plan' },
        { id: 'coach', icon: Brain, label: 'Coach' },
      ].map(({ id, icon: Icon, label }) => (
        <button
          key={id}
          onClick={() => setActiveTab(id)}
          className={`flex flex-col items-center p-2 rounded ${
            activeTab === id ? 'bg-blue-100 text-blue-600' : 'text-gray-600'
          }`}
        >
          <Icon size={id === 'log' ? 24 : 20} />
          <span className="text-xs mt-1">{label}</span>
        </button>
      ))}
    </div>
  </div>
);

export default ProFitAgentV5;
