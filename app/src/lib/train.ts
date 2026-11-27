// The training plan and its log. Pure logic, no React Native imports.
import { addDays, daysBetween } from "./days";

export type Move = "push" | "pull" | "legs";

export interface Session {
  move: Move;
  /** 0 = Sunday. */
  weekday: number;
  dayLabel: string;
  name: string;
  what: string;
  cue: string;
  /** Reps per set in week 1, added per week, and where it tops out. */
  base: number;
  step: number;
  cap: number;
}

export const SETS = 4;
export const REST_SECONDS = 45;

export const PLAN: Session[] = [
  {
    move: "push",
    weekday: 1,
    dayLabel: "Mon",
    name: "Push",
    what: "Push-ups.",
    cue: "On the driveway, where the neighbors can see. Elbows in, ego out.",
    base: 8,
    step: 2,
    cap: 30,
  },
  {
    move: "pull",
    weekday: 3,
    dayLabel: "Wed",
    name: "Pull",
    what: "Rows or pull-ups.",
    cue: "Find something to hang from. Chest to the bar. Kicking doesn't count.",
    base: 5,
    step: 1,
    cap: 15,
  },
  {
    move: "legs",
    weekday: 5,
    dayLabel: "Fri",
    name: "Legs",
    what: "Squats.",
    cue: "Hips below knees or it didn't happen. Nobody skips this one twice.",
    base: 12,
    step: 2,
    cap: 40,
  },
];

function parts(key: string): [number, number, number] {
  const [y, m, d] = key.split("-").map(Number);
  return [y!, m!, d!];
}

export function weekdayOf(key: string): number {
  const [y, m, d] = parts(key);
  return new Date(y, m - 1, d).getDay();
}

/** The Sunday that starts the week a day falls in. New weeks drop on Sunday. */
export function weekStart(key: string): string {
  return addDays(key, -weekdayOf(key));
}

/** Week 1 is the week they started. */
export function weekNumber(startKey: string, today: string): number {
  return Math.max(1, Math.round(daysBetween(weekStart(startKey), weekStart(today)) / 7) + 1);
}

export function daysToNextDrop(today: string): number {
  return 7 - weekdayOf(today);
}

export function repsFor(s: Session, week: number): number {
  return Math.min(s.cap, s.base + s.step * (Math.max(1, week) - 1));
}

export interface SessionLog {
  /** Sets finished so far. */
  sets: number;
  reps: number;
  /** Day key it was finished on. Missing until all sets are done. */
  doneOn?: string;
}
export type TrainLog = Record<string, SessionLog>;

export const sessionKey = (week: string, move: Move) => `${week}:${move}`;

export function isDone(log: SessionLog | undefined): boolean {
  return Boolean(log?.doneOn);
}

export type DayState = "done" | "today" | "owed" | "ahead";

export function stateOf(s: Session, log: SessionLog | undefined, todayWeekday: number): DayState {
  if (isDone(log)) return "done";
  if (s.weekday === todayWeekday) return "today";
  return s.weekday < todayWeekday ? "owed" : "ahead";
}

/**
 * What to put in front of them right now: today's session if it's a training
 * day and not done, otherwise the oldest one they skipped this week. Null
 * means there is nothing to do today.
 */
export function upNext(log: TrainLog, today: string): Session | null {
  const week = weekStart(today);
  const wd = weekdayOf(today);
  const open = PLAN.filter((s) => s.weekday <= wd && !isDone(log[sessionKey(week, s.move)]));
  return open.find((s) => s.weekday === wd) ?? open[0] ?? null;
}

/** The next session still ahead this week, for the rest-day message. */
export function comingUp(today: string): Session | null {
  const wd = weekdayOf(today);
  return PLAN.find((s) => s.weekday > wd) ?? null;
}

/** Marks one more set done. Finishing the last set finishes the session. */
export function logSet(prev: SessionLog | undefined, reps: number, today: string): SessionLog {
  const sets = Math.min(SETS, (prev?.sets ?? 0) + 1);
  return sets >= SETS ? { sets, reps, doneOn: prev?.doneOn ?? today } : { sets, reps };
}

export function undoSet(prev: SessionLog | undefined): SessionLog | undefined {
  if (!prev || prev.sets <= 0) return prev;
  const sets = prev.sets - 1;
  return sets === 0 ? undefined : { sets, reps: prev.reps };
}

/** Last week's result for the same session, only if they finished it. */
export function lastWeek(log: TrainLog, today: string, move: Move): SessionLog | null {
  const prev = log[sessionKey(addDays(weekStart(today), -7), move)];
  return prev && isDone(prev) ? prev : null;
}

export function clock(seconds: number): string {
  const s = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** Drop sessions older than about a year so the log can't grow forever. */
export function pruneTrain(log: TrainLog, today: string): TrainLog {
  const cutoff = addDays(today, -400);
  const out: TrainLog = {};
  for (const [k, v] of Object.entries(log)) if (k.slice(0, 10) >= cutoff) out[k] = v;
  return out;
}
