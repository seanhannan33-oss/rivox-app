// Loop Subscriptions client.
//
// UNVERIFIED: Loop's API reference confirms an Admin API call named
// "Read subscriptions for customer via email address" and webhooks for
// subscription paused, resumed and cancelled. The base URL, auth header,
// exact path and response shape below are best guesses kept in config so
// they can be corrected without code changes. Confirm each against
// https://developer.loopwork.co with a real token before launch.
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
    return { id: asString(r.id), status: asString(r.status), productIds, productTitles };
  });
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
    if (!res.ok) throw new Error(`Loop responded ${res.status} looking up subscriptions.`);
    return parseSubscriptions(await res.json());
  }
}
