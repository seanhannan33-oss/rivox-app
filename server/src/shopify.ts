// One small client for Shopify's Admin GraphQL API, shared by rewards and the shop.

export interface ShopifyConfig {
  /** e.g. your-store.myshopify.com */
  storeDomain: string;
  adminToken: string;
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

export function shopifyGql(config: ShopifyConfig, doFetch: typeof fetch = fetch): Gql {
  return async <T>(query: string, variables: unknown): Promise<T> => {
    const res = await doFetch(`https://${config.storeDomain}/admin/api/${config.apiVersion}/graphql.json`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": config.adminToken },
      body: JSON.stringify({ query, variables }),
    });
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
