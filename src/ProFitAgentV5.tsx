import React, { useState, useEffect, useCallback } from 'react';
import {
  Calendar, TrendingUp, Brain, Target, Plus, ChevronLeft, ChevronRight,
  X, User, Settings, LogOut, Loader, Check, AlertTriangle, Sun, Moon, Send, RefreshCw, UtensilsCrossed, Lock, Edit3, Save,
  Smartphone, Copy, Flag, Award, MessageCircle, Palette, ChevronDown, Dumbbell, ArrowLeft, Trash2
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
  raceLocation?: string;
  raceName?: string;
  raceCost?: string;
  raceWebsite?: string;
  raceAccommodation?: string;
  raceWeather?: string;
  raceTravel?: string;
  raceNotes?: string;
  priority?: string;
  hoursPerWeek?: number;
  poolDaysPerWeek?: number;
  gymAccess?: boolean;
  canSwim1900m?: boolean;
  fiveKTime?: number;
  ftp?: number;
}

interface Milestone {
  id: string;
  user_id: string;
  title: string;
  date: string | null;
  rule_type: string;
  rule_json: any;
  status: string;
  achieved_at: string | null;
  phase: string | null;
  icon: string;
}

interface UserPrefs {
  avatar_emoji: string | null;
  avatar_color: string;
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
    race_location: data.raceLocation || null,
    race_name: data.raceName || null,
    race_cost: data.raceCost || null,
    race_website: data.raceWebsite || null,
    race_accommodation: data.raceAccommodation || null,
    race_weather: data.raceWeather || null,
    race_travel: data.raceTravel || null,
    race_notes: data.raceNotes || null,
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
    raceLocation: row.race_location,
    raceName: row.race_name,
    raceCost: row.race_cost,
    raceWebsite: row.race_website,
    raceAccommodation: row.race_accommodation,
    raceWeather: row.race_weather,
    raceTravel: row.race_travel,
    raceNotes: row.race_notes,
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

// Format race date nicely: "2026-09-21" → "Sept 21st, 2026"
function formatRaceDate(dateStr: string): string {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sept', 'Oct', 'Nov', 'Dec'];
  const day = d.getDate();
  const suffix = day === 1 || day === 21 || day === 31 ? 'st' : day === 2 || day === 22 ? 'nd' : day === 3 || day === 23 ? 'rd' : 'th';
  return `${months[d.getMonth()]} ${day}${suffix}, ${d.getFullYear()}`;
}

// Map of known cities to reliable Unsplash photo URLs
const cityImageMap: Record<string, string> = {
  'cascais': 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=800&h=400&fit=crop',
  'portugal': 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=800&h=400&fit=crop',
  'london': 'https://images.unsplash.com/photo-1513635269975-59663e0ac1ad?w=800&h=400&fit=crop',
  'nice': 'https://images.unsplash.com/photo-1491166617655-0723a0999cfc?w=800&h=400&fit=crop',
  'barcelona': 'https://images.unsplash.com/photo-1583422409516-2895a77efded?w=800&h=400&fit=crop',
  'dubai': 'https://images.unsplash.com/photo-1512453979798-5ea266f8880c?w=800&h=400&fit=crop',
  'new york': 'https://images.unsplash.com/photo-1496442226666-8d4d0e62e6e9?w=800&h=400&fit=crop',
  'paris': 'https://images.unsplash.com/photo-1502602898657-3e91760cbb34?w=800&h=400&fit=crop',
  'rome': 'https://images.unsplash.com/photo-1552832230-c0197dd311b5?w=800&h=400&fit=crop',
  'athens': 'https://images.unsplash.com/photo-1555993539-1732b0258235?w=800&h=400&fit=crop',
  'berlin': 'https://images.unsplash.com/photo-1560969184-10fe8719e047?w=800&h=400&fit=crop',
  'amsterdam': 'https://images.unsplash.com/photo-1534351590666-13e3e96b5017?w=800&h=400&fit=crop',
  'zurich': 'https://images.unsplash.com/photo-1515488764276-beab7607c1e6?w=800&h=400&fit=crop',
  'hawaii': 'https://images.unsplash.com/photo-1507876466758-bc54f384809c?w=800&h=400&fit=crop',
  'sydney': 'https://images.unsplash.com/photo-1506973035872-a4ec16b8e8d9?w=800&h=400&fit=crop',
  'tokyo': 'https://images.unsplash.com/photo-1540959733332-eab4deabeeaf?w=800&h=400&fit=crop',
  'lisbon': 'https://images.unsplash.com/photo-1585208798174-6cedd86e019a?w=800&h=400&fit=crop',
  'miami': 'https://images.unsplash.com/photo-1533106497176-45ae19e68ba2?w=800&h=400&fit=crop',
  'los angeles': 'https://images.unsplash.com/photo-1534190239940-9ba8944ea261?w=800&h=400&fit=crop',
  'san francisco': 'https://images.unsplash.com/photo-1501594907352-04cda38ebc29?w=800&h=400&fit=crop',
};

function getRaceImageUrl(location: string): string {
  if (!location) return '';
  const lower = location.toLowerCase();
  for (const [key, url] of Object.entries(cityImageMap)) {
    if (lower.includes(key)) return url;
  }
  // Default scenic image for unknown locations
  return 'https://images.unsplash.com/photo-1467269204594-9661b134dd2b?w=800&h=400&fit=crop';
}

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
    cellSkipped: 'bg-gray-900 ring-1 ring-gray-700', cellCancelled: 'bg-amber-950 ring-1 ring-amber-700', cellRest: 'bg-gray-900 bg-opacity-30',
    dotSkipped: 'bg-gray-700', dotCancelled: 'bg-amber-700', dotPlanned: 'bg-gray-500',
    detailBg: 'bg-gray-900', detailTitle: 'text-gray-300', detailRestText: 'text-gray-600',
    sessionBg: 'bg-gray-800', sessionText: 'text-white', sessionSkippedText: 'text-gray-500', sessionCancelledText: 'text-amber-400', sessionMeta: 'text-gray-400',
    badgeCompleted: 'bg-emerald-900 text-emerald-300', badgeSkipped: 'bg-gray-700 text-gray-400', badgeCancelled: 'bg-amber-900 text-amber-300', badgePlanned: 'bg-blue-900 text-blue-300',
    swimIcon: 'bg-cyan-900', bikeIcon: 'bg-emerald-900', runIcon: 'bg-rose-900', strengthIcon: 'bg-violet-900',
  },
  light: {
    bg: 'bg-gray-50', statCard: 'bg-white shadow-sm', statText: 'text-gray-900', legendText: 'text-gray-500',
    weekLabel: 'text-gray-400', weekLabelActive: 'text-blue-600', dayHeader: 'text-gray-500',
    currentWeekBg: 'bg-blue-50', dayDefault: 'text-gray-700', dayFuture: 'text-gray-400',
    dayCompleted: 'text-emerald-600', daySkipped: 'text-gray-400',
    cellCompleted: 'bg-emerald-50 ring-2 ring-emerald-400', cellPartial: 'bg-yellow-50 ring-2 ring-yellow-400',
    cellPlanned: 'bg-white ring-1 ring-gray-300', cellPlannedFuture: 'bg-gray-100 ring-1 ring-gray-200',
    cellSkipped: 'bg-gray-100 ring-1 ring-gray-200', cellCancelled: 'bg-amber-50 ring-1 ring-amber-300', cellRest: 'bg-white bg-opacity-50',
    dotSkipped: 'bg-gray-300', dotCancelled: 'bg-amber-400', dotPlanned: 'bg-gray-400',
    detailBg: 'bg-white shadow-sm', detailTitle: 'text-gray-700', detailRestText: 'text-gray-400',
    sessionBg: 'bg-gray-50', sessionText: 'text-gray-900', sessionSkippedText: 'text-gray-400', sessionCancelledText: 'text-amber-600', sessionMeta: 'text-gray-500',
    badgeCompleted: 'bg-emerald-100 text-emerald-700', badgeSkipped: 'bg-gray-200 text-gray-500', badgeCancelled: 'bg-amber-100 text-amber-700', badgePlanned: 'bg-blue-100 text-blue-700',
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
      1: [
        { sport: 'Swim', type: 'Skills', duration: 45, distance: 1500, intensity: 'Easy', description: 'Technique drills + easy swimming' },
        { sport: 'Gym - Push', type: 'Push', duration: 45, distance: 0, intensity: 'Moderate', description: 'Bench press, overhead press, lateral raises, triceps' },
      ],
      2: [{ sport: 'Run', type: 'Z2', duration: 40, distance: 6, intensity: 'Easy', description: 'Easy aerobic run' }],
      3: [
        { sport: 'Bike', type: 'Z2', duration: 60, distance: 20, intensity: 'Easy', description: 'Steady endurance ride' },
        { sport: 'Gym - Pull', type: 'Pull', duration: 45, distance: 0, intensity: 'Moderate', description: 'Rows, pull-ups, lat pulldown, bicep curls' },
      ],
      4: [{ sport: 'Swim', type: 'Threshold', duration: 50, distance: 2000, intensity: 'Moderate', description: '6x200m @ threshold' }],
      5: [
        { sport: 'Run', type: 'Tempo', duration: 45, distance: 7, intensity: 'Moderate', description: 'Tempo run' },
        { sport: 'Gym - Legs', type: 'Legs', duration: 45, distance: 0, intensity: 'Moderate', description: 'Squats, leg press, RDL, leg curls, calf raises' },
      ],
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
  const [dataLoading, setDataLoading] = useState(false);
  const [onboardingData, setOnboardingData] = useState<OnboardingData>({ step: 1, completed: false });
  const [plannedSessions, setPlannedSessions] = useState<PlannedSession[]>([]);
  const [trainingSessions, setTrainingSessions] = useState<TrainingSession[]>([]);
  const [bodyMetrics, setBodyMetrics] = useState<BodyMetrics[]>([]);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [activeScreen, setActiveScreen] = useState('home');
  const [projection, setProjection] = useState<any>(null);
  const [plan, setPlan] = useState<any>(null);
  const [realism, setRealism] = useState<any>(null);
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [userPrefs, setUserPrefs] = useState<UserPrefs>({ avatar_emoji: null, avatar_color: '#6366f1' });

  useEffect(() => {
    checkUser();
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_IN' && session?.user) { setUser(session.user as any); setDataLoading(true); await loadUserData(session.user.id); setDataLoading(false); }
      else if (event === 'SIGNED_OUT') { setUser(null); setOnboardingData({ step: 1, completed: false }); }
    });
    return () => subscription.unsubscribe();
  }, []);

  const checkUser = async () => {
    const { data: { user: authUser } } = await supabase.auth.getUser();
    if (authUser) {
      setUser(authUser as any);
      setDataLoading(true);
      await loadUserData(authUser.id);
      setDataLoading(false);
    }
    setLoading(false);
  };

  const loadUserData = async (userId: string) => {
    const { data: onboardingRow } = await safeQuery(
      () => supabase.from('onboarding_data').select('*').eq('user_id', userId).maybeSingle(), 'loadOnboarding'
    );
    // Load user preferences (avatar etc)
    const { data: prefsRow } = await safeQuery(
      () => supabase.from('user_preferences').select('avatar_emoji, avatar_color').eq('user_id', userId).maybeSingle(), 'loadPrefs'
    );
    if (prefsRow) setUserPrefs({ avatar_emoji: prefsRow.avatar_emoji, avatar_color: prefsRow.avatar_color || '#6366f1' });

    if (onboardingRow) {
      const onboarding = onboardingFromDb(onboardingRow);
      setOnboardingData(onboarding);
      if (onboarding.completed) {
        const [planRes, sessionsRes, trainingRes, bodyRes, milestonesRes] = await Promise.all([
          safeQuery(() => supabase.from('training_plans').select('*').eq('user_id', userId).maybeSingle(), 'loadPlan'),
          safeQuery(() => supabase.from('planned_sessions').select('*').eq('user_id', userId).order('date', { ascending: true }), 'loadPlanned'),
          safeQuery(() => supabase.from('training_sessions').select('*').eq('user_id', userId).order('date', { ascending: false }), 'loadTraining'),
          safeQuery(() => supabase.from('body_metrics').select('*').eq('user_id', userId).order('date', { ascending: false }), 'loadBody'),
          safeQuery(() => supabase.from('milestones').select('*').eq('user_id', userId).order('date', { ascending: true }), 'loadMilestones'),
        ]);
        if (planRes.data) setPlan(planRes.data);
        if (sessionsRes.data) setPlannedSessions(sessionsRes.data as any);
        if (trainingRes.data) setTrainingSessions(trainingRes.data as any);
        if (bodyRes.data) setBodyMetrics(bodyRes.data as any);
        if (milestonesRes.data) setMilestones(milestonesRes.data as any);

        // Load recent gym sessions for coach context
        try {
          const { data: gymSessions } = await supabase.from('gym_sessions')
            .select('*')
            .eq('user_id', userId)
            .not('completed_at', 'is', null)
            .order('date', { ascending: false })
            .limit(10);
          if (gymSessions && gymSessions.length > 0) {
            const enriched = [];
            for (const gs of gymSessions.slice(0, 5)) {
              const { data: entries } = await supabase.from('gym_exercise_entries')
                .select('*, gym_exercises(name)').eq('session_id', gs.id).order('order_index');
              const entryData = [];
              if (entries) {
                for (const e of entries) {
                  const { data: sets } = await supabase.from('gym_sets')
                    .select('weight, reps, rpe').eq('entry_id', e.id).order('set_index');
                  entryData.push({ exercise_name: e.gym_exercises?.name || 'Unknown', sets: sets || [] });
                }
              }
              enriched.push({ ...gs, entries: entryData });
            }
            (window as any).__recentGymSessions = enriched;
          }
        } catch (e) { console.error('Failed to load gym for coach:', e); }
      }
    }
  };

  const handleAuth = async (authUser: AppUser) => {
    setUser(authUser);
    setDataLoading(true);
    // Try to init profile (will fail silently for existing users due to unique constraint)
    await safeQuery(() => supabase.from('user_profiles').insert({ user_id: authUser.id }), 'initProfile');
    await safeQuery(() => supabase.from('user_preferences').insert({ user_id: authUser.id }), 'initPrefs');
    await safeQuery(() => supabase.from('billing_info').insert({ user_id: authUser.id, plan: 'free', status: 'active' }), 'initBilling');
    await loadUserData(authUser.id);
    setDataLoading(false);
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

    // Generate milestones
    if (data.raceDate) {
      const raceDate = new Date(data.raceDate);
      const now = new Date();
      const totalWeeks = Math.floor((raceDate.getTime() - now.getTime()) / (7 * 24 * 60 * 60 * 1000));
      const phaseDates = {
        base: new Date(now),
        build: new Date(now.getTime() + Math.max(1, totalWeeks - 12) * 7 * 24 * 60 * 60 * 1000),
        peak: new Date(raceDate.getTime() - 3 * 7 * 24 * 60 * 60 * 1000),
        taper: new Date(raceDate.getTime() - 1 * 7 * 24 * 60 * 60 * 1000),
      };
      const milestoneRows = [
        { user_id: user.id, title: 'Training begins', date: now.toISOString().split('T')[0], rule_type: 'date_based', rule_json: {}, status: 'achieved', achieved_at: now.toISOString(), phase: 'Base', icon: '🚀' },
        { user_id: user.id, title: 'Build phase starts', date: phaseDates.build.toISOString().split('T')[0], rule_type: 'date_based', rule_json: {}, status: 'upcoming', achieved_at: null, phase: 'Build', icon: '💪' },
        { user_id: user.id, title: 'Peak phase starts', date: phaseDates.peak.toISOString().split('T')[0], rule_type: 'date_based', rule_json: {}, status: 'upcoming', achieved_at: null, phase: 'Peak', icon: '⚡' },
        { user_id: user.id, title: 'Taper begins', date: phaseDates.taper.toISOString().split('T')[0], rule_type: 'date_based', rule_json: {}, status: 'upcoming', achieved_at: null, phase: 'Taper', icon: '🧘' },
        { user_id: user.id, title: 'Race Day!', date: data.raceDate, rule_type: 'date_based', rule_json: {}, status: 'upcoming', achieved_at: null, phase: 'Race', icon: '🏁' },
        { user_id: user.id, title: 'First 2-hour ride', date: null, rule_type: 'achievement_based', rule_json: { sport: 'Bike', min_duration: 120 }, status: 'upcoming', achieved_at: null, phase: null, icon: '🚴' },
        { user_id: user.id, title: 'First continuous 1.9km swim', date: null, rule_type: 'achievement_based', rule_json: { sport: 'Swim', min_distance: 1900 }, status: 'upcoming', achieved_at: null, phase: null, icon: '🏊' },
        { user_id: user.id, title: 'First 10km+ run', date: null, rule_type: 'achievement_based', rule_json: { sport: 'Run', min_distance: 10 }, status: 'upcoming', achieved_at: null, phase: null, icon: '🏃' },
      ];
      const { data: insertedMilestones } = await safeQuery(() => supabase.from('milestones').insert(milestoneRows).select(), 'createMilestones');
      if (insertedMilestones) setMilestones(insertedMilestones as any);
    }

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

  if (loading || dataLoading) {
    const userName = user?.user_metadata?.full_name?.split(' ')[0] || '';
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center">
        <div className="text-white text-center">
          <Loader className="animate-spin mx-auto mb-4" size={48} />
          <p className="text-xl font-bold">{userName ? `Welcome back, ${userName}!` : 'Loading...'}</p>
          {userName && <p className="text-sm opacity-70 mt-1">Loading your training data...</p>}
        </div>
      </div>
    );
  }

  if (!user) return <AuthFlow onAuth={handleAuth} />;
  if (!onboardingData.completed) return <OnboardingFlow user={user} data={onboardingData} onComplete={handleOnboardingComplete} />;

  return (
    <ToastProvider>
      <div className="min-h-screen bg-gray-50">
        <Header user={user} showMenu={showProfileMenu} setShowMenu={setShowProfileMenu} onLogout={handleLogout} onNavigate={setActiveScreen} userPrefs={userPrefs} setUserPrefs={setUserPrefs} />
        <div className="pb-20">
          {activeScreen === 'home' && (
            <HomeScreen user={user} onboarding={onboardingData} plan={plan} projection={projection}
              realism={realism} plannedSessions={plannedSessions} trainingSessions={trainingSessions} bodyMetrics={bodyMetrics} milestones={milestones} />
          )}
          {activeScreen === 'calendar' && <CalendarScreen plannedSessions={plannedSessions} milestones={milestones} />}
          {activeScreen === 'log' && <LogScreen onLogTraining={handleLogTraining} onLogBody={handleLogBody} setActiveScreen={setActiveScreen} />}
          {activeScreen === 'plan' && <PlanScreen plan={plan} plannedSessions={plannedSessions} setPlannedSessions={setPlannedSessions} onboarding={onboardingData} milestones={milestones} user={user} supabase={supabase} />}
          {activeScreen === 'coach' && <CoachScreen onboarding={onboardingData} plan={plan} plannedSessions={plannedSessions} setPlannedSessions={setPlannedSessions} trainingSessions={trainingSessions} bodyMetrics={bodyMetrics} />}
          {activeScreen === 'nutrition' && <NutritionScreen onboarding={onboardingData} plan={plan} trainingSessions={trainingSessions} />}
          {activeScreen === 'gym' && <GymScreen supabase={supabase} user={user} />}
          {activeScreen === 'account' && <AccountScreen user={user} onboarding={onboardingData} setOnboarding={setOnboardingData} setActiveScreen={setActiveScreen} />}
        </div>
        <BottomNav activeTab={activeScreen} setActiveTab={setActiveScreen} />
      </div>
    </ToastProvider>
  );
};

