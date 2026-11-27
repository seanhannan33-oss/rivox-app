import assert from "node:assert/strict";
import { test } from "node:test";
import { parseSubscriptions, toMs } from "../src/loop.ts";

test("parses a wrapped list with lines", () => {
  const subs = parseSubscriptions({
    data: [{ id: 7, status: "ACTIVE", lines: [{ productShopifyId: 111, productTitle: "No Curfew" }] }],
  });
  assert.deepEqual(subs, [
    { id: "7", status: "ACTIVE", productIds: ["111"], productTitles: ["No Curfew"], startedAt: null, nextBillingAt: null },
  ]);
});

test("parses a bare array and tolerates missing fields", () => {
  assert.deepEqual(parseSubscriptions([{ id: "a" }]), [
    { id: "a", status: "", productIds: [], productTitles: [], startedAt: null, nextBillingAt: null },
  ]);
});

test("garbage in, empty list out", () => {
  assert.deepEqual(parseSubscriptions(null), []);
  assert.deepEqual(parseSubscriptions({ nope: true }), []);
});

test("toMs reads epoch seconds, epoch ms, digit strings and ISO dates", () => {
  assert.equal(toMs(1764200000), 1764200000000);
  assert.equal(toMs(1764200000000), 1764200000000);
  assert.equal(toMs("1764200000"), 1764200000000);
  assert.equal(toMs("2026-11-26T00:00:00.000Z"), Date.UTC(2026, 10, 26));
  for (const bad of [null, undefined, "", "soon", 0, -5, {}, NaN]) assert.equal(toMs(bad), null);
});

test("parses the start and next billing dates off a subscription", () => {
  const [s] = parseSubscriptions({
    data: [{ id: 1, status: "ACTIVE", createdAt: "2026-10-17T15:00:00Z", nextBillingDateEpoch: 1766000000, lines: [] }],
  });
  assert.equal(s!.startedAt, Date.parse("2026-10-17T15:00:00Z"));
  assert.equal(s!.nextBillingAt, 1766000000000);
});
