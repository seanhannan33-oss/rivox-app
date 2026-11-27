// Merging what's on the phone with what's on the server. Pure logic.
// Every record carries `t`, the time it was last changed, and the newer one wins.
import type { DayEntry, DayLog } from "./days";
import type { SessionLog, TrainLog } from "./train";

export interface DaysDoc {
  firstDay: string;
  log: DayLog;
}

const stamp = (v: { t?: number } | undefined) => (v && typeof v.t === "number" ? v.t : 0);

function mergeRecords<T extends { t?: number }>(local: Record<string, T>, remote: Record<string, T>): Record<string, T> {
  const out: Record<string, T> = { ...remote };
  for (const [k, v] of Object.entries(local)) {
    const other = remote[k];
    // On a tie the phone wins: it's what the person is looking at.
    if (!other || stamp(v) >= stamp(other)) out[k] = v;
  }
  return out;
}

export function mergeDays(local: DaysDoc, remote: DaysDoc): DaysDoc {
  return {
    firstDay: local.firstDay <= remote.firstDay ? local.firstDay : remote.firstDay,
    log: mergeRecords<DayEntry>(local.log, remote.log),
  };
}

export function mergeTrain(local: TrainLog, remote: TrainLog): TrainLog {
  return mergeRecords<SessionLog>(local, remote);
}

const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/;
const isObject = (v: unknown): v is Record<string, unknown> => Boolean(v) && typeof v === "object" && !Array.isArray(v);

/** Reads a days document from storage or the server. Anything malformed is dropped, not trusted. */
export function readDays(value: unknown): DaysDoc | null {
  if (!isObject(value) || typeof value.firstDay !== "string" || !DAY_KEY.test(value.firstDay) || !isObject(value.log)) {
    return null;
  }
  const log: DayLog = {};
  for (const [k, v] of Object.entries(value.log)) {
    if (!DAY_KEY.test(k) || !isObject(v)) continue;
    const e: DayEntry = {};
    if (typeof v.caps === "boolean") e.caps = v.caps;
    if (typeof v.pouches === "number" && Number.isFinite(v.pouches)) e.pouches = Math.max(0, Math.min(200, Math.round(v.pouches)));
    if (Array.isArray(v.habits)) e.habits = v.habits.filter((h): h is string => typeof h === "string").slice(0, 20);
    if (typeof v.t === "number" && Number.isFinite(v.t)) e.t = v.t;
    log[k] = e;
  }
  return { firstDay: value.firstDay, log };
}

const TRAIN_KEY = /^\d{4}-\d{2}-\d{2}:(push|pull|legs)$/;

export function readTrain(value: unknown): TrainLog | null {
  if (!isObject(value)) return null;
  const out: TrainLog = {};
  for (const [k, v] of Object.entries(value)) {
    if (!TRAIN_KEY.test(k) || !isObject(v)) continue;
    if (typeof v.sets !== "number" || typeof v.reps !== "number") continue;
    const s: SessionLog = { sets: Math.max(0, Math.min(10, Math.round(v.sets))), reps: Math.max(0, Math.min(500, Math.round(v.reps))) };
    if (typeof v.doneOn === "string" && DAY_KEY.test(v.doneOn)) s.doneOn = v.doneOn;
    if (typeof v.t === "number" && Number.isFinite(v.t)) s.t = v.t;
    out[k] = s;
  }
  return out;
}
