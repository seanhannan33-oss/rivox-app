import assert from "node:assert/strict";
import { test } from "node:test";
import { DEFAULT_RULES, bonusesFor, rulesFromEnv, streakEnding } from "../src/points.ts";
import { ShopifyRewardIssuer, discountLink, newCode } from "../src/rewards.ts";

test("streakEnding counts back day by day, across months and years", () => {
  assert.equal(streakEnding(["2026-11-25", "2026-11-26", "2026-11-27"], "2026-11-27"), 3);
  assert.equal(streakEnding(["2026-11-25", "2026-11-27"], "2026-11-27"), 1);
  assert.equal(streakEnding(["2026-11-26"], "2026-11-27"), 0);
  assert.equal(streakEnding(["2026-12-31", "2027-01-01", "2026-12-30"], "2027-01-01"), 3);
  assert.equal(streakEnding(["2026-02-28", "2026-03-01"], "2026-03-01"), 2);
});

test("streak bonuses are the ones the streak has reached", () => {
  assert.deepEqual(bonusesFor(6, DEFAULT_RULES), []);
  assert.deepEqual(bonusesFor(7, DEFAULT_RULES), [[7, 2]]);
  assert.deepEqual(bonusesFor(45, DEFAULT_RULES), [[7, 2], [30, 3]]);
  assert.deepEqual(bonusesFor(400, DEFAULT_RULES), [[7, 2], [30, 3], [60, 5], [90, 10]]);
});

test("settings can change the numbers, and bad ones are ignored", () => {
  assert.deepEqual(rulesFromEnv({}), DEFAULT_RULES);
  const r = rulesFromEnv({ POINTS_PER_CHECKIN: "2", FREE_TIN_COST: "120", FIVE_OFF_COST: "75", STREAK_BONUS: "7:1, 30:4" });
  assert.equal(r.perCheckin, 2);
  assert.deepEqual(r.rewards.map((x) => [x.id, x.cost]), [["five_off", 75], ["free_tin", 120]]);
  assert.deepEqual(r.streakBonus, { 7: 1, 30: 4 });
  assert.deepEqual(rulesFromEnv({ STREAK_BONUS: "" }).streakBonus, {}); // bonuses off
  const bad = rulesFromEnv({ POINTS_PER_CHECKIN: "-3", FREE_TIN_COST: "free", STREAK_BONUS: "soon:lots" });
  assert.equal(bad.perCheckin, 1);
  assert.deepEqual(bad.rewards.map((x) => x.cost), [60, 90]);
  assert.deepEqual(bad.streakBonus, {});
  assert.deepEqual(DEFAULT_RULES.rewards.map((x) => x.cost), [60, 90]); // the defaults themselves weren't touched
});

test("codes are unguessable and links apply themselves", () => {
  const a = newCode("TIN");
  assert.match(a, /^TIN-[A-HJKMNP-Z2-9]{10}$/);
  assert.notEqual(a, newCode("TIN"));
  assert.equal(
    discountLink("https://rivoxlabs.com/", "TIN-ABC", "products/x"),
    "https://rivoxlabs.com/discount/TIN-ABC?redirect=%2Fproducts%2Fx",
  );
});

const shopify = {
  storeDomain: "example.myshopify.com",
  adminToken: "shpat_test",
  apiVersion: "2026-10",
  siteUrl: "https://rivoxlabs.com",
  tinProductIds: ["11", "22"],
  redirectPath: "/products/tin",
};

function fakeShopify(opts: { customer?: string | null; userErrors?: { message: string }[]; status?: number } = {}) {
  const calls: { url: string; headers: Record<string, string>; query: string; variables: any }[] = [];
  const doFetch = (async (url: string | URL | Request, init?: RequestInit) => {
    const { query, variables } = JSON.parse(String(init!.body));
    calls.push({ url: String(url), headers: init!.headers as Record<string, string>, query, variables });
    if (opts.status) return new Response("nope", { status: opts.status });
    let data: unknown;
    if (query.includes("nodes(ids")) data = { nodes: [{ variants: { nodes: [{ price: "7.99" }] } }, { variants: { nodes: [{ price: "8.49" }] } }] };
    else if (query.includes("customerByIdentifier")) data = { customerByIdentifier: opts.customer === null ? null : { id: opts.customer ?? "gid://shopify/Customer/5" } };
    else data = { discountCodeBasicCreate: { codeDiscountNode: opts.userErrors ? null : { id: "gid://shopify/DiscountCodeNode/1" }, userErrors: opts.userErrors ?? [] } };
    return new Response(JSON.stringify({ data }), { status: 200 });
  }) as typeof fetch;
  return { calls, doFetch };
}

