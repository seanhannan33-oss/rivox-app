// Loop Subscriptions client.
//
// Loop's docs confirm: GET {base}/customer/{email}/subscription with the
// token in X-Loop-Token (scope: Read Subscription contracts). The docs do not
// show the response body, so the parser below is tolerant and the client logs
// the response's field names (never values) so the shape can be confirmed.
import type { Subscription } from "./access.ts";
import type { Config } from "./config.ts";

export interface LoopClient {
  subscriptionsByEmail(email: string): Promise<Subscription[]>;
}

type Json = Record<string, unknown>;

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asString(value: unknown): string {
  return typeof value === "string" || typeof value === "number" ? String(value) : "";
}

/**
 * Loop's date fields, as ms since epoch. Accepts epoch seconds, epoch ms
 * (as number or digit string) or an ISO date string. Anything else is null.
 */
export function toMs(value: unknown): number | null {
  if (typeof value === "number" || (typeof value === "string" && /^\d+$/.test(value.trim()))) {
    const n = Number(value);
    if (!Number.isFinite(n) || n <= 0) return null;
    return n < 1e11 ? n * 1000 : n; // below 1e11 can only be seconds
  }
  if (typeof value === "string" && value.trim()) {
    const t = Date.parse(value);
    return Number.isNaN(t) ? null : t;
  }
  return null;
}

function describeValue(value: unknown): string {
  if (typeof value === "string") return `string(${value.length})`;
  if (typeof value === "number") return `number(${String(Math.trunc(value)).length} digits)`;
  return value === null ? "null" : typeof value;
}

/** Tolerant parser: accepts a bare array or an object wrapping one under `data`. */
export function parseSubscriptions(body: unknown): Subscription[] {
  const rows = Array.isArray(body) ? body : asArray((body as Json | null)?.data);
  return rows.map((row) => {
    const r = (row ?? {}) as Json;
    const lines = asArray(r.lines);
    const productIds: string[] = [];
    const productTitles: string[] = [];
    for (const line of lines) {
      const l = (line ?? {}) as Json;
      const id = asString(l.productShopifyId ?? l.productId);
      const title = asString(l.productTitle ?? l.name ?? l.title);
      if (id) productIds.push(id);
      if (title) productTitles.push(title);
    }
    return {
      id: asString(r.id),
      status: asString(r.status),
      productIds,
      productTitles,
      startedAt: toMs(r.createdAt),
      nextBillingAt: toMs(r.nextBillingDateEpoch),
    };
  });
}

/** Field names and statuses only. No emails, names, addresses or IDs. */
function describeShape(body: unknown, subs: Subscription[]) {
  const top = body && typeof body === "object" && !Array.isArray(body) ? Object.keys(body as Json) : ["(array)"];
  const rows = Array.isArray(body) ? body : asArray((body as Json | null)?.data);
  const first = (rows[0] ?? {}) as Json;
  const firstLine = (asArray(first.lines)[0] ?? {}) as Json;
  return {
    topKeys: top,
    count: rows.length,
    subscriptionKeys: Object.keys(first),
    lineKeys: Object.keys(firstLine),
    dateFormats: { createdAt: describeValue(first.createdAt), nextBilling: describeValue(first.nextBillingDateEpoch) },
    parsed: subs.map((s) => ({
      status: s.status,
      products: s.productIds.length,
      hasStart: s.startedAt !== null,
      hasNextBilling: s.nextBillingAt !== null,
    })),
  };
}

export class HttpLoopClient implements LoopClient {
  constructor(private readonly config: Config["loop"]) {}

  async subscriptionsByEmail(email: string): Promise<Subscription[]> {
    if (!this.config.token) throw new Error("LOOP_API_TOKEN is not set.");
    const path = this.config.subscriptionsByEmailPath.replace("{email}", encodeURIComponent(email));
    const res = await fetch(this.config.base + path, {
      headers: { [this.config.authHeader]: this.config.token, Accept: "application/json" },
    });
    // A customer Loop has never seen is not an error. They just have no subscription.
    if (res.status === 404) return [];
    if (!res.ok) {
      const detail = (await res.text().catch(() => "")).slice(0, 300);
      throw new Error(`Loop responded ${res.status} looking up subscriptions. ${detail}`);
    }
    const body: unknown = await res.json();
    const subs = parseSubscriptions(body);
    console.log("Loop lookup ok:", JSON.stringify(describeShape(body, subs)));
    return subs;
  }
}
