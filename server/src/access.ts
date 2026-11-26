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
}

export interface Access {
  allowed: boolean;
  /** Which subscriptions grant access. Drives which cards the app shows. */
  products: Product[];
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

export function decideAccess(subs: Subscription[], map: ProductMap): Access {
  const products = new Set<Product>();
  for (const sub of subs) {
    if (!grantsAccess(sub.status)) continue;
    for (const p of classify(sub, map)) products.add(p);
  }
  const ordered: Product[] = (["no_curfew", "pouches"] as const).filter((p) => products.has(p));
  return { allowed: ordered.length > 0, products: ordered };
}
