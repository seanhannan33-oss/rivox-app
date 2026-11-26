import assert from "node:assert/strict";
import { test } from "node:test";
import { parseSubscriptions } from "../src/loop.ts";

test("parses a wrapped list with lines", () => {
  const subs = parseSubscriptions({
    data: [{ id: 7, status: "ACTIVE", lines: [{ productShopifyId: 111, productTitle: "No Curfew" }] }],
  });
  assert.deepEqual(subs, [{ id: "7", status: "ACTIVE", productIds: ["111"], productTitles: ["No Curfew"] }]);
});

test("parses a bare array and tolerates missing fields", () => {
  assert.deepEqual(parseSubscriptions([{ id: "a" }]), [{ id: "a", status: "", productIds: [], productTitles: [] }]);
});

test("garbage in, empty list out", () => {
  assert.deepEqual(parseSubscriptions(null), []);
  assert.deepEqual(parseSubscriptions({ nope: true }), []);
});
