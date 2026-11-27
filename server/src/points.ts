// Points: earned by checking in, spent on rewards. Pure logic.

export interface Reward {
  id: string;
  title: string;
  /** One line shown under the title. */
  blurb: string;
  cost: number;
}

export interface PointsRules {
  /** Points for checking in on a day. */
  perCheckin: number;
  /** One-time bonus the first time a streak reaches each length. */
  streakBonus: Record<number, number>;
  rewards: Reward[];
}

export const DEFAULT_RULES: PointsRules = {
  perCheckin: 1,
  streakBonus: { 7: 2, 30: 3, 60: 5, 90: 10 },
  rewards: [
    {
      id: "five_off",
      title: "$5 OFF",
      blurb: "Five dollars off any one-time order.",
      cost: 60,
    },
    {
      id: "free_tin",
      title: "FREE TIN",
      blurb: "One tin of Focus Pouches on us. Any flavor.",
      cost: 90,
    },
  ],
};

function nextDay(day: string): string {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/** How many check-ins earn one streak save, and how many can be held at once. */
export const SAVE_EVERY = 14;
export const SAVE_MAX = 2;

export interface StreakState {
  /** Checked-in days in the current unbroken run. A saved day keeps the run alive but doesn't add to it. */
  streak: number;
  /** The longest run ever. */
  best: number;
  /** Streak saves in hand. */
  saves: number;
  /** Missed days a save covered. */
  saved: string[];
}

/**
 * Walks every day from the first check-in to `today` and works out the streak.
 * A missed day costs a save if one is in hand, otherwise it ends the run.
 * Today not being done yet is not a miss. The result depends only on which days
 * were checked in, so the phone and the server always agree.
 */
export function streakState(checkedDays: Iterable<string>, today: string): StreakState {
  const set = new Set(checkedDays);
  const first = [...set].sort()[0];
  const state: StreakState = { streak: 0, best: 0, saves: 0, saved: [] };
  if (!first || first > today) return state;
  let sinceSave = 0;
  for (let day = first; day <= today; day = nextDay(day)) {
    if (set.has(day)) {
      state.streak += 1;
      if (state.streak > state.best) state.best = state.streak;
      sinceSave += 1;
      if (sinceSave >= SAVE_EVERY && state.saves < SAVE_MAX) {
        state.saves += 1;
        sinceSave = 0;
      }
    } else if (day === today) {
      // Still time to check in.
    } else if (state.streak > 0 && state.saves > 0) {
      state.saves -= 1;
      state.saved.push(day);
    } else {
      state.streak = 0;
    }
  }
  return state;
}

/** Streak bonuses this streak qualifies for, as [length, points], smallest first. */
export function bonusesFor(streak: number, rules: PointsRules): [number, number][] {
  return Object.entries(rules.streakBonus)
    .map(([len, pts]) => [Number(len), pts] as [number, number])
    .filter(([len, pts]) => Number.isInteger(len) && len > 0 && pts > 0 && streak >= len)
    .sort((a, b) => a[0] - b[0]);
}

/** Reads optional overrides from settings. Bad values fall back to the defaults rather than break the server. */
export function rulesFromEnv(env: Record<string, string | undefined>): PointsRules {
  const rules: PointsRules = { ...DEFAULT_RULES, rewards: DEFAULT_RULES.rewards.map((r) => ({ ...r })) };
  const per = Number(env.POINTS_PER_CHECKIN);
  if (Number.isInteger(per) && per > 0 && per <= 100) rules.perCheckin = per;
  for (const [id, key] of [["five_off", "FIVE_OFF_COST"], ["free_tin", "FREE_TIN_COST"]] as const) {
    const cost = Number(env[key]);
    const reward = rules.rewards.find((r) => r.id === id);
    if (reward && Number.isInteger(cost) && cost > 0) reward.cost = cost;
  }
  if (env.STREAK_BONUS !== undefined) {
    // Format: "7:2,30:3". An empty value switches bonuses off.
    const parsed: Record<number, number> = {};
    for (const part of env.STREAK_BONUS.split(",")) {
      const [len, pts] = part.split(":").map((x) => Number(x.trim()));
      if (Number.isInteger(len) && Number.isInteger(pts) && len! > 0 && pts! > 0) parsed[len!] = pts!;
    }
    rules.streakBonus = parsed;
  }
  return rules;
}