test("a free tin becomes a single-use code locked to the member", async () => {
  const { calls, doFetch } = fakeShopify();
  const out = await new ShopifyRewardIssuer(shopify, doFetch, () => Date.UTC(2026, 10, 27)).issue("free_tin", "dan@example.com");
  assert.match(out.code, /^TIN-/);
  assert.equal(out.url, `https://rivoxlabs.com/discount/${out.code}?redirect=%2Fproducts%2Ftin`);
  assert.equal(calls[0]!.url, "https://example.myshopify.com/admin/api/2026-10/graphql.json");
  assert.equal(calls[0]!.headers["X-Shopify-Access-Token"], "shpat_test");
  const d = calls[2]!.variables.discount; // prices, then the customer, then the create
  assert.equal(d.code, out.code);
  assert.equal(d.usageLimit, 1);
  assert.equal(d.appliesOncePerCustomer, true);
  assert.equal(d.startsAt, "2026-11-27T00:00:00.000Z");
  assert.deepEqual(d.context, { customers: { add: ["gid://shopify/Customer/5"] } });
  assert.deepEqual(d.customerGets, {
    appliesOnOneTimePurchase: true,
    appliesOnSubscription: false,
    items: { products: { productsToAdd: ["gid://shopify/Product/11", "gid://shopify/Product/22"] } },
    value: { discountAmount: { amount: "8.49", appliesOnEachItem: false } }, // the dearest tin, so any one is fully covered
  });
});

test("with no Shopify customer the code is still single-use", async () => {
  const { calls, doFetch } = fakeShopify({ customer: null });
  await new ShopifyRewardIssuer(shopify, doFetch).issue("free_tin", "new@example.com");
  assert.deepEqual(calls[2]!.variables.discount.context, { all: "ALL" });
  assert.equal(calls[2]!.variables.discount.usageLimit, 1);
});

test("Shopify refusing or failing throws, so the points can be handed back", async () => {
  const refused = fakeShopify({ userErrors: [{ message: "Code must be unique" }] });
  await assert.rejects(new ShopifyRewardIssuer(shopify, refused.doFetch).issue("free_tin", "a@b.co"), /Code must be unique/);
  const down = fakeShopify({ status: 502 });
  await assert.rejects(new ShopifyRewardIssuer(shopify, down.doFetch).issue("free_tin", "a@b.co"), /responded 502/);
  await assert.rejects(new ShopifyRewardIssuer({ ...shopify, tinProductIds: [] }, down.doFetch).issue("free_tin", "a@b.co"), /No tin products/);
  await assert.rejects(new ShopifyRewardIssuer(shopify, down.doFetch).issue("a_car", "a@b.co"), /No such reward/);
});

test("$5 off is a single-use code on any one-time order", async () => {
  const { calls, doFetch } = fakeShopify();
  const out = await new ShopifyRewardIssuer(shopify, doFetch).issue("five_off", "dan@example.com");
  assert.match(out.code, /^FIVE-/);
  assert.equal(out.url, `https://rivoxlabs.com/discount/${out.code}?redirect=%2F`);
  const d = calls.at(-1)!.variables.discount;
  assert.equal(d.usageLimit, 1);
  assert.deepEqual(d.context, { customers: { add: ["gid://shopify/Customer/5"] } });
  assert.deepEqual(d.customerGets, {
    appliesOnOneTimePurchase: true,
    appliesOnSubscription: false,
    items: { all: true },
    value: { discountAmount: { amount: "5.00", appliesOnEachItem: false } },
  });
});
