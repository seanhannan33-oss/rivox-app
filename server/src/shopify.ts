// One small client for Shopify's Admin GraphQL API, shared by rewards and the shop.

export interface ShopifyConfig {
  /** e.g. your-store.myshopify.com */
  storeDomain: string;
  /** A fixed Admin API token, from a custom app made before 2026. Leave empty for newer apps. */
  adminToken: string;
  /** Client ID and secret from the Dev Dashboard, for apps made in 2026 or later. The server swaps them for a 24-hour token and renews it. */
  clientId: string;
  clientSecret: string;
  apiVersion: string;
  /** Storefront address members are sent to, e.g. https://rivoxlabs.com */
  siteUrl: string;
  /** Shopify product IDs a free tin can be claimed from. */
  tinProductIds: string[];
  /** Where the free tin link lands after applying the code. */
  redirectPath: string;
  /** Product IDs kept out of the in-app shop. */
  hiddenProductIds: string[];
}

export type Gql = <T>(query: string, variables: unknown) => Promise<T>;

/** True when there is some way to authenticate: a fixed token, or a client ID and secret. */
export function shopifyReady(config: ShopifyConfig): boolean {
  return Boolean(config.storeDomain && (config.adminToken || (config.clientId && config.clientSecret)));
}

const RENEW_EARLY_MS = 5 * 60_000;

/**
 * Hands out a valid Admin API token. With a fixed token it just returns it. With
 * a client ID and secret it asks Shopify for one (the "client credentials grant"),
 * keeps it until shortly before it expires, and asks again.
 */
export function tokenSource(config: ShopifyConfig, doFetch: typeof fetch, now: () => number) {
  let cached: { token: string; until: number } | null = null;
  let pending: Promise<string> | null = null;

  async function request(): Promise<string> {
    const res = await doFetch(`https://${config.storeDomain}/admin/oauth/access_token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: config.clientId,
        client_secret: config.clientSecret,
      }).toString(),
    });
    if (!res.ok) {
      const detail = (await res.text().catch(() => "")).slice(0, 200);
      throw new Error(`Shopify refused to issue a token (${res.status}). ${detail}`);
    }
    const body = (await res.json()) as { access_token?: unknown; expires_in?: unknown };
    if (typeof body.access_token !== "string" || !body.access_token) throw new Error("Shopify sent no access token.");
    const seconds = typeof body.expires_in === "number" && body.expires_in > 0 ? body.expires_in : 3600;
    cached = { token: body.access_token, until: now() + seconds * 1000 - RENEW_EARLY_MS };
    return body.access_token;
  }

  return {
    async get(): Promise<string> {
      if (config.adminToken) return config.adminToken;
      if (cached && now() < cached.until) return cached.token;
      // Several requests arriving together share one token request.
      pending ??= request().finally(() => {
        pending = null;
      });
      return pending;
    },
    /** Called when Shopify rejects a token, so the next call fetches a fresh one. */
    forget() {
      cached = null;
    },
    renewable: !config.adminToken,
  };
}

export function shopifyGql(config: ShopifyConfig, doFetch: typeof fetch = fetch, now: () => number = Date.now): Gql {
  const tokens = tokenSource(config, doFetch, now);
  const post = async (query: string, variables: unknown) =>
    doFetch(`https://${config.storeDomain}/admin/api/${config.apiVersion}/graphql.json`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": await tokens.get() },
      body: JSON.stringify({ query, variables }),
    });

  return async <T>(query: string, variables: unknown): Promise<T> => {
    let res = await post(query, variables);
    if (res.status === 401 && tokens.renewable) {
      tokens.forget(); // the token may have been revoked early: get a new one and try once more
      res = await post(query, variables);
    }
    if (!res.ok) {
      const detail = (await res.text().catch(() => "")).slice(0, 300);
      throw new Error(`Shopify responded ${res.status}. ${detail}`);
    }
    const body = (await res.json()) as { data?: T; errors?: { message?: string }[] };
    if (body.errors?.length) {
      throw new Error(`Shopify error: ${body.errors.map((e) => e.message).join("; ").slice(0, 300)}`);
    }
    if (!body.data) throw new Error("Shopify sent no data.");
    return body.data;
  };
}
