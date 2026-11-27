import assert from "node:assert/strict";
import { test } from "node:test";
import { DEFAULT_RULES, bonusesFor, rulesFromEnv, streakState } from "../src/points.ts";
import { ShopifyRewardIssuer, discountLink, newCode } from "../src/rewards.ts";

const plus = (day: string, n: number) => {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const span = (from: string, n: number) => Array.from({ length: n }, (_, i) => plus(from, i));

test("streak saves: none earned, so a missed day ends the run", () => {
  assert.deepEqual(streakState([], "2026-11-27"), { streak: 0, best: 0, saves: 0, saved: [] });
  assert.deepEqual(streakState(span("2026-11-01", 5), "2026-11-05"), { streak: 5, best: 5, saves: 0, saved: [] });
  assert.equal(streakState(span("2026-11-01", 5), "2026-11-06").streak, 5); // today not done yet is not a miss
  assert.deepEqual(streakState(span("2026-11-01", 5), "2026-11-07"), { streak: 0, best: 5, saves: 0, saved: [] });
});

test("streak saves: one is earned every 14 check-ins, two at most", () => {
  assert.equal(streakState(span("2026-10-01", 13), "2026-10-13").saves, 0);
  assert.equal(streakState(span("2026-10-01", 14), "2026-10-14").saves, 1);
  assert.equal(streakState(span("2026-10-01", 28), "2026-10-28").saves, 2);
  assert.equal(streakState(span("2026-10-01", 60), "2026-11-29").saves, 2); // capped
});

test("streak saves: a save covers a missed day and the run carries on", () => {
  // 14 days, miss the 15th, back on the 16th.
  const days = [...span("2026-10-01", 14), "2026-10-16"];
  assert.deepEqual(streakState(days, "2026-10-16"), { streak: 15, best: 15, saves: 0, saved: ["2026-10-15"] });
  // The morning after the miss, before checking in: already covered.
  assert.deepEqual(streakState(span("2026-10-01", 14), "2026-10-16"), { streak: 14, best: 14, saves: 0, saved: ["2026-10-15"] });
  // Miss a second day with no saves left: gone.
  assert.deepEqual(streakState(span("2026-10-01", 14), "2026-10-17"), { streak: 0, best: 14, saves: 0, saved: ["2026-10-15"] });
});

test("streak saves: two saves cover two days running, a third miss ends it", () => {
  const base = span("2026-10-01", 28); // through Oct 28, two saves in hand
  assert.deepEqual(streakState(base, "2026-10-31"), { streak: 28, best: 28, saves: 0, saved: ["2026-10-29", "2026-10-30"] });
  assert.equal(streakState(base, "2026-11-01").streak, 0);
  assert.equal(streakState([...base, "2026-10-31"], "2026-10-31").streak, 29);
});

test("streak saves: a used save is earned back, and saves never rescue a run that's already dead", () => {
  // Use one after 14 days, then 14 more check-ins earns another.
  const days = [...span("2026-10-01", 14), ...span("2026-10-16", 14)];
  assert.deepEqual(streakState(days, "2026-10-29"), { streak: 28, best: 28, saves: 1, saved: ["2026-10-15"] });
  // A lone check-in after a long gap starts from one.
  const gap = [...span("2026-09-01", 3), "2026-11-27"];
  assert.deepEqual(streakState(gap, "2026-11-27"), { streak: 1, best: 3, saves: 0, saved: [] });
  // Across a year end.
  assert.equal(streakState(span("2026-12-20", 20), "2027-01-08").streak, 20);
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
  hiddenProductIds: [],
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
