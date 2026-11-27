import assert from "node:assert/strict";
import { test } from "node:test";
import { groupOf, ShopifyShop, shortTitle, toOrders, toProducts } from "../src/shop.ts";

test("shortTitle strips the search-engine padding", () => {
  assert.equal(shortTitle("Rivox Focus Pouches – Cool Mint | Zero-Nicotine Energy + Focus, Caffeine + L-Theanine"), "Focus Pouches – Cool Mint");
  assert.equal(shortTitle("Rivox Focus Pouches Variety 3-Pack, Caffeine and L-Theanine, 45 Count"), "Focus Pouches Variety 3-Pack");
  assert.equal(shortTitle("No Curfew Testosterone Support"), "No Curfew Testosterone Support");
  assert.equal(shortTitle("Rivox Labs Premium Weatherproof Aluminum Pouch Case"), "Premium Weatherproof Aluminum Pouch Case");
  assert.equal(shortTitle("Rivox"), "Rivox");
});

const raw = (over: Record<string, unknown> = {}) => ({
  legacyResourceId: "1",
  title: "Rivox Focus Pouches – Cool Mint | Zero-Nicotine",
  requiresSellingPlan: false,
  onlineStoreUrl: "https://rivoxlabs.com/products/cool-mint",
  featuredMedia: { preview: { image: { url: "https://cdn.shopify.com/x.png" } } },
  variants: { nodes: [{ legacyResourceId: "11", title: "Default Title", price: "7.99", availableForSale: true }] },
  ...over,
});

test("products: only what a member can buy one-off, cleaned up", () => {
  const out = toProducts(
    [
      raw(),
      raw({ legacyResourceId: "2", onlineStoreUrl: null }), // not on the online store
      raw({ legacyResourceId: "3", requiresSellingPlan: true }), // subscription only
      raw({ legacyResourceId: "4" }), // hidden by setting
      raw({ legacyResourceId: "5", variants: { nodes: [{ legacyResourceId: "51", title: "Default Title", price: "0.00", availableForSale: true }] } }), // free
      raw({ legacyResourceId: "6", featuredMedia: null, variants: { nodes: [{ legacyResourceId: "61", title: "Pack 1", price: "34.990", availableForSale: false }] } }),
    ] as any,
    ["4"],
  );
  assert.deepEqual(out, [
    { id: "1", title: "Focus Pouches – Cool Mint", image: "https://cdn.shopify.com/x.png", url: "https://rivoxlabs.com/products/cool-mint", group: "Focus Pouches", variants: [{ id: "11", title: "", price: "7.99", available: true }] },
    { id: "6", title: "Focus Pouches – Cool Mint", image: null, url: "https://rivoxlabs.com/products/cool-mint", group: "Focus Pouches", variants: [{ id: "61", title: "Pack 1", price: "34.99", available: false }] },
  ]);
});

const order = (over: Record<string, unknown> = {}) => ({
  name: "#1467",
  createdAt: "2026-11-27T13:03:45Z",
  displayFulfillmentStatus: "FULFILLED",
  cancelledAt: null,
  statusPageUrl: "https://rivoxlabs.com/orders/abc",
  totalPriceSet: { shopMoney: { amount: "20.37" } },
  lineItems: { nodes: [{ title: "Rivox Focus Pouches – Cool Mint | Zero-Nicotine", quantity: 2 }] },
  fulfillments: [{ trackingInfo: [{ url: "https://tools.usps.com/x", number: "9300", company: "USPS" }] }],
  ...over,
});

test("orders: status, total, items and tracking", () => {
  const [shipped, preparing, cancelled, noTrack, partial] = toOrders([
    order(),
    order({ displayFulfillmentStatus: "UNFULFILLED", fulfillments: [] }),
    order({ cancelledAt: "2026-11-27T14:00:00Z" }),
    order({ fulfillments: [{ trackingInfo: [] }] }),
    order({ displayFulfillmentStatus: "PARTIALLY_FULFILLED" }),
  ] as any);
  assert.deepEqual(shipped, {
    name: "#1467",
    placedAt: Date.parse("2026-11-27T13:03:45Z"),
    status: "shipped",
    total: "20.37",
    items: [{ title: "Focus Pouches – Cool Mint", quantity: 2 }],
    tracking: { url: "https://tools.usps.com/x", number: "9300", company: "USPS" },
    statusUrl: "https://rivoxlabs.com/orders/abc",
  });
  assert.equal(preparing!.status, "preparing");
  assert.equal(preparing!.tracking, null);
  assert.equal(cancelled!.status, "cancelled");
  assert.equal(noTrack!.status, "delivered");
  assert.equal(partial!.status, "shipped");
});

