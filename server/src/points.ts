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

function prevDay(day: string): string {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/** Consecutive checked-in days ending on `day`. Zero if `day` itself isn't checked in. */
export function streakEnding(days: Iterable<string>, day: string): number {
  const set = new Set(days);
  let n = 0;
  let cursor = day;
  while (set.has(cursor)) {
    n += 1;
    cursor = prevDay(cursor);
  }
  return n;
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