// ============================================================================
// AUTH FLOW — PIN for Manolis + Normal signup for others
// ============================================================================

const MANOLIS_EMAIL = 'manolis@profitagent.app';
const DEFAULT_PIN = '224366';

const AuthFlow = ({ onAuth }: { onAuth: (user: AppUser) => void }) => {
  const [mode, setMode] = useState<'choose' | 'pin' | 'signin' | 'signup'>('choose');
  const [pin, setPin] = useState(['', '', '', '', '', '']);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const pinRefs = [React.useRef<HTMLInputElement>(null), React.useRef<HTMLInputElement>(null), React.useRef<HTMLInputElement>(null), React.useRef<HTMLInputElement>(null), React.useRef<HTMLInputElement>(null), React.useRef<HTMLInputElement>(null)];

  const handlePinChange = (index: number, value: string) => {
    if (!/^\d*$/.test(value)) return;
    const newPin = [...pin];
    newPin[index] = value.slice(-1);
    setPin(newPin);
    setError('');
    if (value && index < 5) pinRefs[index + 1]?.current?.focus();
    if (newPin.every(d => d !== '') && newPin.join('').length === 6) {
      setTimeout(() => handlePinSubmit(newPin.join('')), 200);
    }
  };

  const handlePinKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !pin[index] && index > 0) {
      pinRefs[index - 1]?.current?.focus();
    }
  };

  const handlePinSubmit = async (pinCode: string) => {
    setLoading(true);
    setError('');
    try {
      // Try to sign in with Manolis's account using PIN as password
      const { data, error: signInErr } = await supabase.auth.signInWithPassword({
        email: MANOLIS_EMAIL,
        password: pinCode,
      });
      if (signInErr) {
        // If account doesn't exist yet, create it with default PIN
        if (pinCode === DEFAULT_PIN) {
          const { data: signUpData, error: signUpErr } = await supabase.auth.signUp({
            email: MANOLIS_EMAIL,
            password: DEFAULT_PIN,
            options: { data: { full_name: 'Manolis' } },
          });
          if (signUpErr) { setError('Setup failed: ' + signUpErr.message); setLoading(false); return; }
          if (signUpData.user) { onAuth(signUpData.user as any); setLoading(false); return; }
        }
        setError('Wrong PIN');
        setPin(['', '', '', '', '', '']);
        pinRefs[0]?.current?.focus();
        setLoading(false);
        return;
      }
      if (data.user) onAuth(data.user as any);
    } catch (err: any) { setError('Connection error'); }
    setLoading(false);
  };

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
      <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Pro Fit Agent</h1>
          
        </div>

        {mode === 'choose' && (
          <div className="space-y-3">
            <button onClick={() => { setMode('pin'); setTimeout(() => pinRefs[0]?.current?.focus(), 100); }}
              className="w-full bg-gradient-to-r from-purple-600 to-blue-600 text-white py-4 rounded-xl font-semibold flex items-center justify-center gap-3 hover:shadow-lg transition-shadow">
              <Lock size={20} /> Manolis — Enter PIN
            </button>
            <div className="flex items-center gap-3 py-2">
              <div className="flex-1 h-px bg-gray-200"></div>
              <span className="text-xs text-gray-400">or</span>
              <div className="flex-1 h-px bg-gray-200"></div>
            </div>
            <button onClick={() => setMode('signin')}
              className="w-full border-2 border-gray-200 py-3 rounded-xl font-semibold text-gray-700 hover:bg-gray-50 transition-colors">
              Sign In with Email
            </button>
            <button onClick={() => setMode('signup')}
              className="w-full text-sm text-blue-600 hover:underline py-1">
              Create new account
            </button>
          </div>
        )}

        {mode === 'pin' && (
          <div className="text-center">
            <div className="w-16 h-16 bg-purple-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Lock size={28} className="text-purple-600" />
            </div>
            <h2 className="text-xl font-bold mb-1">Welcome back, Manolis</h2>
            <p className="text-gray-500 text-sm mb-6">Enter your 6-digit PIN</p>
            <div className="flex justify-center gap-2 mb-4">
              {pin.map((digit, i) => (
                <input key={i} ref={pinRefs[i]} type="text" inputMode="numeric" maxLength={1}
                  value={digit} onChange={(e) => handlePinChange(i, e.target.value)}
                  onKeyDown={(e) => handlePinKeyDown(i, e)}
                  className={`w-11 h-14 text-center text-2xl font-bold border-2 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-400 ${error ? 'border-red-400 shake' : 'border-gray-200'}`} />
              ))}
            </div>
            {error && <p className="text-red-500 text-sm mb-3">{error}</p>}
            {loading && <Loader className="animate-spin mx-auto text-purple-500" size={24} />}
            <button onClick={() => { setMode('choose'); setPin(['', '', '', '', '', '']); setError(''); }}
              className="text-sm text-gray-500 hover:underline mt-4">Back</button>
          </div>
        )}

        {(mode === 'signin' || mode === 'signup') && (
          <>
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
            <button onClick={() => { setMode('choose'); setError(''); }} className="w-full text-sm text-gray-500 hover:underline mt-4">Back</button>
          </>
        )}
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