const cfg = { storeDomain: "x.myshopify.com", adminToken: "t", clientId: "", clientSecret: "", apiVersion: "2026-10", siteUrl: "https://rivoxlabs.com", tinProductIds: [], redirectPath: "/", hiddenProductIds: [] };

test("ShopifyShop caches products briefly and looks orders up by the exact email", async () => {
  const calls: { query: string; variables: any }[] = [];
  let t = 0;
  const doFetch = (async (_u: string | URL | Request, init?: RequestInit) => {
    const body = JSON.parse(String(init!.body));
    calls.push(body);
    const data = body.query.includes("products(") ? { products: { nodes: [raw()] } } : { orders: { nodes: [order()] } };
    return new Response(JSON.stringify({ data }), { status: 200 });
  }) as typeof fetch;
  const shop = new ShopifyShop(cfg, doFetch, () => t);
  assert.equal((await shop.products()).length, 1);
  await shop.products();
  assert.equal(calls.length, 1); // second call came from the cache
  t += 6 * 60_000;
  await shop.products();
  assert.equal(calls.length, 2);
  assert.equal(calls[0]!.variables.q, "status:active");

  const orders = await shop.orders('dan"@example.com OR email:*');
  assert.equal(orders[0]!.name, "#1467");
  assert.equal(calls[2]!.variables.q, 'email:"dan@example.com OR email:*"'); // quotes stripped, the rest stays inside the quotes
});

test("the shelf is sorted into sections, cheapest first inside each", () => {
  assert.equal(groupOf("No Curfew Testosterone Support - 3 Month Supply", "Testosterone Support"), "No Curfew");
  assert.equal(groupOf("Rivox Focus Pouches – Cool Mint 5-Pack", "Focus Pouches"), "Focus Pouches");
  assert.equal(groupOf("Rivox Focus Gum – 3 Pack", "Energy Gum"), "Energy Gum");
  assert.equal(groupOf("The Full Stack – Zero-Nicotine Focus Bundle | 3 Pouch Tins + Energy Gum", "Focus Pouches"), "Kits + Bundles");
  assert.equal(groupOf("Rivox Pouch Starter Kit", ""), "Kits + Bundles");
  assert.equal(groupOf("Rivox Labs Premium Weatherproof Aluminum Pouch Case", "Aluminum Cans"), "Gear");
  assert.equal(groupOf("The Modern Testosterone Handbook", ""), "Reads");
  assert.equal(shortTitle("No Curfew Testosterone Support - 2 Month Supply"), "No Curfew – 2 Month Supply");
  assert.equal(shortTitle("Rivox Focus Pouches –  Tropical Mango  5-Pack"), "Focus Pouches – Tropical Mango 5-Pack");
  assert.equal(shortTitle("Build Your Five-Pack at $34.99"), "Build Your Five-Pack");

  const v = (price: string) => ({ nodes: [{ legacyResourceId: "v" + price, title: "Default Title", price, availableForSale: true }] });
  const out = toProducts(
    [
      raw({ legacyResourceId: "a", title: "The Modern Focus Playbook", variants: v("9.99") }),
      raw({ legacyResourceId: "b", title: "Rivox Focus Pouches – Cool Mint 5-Pack", variants: v("34.99") }),
      raw({ legacyResourceId: "c", title: "No Curfew Testosterone Support", variants: v("59.00") }),
      raw({ legacyResourceId: "d", title: "Rivox Focus Pouches – Cool Mint", variants: v("7.99") }),
    ] as any,
    [],
  );
  assert.deepEqual(out.map((p) => p.id), ["c", "d", "b", "a"]);
});
