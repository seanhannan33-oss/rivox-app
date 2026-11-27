import assert from "node:assert/strict";
import { test } from "node:test";
import { decideAccess, type Subscription } from "../src/access.ts";

const map = { noCurfewProductIds: ["111"], pouchProductIds: ["222"] };
const NOW = Date.UTC(2026, 10, 26);
const DAY = 86_400_000;
const none = { startedAt: null, nextBillingAt: null, paused: false };
const sub = (over: Partial<Subscription>): Subscription => ({
  id: "s1",
  status: "ACTIVE",
  productIds: [],
  productTitles: [],
  startedAt: null,
  nextBillingAt: null,
  ...over,
});

test("active No Curfew subscription gets in", () => {
  assert.deepEqual(decideAccess([sub({ productIds: ["111"] })], map), {
    allowed: true,
    products: ["no_curfew"],
    details: { no_curfew: none },
  });
});

test("active pouch subscription gets in", () => {
  assert.deepEqual(decideAccess([sub({ productIds: ["222"] })], map), {
    allowed: true,
    products: ["pouches"],
    details: { pouches: none },
  });
});

test("paused keeps access", () => {
  assert.equal(decideAccess([sub({ status: "PAUSED", productIds: ["111"] })], map).allowed, true);
});

test("cancelled and expired are locked out", () => {
  assert.equal(decideAccess([sub({ status: "CANCELLED", productIds: ["111"] })], map).allowed, false);
  assert.equal(decideAccess([sub({ status: "EXPIRED", productIds: ["222"] })], map).allowed, false);
});

test("no subscriptions is locked out", () => {
  assert.deepEqual(decideAccess([], map), { allowed: false, products: [], details: {} });
});

test("both subscriptions show both products, No Curfew first", () => {
  const access = decideAccess([sub({ id: "a", productIds: ["222"] }), sub({ id: "b", productIds: ["111"] })], map);
  assert.deepEqual(access.products, ["no_curfew", "pouches"]);
});

test("a cancelled sub does not count even beside an active one", () => {
  const access = decideAccess(
    [sub({ id: "a", status: "CANCELLED", productIds: ["111"] }), sub({ id: "b", productIds: ["222"] })],
    map,
  );
  assert.deepEqual(access.products, ["pouches"]);
  assert.equal(access.details.no_curfew, undefined);
});

test("falls back to titles when product IDs do not match", () => {
  const access = decideAccess([sub({ productIds: ["999"], productTitles: ["Rivox Pouch Starter Kit"] })], map);
  assert.deepEqual(access.products, ["pouches"]);
  assert.equal(access.details.no_curfew, undefined);
});

test("an active subscription to an unknown product does not get in", () => {
  assert.equal(decideAccess([sub({ productIds: ["999"], productTitles: ["Energy Gum"] })], map).allowed, false);
});

test("status is case-insensitive", () => {
  assert.equal(decideAccess([sub({ status: "active", productIds: ["111"] })], map).allowed, true);
});

test("dates: earliest start, soonest upcoming billing, per product", () => {
  const access = decideAccess(
    [
      sub({ id: "old", status: "CANCELLED", productIds: ["111"], startedAt: NOW - 400 * DAY, nextBillingAt: NOW + DAY }),
      sub({ id: "a", productIds: ["111"], startedAt: NOW - 40 * DAY, nextBillingAt: NOW + 49 * DAY }),
      sub({ id: "b", productIds: ["111"], startedAt: NOW - 10 * DAY, nextBillingAt: NOW + 20 * DAY }),
      sub({ id: "c", productIds: ["222"], startedAt: NOW - 5 * DAY, nextBillingAt: NOW + 12 * DAY }),
    ],
    map,
    NOW,
  );
  assert.deepEqual(access.details.no_curfew, { startedAt: NOW - 40 * DAY, nextBillingAt: NOW + 20 * DAY, paused: false });
  assert.deepEqual(access.details.pouches, { startedAt: NOW - 5 * DAY, nextBillingAt: NOW + 12 * DAY, paused: false });
});

test("dates: a paused subscription has no next box, and a past billing date is ignored", () => {
  const paused = decideAccess(
    [sub({ status: "PAUSED", productIds: ["111"], startedAt: NOW - 30 * DAY, nextBillingAt: NOW + 9 * DAY })],
    map,
    NOW,
  );
  assert.deepEqual(paused.details.no_curfew, { startedAt: NOW - 30 * DAY, nextBillingAt: null, paused: true });

  const stale = decideAccess([sub({ productIds: ["222"], nextBillingAt: NOW - DAY })], map, NOW);
  assert.equal(stale.details.pouches!.nextBillingAt, null);

  const mixed = decideAccess(
    [sub({ id: "p", status: "PAUSED", productIds: ["111"] }), sub({ id: "a", productIds: ["111"], nextBillingAt: NOW + DAY })],
    map,
    NOW,
  );
  assert.deepEqual(mixed.details.no_curfew, { startedAt: null, nextBillingAt: NOW + DAY, paused: false });
});
