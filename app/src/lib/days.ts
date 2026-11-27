// Pure day-log logic. No React Native imports, so it can be tested with plain Node.

export interface DayEntry {
  caps?: boolean;
  pouches?: number;
  habits?: string[];
  /** When this day was last changed, ms since epoch. Used to merge with the server. */
  t?: number;
}
export type DayLog = Record<string, DayEntry>;

export const KEEP_DAYS = 400;

/** Local calendar date as YYYY-MM-DD. A day is the user's day, not UTC's. */
export function dateKey(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

export function addDays(key: string, n: number): string {
  const [y, m, d] = key.split("-").map(Number);
  return dateKey(new Date(y!, m! - 1, d! + n));
}

export function daysBetween(fromKey: string, toKey: string): number {
  const [y1, m1, d1] = fromKey.split("-").map(Number);
  const [y2, m2, d2] = toKey.split("-").map(Number);
  return Math.round((Date.UTC(y2!, m2! - 1, d2!) - Date.UTC(y1!, m1! - 1, d1!)) / 86_400_000);
}

/** A day counts once the main thing got done: caps taken, or at least one pouch logged. */
export function checkedIn(e: DayEntry | undefined): boolean {
  return Boolean(e && (e.caps || (e.pouches ?? 0) > 0));
}

const nextDay = (key: string) => addDays(key, 1);

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

const checkedDays = (log: DayLog) => Object.keys(log).filter((k) => checkedIn(log[k]));

/** The current streak, with streak saves applied. */
export function streak(log: DayLog, today: string): number {
  return streakState(checkedDays(log), today).streak;
}

/** Streak, best run, saves in hand and saved days, straight from the day log. */
export function streakInfo(log: DayLog, today: string): StreakState {
  return streakState(checkedDays(log), today);
}

export interface Rank {
  id: "pup" | "pack" | "hunter" | "alpha" | "nocurfew";
  /** Streak length that earns it. */
  days: number;
  name: string;
  /** Shown on the rank-up screen. */
  line: string;
}

/** Five ranks, each earned once on the longest streak and kept for good. */
export const RANKS: Rank[] = [
  { id: "pup", days: 7, name: "PUP", line: "You showed up for a week. That's more than most. Barely." },
  { id: "pack", days: 30, name: "PACK", line: "A month straight. Now it's a habit. Try not to let it go to your head." },
  { id: "hunter", days: 60, name: "HUNTER", line: "Most guys quit before this. You're not most guys." },
  { id: "alpha", days: 90, name: "ALPHA", line: "The full cycle. Done right. Take the crown." },
  { id: "nocurfew", days: 365, name: "NO CURFEW", line: "A year. Almost nobody gets here. Stay out as late as you want." },
];

export const BADGES: readonly number[] = RANKS.map((r) => r.days);

/** The highest rank their best streak has earned. Null before the first one. */
export function currentRank(best: number): Rank | null {
  return [...RANKS].reverse().find((r) => best >= r.days) ?? null;
}

/** The next rank to chase, how far off it is on the current streak, and progress from the last rank to it. */
export function nextRank(best: number, streakNow: number): { rank: Rank; left: number; progress: number } | null {
  const rank = RANKS.find((r) => r.days > best);
  if (!rank) return null;
  const from = currentRank(best)?.days ?? 0;
  const at = Math.max(from, Math.min(streakNow, rank.days));
  return { rank, left: Math.max(1, rank.days - streakNow), progress: (at - from) / (rank.days - from) };
}

export function nextBadge(current: number): number | null {
  return BADGES.find((b) => b > current) ?? null;
}

/** Day 1 is the first day they used the app. */
export function dayNumber(firstDay: string, today: string): number {
  return Math.max(1, daysBetween(firstDay, today) + 1);
}

export function prune(log: DayLog, today: string): DayLog {
  const cutoff = addDays(today, -KEEP_DAYS);
  const out: DayLog = {};
  for (const [k, v] of Object.entries(log)) if (k >= cutoff) out[k] = v;
  return out;
}

export function toggleHabit(e: DayEntry | undefined, habit: string): DayEntry {
  const have = new Set(e?.habits ?? []);
  if (have.has(habit)) have.delete(habit);
  else have.add(habit);
  return { ...e, habits: [...have] };
}

export function dayLine(n: number): string {
  if (n <= 3) return "Anyone can start. Starting is the easy part.";
  if (n <= 14) return "Two weeks is where the excuses show up. Don't answer the door.";
  if (n <= 30) return "Still here. Most guys aren't. Keep going.";
  if (n <= 60) return "This is where most guys go soft. You are not most guys. Prove it.";
  if (n <= 90) return "The home stretch. Finish what you started.";
  return "Past ninety. This is just who you are now.";
}

/** Whole calendar days from today until a moment in time. Never negative. */
export function daysUntil(whenMs: number, today: string): number {
  return Math.max(0, daysBetween(today, dateKey(new Date(whenMs))));
}

/** The earliest real start date we know of, as a day key. Null if we know none. */
export function earliestStart(starts: (number | null | undefined)[]): string | null {
  const known = starts.filter((s): s is number => typeof s === "number" && s > 0);
  return known.length ? dateKey(new Date(Math.min(...known))) : null;
}

export function inDays(n: number): string {
  if (n === 0) return "TODAY";
  return n === 1 ? "IN 1 DAY" : `IN ${n} DAYS`;
}

/** How a drop's deadline reads on its card. Null when it has no end. */
export function endsLabel(endsAt: number | null, nowMs: number): string | null {
  if (endsAt === null) return null;
  const left = endsAt - nowMs;
  if (left <= 0) return "ENDED";
  const hours = Math.ceil(left / 3_600_000);
  if (hours <= 1) return "ENDS WITHIN THE HOUR";
  if (hours < 48) return `ENDS IN ${hours} HOURS`;
  return `ENDS IN ${Math.floor(hours / 24)} DAYS`;
}

/** Tags a store link so app orders can be told apart. Leaves existing tags alone. */
export function tagLink(url: string): string {
  if (/[?&]utm_source=/.test(url)) return url;
  const [base, hash = ""] = url.split("#");
  const sep = base!.includes("?") ? "&" : "?";
  return `${base}${sep}utm_source=rivox_app&utm_medium=app&utm_campaign=drops${hash ? `#${hash}` : ""}`;
}

/** The longest run ever, with streak saves applied. Badges are earned on this, so a missed day never takes one back. */
export function bestStreak(log: DayLog, today: string): number {
  return streakState(checkedDays(log), today).best;
}

/** What to say about streak saves. Null when there's nothing worth saying. */
export function savesLine(state: StreakState, today: string): string | null {
  const yesterday = addDays(today, -1);
  const left = state.saves === 1 ? "1 save left." : `${state.saves} saves left.`;
  if (state.saved.includes(yesterday) && state.streak > 0) return `You missed yesterday. A save covered it. ${left}`;
  if (state.saves > 0) return state.saves === 1 ? "1 streak save banked." : `${state.saves} streak saves banked.`;
  return null;
}

/** The badge they hit today, if today's check-in is the one that got them there. */
export function badgeEarnedToday(log: DayLog, today: string): number | null {
  if (!checkedIn(log[today])) return null;
  const now = streak(log, today);
  return BADGES.includes(now) ? now : null;
}

/** Don't show a crowd number until there's a crowd. */
export const MIN_CROWD = 5;

export function crowdLine(count: number | null, doneToday: boolean): string | null {
  if (count === null) return null;
  const others = Math.max(0, count - (doneToday ? 1 : 0));
  if (others < MIN_CROWD) return null;
  return doneToday ? `You and ${others} others checked in today.` : `${others} beat you to it today.`;
}

/** The cheapest reward they can't afford yet, and how far along they are. Null when they can afford everything. */
export function nextReward<T extends { cost: number }>(points: number, rewards: T[]): { reward: T; left: number; progress: number } | null {
  const ahead = rewards.filter((r) => r.cost > points).sort((a, b) => a.cost - b.cost)[0];
  if (!ahead) return null;
  return { reward: ahead, left: ahead.cost - points, progress: Math.max(0, Math.min(1, points / ahead.cost)) };
}
