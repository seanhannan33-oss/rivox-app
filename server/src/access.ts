// Decides who gets into the app. Pure logic, no network.
//
// Rule (decided 2026-11-26): the app is free with any active Rivox
// subscription, No Curfew or pouches. A paused subscriber keeps access.
// A cancelled or expired subscriber is locked out.

export type Product = "no_curfew" | "pouches";

export interface Subscription {
  id: string;
  /** Status as Loop reports it, e.g. ACTIVE, PAUSED, CANCELLED, EXPIRED. */
  status: string;
  /** Shopify product IDs on the subscription's lines. */
  productIds: string[];
  /** Product titles on the subscription's lines. Used only as a fallback. */
  productTitles: string[];
  /** When the subscription was created, ms since epoch. Null if Loop didn't say. */
  startedAt: number | null;
  /** Next billing date, ms since epoch. Null if unknown. */
  nextBillingAt: number | null;
}

export interface ProductDetail {
  /** Earliest start among this product's live subscriptions. Drives the day count. */
  startedAt: number | null;
  /** Soonest upcoming billing among the active (not paused) ones. */
  nextBillingAt: number | null;
  /** True when every live subscription for this product is paused. */
  paused: boolean;
}

export interface Access {
  allowed: boolean;
  /** Which subscriptions grant access. Drives which cards the app shows. */
  products: Product[];
  /** Dates per product, for the day count and the next-box card. */
  details: Partial<Record<Product, ProductDetail>>;
}

export interface ProductMap {
  noCurfewProductIds: string[];
  pouchProductIds: string[];
}

const GRANTING_STATUSES = new Set(["ACTIVE", "PAUSED"]);

export function grantsAccess(status: string): boolean {
  return GRANTING_STATUSES.has(status.trim().toUpperCase());
}

export function classify(sub: Subscription, map: ProductMap): Product[] {
  const found = new Set<Product>();
  for (const id of sub.productIds) {
    if (map.noCurfewProductIds.includes(id)) found.add("no_curfew");
    if (map.pouchProductIds.includes(id)) found.add("pouches");
  }
  // Fallback for when product IDs are not configured yet or missing from the payload.
  if (found.size === 0) {
    for (const title of sub.productTitles) {
      const t = title.toLowerCase();
      if (t.includes("no curfew")) found.add("no_curfew");
      if (t.includes("pouch")) found.add("pouches");
    }
  }
  return [...found];
}

function isPaused(status: string): boolean {
  return status.trim().toUpperCase() === "PAUSED";
}

function minOrNull(a: number | null, b: number | null): number | null {
  if (a === null) return b;
  if (b === null) return a;
  return Math.min(a, b);
}

export function decideAccess(subs: Subscription[], map: ProductMap, now: number = Date.now()): Access {
  const details: Partial<Record<Product, ProductDetail>> = {};
  for (const sub of subs) {
    if (!grantsAccess(sub.status)) continue;
    const paused = isPaused(sub.status);
    // A billing date already in the past is stale, not "next".
    const upcoming = !paused && sub.nextBillingAt !== null && sub.nextBillingAt > now ? sub.nextBillingAt : null;
    for (const p of classify(sub, map)) {
      const d = details[p] ?? { startedAt: null, nextBillingAt: null, paused: true };
      d.startedAt = minOrNull(d.startedAt, sub.startedAt);
      d.nextBillingAt = minOrNull(d.nextBillingAt, upcoming);
      d.paused = d.paused && paused;
      details[p] = d;
    }
  }
  const ordered: Product[] = (["no_curfew", "pouches"] as const).filter((p) => details[p] !== undefined);
  return { allowed: ordered.length > 0, products: ordered, details };
}
