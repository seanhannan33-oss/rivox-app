// Turning a redeemed reward into something the member can use: a one-time Shopify discount code.
import { randomBytes } from "node:crypto";

export interface IssuedReward {
  code: string;
  /** A link that applies the code by itself. */
  url: string;
}

export interface RewardIssuer {
  /** Creates a single-use code for this member and reward. Throws if it can't. */
  issue(rewardId: string, email: string): Promise<IssuedReward>;
}

export interface ShopifyConfig {
  /** e.g. your-store.myshopify.com */
  storeDomain: string;
  adminToken: string;
  apiVersion: string;
  /** Storefront address the member is sent to, e.g. https://rivoxlabs.com */
  siteUrl: string;
  /** Shopify product IDs a free tin can be claimed from. */
  tinProductIds: string[];
  /** Where the free tin link lands after applying the code. */
  redirectPath: string;
}

/** Dollars off for the money-off reward. */
export const FIVE_OFF_AMOUNT = "5.00";

const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // no look-alikes
export function newCode(prefix: string): string {
  const bytes = randomBytes(10);
  let out = "";
  for (const b of bytes) out += ALPHABET[b % ALPHABET.length];
  return `${prefix}-${out}`;
}

export function discountLink(siteUrl: string, code: string, redirectPath: string): string {
  const base = siteUrl.replace(/\/+$/, "");
  const path = redirectPath.startsWith("/") ? redirectPath : `/${redirectPath}`;
  return `${base}/discount/${encodeURIComponent(code)}?redirect=${encodeURIComponent(path)}`;
}

type Fetch = typeof fetch;

const FIND_CUSTOMER = `query($email: String!) { customerByIdentifier(identifier: { emailAddress: $email }) { id } }`;
const TIN_PRICES = `query($ids: [ID!]!) { nodes(ids: $ids) { ... on Product { id variants(first: 20) { nodes { price } } } } }`;
const CREATE = `mutation($discount: DiscountCodeBasicInput!) {
  discountCodeBasicCreate(basicCodeDiscount: $discount) {
    codeDiscountNode { id }
    userErrors { field message }
  }
}`;

/**
 * Creates codes through Shopify's Admin API. Field names were checked against the
 * live Admin schema. Every code works once, only on a one-time purchase, and is
 * locked to the member's Shopify customer record when one exists. The free tin
 * is worth the price of one tin and only applies to the tin products.
 */
export class ShopifyRewardIssuer implements RewardIssuer {
  constructor(
    private readonly config: ShopifyConfig,
    private readonly doFetch: Fetch = fetch,
    private readonly now: () => number = Date.now,
  ) {}

  private async gql<T>(query: string, variables: unknown): Promise<T> {
    const { storeDomain, apiVersion, adminToken } = this.config;
    const res = await this.doFetch(`https://${storeDomain}/admin/api/${apiVersion}/graphql.json`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": adminToken },
      body: JSON.stringify({ query, variables }),
    });
    if (!res.ok) {
      const detail = (await res.text().catch(() => "")).slice(0, 300);
      throw new Error(`Shopify responded ${res.status}. ${detail}`);
    }
    const body = (await res.json()) as { data?: T; errors?: { message?: string }[] };
    if (body.errors?.length) throw new Error(`Shopify error: ${body.errors.map((e) => e.message).join("; ").slice(0, 300)}`);
    if (!body.data) throw new Error("Shopify sent no data.");
    return body.data;
  }

  issue(rewardId: string, email: string): Promise<IssuedReward> {
    if (rewardId === "free_tin") return this.freeTin(email);
    if (rewardId === "five_off") return this.fiveOff(email);
    return Promise.reject(new Error(`No such reward: ${rewardId}`));
  }

  /** The member's Shopify customer, if Shopify knows them. A code locked to it can't be used by anyone else. */
  private async audience(email: string): Promise<unknown> {
    const found = await this.gql<{ customerByIdentifier: { id: string } | null }>(FIND_CUSTOMER, { email });
    const id = found.customerByIdentifier?.id;
    return id ? { customers: { add: [id] } } : { all: "ALL" }; // otherwise the single use is the only lock
  }

  private async create(email: string, prefix: string, label: string, customerGets: unknown, redirectPath: string) {
    const code = newCode(prefix);
    const created = await this.gql<{
      discountCodeBasicCreate: { codeDiscountNode: { id: string } | null; userErrors: { field?: string[]; message: string }[] };
    }>(CREATE, {
      discount: {
        title: `App reward: ${label} (${email})`,
        code,
        startsAt: new Date(this.now()).toISOString(),
        usageLimit: 1,
        appliesOncePerCustomer: true,
        context: await this.audience(email),
        customerGets,
      },
    });
    const errors = created.discountCodeBasicCreate.userErrors;
    if (errors.length || !created.discountCodeBasicCreate.codeDiscountNode) {
      throw new Error(`Shopify refused the discount: ${errors.map((e) => e.message).join("; ").slice(0, 300) || "no reason given"}`);
    }
    return { code, url: discountLink(this.config.siteUrl, code, redirectPath) };
  }

  private fiveOff(email: string): Promise<IssuedReward> {
    return this.create(
      email,
      "FIVE",
      "$5 off",
      {
        appliesOnOneTimePurchase: true,
        appliesOnSubscription: false,
        items: { all: true },
        value: { discountAmount: { amount: FIVE_OFF_AMOUNT, appliesOnEachItem: false } },
      },
      "/",
    );
  }

  private async freeTin(email: string): Promise<IssuedReward> {
    const productGids = this.config.tinProductIds.map((id) => `gid://shopify/Product/${id}`);
    if (productGids.length === 0) throw new Error("No tin products are configured for the free tin reward.");

    const prices = await this.gql<{ nodes: ({ variants?: { nodes: { price: string }[] } } | null)[] }>(TIN_PRICES, {
      ids: productGids,
    });
    const all = prices.nodes.flatMap((n) => n?.variants?.nodes ?? []).map((v) => Number(v.price));
    const tinPrice = Math.max(...all.filter((p) => Number.isFinite(p) && p > 0));
    if (!Number.isFinite(tinPrice)) throw new Error("Couldn't read a tin price from Shopify.");

    return this.create(
      email,
      "TIN",
      "free tin",
      {
        appliesOnOneTimePurchase: true,
        appliesOnSubscription: false,
        items: { products: { productsToAdd: productGids } },
        // The price of one tin off the tins in the cart, so exactly one is free.
        value: { discountAmount: { amount: tinPrice.toFixed(2), appliesOnEachItem: false } },
      },
      this.config.redirectPath,
    );
  }
}
