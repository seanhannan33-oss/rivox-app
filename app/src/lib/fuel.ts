// Protein tracking. Pure logic, no React Native imports.

export type Unit = "lb" | "kg";

export interface Profile {
  weight: number;
  unit: Unit;
  /** Daily protein target in grams. */
  target: number;
}

export interface FuelEntry {
  id: string;
  /** ms since epoch. */
  at: number;
  grams: number;
  label: string;
  source: "photo" | "quick";
}

/**
 * 0.8 g of protein per pound of body weight, a common middle-of-the-road
 * target for men who train. Rounded to the nearest 5 and kept in a sane range.
 */
export const GRAMS_PER_LB = 0.8;
const KG_TO_LB = 2.20462;

export function weightOk(weight: number, unit: Unit): boolean {
  if (!Number.isFinite(weight)) return false;
  const lb = unit === "kg" ? weight * KG_TO_LB : weight;
  return lb >= 80 && lb <= 500;
}

export function targetFor(weight: number, unit: Unit): number {
  const lb = unit === "kg" ? weight * KG_TO_LB : weight;
  const raw = Math.round((lb * GRAMS_PER_LB) / 5) * 5;
  return Math.max(80, Math.min(250, raw));
}

export const total = (entries: FuelEntry[]) => entries.reduce((n, e) => n + e.grams, 0);

export type Slot = "BREAKFAST" | "LUNCH" | "SNACK" | "DINNER";
export const SLOTS: Slot[] = ["BREAKFAST", "LUNCH", "SNACK", "DINNER"];

/** Which meal a log falls under, by the clock on their phone. */
export function slotFor(at: number): Slot {
  const d = new Date(at);
  const h = d.getHours() + d.getMinutes() / 60;
  if (h < 10.5) return "BREAKFAST";
  if (h < 15) return "LUNCH";
  if (h < 17.5) return "SNACK";
  return "DINNER";
}

export function bySlot(entries: FuelEntry[]): Record<Slot, number> {
  const out: Record<Slot, number> = { BREAKFAST: 0, LUNCH: 0, SNACK: 0, DINNER: 0 };
  for (const e of entries) out[slotFor(e.at)] += e.grams;
  return out;
}

export function statusLine(sum: number, target: number): string {
  const short = target - sum;
  if (sum === 0) return "Nothing logged. Your muscles noticed.";
  if (short > 0) return `${short} g short. Fix it.`;
  if (short === 0) return "Number hit. Do it again tomorrow.";
  return `${-short} g over. Nobody's mad.`;
}

export function clampGrams(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(300, Math.round(n)));
}

export function timeLabel(at: number): string {
  const d = new Date(at);
  const h = d.getHours();
  const m = String(d.getMinutes()).padStart(2, "0");
  return `${h % 12 === 0 ? 12 : h % 12}:${m} ${h < 12 ? "am" : "pm"}`;
}

export type FuelDays = Record<string, FuelEntry[]>;

export function pruneFuel(days: FuelDays, cutoffKey: string): FuelDays {
  const out: FuelDays = {};
  for (const [k, v] of Object.entries(days)) if (k >= cutoffKey && v.length > 0) out[k] = v;
  return out;
}
