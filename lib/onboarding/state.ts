export const ONBOARDING_STORAGE_KEY = 'golfiq:onboarding:v1';
export const ONBOARDING_VERSION = 1;

export const ONBOARDING_GOALS = [
  'Break 100',
  'Break 90',
  'Break 80',
  'Play more consistently',
  "Find out where I'm losing strokes",
] as const;

export type OnboardingGoal = (typeof ONBOARDING_GOALS)[number];

export type OnboardingState = {
  version: 1;
  selectedGoal: OnboardingGoal | null;
  completed: boolean;
  completedAt: string | null;
  lastStep: number;
  source: string | null;
  startedAt: string | null;
};

const DEFAULT_STATE: OnboardingState = {
  version: ONBOARDING_VERSION,
  selectedGoal: null,
  completed: false,
  completedAt: null,
  lastStep: 1,
  source: null,
  startedAt: null,
};

function isGoal(value: unknown): value is OnboardingGoal {
  return ONBOARDING_GOALS.some((goal) => goal === value);
}

function toSafeStep(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 1;
  const rounded = Math.floor(value);
  return Math.min(5, Math.max(1, rounded));
}

function normalize(raw: unknown): OnboardingState {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_STATE };
  const source = raw as Record<string, unknown>;

  return {
    version: ONBOARDING_VERSION,
    selectedGoal: isGoal(source.selectedGoal) ? source.selectedGoal : null,
    completed: source.completed === true,
    completedAt: typeof source.completedAt === 'string' ? source.completedAt : null,
    lastStep: toSafeStep(source.lastStep),
    source: typeof source.source === 'string' ? source.source : null,
    startedAt: typeof source.startedAt === 'string' ? source.startedAt : null,
  };
}

export function readOnboardingState(): OnboardingState {
  if (typeof window === 'undefined') return { ...DEFAULT_STATE };
  try {
    const raw = window.localStorage.getItem(ONBOARDING_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_STATE };
    return normalize(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_STATE };
  }
}

export function writeOnboardingState(patch: Partial<OnboardingState>): OnboardingState {
  const nextState = normalize({
    ...readOnboardingState(),
    ...patch,
  });

  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(ONBOARDING_STORAGE_KEY, JSON.stringify(nextState));
    } catch {
      // Best effort only.
    }
  }

  return nextState;
}

export function markOnboardingCompleted(): OnboardingState {
  return writeOnboardingState({
    completed: true,
    completedAt: new Date().toISOString(),
    lastStep: 5,
  });
}

