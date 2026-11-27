// The in-app shop: what's for sale, and a member's own orders. Read-only.
import { shopifyGql, type Gql, type ShopifyConfig } from "./shopify.ts";

export interface ShopVariant {
  /** Shopify's numeric variant ID, used to build the checkout link. */
  id: string;
  title: string;
  price: string;
  available: boolean;
}

export interface ShopProduct {
  id: string;
  title: string;
  image: string | null;
  /** The product's page on the store. */
  url: string;
  variants: ShopVariant[];
}

export interface ShopOrder {
  name: string;
  /** ms since epoch. */
  placedAt: number;
  status: "cancelled" | "delivered" | "shipped" | "preparing";
  total: string;
  items: { title: string; quantity: number }[];
  tracking: { url: string; number: string; company: string } | null;
  /** Shopify's own status page for the order. */
  statusUrl: string | null;
}

export interface Shop {
  products(): Promise<ShopProduct[]>;
  orders(email: string): Promise<ShopOrder[]>;
}

/** "Rivox Focus Pouches – Cool Mint | Zero-Nicotine Energy + Focus" -> "Focus Pouches – Cool Mint" */
export function shortTitle(title: string): string {
  const cut = title.split(" | ")[0]!.split(",")[0]!.trim();
  return cut.replace(/^Rivox\s+(Labs\s+)?/i, "").trim() || title;
}

const PRODUCTS = `query($q: String!) {
  products(first: 50, query: $q, sortKey: TITLE) {
    nodes {
      legacyResourceId title requiresSellingPlan onlineStoreUrl
      featuredMedia { preview { image { url } } }
      variants(first: 10) { nodes { legacyResourceId title price availableForSale } }
    }
  }
}`;

const ORDERS = `query($q: String!) {
  orders(first: 10, query: $q, sortKey: CREATED_AT, reverse: true) {
    nodes {
      name createdAt displayFulfillmentStatus cancelledAt statusPageUrl
      totalPriceSet { shopMoney { amount currencyCode } }
      lineItems(first: 8) { nodes { title quantity } }
      fulfillments(first: 3) { trackingInfo(first: 1) { url number company } }
    }
  }
}`;

interface RawProduct {
  legacyResourceId: string;
  title: string;
  requiresSellingPlan: boolean;
  onlineStoreUrl: string | null;
  featuredMedia: { preview: { image: { url: string } | null } | null } | null;
  variants: { nodes: { legacyResourceId: string; title: string; price: string; availableForSale: boolean }[] };
}

/** Keeps what a member can actually buy one-off in the app. */
export function toProducts(raw: RawProduct[], hidden: string[]): ShopProduct[] {
  return raw
    .filter((p) => p.onlineStoreUrl && !p.requiresSellingPlan && !hidden.includes(p.legacyResourceId))
    .map((p) => ({
      id: p.legacyResourceId,
      title: shortTitle(p.title),
      image: p.featuredMedia?.preview?.image?.url ?? null,
      url: p.onlineStoreUrl!,
      variants: p.variants.nodes
        .filter((v) => Number(v.price) > 0) // free items aren't for sale
        .map((v) => ({
          id: v.legacyResourceId,
          title: v.title === "Default Title" ? "" : v.title,
          price: Number(v.price).toFixed(2),
          available: v.availableForSale,
        })),
    }))
    .filter((p) => p.variants.length > 0);
}

interface RawOrder {
  name: string;
  createdAt: string;
  displayFulfillmentStatus: string;
  cancelledAt: string | null;
  statusPageUrl: string | null;
  totalPriceSet: { shopMoney: { amount: string } };
  lineItems: { nodes: { title: string; quantity: number }[] };
  fulfillments: { trackingInfo: { url: string | null; number: string | null; company: string | null }[] }[];
}

export function toOrders(raw: RawOrder[]): ShopOrder[] {
  return raw.map((o) => {
    const track = o.fulfillments.flatMap((f) => f.trackingInfo).find((t) => t.url);
    const status: ShopOrder["status"] = o.cancelledAt
      ? "cancelled"
      : o.displayFulfillmentStatus === "FULFILLED"
        ? track
          ? "shipped"
          : "delivered"
        : ["IN_PROGRESS", "PARTIALLY_FULFILLED"].includes(o.displayFulfillmentStatus)
          ? "shipped"
          : "preparing";
    return {
      name: o.name,
      placedAt: Date.parse(o.createdAt),
      status,
      total: Number(o.totalPriceSet.shopMoney.amount).toFixed(2),
      items: o.lineItems.nodes.map((l) => ({ title: shortTitle(l.title), quantity: l.quantity })),
      tracking: track?.url ? { url: track.url, number: track.number ?? "", company: track.company ?? "" } : null,
      statusUrl: o.statusPageUrl,
    };
  });
}

const PRODUCTS_FRESH_MS = 5 * 60_000;

/** Queries were run against the live store's schema before being written here. */
export class ShopifyShop implements Shop {
  private readonly gql: Gql;
  private cache: { at: number; products: ShopProduct[] } | null = null;

  constructor(
    private readonly config: ShopifyConfig,
    doFetch: typeof fetch = fetch,
    private readonly now: () => number = Date.now,
  ) {
    this.gql = shopifyGql(config, doFetch);
  }

  async products(): Promise<ShopProduct[]> {
    if (this.cache && this.now() - this.cache.at < PRODUCTS_FRESH_MS) return this.cache.products;
    const data = await this.gql<{ products: { nodes: RawProduct[] } }>(PRODUCTS, { q: "status:active" });
    const products = toProducts(data.products.nodes, this.config.hiddenProductIds);
    this.cache = { at: this.now(), products };
    return products;
  }

  async orders(email: string): Promise<ShopOrder[]> {
    // The address is quoted so nothing in it can widen the search.
    const data = await this.gql<{ orders: { nodes: RawOrder[] } }>(ORDERS, { q: `email:"${email.replace(/["\\]/g, "")}"` });
    return toOrders(data.orders.nodes);
  }
}
