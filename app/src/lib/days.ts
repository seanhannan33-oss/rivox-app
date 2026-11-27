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

/**
 * Consecutive checked-in days ending today. If today isn't done yet, the run
 * ending yesterday still stands, so the streak doesn't read 0 every morning.
 */
export function streak(log: DayLog, today: string): number {
  let cursor = checkedIn(log[today]) ? today : addDays(today, -1);
  let n = 0;
  while (checkedIn(log[cursor])) {
    n += 1;
    cursor = addDays(cursor, -1);
  }
  return n;
}

export const BADGES = [7, 14, 30, 60, 90, 180, 365] as const;

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