const Header = ({ user, showMenu, setShowMenu, onLogout, onNavigate, userPrefs, setUserPrefs }: any) => {
  const initials = (user.user_metadata?.full_name || user.email || '?').split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showWhatsApp, setShowWhatsApp] = useState(false);

  const handleEmojiSelect = async (emoji: string) => {
    setUserPrefs({ ...userPrefs, avatar_emoji: emoji });
    setShowEmojiPicker(false);
    await safeQuery(() => supabase.from('user_preferences').update({ avatar_emoji: emoji }).eq('user_id', user.id), 'saveEmoji');
  };

  return (
    <>
      <div className="bg-gradient-to-r from-blue-600 to-purple-600 text-white p-4 shadow-lg">
        <div className="flex items-center justify-between">
          <div><h1 className="text-2xl font-bold">Pro Fit Agent</h1></div>
          <button onClick={() => setShowMenu(!showMenu)}
            className="w-10 h-10 rounded-full flex items-center justify-center font-bold hover:ring-2 hover:ring-white/50 text-sm transition-all"
            style={{ backgroundColor: userPrefs.avatar_color || '#6366f1' }}>
            {userPrefs.avatar_emoji ? <span className="text-xl">{userPrefs.avatar_emoji}</span> : initials}
          </button>
        </div>
      </div>
      {showMenu && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50" onClick={() => setShowMenu(false)}>
          <div className="absolute right-4 top-16 bg-white rounded-xl shadow-2xl w-72 py-2 overflow-hidden" onClick={(e: any) => e.stopPropagation()}>
            {/* User Info */}
            <div className="px-4 py-3 border-b flex items-center gap-3">
              <div className="w-12 h-12 rounded-full flex items-center justify-center text-xl font-bold"
                style={{ backgroundColor: userPrefs.avatar_color || '#6366f1', color: 'white' }}>
                {userPrefs.avatar_emoji || initials}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-semibold truncate">{user.user_metadata?.full_name || user.email}</div>
                <div className="text-xs text-gray-500 truncate">{user.email}</div>
              </div>
            </div>

            {/* Emoji Picker Toggle */}
            <button onClick={() => setShowEmojiPicker(!showEmojiPicker)} className="w-full px-4 py-3 text-left hover:bg-gray-50 flex items-center gap-3 text-sm">
              <Palette size={18} className="text-purple-500" /><span>Change Avatar</span>
              <ChevronDown size={14} className={`ml-auto text-gray-400 transition-transform ${showEmojiPicker ? 'rotate-180' : ''}`} />
            </button>

            {showEmojiPicker && (
              <div className="px-4 py-2 border-t border-b bg-gray-50">
                <div className="grid grid-cols-8 gap-1">
                  {['🏃','🚴','🏊','💪','🧘','⚡','🔥','🌟','🎯','🏆','🥇','🦈','🐎','🦅','🐺','🦁','😎','🤘','✌️','🙌','💎','🌊','🏔️','🎪'].map(emoji => (
                    <button key={emoji} onClick={() => handleEmojiSelect(emoji)}
                      className={`text-xl p-1.5 rounded-lg hover:bg-purple-100 transition-colors ${userPrefs.avatar_emoji === emoji ? 'bg-purple-200 ring-2 ring-purple-400' : ''}`}>
                      {emoji}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <button onClick={() => { onNavigate('account'); setShowMenu(false); }} className="w-full px-4 py-3 text-left hover:bg-gray-50 flex items-center gap-3 text-sm">
              <Settings size={18} className="text-gray-500" /><span>Profile Settings</span>
            </button>
            <button onClick={() => { setShowWhatsApp(true); setShowMenu(false); }} className="w-full px-4 py-3 text-left hover:bg-gray-50 flex items-center gap-3 text-sm">
              <MessageCircle size={18} className="text-blue-500" /><span>Connect Telegram</span>
            </button>
            <div className="border-t my-1"></div>
            <button onClick={onLogout} className="w-full px-4 py-3 text-left hover:bg-gray-50 flex items-center gap-3 text-sm text-red-600">
              <LogOut size={18} /><span>Log Out</span>
            </button>
          </div>
        </div>
      )}

      {/* Telegram Connect Modal */}
      {showWhatsApp && <WhatsAppConnectModal user={user} onClose={() => setShowWhatsApp(false)} />}
    </>
  );
};

// ============================================================================
// WHATSAPP CONNECT MODAL
// ============================================================================

const WhatsAppConnectModal = ({ user, onClose }: { user: AppUser; onClose: () => void }) => {
  const [code, setCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const generateCode = async () => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const response = await fetch('/api/create-pairing-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token}` },
      });
      const data = await response.json();
      if (data.code) { setCode(data.code); setExpiresAt(data.expires_at); }
    } catch (err) { console.error('Pairing error:', err); }
    setLoading(false);
  };

  const copyCommand = () => {
    if (code) { navigator.clipboard.writeText(`/start ${code}`); setCopied(true); setTimeout(() => setCopied(false), 2000); }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-6" onClick={(e: any) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold flex items-center gap-2"><MessageCircle size={22} className="text-blue-500" /> Connect Telegram</h2>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded"><X size={20} /></button>
        </div>

        {!code ? (
          <div className="text-center">
            <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Smartphone size={28} className="text-blue-600" />
            </div>
            <p className="text-sm text-gray-600 mb-4">Connect your Telegram to log sleep, fatigue, weight and check your training plan via messages.</p>
            <button onClick={generateCode} disabled={loading}
              className="w-full bg-blue-600 text-white py-3 rounded-xl font-semibold hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2">
              {loading ? <Loader className="animate-spin" size={18} /> : <MessageCircle size={18} />}
              {loading ? 'Generating...' : 'Generate Pairing Code'}
            </button>
          </div>
        ) : (
          <div className="text-center">
            <div className="bg-blue-50 rounded-xl p-4 mb-4">
              <p className="text-xs text-blue-600 font-semibold mb-2">Step 1: Open Telegram and search for</p>
              <a href="https://t.me/ProFitAgent_bot" target="_blank" rel="noopener" className="text-blue-700 font-bold text-lg hover:underline">@ProFitAgent_bot</a>
            </div>

            <div className="bg-gray-50 rounded-xl p-4 mb-4">
              <p className="text-xs text-gray-500 font-semibold mb-2">Step 2: Send this exact message to the bot</p>
              <div className="flex items-center justify-center gap-2 mb-1">
                <code className="text-2xl font-mono font-bold tracking-wide text-gray-900 bg-white px-4 py-2 rounded-lg border">/start {code}</code>
              </div>
              <button onClick={copyCommand} className="mt-2 flex items-center gap-1 mx-auto text-sm text-blue-600 hover:underline">
                {copied ? <><Check size={14} className="text-green-500" /> Copied!</> : <><Copy size={14} /> Copy command</>}
              </button>
            </div>

            <p className="text-xs text-gray-400 mb-4">
              Code expires in 10 minutes{expiresAt ? ` (${new Date(expiresAt).toLocaleTimeString()})` : ''}
            </p>

            <div className="bg-gray-50 rounded-xl p-3 text-left text-xs text-gray-600 space-y-1">
              <p className="font-semibold mb-1">After pairing, you can send:</p>
              <p><code className="bg-gray-200 px-1 rounded">/sleep 7.5</code> — Log sleep hours</p>
              <p><code className="bg-gray-200 px-1 rounded">/fatigue 6</code> — Log tiredness (1-10)</p>
              <p><code className="bg-gray-200 px-1 rounded">/weight 67.2</code> — Log body weight</p>
              <p><code className="bg-gray-200 px-1 rounded">/today</code> — Today's training plan</p>
              <p><code className="bg-gray-200 px-1 rounded">/summary</code> — Weekly stats</p>
            </div>
            <button onClick={generateCode} className="text-sm text-blue-600 hover:underline mt-3">Generate new code</button>
          </div>
        )}
      </div>
    </div>
  );
};

// ============================================================================
// PHASE TIMELINE COMPONENT
// ============================================================================

const PhaseTimeline = ({ onboarding, plan }: { onboarding: OnboardingData; plan: any }) => {
  if (!onboarding.raceDate) return null;

  const raceDate = new Date(onboarding.raceDate);
  const now = new Date();
  const totalDays = Math.max(1, (raceDate.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
  const totalWeeks = Math.floor(totalDays / 7);

  const phases = [
    { name: 'Base', color: 'bg-blue-500', weeks: Math.max(1, totalWeeks - 12) },
    { name: 'Build', color: 'bg-orange-500', weeks: Math.min(9, Math.max(1, totalWeeks > 12 ? 9 : totalWeeks - 3)) },
    { name: 'Peak', color: 'bg-red-500', weeks: Math.min(2, Math.max(1, totalWeeks > 3 ? 2 : 1)) },
    { name: 'Taper', color: 'bg-green-500', weeks: 1 },
    { name: 'Race', color: 'bg-purple-600', weeks: 0 },
  ];

  const currentPhase = plan?.phase || 'Base';

  return (
    <div className="bg-white rounded-xl shadow-sm p-4">
      <h3 className="font-bold text-sm text-gray-700 mb-3 flex items-center gap-2"><Flag size={16} className="text-purple-500" /> Training Phases</h3>
      <div className="flex items-center gap-1 mb-2">
        {phases.map((phase, i) => {
          const isCurrent = phase.name === currentPhase;
          const isPast = phases.findIndex(p => p.name === currentPhase) > i;
          return (
            <React.Fragment key={phase.name}>
              <div className={`flex-1 h-2 rounded-full transition-all ${isCurrent ? phase.color : isPast ? phase.color + ' opacity-40' : 'bg-gray-200'}`} />
              {i < phases.length - 1 && <div className="w-1" />}
            </React.Fragment>
          );
        })}
      </div>
      <div className="flex justify-between text-[9px] text-gray-500">
        {phases.map(phase => {
          const isCurrent = phase.name === currentPhase;
          return (
            <span key={phase.name} className={`${isCurrent ? 'text-blue-600 font-bold' : ''}`}>
              {phase.name} {isCurrent && '📍'}
            </span>
          );
        })}
      </div>
    </div>
  );
};

// ============================================================================
// MILESTONES CARD COMPONENT
// ============================================================================

const MilestonesCard = ({ milestones }: { milestones: Milestone[] }) => {
  const upcoming = milestones.filter(m => m.status === 'upcoming').sort((a, b) => {
    if (!a.date) return 1;
    if (!b.date) return -1;
    return new Date(a.date).getTime() - new Date(b.date).getTime();
  }).slice(0, 3);

  const achieved = milestones.filter(m => m.status === 'achieved').length;

  if (milestones.length === 0) return null;

  return (
    <div className="bg-white rounded-xl shadow-sm p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-bold text-sm text-gray-700 flex items-center gap-2"><Award size={16} className="text-yellow-500" /> Milestones</h3>
        <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full font-semibold">{achieved}/{milestones.length}</span>
      </div>
      <div className="space-y-2">
        {upcoming.map(m => {
          const daysUntil = m.date ? Math.ceil((new Date(m.date).getTime() - Date.now()) / (24 * 60 * 60 * 1000)) : null;
          return (
            <div key={m.id} className="flex items-center gap-3 p-2 bg-gray-50 rounded-lg">
              <span className="text-xl">{m.icon}</span>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-gray-800 truncate">{m.title}</div>
                {daysUntil !== null && <div className="text-xs text-gray-500">{daysUntil <= 0 ? 'Today!' : `In ${daysUntil} days`}{m.date ? ` • ${m.date}` : ''}</div>}
                {!m.date && <div className="text-xs text-purple-500">Achievement goal</div>}
              </div>
              <div className="w-6 h-6 rounded-full bg-gray-200 flex items-center justify-center">
                <div className="w-3 h-3 rounded-full bg-gray-400" />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

// ============================================================================
// HOME SCREEN
// ============================================================================

const HomeScreen = ({ user, onboarding, plan, projection, realism, plannedSessions, trainingSessions, bodyMetrics, milestones }: any) => {
  const weeksToRace = Math.max(0, Math.floor((new Date(onboarding.raceDate).getTime() - Date.now()) / (7 * 24 * 60 * 60 * 1000)));
  const today = new Date().toISOString().split('T')[0];
  const todaySessions = plannedSessions.filter((s: PlannedSession) => s.date === today);
  const weekStart = new Date(); weekStart.setDate(weekStart.getDate() - weekStart.getDay());
  const thisWeekTraining = trainingSessions.filter((t: TrainingSession) => new Date(t.date) >= weekStart);
  const actualSwim = thisWeekTraining.filter((t: TrainingSession) => t.sport === 'Swim').reduce((s: number, t: TrainingSession) => s + t.distance, 0);
  const actualBike = thisWeekTraining.filter((t: TrainingSession) => t.sport === 'Bike').reduce((s: number, t: TrainingSession) => s + t.distance, 0);
  const actualRun = thisWeekTraining.filter((t: TrainingSession) => t.sport === 'Run').reduce((s: number, t: TrainingSession) => s + t.distance, 0);
  const thisWeekPlanned = plannedSessions.filter((p: PlannedSession) => new Date(p.date) >= weekStart && p.status !== 'cancelled');
  const completed = thisWeekPlanned.filter((p: PlannedSession) => p.status === 'completed').length;
  const total = thisWeekPlanned.length;
  const compliance = total > 0 ? Math.round((completed / total) * 100) : 0;

  return (
    <div className="p-4 space-y-4">
      {onboarding.raceLocation ? (
        <div className="relative rounded-lg shadow overflow-hidden" style={{ minHeight: 180 }}>
          <div className="absolute inset-0 bg-cover bg-center" style={{
            backgroundImage: `url(${getRaceImageUrl(onboarding.raceLocation)})`,
          }} />
          <div className="absolute inset-0 bg-gradient-to-r from-black/70 to-black/40" />
          <div className="relative z-10 p-6 text-white">
            <div className="flex items-center justify-between mb-3"><h2 className="font-bold text-xl">Race Goal Progress</h2><Target size={28} /></div>
            <div className="text-4xl font-bold mb-1">{weeksToRace} weeks</div>
            <div className="text-sm opacity-90 mb-1">Ironman 70.3 • {formatRaceDate(onboarding.raceDate)}</div>
            <div className="text-xs opacity-70 mb-3">📍 {onboarding.raceLocation}</div>
            {projection && <div className="bg-white bg-opacity-20 rounded px-3 py-2 text-sm mb-2">📊 Projected: {projection.time}</div>}
            <div className="flex gap-2">
              <div className="bg-white bg-opacity-20 rounded px-3 py-1 text-xs">{plan?.phase || 'Base'} Phase</div>
              <div className="bg-white bg-opacity-20 rounded px-3 py-1 text-xs">📈 {compliance}% Compliance</div>
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-gradient-to-r from-green-500 to-blue-500 text-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between mb-3"><h2 className="font-bold text-xl">Race Goal Progress</h2><Target size={28} /></div>
          <div className="text-4xl font-bold mb-1">{weeksToRace} weeks</div>
          <div className="text-sm opacity-90 mb-3">Ironman 70.3 • {formatRaceDate(onboarding.raceDate)}</div>
          {projection && <div className="bg-white bg-opacity-20 rounded px-3 py-2 text-sm mb-2">📊 Projected: {projection.time}</div>}
          <div className="flex gap-2">
            <div className="bg-white bg-opacity-20 rounded px-3 py-1 text-xs">{plan?.phase || 'Base'} Phase</div>
            <div className="bg-white bg-opacity-20 rounded px-3 py-1 text-xs">📈 {compliance}% Compliance</div>
          </div>
        </div>
      )}
      <PhaseTimeline onboarding={onboarding} plan={plan} />
      <MilestonesCard milestones={milestones} />
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

const CalendarScreen = ({ plannedSessions, milestones }: any) => {
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
    const activeSessions = sessions.filter((s: PlannedSession) => s.status !== 'cancelled');
    const allCancelled = sessions.every((s: PlannedSession) => s.status === 'cancelled');
    const allCompleted = activeSessions.length > 0 && activeSessions.every((s: PlannedSession) => s.status === 'completed');
    const allSkipped = activeSessions.length > 0 && activeSessions.every((s: PlannedSession) => s.status === 'skipped');
    const someCompleted = activeSessions.some((s: PlannedSession) => s.status === 'completed');
    const sports = [...new Set(sessions.map((s: PlannedSession) => s.sport))] as string[];
    if (allCancelled) return { type: 'cancelled', sports, sessions };
    if (allCompleted) return { type: 'completed', sports, sessions };
    if (allSkipped) return { type: 'skipped', sports, sessions };
    if (someCompleted) return { type: 'partial', sports, sessions };
    return { type: 'planned', sports, sessions };
  };

  const sportDotColor: Record<string, string> = { Swim: 'bg-cyan-400', Bike: 'bg-emerald-400', Run: 'bg-rose-400', Strength: 'bg-violet-400', 'Gym - Push': 'bg-red-400', 'Gym - Pull': 'bg-blue-400', 'Gym - Legs': 'bg-green-400' };

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
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-red-400"></span> Gym Push</span>
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-blue-400"></span> Gym Pull</span>
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-green-400"></span> Gym Legs</span>
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
                const hasMilestone = milestones?.some((m: Milestone) => m.date === dateStr);
                const cellClass = type === 'completed' ? t.cellCompleted : type === 'partial' ? t.cellPartial : type === 'skipped' ? t.cellSkipped : type === 'cancelled' ? t.cellCancelled : type === 'planned' && isFuture ? t.cellPlannedFuture : type === 'planned' ? t.cellPlanned : t.cellRest;
                const textClass = isToday ? (isDark ? 'text-white' : 'text-blue-600 font-black') : type === 'completed' ? t.dayCompleted : type === 'skipped' ? t.daySkipped : type === 'cancelled' ? (isDark ? 'text-amber-400' : 'text-amber-600') : isFuture ? t.dayFuture : t.dayDefault;

                return (
                  <button key={dateStr} onClick={() => setSelectedDate(dateStr)}
                    className={`relative w-full rounded-lg flex flex-col items-center justify-center py-1.5 transition-all duration-200 ${cellClass} ${isSelected ? 'ring-2 ring-blue-400 scale-105 z-10' : ''} ${isToday && !isSelected ? (isDark ? 'ring-2 ring-white ring-opacity-40' : 'ring-2 ring-blue-500') : ''}`}>
                    <span className={`text-[10px] font-bold ${textClass}`}>{dayNum}</span>
                    {sports && sports.length > 0 && (
                      <div className="flex gap-0.5 mt-0.5 flex-wrap justify-center">
                        {sports.slice(0, 3).map((sport: string, i: number) => {
                          const colorClass = type === 'skipped' ? 'text-gray-400' : type === 'cancelled' ? 'text-amber-500 bg-amber-100' : sport === 'Swim' ? 'text-cyan-600 bg-cyan-100' : sport === 'Bike' ? 'text-emerald-600 bg-emerald-100' : sport === 'Run' ? 'text-rose-600 bg-rose-100' : sport === 'Gym - Push' ? 'text-red-600 bg-red-100' : sport === 'Gym - Pull' ? 'text-blue-600 bg-blue-100' : sport === 'Gym - Legs' ? 'text-green-600 bg-green-100' : 'text-violet-600 bg-violet-100';
                          return (
                            <span key={i} className={`text-[6px] font-bold px-0.5 rounded leading-tight ${colorClass}`}>
                              {sport}
                            </span>
                          );
                        })}
                      </div>
                    )}
                    {type === 'completed' && (
                      <div className="absolute -top-0.5 -right-0.5 bg-emerald-500 rounded-full w-3 h-3 flex items-center justify-center"><Check size={7} className="text-white" /></div>
                    )}
                    {hasMilestone && (
                      <div className="absolute -top-1 -left-0.5 text-[8px]">🏁</div>
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
                <div key={session.id} className={`flex items-center gap-3 p-3 rounded-lg ${t.sessionBg} ${session.status === 'skipped' ? 'opacity-40' : session.status === 'cancelled' ? 'opacity-60' : ''} transition-colors duration-300`}>
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center text-lg ${session.sport === 'Swim' ? t.swimIcon : session.sport === 'Bike' ? t.bikeIcon : session.sport === 'Run' ? t.runIcon : session.sport === 'Gym - Push' ? 'bg-red-100' : session.sport === 'Gym - Pull' ? 'bg-blue-100' : session.sport === 'Gym - Legs' ? 'bg-green-100' : t.strengthIcon}`}>
                    {session.sport === 'Swim' ? '🏊' : session.sport === 'Bike' ? '🚴' : session.sport === 'Run' ? '🏃' : session.sport?.startsWith('Gym') ? '🏋️' : '💪'}
                  </div>
                  <div className="flex-1">
                    <div className={`font-semibold text-sm ${session.status === 'skipped' ? t.sessionSkippedText + ' line-through' : session.status === 'cancelled' ? t.sessionCancelledText + ' line-through' : t.sessionText}`}>{session.sport} – {session.type}</div>
                    <div className={`text-xs ${t.sessionMeta}`}>{session.duration}min{session.distance > 0 ? ` • ${session.distance}${session.sport === 'Swim' ? 'm' : 'km'}` : ''} • {session.intensity}</div>
                  </div>
                  <div>
                    {session.status === 'completed' && <div className={`${t.badgeCompleted} text-xs px-2 py-1 rounded-full font-semibold`}>Done</div>}
                    {session.status === 'skipped' && <div className={`${t.badgeSkipped} text-xs px-2 py-1 rounded-full`}>Skipped</div>}
                    {session.status === 'cancelled' && <div className={`${t.badgeCancelled} text-xs px-2 py-1 rounded-full`}>Replaced</div>}
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

const PlanScreen = ({ plan, plannedSessions, setPlannedSessions, onboarding, milestones, user, supabase }: any) => {
  const [weekOffset, setWeekOffset] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  const refreshPlan = async () => {
    setRefreshing(true);
    try {
      const today = new Date().toISOString().split('T')[0];
      
      // 1. Get all existing sessions
      const { data: existing } = await supabase.from('planned_sessions').select('*')
        .eq('user_id', user.id);
      
      // 2. Keep past sessions + completed/skipped future sessions
      const toKeep = (existing || []).filter((s: any) => 
        s.date < today || s.status === 'completed' || s.status === 'skipped'
      );
      const toDeleteIds = (existing || []).filter((s: any) => 
        s.date >= today && s.status === 'planned'
      ).map((s: any) => s.id);
      
      // 3. Delete only future planned (not completed/skipped)
      if (toDeleteIds.length > 0) {
        await supabase.from('planned_sessions').delete().in('id', toDeleteIds);
      }
      
      // 4. Generate new sessions
      const newSessions = PlanningEngine.generate30DaySessions(user.id);
      
      // 5. Filter out dates that already have a kept session for the same sport
      const keptKeys = new Set(toKeep.filter((s: any) => s.date >= today).map((s: any) => `${s.date}-${s.sport}`));
      const toInsert = newSessions.filter((s: any) => !keptKeys.has(`${s.date}-${s.sport}`));
      
      if (toInsert.length > 0) {
        await supabase.from('planned_sessions').insert(toInsert);
      }
      
      // 6. Reload everything
      const { data: all } = await supabase.from('planned_sessions').select('*')
        .eq('user_id', user.id).order('date', { ascending: true });
      if (all) setPlannedSessions(all);
    } catch (err) {
      console.error('Refresh plan error:', err);
    }
    setRefreshing(false);
  };
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
  const activeSessions = weekSessions.filter((s: PlannedSession) => s.status !== 'cancelled');
  const completed = activeSessions.filter((s: PlannedSession) => s.status === 'completed').length;
  const skipped = activeSessions.filter((s: PlannedSession) => s.status === 'skipped').length;
  const cancelled = weekSessions.filter((s: PlannedSession) => s.status === 'cancelled').length;
  const planned = activeSessions.filter((s: PlannedSession) => s.status === 'planned').length;
  const total = activeSessions.length;
  const totalHours = (activeSessions.reduce((sum: number, s: PlannedSession) => sum + s.duration, 0) / 60).toFixed(1);

  const sportColor: Record<string, string> = { Swim: 'border-blue-500 bg-blue-50', Bike: 'border-green-500 bg-green-50', Run: 'border-orange-500 bg-orange-50', Strength: 'border-purple-500 bg-purple-50', 'Gym - Push': 'border-red-500 bg-red-50', 'Gym - Pull': 'border-blue-500 bg-blue-50', 'Gym - Legs': 'border-green-500 bg-green-50' };
  const sportEmoji: Record<string, string> = { Swim: '🏊', Bike: '🚴', Run: '🏃', Strength: '💪', 'Gym - Push': '🏋️', 'Gym - Pull': '🏋️', 'Gym - Legs': '🦵' };
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
        <div className="flex items-center justify-between mb-2"><h2 className="font-bold text-xl">Training Plan</h2><button onClick={refreshPlan} disabled={refreshing} className="px-3 py-1 bg-white bg-opacity-20 rounded-lg text-xs font-bold hover:bg-opacity-30">{refreshing ? '⏳' : '🔄'} Refresh</button></div>
        <div className="text-sm opacity-90 mb-3">{plan?.phase || 'Base'} Phase • Race: {formatRaceDate(onboarding.raceDate)}</div>
        <div className="grid grid-cols-4 gap-2 text-center">
          <div className="bg-white bg-opacity-20 rounded p-2"><div className="text-lg font-bold">{plan?.weekly_swim_sessions || 3}</div><div className="text-xs opacity-80">Swims/wk</div></div>
          <div className="bg-white bg-opacity-20 rounded p-2"><div className="text-lg font-bold">{plan?.weekly_bike_km || 60}</div><div className="text-xs opacity-80">Bike km/wk</div></div>
          <div className="bg-white bg-opacity-20 rounded p-2"><div className="text-lg font-bold">{plan?.weekly_run_km || 25}</div><div className="text-xs opacity-80">Run km/wk</div></div>
          <div className="bg-white bg-opacity-20 rounded p-2"><div className="text-lg font-bold">{plan?.weekly_strength_sessions || 2}</div><div className="text-xs opacity-80">Gym/wk</div></div>
        </div>
      </div>
      <PhaseTimeline onboarding={onboarding} plan={plan} />

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
          {cancelled > 0 && <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-amber-400"></div>{cancelled} replaced</div>}
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
                <div key={session.id} className={`border-l-4 ${sportColor[session.sport] || 'border-gray-300 bg-gray-50'} p-3 mb-1 rounded-r ${session.status === 'skipped' ? 'opacity-50' : session.status === 'cancelled' ? 'opacity-40 bg-amber-50 border-amber-400' : ''}`}>
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span>{sportEmoji[session.sport] || '🏋️'}</span>
                        <span className={`font-semibold ${session.status === 'skipped' ? 'line-through' : session.status === 'cancelled' ? 'line-through text-amber-600' : ''}`}>{session.sport} – {session.type}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full ${intensityColor[session.intensity] || 'bg-gray-100'}`}>{session.intensity}</span>
                      </div>
                      <div className="text-sm text-gray-600 mt-1">{session.description}</div>
                      <div className="text-xs text-gray-500 mt-1">{session.duration}min • {session.distance}{session.sport === 'Swim' ? 'm' : 'km'}</div>
                    </div>
                    <div className="ml-2">
                      {session.status === 'completed' ? (
                        <div className="flex items-center gap-1 text-green-600"><Check size={16} /><span className="text-xs font-semibold">Done</span></div>
                      ) : session.status === 'cancelled' ? (
                        <div className="text-xs bg-amber-100 text-amber-700 px-2 py-1 rounded font-semibold">Replaced</div>
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

const CoachScreen = ({ onboarding, plan, plannedSessions, setPlannedSessions, trainingSessions, bodyMetrics }: any) => {
  const [activeTab, setActiveTab] = useState<'chat' | 'summary'>('summary');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState<string | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [chatLoaded, setChatLoaded] = useState(false);
  const chatEndRef = React.useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => { scrollToBottom(); }, [messages]);

  // Load saved chat history on mount
  useEffect(() => {
    const loadChat = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        const { data } = await supabase
          .from('coach_messages')
          .select('role, content, timestamp')
          .eq('user_id', user.id)
          .order('timestamp', { ascending: true })
          .limit(50);
        if (data && data.length > 0) {
          setMessages(data.map((m: any) => ({ role: m.role, content: m.content, timestamp: m.timestamp })));
        }
      } catch (err) {
        console.error('Failed to load chat history:', err);
      }
      setChatLoaded(true);
    };
    loadChat();
  }, []);

  // Save messages to Supabase when they change
  const saveMessage = async (msg: ChatMessage) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      await supabase.from('coach_messages').insert({
        user_id: user.id,
        role: msg.role,
        content: msg.content,
        timestamp: msg.timestamp,
      });
    } catch (err) {
      console.error('Failed to save message:', err);
    }
  };

  const buildAthleteContext = () => {
    const today = new Date();
    const weekStart = new Date(today);
    weekStart.setDate(today.getDate() - today.getDay());

    const thisWeekPlanned = plannedSessions.filter((p: PlannedSession) => new Date(p.date) >= weekStart && p.status !== 'cancelled');
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
      plannedSessionsList: plannedSessions.filter((s: PlannedSession) => {
        const todayStr = new Date().toISOString().split('T')[0];
        return s.status === 'planned' && s.date >= todayStr;
      }).slice(0, 14),
      recentGymSessions: (window as any).__recentGymSessions || [],
    };
  };

  const callCoachAPI = async (mode: 'chat' | 'summary', userMessage?: string) => {
    const context = buildAthleteContext();
    context.canModifyPlan = true;
    // Send conversation history so coach remembers the chat
    const chatHistory = messages.slice(-20).map(m => ({ role: m.role, content: m.content }));
    try {
      const response = await fetch('/api/coach', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode, userMessage, athleteContext: context, chatHistory }),
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Failed to get coach response');
      }

      const data = await response.json();

      // Check for plan modification commands in the response
      if (data.planChanges && data.planChanges.length > 0) {
        await applyPlanChanges(data.planChanges);
      }

      return data.message;
    } catch (err: any) {
      console.error('Coach API error:', err);
      throw err;
    }
  };

  const applyPlanChanges = async (changes: any[]) => {
    for (const change of changes) {
      if (change.action === 'skip' && change.sessionId) {
        // Coach-initiated skips are "cancelled" (replaced), not "skipped" (athlete chose to skip)
        await safeQuery(() => supabase.from('planned_sessions').update({ status: 'cancelled' }).eq('id', change.sessionId), 'coachCancel');
        setPlannedSessions((prev: PlannedSession[]) => prev.map(p => p.id === change.sessionId ? { ...p, status: 'cancelled' } : p));
      }
      if (change.action === 'cancel' && change.sessionId) {
        await safeQuery(() => supabase.from('planned_sessions').update({ status: 'cancelled' }).eq('id', change.sessionId), 'coachCancel');
        setPlannedSessions((prev: PlannedSession[]) => prev.map(p => p.id === change.sessionId ? { ...p, status: 'cancelled' } : p));
      }
      if (change.action === 'reschedule' && change.sessionId && change.newDate) {
        // Mark original as cancelled, create new one
        await safeQuery(() => supabase.from('planned_sessions').update({ status: 'cancelled' }).eq('id', change.sessionId), 'coachRescheduleCancel');
        setPlannedSessions((prev: PlannedSession[]) => prev.map(p => p.id === change.sessionId ? { ...p, status: 'cancelled' } : p));
        // Add replacement session on new date
        const original = plannedSessions.find((p: PlannedSession) => p.id === change.sessionId);
        if (original) {
          const newSession = { user_id: original.user_id, date: change.newDate, sport: original.sport, type: original.type, duration: original.duration, distance: original.distance, intensity: original.intensity, description: original.description, status: 'planned', completed_session_id: null, created_by: 'coach' };
          const { data: inserted } = await safeQuery(() => supabase.from('planned_sessions').insert(newSession).select().single(), 'coachRescheduleAdd');
          if (inserted) setPlannedSessions((prev: PlannedSession[]) => [...prev, inserted]);
        }
      }
      if (change.action === 'add') {
        const newSession = { user_id: plannedSessions[0]?.user_id, date: change.date, sport: change.sport, type: change.type || 'Z2', duration: change.duration || 45, distance: change.distance || 0, intensity: change.intensity || 'Easy', description: change.description || '', status: 'planned', completed_session_id: null, created_by: 'coach' };
        const { data: inserted } = await safeQuery(() => supabase.from('planned_sessions').insert(newSession).select().single(), 'coachAdd');
        if (inserted) setPlannedSessions((prev: PlannedSession[]) => [...prev, inserted]);
      }
    }
  };

  const handleSendMessage = async () => {
    if (!input.trim() || loading) return;
    const userMsg: ChatMessage = { role: 'user', content: input.trim(), timestamp: new Date().toISOString() };
    setMessages(prev => [...prev, userMsg]);
    saveMessage(userMsg);
    setInput('');
    setLoading(true);

    try {
      const reply = await callCoachAPI('chat', userMsg.content);
      const assistantMsg: ChatMessage = { role: 'assistant', content: reply, timestamp: new Date().toISOString() };
      setMessages(prev => [...prev, assistantMsg]);
      saveMessage(assistantMsg);
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
    "What weight should I aim for on bench press?",
    "How's my gym progress — any suggestions?",
    "Skip tomorrow's workout — I'm too tired",
    "Add an easy swim session on Saturday",
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
// ACCOUNT / PROFILE SETTINGS SCREEN
// ============================================================================

const AccountScreen = ({ user, onboarding, setOnboarding, setActiveScreen }: any) => {
  const { showToast } = useToast();
  const [accountTab, setAccountTab] = useState<'profile' | 'goals' | 'raceInfo'>('profile');
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    age: onboarding.age || '', weight: onboarding.weight || '', height: onboarding.height || '',
    trainingBackground: onboarding.trainingBackground || 'beginner', goalType: onboarding.goalType || 'finish',
    raceDate: onboarding.raceDate || '', raceLocation: onboarding.raceLocation || '', raceName: onboarding.raceName || '',
    raceCost: onboarding.raceCost || '', raceWebsite: onboarding.raceWebsite || '', raceAccommodation: onboarding.raceAccommodation || '',
    raceWeather: onboarding.raceWeather || '', raceTravel: onboarding.raceTravel || '', raceNotes: onboarding.raceNotes || '',
    priority: onboarding.priority || 'balanced', hoursPerWeek: onboarding.hoursPerWeek || '',
    poolDaysPerWeek: onboarding.poolDaysPerWeek || '', gymAccess: onboarding.gymAccess ?? true,
    canSwim1900m: onboarding.canSwim1900m ?? false, fiveKTime: onboarding.fiveKTime || '', ftp: onboarding.ftp || '',
  });

  const resetForm = () => setForm({
    age: onboarding.age || '', weight: onboarding.weight || '', height: onboarding.height || '',
    trainingBackground: onboarding.trainingBackground || 'beginner', goalType: onboarding.goalType || 'finish',
    raceDate: onboarding.raceDate || '', raceLocation: onboarding.raceLocation || '', raceName: onboarding.raceName || '',
    raceCost: onboarding.raceCost || '', raceWebsite: onboarding.raceWebsite || '', raceAccommodation: onboarding.raceAccommodation || '',
    raceWeather: onboarding.raceWeather || '', raceTravel: onboarding.raceTravel || '', raceNotes: onboarding.raceNotes || '',
    priority: onboarding.priority || 'balanced', hoursPerWeek: onboarding.hoursPerWeek || '',
    poolDaysPerWeek: onboarding.poolDaysPerWeek || '', gymAccess: onboarding.gymAccess ?? true,
    canSwim1900m: onboarding.canSwim1900m ?? false, fiveKTime: onboarding.fiveKTime || '', ftp: onboarding.ftp || '',
  });

  const handleSave = async () => {
    setSaving(true);
    const updatedOnboarding = { ...onboarding, ...form };
    const dbData = onboardingToDb(updatedOnboarding, user.id);
    console.log('Saving profile data:', JSON.stringify(dbData));
    const { error } = await safeQuery(
      () => supabase.from('onboarding_data').upsert(dbData, { onConflict: 'user_id' }),
      'updateProfile'
    );
    if (!error) {
      setOnboarding(updatedOnboarding);
      showToast('Profile updated!', 'success');
      setEditing(false);
    } else {
      console.error('Save error:', error);
      showToast('Failed to save: ' + error, 'error');
    }
    setSaving(false);
  };

  const profileFields = [
    { title: 'Personal Info', fields: [
      { key: 'age', label: 'Age', type: 'number', unit: 'years' },
      { key: 'weight', label: 'Weight', type: 'number', unit: 'kg', step: '0.1' },
      { key: 'height', label: 'Height', type: 'number', unit: 'cm' },
      { key: 'trainingBackground', label: 'Experience', type: 'select', options: [
        { value: 'beginner', label: 'Beginner (0-1 years)' },
        { value: 'intermediate', label: 'Intermediate (1-3 years)' },
        { value: 'advanced', label: 'Advanced (3+ years)' },
      ]},
    ]},
    { title: 'Training Availability', fields: [
      { key: 'hoursPerWeek', label: 'Hours/week', type: 'number', unit: 'hrs' },
      { key: 'poolDaysPerWeek', label: 'Pool days/week', type: 'number' },
      { key: 'gymAccess', label: 'Gym access', type: 'toggle' },
    ]},
    { title: 'Fitness Benchmarks', fields: [
      { key: 'canSwim1900m', label: 'Can swim 1.9km', type: 'toggle' },
      { key: 'fiveKTime', label: '5K time', type: 'number', unit: 'seconds' },
      { key: 'ftp', label: 'FTP', type: 'number', unit: 'watts' },
    ]},
  ];

  const goalFields = [
    { title: 'Race Goals', fields: [
      { key: 'goalType', label: 'Goal', type: 'select', options: [
        { value: 'finish', label: 'Finish the race' },
        { value: 'sub6', label: 'Finish under 6 hours' },
        { value: 'sub530', label: 'Finish under 5:30' },
        { value: 'sub5', label: 'Finish under 5 hours' },
        { value: 'pb', label: 'Personal best' },
      ]},
      { key: 'raceDate', label: 'Race Date', type: 'date' },
      { key: 'priority', label: 'Priority Discipline', type: 'select', options: [
        { value: 'swim', label: 'Swim' },
        { value: 'bike', label: 'Bike' },
        { value: 'run', label: 'Run' },
        { value: 'balanced', label: 'Balanced' },
      ]},
    ]},
  ];

  const raceInfoFields = [
    { title: 'Event Details', fields: [
      { key: 'raceName', label: 'Race Name', type: 'text' },
      { key: 'raceLocation', label: 'Location', type: 'text' },
      { key: 'raceWebsite', label: 'Race Website', type: 'text' },
      { key: 'raceCost', label: 'Entry Cost', type: 'text' },
    ]},
    { title: 'Logistics', fields: [
      { key: 'raceTravel', label: 'Travel Plans', type: 'text' },
      { key: 'raceAccommodation', label: 'Accommodation', type: 'text' },
      { key: 'raceWeather', label: 'Expected Weather', type: 'text' },
      { key: 'raceNotes', label: 'Notes', type: 'text' },
    ]},
  ];

  const currentFieldGroups = accountTab === 'profile' ? profileFields : accountTab === 'goals' ? goalFields : raceInfoFields;

  const renderField = (field: any) => (
    <div key={field.key} className={`px-4 py-3 ${field.type === 'text' ? 'block' : 'flex items-center justify-between'}`}>
      <label className="text-sm text-gray-600 font-medium">{field.label}</label>
      {!editing ? (
        <span className={`text-sm font-semibold text-gray-900 ${field.type === 'text' ? 'block mt-1' : ''}`}>
          {field.type === 'toggle' ? (
            (form as any)[field.key] ? <span className="text-green-600">Yes</span> : <span className="text-gray-400">No</span>
          ) : field.type === 'select' ? (
            field.options?.find((o: any) => o.value === (form as any)[field.key])?.label || (form as any)[field.key] || '—'
          ) : field.key === 'fiveKTime' && (form as any)[field.key] ? (
            `${Math.floor((form as any)[field.key] / 60)}:${String((form as any)[field.key] % 60).padStart(2, '0')}`
          ) : field.key === 'raceDate' && (form as any)[field.key] ? (
            formatRaceDate((form as any)[field.key])
          ) : (
            (form as any)[field.key] ? `${(form as any)[field.key]}${field.unit ? ' ' + field.unit : ''}` : '—'
          )}
        </span>
      ) : (
        <div className={field.type === 'text' ? 'w-full mt-1' : 'w-40'}>
          {field.type === 'toggle' ? (
            <button onClick={() => setForm({ ...form, [field.key]: !(form as any)[field.key] })}
              className={`w-12 h-6 rounded-full relative transition-colors ${(form as any)[field.key] ? 'bg-green-500' : 'bg-gray-300'}`}>
              <div className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${(form as any)[field.key] ? 'left-6' : 'left-0.5'}`} />
            </button>
          ) : field.type === 'select' ? (
            <select value={(form as any)[field.key]} onChange={(e) => setForm({ ...form, [field.key]: e.target.value })}
              className="w-full p-2 border rounded-lg text-sm text-right">
              {field.options?.map((o: any) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          ) : field.type === 'text' ? (
            <input type="text" value={(form as any)[field.key] || ''}
              onChange={(e) => setForm({ ...form, [field.key]: e.target.value })}
              placeholder={`Enter ${field.label.toLowerCase()}...`}
              className="w-full p-2 border rounded-lg text-sm" />
          ) : (
            <div className="flex items-center gap-1">
              <input type={field.type === 'date' ? 'date' : 'number'} step={field.step || '1'}
                value={(form as any)[field.key] || ''}
                onChange={(e) => setForm({ ...form, [field.key]: field.type === 'number' ? (e.target.value ? +e.target.value : '') : e.target.value })}
                className="w-full p-2 border rounded-lg text-sm text-right" />
              {field.unit && <span className="text-xs text-gray-400 whitespace-nowrap">{field.unit}</span>}
            </div>
          )}
        </div>
      )}
    </div>
  );

  return (
    <div className="p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => setActiveScreen('home')} className="p-2 hover:bg-gray-100 rounded-lg"><ChevronLeft size={20} /></button>
          <h2 className="text-xl font-bold text-gray-900">Settings</h2>
        </div>
        {!editing ? (
          <button onClick={() => setEditing(true)} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700">
            <Edit3 size={14} /> Edit
          </button>
        ) : (
          <div className="flex gap-2">
            <button onClick={() => { setEditing(false); resetForm(); }}
              className="px-3 py-2 border rounded-lg text-sm font-semibold text-gray-600 hover:bg-gray-50">Cancel</button>
            <button onClick={handleSave} disabled={saving}
              className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-semibold hover:bg-green-700 disabled:opacity-50">
              {saving ? <Loader className="animate-spin" size={14} /> : <Save size={14} />} Save
            </button>
          </div>
        )}
      </div>

      {/* User Info Card */}
      <div className="bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-xl p-5">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-full bg-white bg-opacity-20 flex items-center justify-center text-xl font-bold">
            {(user.user_metadata?.full_name || user.email || '?').split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2)}
          </div>
          <div>
            <h3 className="font-bold text-lg">{user.user_metadata?.full_name || 'Athlete'}</h3>
            <p className="text-sm opacity-80">{user.email}</p>
          </div>
        </div>
      </div>

      {/* Tab buttons */}
      <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
        {[
          { id: 'profile' as const, label: '👤 Profile' },
          { id: 'goals' as const, label: '🎯 Goals' },
          { id: 'raceInfo' as const, label: '🏁 Race Info' },
        ].map(tab => (
          <button key={tab.id} onClick={() => setAccountTab(tab.id)}
            className={`flex-1 py-2 rounded-md text-sm font-semibold transition-all ${
              accountTab === tab.id ? 'bg-white shadow text-gray-900' : 'text-gray-500'
            }`}>
            {tab.label}
          </button>
        ))}
      </div>

      {/* Race location preview on Race Info tab */}
      {accountTab === 'raceInfo' && onboarding.raceLocation && (
        <div className="relative rounded-xl overflow-hidden" style={{ height: 120 }}>
          <div className="absolute inset-0 bg-cover bg-center" style={{
            backgroundImage: `url(${getRaceImageUrl(onboarding.raceLocation)})`,
            filter: 'brightness(0.4) grayscale(0.7)',
          }} />
          <div className="relative z-10 p-4 text-white flex items-end h-full">
            <div>
              <div className="text-xs opacity-70">📍 Race Location</div>
              <div className="font-bold text-lg">{onboarding.raceLocation}</div>
              {onboarding.raceName && <div className="text-sm opacity-80">{onboarding.raceName}</div>}
            </div>
          </div>
        </div>
      )}

      {/* Field Groups for current tab */}
      {currentFieldGroups.map((group) => (
        <div key={group.title} className="bg-white rounded-xl shadow-sm overflow-hidden">
          <div className="px-4 py-3 bg-gray-50 border-b">
            <h3 className="font-bold text-sm text-gray-700">{group.title}</h3>
          </div>
          <div className="divide-y">
            {group.fields.map((field: any) => renderField(field))}
          </div>
        </div>
      ))}

      {/* PIN Section - only on Profile tab */}
      {accountTab === 'profile' && user.email === MANOLIS_EMAIL && (
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          <div className="px-4 py-3 bg-gray-50 border-b">
            <h3 className="font-bold text-sm text-gray-700">Security</h3>
          </div>
          <div className="px-4 py-3 flex items-center justify-between">
            <div>
              <div className="text-sm font-medium text-gray-600">Login PIN</div>
              <div className="text-xs text-gray-400">Change your 6-digit PIN</div>
            </div>
            <div className="flex items-center gap-2">
              <Lock size={16} className="text-gray-400" />
              <span className="text-sm font-semibold text-gray-500">••••••</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ============================================================================
// NUTRITION SCREEN — AI Meal Plans + Manual Logging
// ============================================================================

interface MealEntry {
  id?: string;
  meal: string;
  food: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

interface DailyHabit {
  id?: string;
  name: string;
  icon: string;
  completed: boolean;
  date: string;
}

const NutritionScreen = ({ onboarding, plan, trainingSessions }: any) => {
  const [activeTab, setActiveTab] = useState<'habits' | 'plan' | 'log'>('habits');
  const [mealPlan, setMealPlan] = useState<string | null>(null);
  const [mealPlanLoading, setMealPlanLoading] = useState(false);
  const [todayMeals, setTodayMeals] = useState<MealEntry[]>([]);
  const [showAddMeal, setShowAddMeal] = useState(false);
  const [mealForm, setMealForm] = useState<MealEntry>({ meal: 'Breakfast', food: '', calories: 0, protein: 0, carbs: 0, fat: 0 });
  const [habits, setHabits] = useState<DailyHabit[]>([]);
  const [showAddHabit, setShowAddHabit] = useState(false);
  const [newHabitName, setNewHabitName] = useState('');
  const [newHabitIcon, setNewHabitIcon] = useState('💧');
  const [habitsLoaded, setHabitsLoaded] = useState(false);

  const today = new Date().toISOString().split('T')[0];

  // Default habits for first-time use
  const defaultHabits: Omit<DailyHabit, 'id'>[] = [
    { name: 'Drink 2L water', icon: '💧', completed: false, date: today },
    { name: 'Take creatine', icon: '💊', completed: false, date: today },
    { name: 'Take collagen', icon: '🦴', completed: false, date: today },
    { name: 'Eat 120g+ protein', icon: '🥩', completed: false, date: today },
    { name: 'Take vitamins', icon: '💉', completed: false, date: today },
    { name: 'Stretch / mobility', icon: '🧘', completed: false, date: today },
  ];

  // Load habits from Supabase
  useEffect(() => {
    const loadHabits = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        // Load today's habits
        const { data } = await supabase
          .from('daily_habits')
          .select('*')
          .eq('user_id', user.id)
          .eq('date', today)
          .order('created_at');

        if (data && data.length > 0) {
          setHabits(data);
        } else {
          // Check if user has habit templates (from any previous day)
          const { data: templates } = await supabase
            .from('daily_habits')
            .select('name, icon')
            .eq('user_id', user.id)
            .order('date', { ascending: false })
            .limit(20);

          if (templates && templates.length > 0) {
            // Use unique habits from previous days as templates
            const seen = new Set<string>();
            const uniqueTemplates = templates.filter(t => { if (seen.has(t.name)) return false; seen.add(t.name); return true; });
            const todayHabits = uniqueTemplates.map(t => ({
              name: t.name, icon: t.icon, completed: false, date: today,
            }));
            // Insert today's habits
            const { data: inserted } = await supabase.from('daily_habits').insert(
              todayHabits.map(h => ({ ...h, user_id: user.id }))
            ).select();
            if (inserted) setHabits(inserted);
          } else {
            // First time — use defaults
            const { data: inserted } = await supabase.from('daily_habits').insert(
              defaultHabits.map(h => ({ ...h, user_id: user.id }))
            ).select();
            if (inserted) setHabits(inserted);
          }
        }
      } catch (err) {
        console.error('Failed to load habits:', err);
      }
      setHabitsLoaded(true);
    };
    loadHabits();
  }, []);

  const toggleHabit = async (habitId: string) => {
    const habit = habits.find(h => h.id === habitId);
    if (!habit) return;
    const newCompleted = !habit.completed;
    setHabits(prev => prev.map(h => h.id === habitId ? { ...h, completed: newCompleted } : h));
    await supabase.from('daily_habits').update({ completed: newCompleted }).eq('id', habitId);
  };

  const addHabit = async () => {
    if (!newHabitName.trim()) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data: inserted } = await supabase.from('daily_habits').insert({
      user_id: user.id, name: newHabitName.trim(), icon: newHabitIcon, completed: false, date: today,
    }).select().single();
    if (inserted) setHabits(prev => [...prev, inserted]);
    setNewHabitName('');
    setNewHabitIcon('💧');
    setShowAddHabit(false);
  };

  const deleteHabit = async (habitId: string) => {
    setHabits(prev => prev.filter(h => h.id !== habitId));
    await supabase.from('daily_habits').delete().eq('id', habitId);
  };

  const completedCount = habits.filter(h => h.completed).length;
  const habitProgress = habits.length > 0 ? Math.round((completedCount / habits.length) * 100) : 0;

  const totalCals = todayMeals.reduce((s, m) => s + m.calories, 0);
  const totalProtein = todayMeals.reduce((s, m) => s + m.protein, 0);
  const totalCarbs = todayMeals.reduce((s, m) => s + m.carbs, 0);
  const totalFat = todayMeals.reduce((s, m) => s + m.fat, 0);

  // Estimate daily targets based on weight and training
  const weight = onboarding?.weight || 75;
  const targetCalories = Math.round(weight * 35);
  const targetProtein = Math.round(weight * 1.8);
  const targetCarbs = Math.round(weight * 5);
  const targetFat = Math.round(weight * 1);

  const handleGenerateMealPlan = async () => {
    setMealPlanLoading(true);
    setMealPlan(null);
    try {
      const response = await fetch('/api/coach', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'nutrition',
          athleteContext: { onboarding, plan, recentSessions: trainingSessions.slice(0, 7), targetCalories, targetProtein, targetCarbs, targetFat },
        }),
      });
      const data = await response.json();
      setMealPlan(data.message);
    } catch (err) {
      setMealPlan('Could not generate meal plan. Please try again.');
    }
    setMealPlanLoading(false);
  };

  const handleAddMeal = () => {
    if (!mealForm.food) return;
    setTodayMeals([...todayMeals, { ...mealForm, id: Date.now().toString() }]);
    setMealForm({ meal: 'Breakfast', food: '', calories: 0, protein: 0, carbs: 0, fat: 0 });
    setShowAddMeal(false);
  };

  const handleDeleteMeal = (id: string) => {
    setTodayMeals(todayMeals.filter(m => m.id !== id));
  };

  return (
    <div className="p-4 space-y-4">
      <div className="flex gap-2">
        <button onClick={() => setActiveTab('habits')}
          className={`flex-1 py-2 rounded-lg font-semibold text-sm flex items-center justify-center gap-1 ${activeTab === 'habits' ? 'bg-green-600 text-white' : 'bg-gray-200 text-gray-700'}`}>
          ✅ Habits
        </button>
        <button onClick={() => setActiveTab('plan')}
          className={`flex-1 py-2 rounded-lg font-semibold text-sm flex items-center justify-center gap-1 ${activeTab === 'plan' ? 'bg-green-600 text-white' : 'bg-gray-200 text-gray-700'}`}>
          <Brain size={14} /> Meal Plan
        </button>
        <button onClick={() => setActiveTab('log')}
          className={`flex-1 py-2 rounded-lg font-semibold text-sm flex items-center justify-center gap-1 ${activeTab === 'log' ? 'bg-green-600 text-white' : 'bg-gray-200 text-gray-700'}`}>
          <UtensilsCrossed size={14} /> Food Log
        </button>
      </div>

      {/* DAILY HABITS TAB */}
      {activeTab === 'habits' && (
        <div className="space-y-3">
          {/* Progress bar */}
          <div className="bg-gradient-to-r from-green-500 to-emerald-500 text-white rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-bold text-sm">Today's Habits</h3>
              <span className="text-sm font-bold">{completedCount}/{habits.length}</span>
            </div>
            <div className="w-full bg-white bg-opacity-30 rounded-full h-3">
              <div className="bg-white rounded-full h-3 transition-all duration-500" style={{ width: `${habitProgress}%` }} />
            </div>
            <div className="text-xs mt-1 opacity-80">{habitProgress}% complete</div>
          </div>

          {/* Habits checklist */}
          <div className="bg-white rounded-lg shadow overflow-hidden">
            {habits.map((habit) => (
              <div key={habit.id} className="flex items-center gap-3 px-4 py-3 border-b last:border-b-0 active:bg-gray-50">
                <button onClick={() => toggleHabit(habit.id!)}
                  className={`w-7 h-7 rounded-full border-2 flex items-center justify-center transition-all ${
                    habit.completed ? 'bg-green-500 border-green-500 text-white' : 'border-gray-300 text-transparent hover:border-green-400'
                  }`}>
                  <Check size={16} />
                </button>
                <span className="text-xl">{habit.icon}</span>
                <span className={`flex-1 text-sm font-medium ${habit.completed ? 'line-through text-gray-400' : 'text-gray-800'}`}>
                  {habit.name}
                </span>
                <button onClick={() => deleteHabit(habit.id!)} className="text-gray-300 hover:text-red-400 p-1">
                  <X size={14} />
                </button>
              </div>
            ))}

            {habits.length === 0 && habitsLoaded && (
              <div className="text-center py-8 text-gray-400">
                <p className="text-sm">No habits yet. Add your first one!</p>
              </div>
            )}
          </div>

          {/* Add habit form */}
          {showAddHabit ? (
            <div className="bg-white rounded-lg shadow p-4 space-y-3">
              <h3 className="font-bold text-sm">Add Habit</h3>
              <div className="flex gap-2">
                <div className="flex gap-1 flex-wrap">
                  {['💧', '💊', '🦴', '🥩', '🥗', '🧘', '😴', '☀️', '🏃', '💪', '🧊', '📖'].map(emoji => (
                    <button key={emoji} onClick={() => setNewHabitIcon(emoji)}
                      className={`w-9 h-9 rounded-lg text-lg flex items-center justify-center ${newHabitIcon === emoji ? 'bg-green-100 ring-2 ring-green-500' : 'bg-gray-100'}`}>
                      {emoji}
                    </button>
                  ))}
                </div>
              </div>
              <input value={newHabitName} onChange={(e) => setNewHabitName(e.target.value)}
                placeholder="e.g. Drink 2L water, Take creatine..."
                className="w-full p-3 border rounded-lg text-sm"
                onKeyDown={(e) => e.key === 'Enter' && addHabit()} />
              <div className="flex gap-2">
                <button onClick={() => setShowAddHabit(false)} className="flex-1 py-2 bg-gray-200 rounded-lg font-semibold text-sm">Cancel</button>
                <button onClick={addHabit} className="flex-1 py-2 bg-green-600 text-white rounded-lg font-semibold text-sm">Add</button>
              </div>
            </div>
          ) : (
            <button onClick={() => setShowAddHabit(true)}
              className="w-full py-3 bg-white rounded-lg shadow text-sm font-semibold text-green-600 flex items-center justify-center gap-2 hover:bg-green-50">
              <Plus size={16} /> Add Habit
            </button>
          )}

          {/* Quick tip */}
          <div className="bg-green-50 rounded-lg p-3 text-xs text-green-800">
            💡 Habits reset daily. Your list carries over from yesterday — just tick them off each day. Ask the AI Coach to suggest habits for your training phase!
          </div>
        </div>
      )}

      {activeTab === 'plan' && (
        <div className="space-y-3">
          {/* Daily Targets */}
          <div className="bg-gradient-to-r from-green-500 to-emerald-500 text-white rounded-lg p-4">
            <h3 className="font-bold text-sm mb-2">Daily Nutrition Targets</h3>
            <div className="grid grid-cols-4 gap-2 text-center">
              <div className="bg-white bg-opacity-20 rounded p-2"><div className="text-lg font-bold">{targetCalories}</div><div className="text-xs opacity-80">kcal</div></div>
              <div className="bg-white bg-opacity-20 rounded p-2"><div className="text-lg font-bold">{targetProtein}g</div><div className="text-xs opacity-80">Protein</div></div>
              <div className="bg-white bg-opacity-20 rounded p-2"><div className="text-lg font-bold">{targetCarbs}g</div><div className="text-xs opacity-80">Carbs</div></div>
              <div className="bg-white bg-opacity-20 rounded p-2"><div className="text-lg font-bold">{targetFat}g</div><div className="text-xs opacity-80">Fat</div></div>
            </div>
          </div>

          {/* AI Meal Plan */}
          <div className="bg-white rounded-lg shadow p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-bold text-lg flex items-center gap-2"><UtensilsCrossed size={20} className="text-green-500" /> AI Meal Plan</h3>
              <button onClick={handleGenerateMealPlan} disabled={mealPlanLoading}
                className="flex items-center gap-1 px-3 py-1.5 bg-green-600 text-white rounded-lg text-sm font-semibold hover:bg-green-700 disabled:opacity-50">
                {mealPlanLoading ? <Loader className="animate-spin" size={14} /> : <RefreshCw size={14} />}
                {mealPlanLoading ? 'Generating...' : mealPlan ? 'Refresh' : 'Generate'}
              </button>
            </div>

            {!mealPlan && !mealPlanLoading && (
              <div className="text-center py-6 text-gray-400">
                <UtensilsCrossed className="mx-auto mb-3 text-green-300" size={36} />
                <p className="text-sm">Generate a personalised meal plan based on your training</p>
              </div>
            )}

            {mealPlanLoading && (
              <div className="text-center py-6">
                <Loader className="animate-spin mx-auto mb-3 text-green-400" size={28} />
                <p className="text-sm text-gray-500">Creating your meal plan...</p>
              </div>
            )}

            {mealPlan && !mealPlanLoading && (
              <div className="prose prose-sm max-w-none">
                {mealPlan.split('\n').map((line: string, i: number) => {
                  if (line.startsWith('**') && line.endsWith('**')) return <h4 key={i} className="font-bold text-gray-900 mt-3 mb-1">{line.replace(/\*\*/g, '')}</h4>;
                  if (line.startsWith('- ')) return <p key={i} className="text-sm text-gray-700 ml-3 mb-1">{'\u2022'} {line.slice(2)}</p>;
                  if (line.trim() === '') return <div key={i} className="h-2" />;
                  const parts = line.split(/(\*\*.*?\*\*)/g);
                  return (<p key={i} className="text-sm text-gray-700 mb-1">{parts.map((part: string, j: number) => part.startsWith('**') && part.endsWith('**') ? <strong key={j}>{part.replace(/\*\*/g, '')}</strong> : part)}</p>);
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'log' && (
        <div className="space-y-3">
          {/* Today's Progress */}
          <div className="bg-white rounded-lg shadow p-4">
            <h3 className="font-bold text-lg mb-3">Today's Intake</h3>
            <div className="grid grid-cols-4 gap-2 mb-3">
              <div className="text-center">
                <div className="text-xs text-gray-500 mb-1">Calories</div>
                <div className={`text-lg font-bold ${totalCals >= targetCalories ? 'text-green-600' : 'text-gray-800'}`}>{totalCals}</div>
                <div className="text-xs text-gray-400">/ {targetCalories}</div>
                <div className="w-full bg-gray-200 rounded-full h-1.5 mt-1"><div className="bg-green-500 h-1.5 rounded-full" style={{ width: `${Math.min(100, (totalCals / targetCalories) * 100)}%` }} /></div>
              </div>
              <div className="text-center">
                <div className="text-xs text-gray-500 mb-1">Protein</div>
                <div className={`text-lg font-bold ${totalProtein >= targetProtein ? 'text-blue-600' : 'text-gray-800'}`}>{totalProtein}g</div>
                <div className="text-xs text-gray-400">/ {targetProtein}g</div>
                <div className="w-full bg-gray-200 rounded-full h-1.5 mt-1"><div className="bg-blue-500 h-1.5 rounded-full" style={{ width: `${Math.min(100, (totalProtein / targetProtein) * 100)}%` }} /></div>
              </div>
              <div className="text-center">
                <div className="text-xs text-gray-500 mb-1">Carbs</div>
                <div className={`text-lg font-bold ${totalCarbs >= targetCarbs ? 'text-orange-600' : 'text-gray-800'}`}>{totalCarbs}g</div>
                <div className="text-xs text-gray-400">/ {targetCarbs}g</div>
                <div className="w-full bg-gray-200 rounded-full h-1.5 mt-1"><div className="bg-orange-500 h-1.5 rounded-full" style={{ width: `${Math.min(100, (totalCarbs / targetCarbs) * 100)}%` }} /></div>
              </div>
              <div className="text-center">
                <div className="text-xs text-gray-500 mb-1">Fat</div>
                <div className={`text-lg font-bold ${totalFat >= targetFat ? 'text-purple-600' : 'text-gray-800'}`}>{totalFat}g</div>
                <div className="text-xs text-gray-400">/ {targetFat}g</div>
                <div className="w-full bg-gray-200 rounded-full h-1.5 mt-1"><div className="bg-purple-500 h-1.5 rounded-full" style={{ width: `${Math.min(100, (totalFat / targetFat) * 100)}%` }} /></div>
              </div>
            </div>
          </div>

          {/* Meals List */}
          <div className="bg-white rounded-lg shadow p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-bold">Meals</h3>
              <button onClick={() => setShowAddMeal(true)} className="flex items-center gap-1 px-3 py-1.5 bg-green-600 text-white rounded-lg text-sm font-semibold"><Plus size={14} /> Add Meal</button>
            </div>

            {todayMeals.length === 0 && !showAddMeal && (
              <p className="text-gray-400 text-sm text-center py-4">No meals logged today. Tap "Add Meal" to start tracking.</p>
            )}

            {todayMeals.map((meal) => (
              <div key={meal.id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg mb-2">
                <div className="flex-1">
                  <div className="font-semibold text-sm">{meal.food}</div>
                  <div className="text-xs text-gray-500">{meal.meal} • {meal.calories} kcal • P:{meal.protein}g C:{meal.carbs}g F:{meal.fat}g</div>
                </div>
                <button onClick={() => handleDeleteMeal(meal.id!)} className="text-red-400 hover:text-red-600"><X size={16} /></button>
              </div>
            ))}
          </div>

          {/* Add Meal Form */}
          {showAddMeal && (
            <div className="bg-white rounded-lg shadow p-4 space-y-3">
              <h3 className="font-bold">Add Meal</h3>
              <div>
                <label className="block text-sm font-medium mb-1">Meal</label>
                <select value={mealForm.meal} onChange={(e) => setMealForm({ ...mealForm, meal: e.target.value })} className="w-full p-3 border rounded-lg">
                  <option>Breakfast</option><option>Snack AM</option><option>Lunch</option><option>Snack PM</option><option>Dinner</option><option>Post-Workout</option>
                </select>
              </div>
              <div><label className="block text-sm font-medium mb-1">Food</label><input type="text" value={mealForm.food} onChange={(e) => setMealForm({ ...mealForm, food: e.target.value })} className="w-full p-3 border rounded-lg" placeholder="e.g. Chicken rice bowl" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="block text-sm font-medium mb-1">Calories</label><input type="number" value={mealForm.calories || ''} onChange={(e) => setMealForm({ ...mealForm, calories: +e.target.value })} className="w-full p-3 border rounded-lg" /></div>
                <div><label className="block text-sm font-medium mb-1">Protein (g)</label><input type="number" value={mealForm.protein || ''} onChange={(e) => setMealForm({ ...mealForm, protein: +e.target.value })} className="w-full p-3 border rounded-lg" /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="block text-sm font-medium mb-1">Carbs (g)</label><input type="number" value={mealForm.carbs || ''} onChange={(e) => setMealForm({ ...mealForm, carbs: +e.target.value })} className="w-full p-3 border rounded-lg" /></div>
                <div><label className="block text-sm font-medium mb-1">Fat (g)</label><input type="number" value={mealForm.fat || ''} onChange={(e) => setMealForm({ ...mealForm, fat: +e.target.value })} className="w-full p-3 border rounded-lg" /></div>
              </div>
              <div className="flex gap-2">
                <button onClick={() => setShowAddMeal(false)} className="flex-1 py-2 border rounded-lg font-semibold">Cancel</button>
                <button onClick={handleAddMeal} className="flex-1 py-2 bg-green-600 text-white rounded-lg font-semibold">Add</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// ============================================================================
// BOTTOM NAV — 6 tabs
// ============================================================================


// ============================================================================
// GYM SCREEN — Push/Pull/Legs Strength Tracker
// ============================================================================


// ============================================================================
// TYPES
// ============================================================================

interface GymExercise {
  id: string;
  slug: string;
  name: string;
  day_type: 'Push' | 'Pull' | 'Legs';
  primary_muscle: string;
  secondary_muscles: string[];
  equipment: string[];
  sort_order: number;
}

interface GymSet {
  id?: string;
  entry_id?: string;
  set_index: number;
  weight: number;
  reps: number;
  rpe?: number;
  is_warmup: boolean;
  notes?: string;
}

interface GymExerciseEntry {
  id?: string;
  session_id?: string;
  exercise_id: string;
  exercise?: GymExercise;
  order_index: number;
  notes?: string;
  sets: GymSet[];
  lastSession?: { date: string; sets: GymSet[] };
}

interface GymSession {
  id?: string;
  user_id?: string;
  date: string;
  day_type: 'Push' | 'Pull' | 'Legs';
  notes?: string;
  duration_minutes?: number;
  started_at?: string;
  completed_at?: string;
  entries?: GymExerciseEntry[];
}

interface GymTemplate {
  id: string;
  name: string;
  day_type: 'Push' | 'Pull' | 'Legs';
  exercises: { exercise_id: string; order_index: number }[];
}

// ============================================================================
// SVG MUSCLE ICONS
// ============================================================================

const EXERCISE_IMG_BASE = 'https://tvpzjylyickdmeurthxe.supabase.co/storage/v1/object/public/exercise-images';

const ExerciseImage = ({ exercise, size = 36 }: { exercise?: { slug?: string; day_type?: string; primary_muscle?: string }; size?: number }) => {
  const [failed, setFailed] = useState(false);
  const folder = exercise?.day_type?.toLowerCase() || '';
  const slug = exercise?.slug || '';
  const url = slug && folder ? `${EXERCISE_IMG_BASE}/${folder}/${slug}.jpg` : '';

  if (!url || failed) {
    // Fallback to emoji
    const muscle = exercise?.primary_muscle || '';
    const iconMap: Record<string, { emoji: string; color: string }> = {
      'Chest': { emoji: '🫁', color: '#ef4444' }, 'Upper Chest': { emoji: '🫁', color: '#f97316' },
      'Shoulders': { emoji: '🔵', color: '#3b82f6' }, 'Lateral Deltoid': { emoji: '🔵', color: '#6366f1' },
      'Rear Deltoid': { emoji: '🔵', color: '#a855f7' }, 'Triceps': { emoji: '💪', color: '#ec4899' },
      'Lats': { emoji: '🦅', color: '#0d9488' }, 'Middle Back': { emoji: '🔙', color: '#14b8a6' },
      'Biceps': { emoji: '💪', color: '#f59e0b' }, 'Quadriceps': { emoji: '🦵', color: '#ef4444' },
      'Hamstrings': { emoji: '🦵', color: '#f97316' }, 'Glutes': { emoji: '🍑', color: '#ec4899' },
      'Calves': { emoji: '🦶', color: '#6366f1' },
    };
    const icon = iconMap[muscle] || { emoji: '🏋️', color: '#6b7280' };
    return (
      <svg width={size} height={size} viewBox="0 0 40 40">
        <circle cx="20" cy="20" r="18" fill={icon.color} opacity="0.15" />
        <circle cx="20" cy="20" r="18" fill="none" stroke={icon.color} strokeWidth="2" opacity="0.4" />
        <text x="20" y="26" textAnchor="middle" fontSize="16">{icon.emoji}</text>
      </svg>
    );
  }

  return (
    <img src={url} alt={exercise?.slug || ''} onError={() => setFailed(true)}
      style={{ width: size, height: size, borderRadius: size > 36 ? 10 : 8, objectFit: 'cover' }} />
  );
};

// Equipment badge
const EquipmentBadge = ({ equipment }: { equipment: string | string[] }) => {
  const colors: Record<string, string> = {
    'Barbell': 'bg-red-100 text-red-700',
    'Dumbbells': 'bg-blue-100 text-blue-700',
    'Dumbbell': 'bg-blue-100 text-blue-700',
    'Cable Machine': 'bg-purple-100 text-purple-700',
    'Cable': 'bg-purple-100 text-purple-700',
    'Machine': 'bg-green-100 text-green-700',
    'Smith Machine': 'bg-green-100 text-green-700',
    'Leg Press Machine': 'bg-green-100 text-green-700',
    'Bodyweight': 'bg-gray-100 text-gray-700',
    'Bench': 'bg-amber-100 text-amber-700',
    'Rack': 'bg-orange-100 text-orange-700',
    'Pull-Up Bar': 'bg-indigo-100 text-indigo-700',
  };
  const items = Array.isArray(equipment) ? equipment : [equipment];
  const primary = items[0] || '';
  return (
    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${colors[primary] || 'bg-gray-100 text-gray-600'}`}>
      {primary}
    </span>
  );
};

// ============================================================================
// MAIN GYM SCREEN
// ============================================================================

const GymScreen = ({ supabase, user }: { supabase: any; user: any }) => {
  const [view, setView] = useState<'home' | 'workout' | 'history' | 'session-detail'>('home');
  const [exercises, setExercises] = useState<GymExercise[]>([]);
  const [activeSession, setActiveSession] = useState<GymSession | null>(null);
  const [sessionEntries, setSessionEntries] = useState<GymExerciseEntry[]>([]);
  const [pastSessions, setPastSessions] = useState<GymSession[]>([]);
  const [recentSessions, setRecentSessions] = useState<GymSession[]>([]);
  const [templates, setTemplates] = useState<GymTemplate[]>([]);
  const [showExercisePicker, setShowExercisePicker] = useState(false);
  const [expandedEntry, setExpandedEntry] = useState<string | null>(null);
  const [viewingSession, setViewingSession] = useState<GymSession | null>(null);
  const [viewingEntries, setViewingEntries] = useState<GymExerciseEntry[]>([]);
  const [sessionTimer, setSessionTimer] = useState(0);
  const [timerInterval, setTimerIntervalState] = useState<any>(null);

  // Load exercises on mount
  useEffect(() => {
    loadExercises();
    loadPastSessions();
    loadRecentSessions();
    loadTemplates();
  }, []);

  // Session timer
  useEffect(() => {
    if (activeSession && !timerInterval) {
      const start = new Date(activeSession.started_at || Date.now()).getTime();
      const interval = setInterval(() => {
        setSessionTimer(Math.floor((Date.now() - start) / 1000));
      }, 1000);
      setTimerIntervalState(interval);
    }
    return () => { if (timerInterval) clearInterval(timerInterval); };
  }, [activeSession]);

  const loadExercises = async () => {
    const { data } = await supabase.from('gym_exercises').select('*').order('sort_order');
    if (data) setExercises(data);
  };

  const loadPastSessions = async () => {
    const { data } = await supabase.from('gym_sessions')
      .select('*')
      .eq('user_id', user.id)
      .not('completed_at', 'is', null)
      .order('date', { ascending: false })
      .limit(50);
    if (data) setPastSessions(data);
  };

  const loadRecentSessions = async () => {
    const { data } = await supabase.from('gym_sessions')
      .select('*')
      .eq('user_id', user.id)
      .is('completed_at', null)
      .order('date', { ascending: false })
      .limit(10);
    if (data) setRecentSessions(data);
  };

  const loadTemplates = async () => {
    const { data } = await supabase.from('gym_templates')
      .select('*, gym_template_exercises(*)')
      .eq('user_id', user.id);
    if (data) setTemplates(data.map((t: any) => ({
      ...t,
      exercises: (t.gym_template_exercises || []).sort((a: any, b: any) => a.order_index - b.order_index),
    })));
  };

  // ========== START WORKOUT ==========
  const startWorkout = async (dayType: 'Push' | 'Pull' | 'Legs', template?: GymTemplate) => {
    const { data: session } = await supabase.from('gym_sessions').insert({
      user_id: user.id,
      date: new Date().toISOString().split('T')[0],
      day_type: dayType,
      started_at: new Date().toISOString(),
    }).select().single();

    if (!session) return;
    setActiveSession(session);
    setSessionTimer(0);

    // If template, pre-populate exercises
    if (template) {
      const entries: GymExerciseEntry[] = [];
      for (const te of template.exercises) {
        const exercise = exercises.find(e => e.id === te.exercise_id);
        if (!exercise) continue;

        const { data: entry } = await supabase.from('gym_exercise_entries').insert({
          session_id: session.id,
          exercise_id: te.exercise_id,
          order_index: te.order_index,
        }).select().single();

        if (entry) {
          const lastSession = await getLastSession(te.exercise_id);
          entries.push({ ...entry, exercise, sets: [], lastSession });
        }
      }
      setSessionEntries(entries);
    } else {
      setSessionEntries([]);
    }

    setView('workout');
  };

  // ========== GET LAST SESSION FOR EXERCISE ==========
  const getLastSession = async (exerciseId: string): Promise<{ date: string; sets: GymSet[] } | undefined> => {
    // Find the most recent entry for this exercise (not in current session)
    const { data: entries } = await supabase.from('gym_exercise_entries')
      .select('id, session_id, gym_sessions!inner(date, user_id, id)')
      .eq('exercise_id', exerciseId)
      .eq('gym_sessions.user_id', user.id)
      .order('gym_sessions(date)', { ascending: false })
      .limit(5);

    if (!entries || entries.length === 0) return undefined;

    // Find first entry not from current session
    const pastEntry = entries.find((e: any) =>
      !activeSession || e.session_id !== activeSession.id
    );
    if (!pastEntry) return undefined;

    const { data: sets } = await supabase.from('gym_sets')
      .select('*')
      .eq('entry_id', pastEntry.id)
      .order('set_index');

    return {
      date: (pastEntry as any).gym_sessions?.date || '',
      sets: sets || [],
    };
  };

  // ========== ADD EXERCISE TO SESSION ==========
  const addExercise = async (exercise: GymExercise) => {
    if (!activeSession) return;

    const { data: entry } = await supabase.from('gym_exercise_entries').insert({
      session_id: activeSession.id,
      exercise_id: exercise.id,
      order_index: sessionEntries.length,
    }).select().single();

    if (entry) {
      const lastSession = await getLastSession(exercise.id);
      setSessionEntries(prev => [...prev, { ...entry, exercise, sets: [], lastSession }]);
    }
    setShowExercisePicker(false);
  };

  // ========== ADD SET ==========
  const addSet = async (entryIndex: number) => {
    const entry = sessionEntries[entryIndex];
    if (!entry.id) return;

    // Pre-fill from last session or previous set
    let defaultWeight = 0;
    let defaultReps = 0;
    if (entry.sets.length > 0) {
      const lastSet = entry.sets[entry.sets.length - 1];
      defaultWeight = lastSet.weight;
      defaultReps = lastSet.reps;
    } else if (entry.lastSession && entry.lastSession.sets.length > 0) {
      const lastTopSet = entry.lastSession.sets.reduce((max, s) => s.weight > max.weight ? s : max, entry.lastSession.sets[0]);
      defaultWeight = lastTopSet.weight;
      defaultReps = lastTopSet.reps;
    }

    const newSet: GymSet = {
      set_index: entry.sets.length,
      weight: defaultWeight,
      reps: defaultReps,
      is_warmup: false,
    };

    const { data: inserted } = await supabase.from('gym_sets').insert({
      entry_id: entry.id,
      ...newSet,
    }).select().single();

    if (inserted) {
      setSessionEntries(prev => prev.map((e, i) =>
        i === entryIndex ? { ...e, sets: [...e.sets, inserted] } : e
      ));
    }
  };

  // ========== UPDATE SET ==========
  const updateSet = async (entryIndex: number, setIndex: number, field: string, value: any) => {
    const entry = sessionEntries[entryIndex];
    const set = entry.sets[setIndex];
    if (!set.id) return;

    await supabase.from('gym_sets').update({ [field]: value }).eq('id', set.id);

    setSessionEntries(prev => prev.map((e, i) =>
      i === entryIndex ? {
        ...e,
        sets: e.sets.map((s, j) => j === setIndex ? { ...s, [field]: value } : s)
      } : e
    ));
  };

  // ========== DELETE SET ==========
  const deleteSet = async (entryIndex: number, setIndex: number) => {
    const set = sessionEntries[entryIndex].sets[setIndex];
    if (!set.id) return;
    await supabase.from('gym_sets').delete().eq('id', set.id);
    setSessionEntries(prev => prev.map((e, i) =>
      i === entryIndex ? { ...e, sets: e.sets.filter((_, j) => j !== setIndex) } : e
    ));
  };

  // ========== FINISH WORKOUT ==========
  // Save workout as draft (recent) — NOT yet in history
  const saveWorkout = async () => {
    if (!activeSession) return;
    const totalSetsLogged = sessionEntries.reduce((sum, e) => sum + e.sets.length, 0);
    if (totalSetsLogged === 0) {
      
      await supabase.from('gym_sessions').delete().eq('id', activeSession.id);
    } else {
      // Save duration but DON'T set completed_at — keeps it as "draft/recent"
      const duration = Math.round(sessionTimer / 60);
      await supabase.from('gym_sessions').update({
        duration_minutes: duration,
      }).eq('id', activeSession.id);
    }

    if (timerInterval) clearInterval(timerInterval);
    setTimerIntervalState(null);
    setActiveSession(null);
    setSessionEntries([]);
    setView('home');
    loadRecentSessions();
    loadPastSessions();
  };

  // Submit a draft session to history (confirm it)
  const submitToHistory = async (sessionId: string) => {
    
    await supabase.from('gym_sessions').update({
      completed_at: new Date().toISOString(),
    }).eq('id', sessionId);
    loadRecentSessions();
    loadPastSessions();
  };

  // Delete a draft or confirmed session
  const deleteGymSession = async (sessionId: string) => {
    
    await supabase.from('gym_sessions').delete().eq('id', sessionId);
    loadRecentSessions();
    loadPastSessions();
    if (viewingSession?.id === sessionId) {
      setViewingSession(null);
      setView('home');
    }
  };

  const discardWorkout = async () => {
    if (!activeSession) return;
    
    await supabase.from('gym_sessions').delete().eq('id', activeSession.id);
    if (timerInterval) clearInterval(timerInterval);
    setTimerIntervalState(null);
    setActiveSession(null);
    setSessionEntries([]);
    setView('home');
  };

  // ========== SAVE AS TEMPLATE ==========
  const saveAsTemplate = async () => {
    if (!activeSession || sessionEntries.length === 0) return;
    const name = prompt(`Template name (e.g. "${activeSession.day_type} A"):`);
    if (!name) return;

    const { data: template } = await supabase.from('gym_templates').insert({
      user_id: user.id,
      name,
      day_type: activeSession.day_type,
    }).select().single();

    if (template) {
      for (const entry of sessionEntries) {
        await supabase.from('gym_template_exercises').insert({
          template_id: template.id,
          exercise_id: entry.exercise_id,
          order_index: entry.order_index,
        });
      }
      loadTemplates();
    }
  };

  // ========== VIEW PAST SESSION ==========
  const viewSession = async (session: GymSession) => {
    const { data: entries } = await supabase.from('gym_exercise_entries')
      .select('*, gym_exercises(*)')
      .eq('session_id', session.id)
      .order('order_index');

    if (entries) {
      const entriesWithSets: GymExerciseEntry[] = [];
      for (const entry of entries) {
        const { data: sets } = await supabase.from('gym_sets')
          .select('*')
          .eq('entry_id', entry.id)
          .order('set_index');
        entriesWithSets.push({
          ...entry,
          exercise: entry.gym_exercises,
          sets: sets || [],
        });
      }
      setViewingSession(session);
      setViewingEntries(entriesWithSets);
      setView('session-detail');
    }
  };

  // Format timer
  const formatTimer = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr + 'T00:00:00');
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    return `${days[d.getDay()]} ${d.getDate()} ${months[d.getMonth()]}`;
  };

  const dayTypeColors = {
    Push: { bg: 'bg-red-500', light: 'bg-red-50', text: 'text-red-700', ring: 'ring-red-200' },
    Pull: { bg: 'bg-blue-500', light: 'bg-blue-50', text: 'text-blue-700', ring: 'ring-blue-200' },
    Legs: { bg: 'bg-green-500', light: 'bg-green-50', text: 'text-green-700', ring: 'ring-green-200' },
  };

  const dayTypeImages: Record<string, string> = {
    Push: `${EXERCISE_IMG_BASE}/day-types/push.jpg`,
    Pull: `${EXERCISE_IMG_BASE}/day-types/pull.jpg`,
    Legs: `${EXERCISE_IMG_BASE}/day-types/legs.jpg`,
  };

  // ========================================================================
  // HOME VIEW
  // ========================================================================
  if (view === 'home') {
    const dayTypes: ('Push' | 'Pull' | 'Legs')[] = ['Push', 'Pull', 'Legs'];
    const recentByType = dayTypes.map(dt => ({
      type: dt,
      last: pastSessions.find(s => s.day_type === dt),
    }));

    return (
      <div className="p-4 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold text-gray-900">Gym</h2>
          <button onClick={() => setView('history')} className="text-sm text-blue-600 font-semibold">History →</button>
        </div>

        {/* Start Workout */}
        <div className="space-y-3">
          <p className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Start Workout</p>
          {dayTypes.map(dt => {
            const c = dayTypeColors[dt];
            const last = recentByType.find(r => r.type === dt)?.last;
            const dayTemplates = templates.filter(t => t.day_type === dt);
            return (
              <div key={dt} className={`bg-white rounded-xl shadow-sm overflow-hidden ring-1 ${c.ring}`}>
                <button onClick={() => startWorkout(dt)}
                  className="w-full p-4 flex items-center gap-4 hover:bg-gray-50 transition-colors">
                  <img src={dayTypeImages[dt]} alt={dt} className="w-14 h-14 rounded-xl object-cover" />
                  <div className="flex-1 text-left">
                    <div className="font-bold text-gray-900">{dt} Day</div>
                    <div className="text-xs text-gray-500">
                      {last ? `Last: ${formatDate(last.date)}${last.duration_minutes ? ` • ${last.duration_minutes}min` : ''}` : 'No sessions yet'}
                    </div>
                  </div>
                  <div className="text-gray-300 text-xl">→</div>
                </button>
                {dayTemplates.length > 0 && (
                  <div className="border-t px-4 py-2 flex gap-2 overflow-x-auto">
                    {dayTemplates.map(t => (
                      <button key={t.id} onClick={() => startWorkout(dt, t)}
                        className={`${c.light} ${c.text} text-xs font-semibold px-3 py-1.5 rounded-lg whitespace-nowrap hover:opacity-80`}>
                        📋 {t.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Recent (Draft) Workouts — not yet submitted to history */}
        {recentSessions.length > 0 && (
          <div>
            <p className="text-sm font-semibold text-amber-600 uppercase tracking-wide mb-2">📝 Recent Training (unsaved)</p>
            {recentSessions.map(s => {
              const c = dayTypeColors[s.day_type as keyof typeof dayTypeColors];
              return (
                <div key={s.id} className="flex items-center gap-3 p-3 bg-amber-50 rounded-lg shadow-sm mb-2 ring-1 ring-amber-200">
                  <img src={dayTypeImages[s.day_type as string] || ''} alt={s.day_type} className="w-10 h-10 rounded-lg object-cover" />
                  <button onClick={() => viewSession(s)} className="flex-1 text-left">
                    <div className="font-semibold text-sm">{s.day_type} Day</div>
                    <div className="text-xs text-gray-500">{formatDate(s.date)}{s.duration_minutes ? ` • ${s.duration_minutes}min` : ''}</div>
                  </button>
                  <button onClick={() => submitToHistory(s.id!)} className="px-2 py-1.5 bg-green-100 text-green-700 text-xs font-bold rounded-lg hover:bg-green-200">✅ Save</button>
                  <button onClick={() => deleteGymSession(s.id!)} className="px-2 py-1.5 bg-red-50 text-red-400 text-xs font-bold rounded-lg hover:bg-red-100">🗑️</button>
                </div>
              );
            })}
          </div>
        )}

        {/* Confirmed History */}
        {pastSessions.length > 0 && (
          <div>
            <p className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">History</p>
            {pastSessions.slice(0, 5).map(s => {
              const c = dayTypeColors[s.day_type as keyof typeof dayTypeColors];
              return (
                <button key={s.id} onClick={() => viewSession(s)}
                  className="w-full flex items-center gap-3 p-3 bg-white rounded-lg shadow-sm mb-2 hover:bg-gray-50">
                  <img src={dayTypeImages[s.day_type as string] || ''} alt={s.day_type} className="w-10 h-10 rounded-lg object-cover" />
                  <div className="flex-1 text-left">
                    <div className="font-semibold text-sm">{s.day_type} Day</div>
                    <div className="text-xs text-gray-500">{formatDate(s.date)}</div>
                  </div>
                  {s.duration_minutes && <div className="text-xs text-gray-400">{s.duration_minutes}min</div>}
                </button>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // ========================================================================
  // ACTIVE WORKOUT VIEW
  // ========================================================================
  if (view === 'workout' && activeSession) {
    const c = dayTypeColors[activeSession.day_type as keyof typeof dayTypeColors];
    const filteredExercises = exercises.filter(e => e.day_type === activeSession.day_type);
    const usedIds = sessionEntries.map(e => e.exercise_id);
    const availableExercises = filteredExercises.filter(e => !usedIds.includes(e.id));

    return (
      <div className="p-4 space-y-3 pb-24">
        {/* Header */}
        <div className={`${c.bg} text-white rounded-xl p-4`}>
          <div className="flex items-center justify-between mb-3">
            <button onClick={discardWorkout} className="flex items-center gap-1 text-sm opacity-80 hover:opacity-100">
              <ArrowLeft size={16} /> Back
            </button>
            <button onClick={saveWorkout} className="flex items-center gap-1 px-3 py-1.5 bg-white bg-opacity-20 rounded-lg text-sm font-bold hover:bg-opacity-30">
              <Save size={14} /> Save Workout
            </button>
          </div>
          <div className="flex items-center justify-between">
            <div>
              <div className="font-bold text-lg">{activeSession.day_type} Day</div>
              <div className="text-sm opacity-80">{formatDate(activeSession.date)}</div>
            </div>
            <div className="text-right">
              <div className="text-2xl font-mono font-bold">{formatTimer(sessionTimer)}</div>
              <div className="text-xs opacity-70">{sessionEntries.length} exercises</div>
            </div>
          </div>
        </div>

        {/* Exercise Entries */}
        {sessionEntries.map((entry, entryIndex) => (
          <div key={entry.id || entryIndex} className="bg-white rounded-xl shadow-sm overflow-hidden">
            {/* Exercise header */}
            <button onClick={() => setExpandedEntry(expandedEntry === entry.id ? null : entry.id || null)}
              className="w-full p-3 flex items-center gap-3 hover:bg-gray-50">
              <ExerciseImage exercise={entry.exercise} size={36} />
              <div className="flex-1 text-left">
                <div className="font-bold text-sm">{entry.exercise?.name}</div>
                <div className="flex items-center gap-2 mt-0.5">
                  <EquipmentBadge equipment={entry.exercise?.equipment || ''} />
                  <span className="text-[10px] text-gray-400">{entry.sets.length} sets</span>
                  {entry.sets.length > 0 && (
                    <span className="text-[10px] text-gray-500 font-semibold">
                      Top: {Math.max(...entry.sets.map(s => s.weight))}kg × {entry.sets.find(s => s.weight === Math.max(...entry.sets.map(s => s.weight)))?.reps}
                    </span>
                  )}
                </div>
              </div>
              <span className="text-gray-300">{expandedEntry === entry.id ? '▲' : '▼'}</span>
            </button>

            {/* Expanded: Last time + sets */}
            {expandedEntry === entry.id && (
              <div className="border-t">
                {/* Last time you did this */}
                {entry.lastSession && (
                  <div className="bg-amber-50 px-3 py-2 border-b border-amber-100">
                    <div className="text-[10px] font-bold text-amber-700 uppercase tracking-wide mb-1">
                      📊 Last time — {formatDate(entry.lastSession.date)}
                    </div>
                    <div className="flex gap-3 flex-wrap">
                      {entry.lastSession.sets.map((s, i) => (
                        <div key={i} className="text-xs text-amber-800">
                          <span className="font-semibold">{s.weight}kg</span> × {s.reps}
                          {s.rpe ? <span className="text-amber-500 ml-1">@{s.rpe}</span> : ''}
                        </div>
                      ))}
                    </div>
                    {entry.lastSession.sets.length > 0 && (
                      <div className="text-[10px] text-amber-600 mt-1">
                        Top set: {Math.max(...entry.lastSession.sets.map(s => s.weight))}kg ×{' '}
                        {entry.lastSession.sets.find(s => s.weight === Math.max(...entry.lastSession.sets.map(s => s.weight)))?.reps}
                      </div>
                    )}
                  </div>
                )}

                {/* Sets table */}
                <div className="px-3 py-2">
                  {entry.sets.length > 0 && (
                    <div className="grid grid-cols-12 gap-1 text-[10px] text-gray-400 font-bold uppercase mb-1 px-1">
                      <div className="col-span-1">#</div>
                      <div className="col-span-4">Weight (kg)</div>
                      <div className="col-span-3">Reps</div>
                      <div className="col-span-2">RPE</div>
                      <div className="col-span-2"></div>
                    </div>
                  )}
                  {entry.sets.map((set, setIndex) => (
                    <div key={set.id || setIndex} className="grid grid-cols-12 gap-1 items-center mb-1">
                      <div className="col-span-1 text-xs text-gray-400 font-bold">{setIndex + 1}</div>
                      <div className="col-span-4">
                        <input type="number" value={set.weight || ''} step="0.5"
                          onChange={(e) => updateSet(entryIndex, setIndex, 'weight', parseFloat(e.target.value) || 0)}
                          className="w-full p-1.5 border rounded text-sm text-center font-semibold" />
                      </div>
                      <div className="col-span-3">
                        <input type="number" value={set.reps || ''}
                          onChange={(e) => updateSet(entryIndex, setIndex, 'reps', parseInt(e.target.value) || 0)}
                          className="w-full p-1.5 border rounded text-sm text-center font-semibold" />
                      </div>
                      <div className="col-span-2">
                        <input type="number" value={set.rpe || ''} step="0.5" min="1" max="10"
                          onChange={(e) => updateSet(entryIndex, setIndex, 'rpe', parseFloat(e.target.value) || null)}
                          className="w-full p-1.5 border rounded text-sm text-center text-gray-500" placeholder="—" />
                      </div>
                      <div className="col-span-2 text-right">
                        <button onClick={() => deleteSet(entryIndex, setIndex)}
                          className="text-red-300 hover:text-red-500 text-xs px-1">✕</button>
                      </div>
                    </div>
                  ))}
                  <button onClick={() => addSet(entryIndex)}
                    className="w-full mt-1 py-2 border-2 border-dashed border-gray-200 rounded-lg text-sm text-gray-500 font-semibold hover:border-blue-300 hover:text-blue-500">
                    + Add Set
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}

        {/* Add Exercise Button */}
        <button onClick={() => setShowExercisePicker(true)}
          className={`w-full py-3 ${c.light} ${c.text} rounded-xl font-bold text-sm hover:opacity-80`}>
          + Add Exercise
        </button>

        {/* Bottom Actions */}
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t p-3 flex gap-2" style={{ maxWidth: 480, margin: '0 auto' }}>
          <button onClick={discardWorkout}
            className="py-3 px-3 border border-red-200 rounded-xl text-xs font-semibold text-red-400 hover:bg-red-50">
            🗑️
          </button>
          <button onClick={saveAsTemplate}
            className="py-3 px-3 border rounded-xl text-sm font-semibold text-gray-600 hover:bg-gray-50">
            💾
          </button>
          <button onClick={saveWorkout}
            className={`flex-1 py-3 ${c.bg} text-white rounded-xl text-sm font-bold hover:opacity-90`}>
            💾 Save Workout
          </button>
        </div>

        {/* Exercise Picker Modal */}
        {showExercisePicker && (
          <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-end" onClick={() => setShowExercisePicker(false)}>
            <div className="bg-white rounded-t-2xl w-full max-h-[70vh] overflow-y-auto" onClick={(e: any) => e.stopPropagation()}>
              <div className="sticky top-0 bg-white p-4 border-b">
                <div className="w-10 h-1 bg-gray-300 rounded-full mx-auto mb-3" />
                <h3 className="font-bold text-lg">Add {activeSession.day_type} Exercise</h3>
                <p className="text-xs text-gray-500">{availableExercises.length} exercises available</p>
              </div>
              <div className="p-2">
                {availableExercises.map(ex => (
                  <button key={ex.id} onClick={() => addExercise(ex)}
                    className="w-full flex items-center gap-3 p-3 hover:bg-gray-50 rounded-lg">
                    <ExerciseImage exercise={ex} size={40} />
                    <div className="flex-1 text-left">
                      <div className="font-semibold text-sm">{ex.name}</div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[10px] text-gray-500">{ex.primary_muscle}</span>
                        <EquipmentBadge equipment={ex.equipment} />
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ========================================================================
  // HISTORY VIEW
  // ========================================================================
  if (view === 'history') {
    // Group by month
    const grouped: Record<string, GymSession[]> = {};
    pastSessions.forEach(s => {
      const key = s.date.substring(0, 7); // YYYY-MM
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(s);
    });

    return (
      <div className="p-4 space-y-4">
        <div className="flex items-center gap-3">
          <button onClick={() => setView('home')} className="p-2 hover:bg-gray-100 rounded-lg">←</button>
          <h2 className="text-xl font-bold text-gray-900">Workout History</h2>
        </div>

        {Object.keys(grouped).length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            <div className="text-4xl mb-3">🏋️</div>
            <div className="font-semibold">No workouts yet</div>
            <div className="text-sm">Start your first session!</div>
          </div>
        ) : (
          Object.entries(grouped).map(([month, sessions]) => {
            const d = new Date(month + '-01');
            const monthName = d.toLocaleString('default', { month: 'long', year: 'numeric' });
            return (
              <div key={month}>
                <p className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">{monthName}</p>
                {sessions.map(s => {
                  const c = dayTypeColors[s.day_type as keyof typeof dayTypeColors];
                  return (
                    <button key={s.id} onClick={() => viewSession(s)}
                      className="w-full flex items-center gap-3 p-3 bg-white rounded-lg shadow-sm mb-2 hover:bg-gray-50">
                      <img src={dayTypeImages[s.day_type as string] || ''} alt={s.day_type} className="w-10 h-10 rounded-lg object-cover" />
                      <div className="flex-1 text-left">
                        <div className="font-semibold text-sm">{s.day_type} Day</div>
                        <div className="text-xs text-gray-500">{formatDate(s.date)}</div>
                      </div>
                      {s.duration_minutes && <div className="text-xs text-gray-400">{s.duration_minutes}min</div>}
                      <span className="text-gray-300">→</span>
                    </button>
                  );
                })}
              </div>
            );
          })
        )}
      </div>
    );
  }

  // ========================================================================
  // SESSION DETAIL VIEW
  // ========================================================================
  // Delete a gym session
  const deleteSession = async (sessionId: string) => {
    
    await supabase.from('gym_sessions').delete().eq('id', sessionId);
    setPastSessions(prev => prev.filter(s => s.id !== sessionId));
    setRecentSessions(prev => prev.filter(s => s.id !== sessionId));
    setViewingSession(null);
    setView('home');
  };

  if (view === 'session-detail' && viewingSession) {
    const c = dayTypeColors[viewingSession.day_type as keyof typeof dayTypeColors];
    const totalSets = viewingEntries.reduce((sum, e) => sum + e.sets.length, 0);
    const totalVolume = viewingEntries.reduce((sum, e) =>
      sum + e.sets.reduce((s, set) => s + set.weight * set.reps, 0), 0
    );

    return (
      <div className="p-4 space-y-3">
        <div className="flex items-center gap-3">
          <button onClick={() => setView('history')} className="p-2 hover:bg-gray-100 rounded-lg"><ArrowLeft size={18} /></button>
          <h2 className="text-xl font-bold text-gray-900 flex-1">Session Detail</h2>
          <button onClick={() => deleteSession(viewingSession.id!)} className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg text-sm">🗑️</button>
        </div>

        <div className={`${c.bg} text-white rounded-xl p-4`}>
          <div className="flex items-center gap-3">
            <img src={dayTypeImages[viewingSession.day_type] || ''} alt="" className="w-12 h-12 rounded-lg object-cover opacity-80" />
            <div>
              <div className="font-bold text-lg">{viewingSession.day_type} Day</div>
              <div className="text-sm opacity-80">{formatDate(viewingSession.date)}</div>
            </div>
          </div>
          <div className="flex gap-4 mt-2 text-sm opacity-80">
            {viewingSession.duration_minutes && <span>⏱ {viewingSession.duration_minutes}min</span>}
            <span>💪 {viewingEntries.length} exercises</span>
            <span>📊 {totalSets} sets</span>
          </div>
          <div className="text-xs mt-1 opacity-60">Volume: {Math.round(totalVolume).toLocaleString()}kg</div>
          {!viewingSession.completed_at && (
            <div className="mt-2 text-xs text-amber-200">⚠️ Draft — not yet saved to history</div>
          )}
        </div>

        {!viewingSession.completed_at && (
          <button onClick={() => submitToHistory(viewingSession.id!)}
            className="w-full py-3 bg-green-500 text-white rounded-xl text-sm font-bold hover:bg-green-600">
            ✅ Submit to History
          </button>
        )}

        {viewingEntries.map((entry, i) => (
          <div key={i} className="bg-white rounded-xl shadow-sm overflow-hidden">
            <div className="p-3 flex items-center gap-3 border-b">
              <ExerciseImage exercise={entry.exercise} size={32} />
              <div>
                <div className="font-bold text-sm">{entry.exercise?.name}</div>
                <EquipmentBadge equipment={entry.exercise?.equipment || ''} />
              </div>
            </div>
            <div className="px-3 py-2">
              {entry.sets.map((set, j) => (
                <div key={j} className="flex items-center gap-4 py-1 text-sm">
                  <span className="text-gray-400 font-bold w-6">{j + 1}</span>
                  <span className="font-semibold">{set.weight}kg</span>
                  <span>× {set.reps}</span>
                  {set.rpe && <span className="text-gray-400">@{set.rpe}</span>}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  }

  return null;
};

const BottomNav = ({ activeTab, setActiveTab }: { activeTab: string; setActiveTab: (t: string) => void }) => (
  <div className="fixed bottom-0 left-0 right-0 bg-white border-t shadow-lg">
    <div className="grid grid-cols-7 gap-0.5 p-1.5">
      {[
        { id: 'home', icon: TrendingUp, label: 'Home' },
        { id: 'calendar', icon: Calendar, label: 'Calendar' },
        { id: 'log', icon: Plus, label: 'Log' },
        { id: 'plan', icon: Target, label: 'Plan' },
        { id: 'gym', icon: Dumbbell, label: 'Gym' },
        { id: 'nutrition', icon: UtensilsCrossed, label: 'Food' },
        { id: 'coach', icon: Brain, label: 'Coach' },
      ].map(({ id, icon: Icon, label }) => (
        <button key={id} onClick={() => setActiveTab(id)}
          className={`flex flex-col items-center py-1.5 px-0.5 rounded ${activeTab === id ? 'bg-blue-100 text-blue-600' : 'text-gray-600'}`}>
          <Icon size={id === 'log' ? 22 : 18} />
          <span className="text-[9px] mt-0.5">{label}</span>
        </button>
      ))}
    </div>
  </div>
);

export default ProFitAgentV5;
