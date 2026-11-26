import assert from "node:assert/strict";
import { test } from "node:test";
import { decideAccess, type Subscription } from "../src/access.ts";

const map = { noCurfewProductIds: ["111"], pouchProductIds: ["222"] };
const sub = (over: Partial<Subscription>): Subscription => ({
  id: "s1",
  status: "ACTIVE",
  productIds: [],
  productTitles: [],
  ...over,
});

test("active No Curfew subscription gets in", () => {
  assert.deepEqual(decideAccess([sub({ productIds: ["111"] })], map), { allowed: true, products: ["no_curfew"] });
});

test("active pouch subscription gets in", () => {
  assert.deepEqual(decideAccess([sub({ productIds: ["222"] })], map), { allowed: true, products: ["pouches"] });
});

test("paused keeps access", () => {
  assert.equal(decideAccess([sub({ status: "PAUSED", productIds: ["111"] })], map).allowed, true);
});

test("cancelled and expired are locked out", () => {
  assert.equal(decideAccess([sub({ status: "CANCELLED", productIds: ["111"] })], map).allowed, false);
  assert.equal(decideAccess([sub({ status: "EXPIRED", productIds: ["222"] })], map).allowed, false);
});

test("no subscriptions is locked out", () => {
  assert.deepEqual(decideAccess([], map), { allowed: false, products: [] });
});

test("both subscriptions show both products, No Curfew first", () => {
  const access = decideAccess([sub({ id: "a", productIds: ["222"] }), sub({ id: "b", productIds: ["111"] })], map);
  assert.deepEqual(access, { allowed: true, products: ["no_curfew", "pouches"] });
});

test("a cancelled sub does not count even beside an active one", () => {
  const access = decideAccess(
    [sub({ id: "a", status: "CANCELLED", productIds: ["111"] }), sub({ id: "b", productIds: ["222"] })],
    map,
  );
  assert.deepEqual(access, { allowed: true, products: ["pouches"] });
});

test("falls back to titles when product IDs do not match", () => {
  const access = decideAccess([sub({ productIds: ["999"], productTitles: ["Rivox Pouch Starter Kit"] })], map);
  assert.deepEqual(access, { allowed: true, products: ["pouches"] });
});

test("an active subscription to an unknown product does not get in", () => {
  assert.equal(decideAccess([sub({ productIds: ["999"], productTitles: ["Energy Gum"] })], map).allowed, false);
});

test("status is case-insensitive", () => {
  assert.equal(decideAccess([sub({ status: "active", productIds: ["111"] })], map).allowed, true);
});
