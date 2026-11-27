// Runs only when TEST_DATABASE_URL points at a throwaway Postgres database.
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import type pg from "pg";
import { PostgresStore, createPool } from "../src/pg-store.ts";

const url = process.env.TEST_DATABASE_URL;
const skip = url ? false : "TEST_DATABASE_URL not set";

let pool: pg.Pool;
let store: PostgresStore;

before(async () => {
  if (!url) return;
  pool = createPool(url);
  store = new PostgresStore(pool);
  await store.migrate();
  await store.migrate(); // running twice must be harmless
  await pool.query("TRUNCATE sign_in_codes, members");
});

after(async () => {
  await pool?.end();
});

test("codes: save, overwrite, read back and delete", { skip }, async () => {
  assert.equal(await store.getCode("a@b.co"), undefined);
  await store.putCode("a@b.co", { hash: "h1", expiresAt: 1764200000000, attempts: 0, sentAt: 1764199400000 });
  await store.putCode("a@b.co", { hash: "h2", expiresAt: 1764200000001, attempts: 2, sentAt: 1764199400001 });
  assert.deepEqual(await store.getCode("a@b.co"), {
    hash: "h2",
    expiresAt: 1764200000001,
    attempts: 2,
    sentAt: 1764199400001,
  });
  await store.deleteCode("a@b.co");
  assert.equal(await store.getCode("a@b.co"), undefined);
});

test("members: save, update and read back", { skip }, async () => {
  assert.equal(await store.getMember("m@b.co"), undefined);
  await store.putMember({ email: "m@b.co", access: { allowed: true, products: ["no_curfew"], details: {} }, checkedAt: 1 });
  await store.putMember({
    email: "m@b.co",
    access: { allowed: true, products: ["no_curfew", "pouches"], details: { no_curfew: { startedAt: 1760000000000, nextBillingAt: null, paused: false } } },
    checkedAt: 1764199400000,
  });
  assert.deepEqual(await store.getMember("m@b.co"), {
    email: "m@b.co",
    access: { allowed: true, products: ["no_curfew", "pouches"], details: { no_curfew: { startedAt: 1760000000000, nextBillingAt: null, paused: false } } },
    checkedAt: 1764199400000,
  });
});

test("drops: save, edit, list and delete", { skip }, async () => {
  await pool.query("TRUNCATE drops");
  const d = {
    id: "d1",
    kind: "deal" as const,
    audience: "all" as const,
    title: "20% off",
    body: "Only here.",
    cta: "CLAIM IT",
    url: "https://rivoxlabs.com/discount/APP20",
    startsAt: 1764199400000,
    endsAt: null,
    createdAt: 1764199400000,
  };
  await store.putDrop(d);
  await store.putDrop({ ...d, id: "d2", title: "Second", createdAt: 1764199500000 });
  await store.putDrop({ ...d, title: "25% off" });
  assert.deepEqual(await store.getDrop("d1"), { ...d, title: "25% off" });
  assert.deepEqual((await store.listDrops()).map((x) => x.id), ["d2", "d1"]);
  await store.deleteDrop("d1");
  assert.equal(await store.getDrop("d1"), undefined);
  assert.equal((await store.listDrops()).length, 1);
});

test("sync docs and usage: save, overwrite, read, and delete everything for one member", { skip }, async () => {
  await pool.query("TRUNCATE sync_docs, usage_counts, members, sign_in_codes");
  await store.putSync("a@b.co", "days", { v: 1 }, 1);
  await store.putSync("a@b.co", "days", { v: 2 }, 2);
  await store.putSync("a@b.co", "train", { t: 1 }, 2);
  await store.putSync("z@b.co", "days", { keep: true }, 2);
  assert.deepEqual(await store.getSync("a@b.co", "days"), { v: 2 });
  assert.equal(await store.getSync("a@b.co", "nope"), undefined);
  assert.equal(await store.bumpUsage("a@b.co", "meal_photo", "2026-11-26"), 1);
  assert.equal(await store.bumpUsage("a@b.co", "meal_photo", "2026-11-26"), 2);
  assert.equal(await store.bumpUsage("a@b.co", "meal_photo", "2026-11-27"), 1);
  await store.putMember({ email: "a@b.co", access: { allowed: true, products: [], details: {} }, checkedAt: 1 });
  await store.putCode("a@b.co", { hash: "h", expiresAt: 1, attempts: 0, sentAt: 1 });

  await store.deleteMemberData("a@b.co");
  assert.equal(await store.getSync("a@b.co", "days"), undefined);
  assert.equal(await store.getSync("a@b.co", "train"), undefined);
  assert.equal(await store.getMember("a@b.co"), undefined);
  assert.equal(await store.getCode("a@b.co"), undefined);
  assert.equal(await store.bumpUsage("a@b.co", "meal_photo", "2026-11-26"), 1); // counter was cleared
  assert.deepEqual(await store.getSync("z@b.co", "days"), { keep: true });
});

test("check-ins: one per member per day, countable, undoable, wiped with the member", { skip }, async () => {
  await pool.query("TRUNCATE checkins");
  await store.setCheckin("a@b.co", "2026-11-27", true);
  await store.setCheckin("a@b.co", "2026-11-27", true);
  await store.setCheckin("c@b.co", "2026-11-27", true);
  await store.setCheckin("c@b.co", "2026-11-26", true);
  assert.equal(await store.countCheckins("2026-11-27"), 2);
  assert.equal(await store.countCheckins("2026-11-26"), 1);
  assert.equal(await store.countCheckins("2026-11-25"), 0);
  await store.setCheckin("a@b.co", "2026-11-27", false);
  assert.equal(await store.countCheckins("2026-11-27"), 1);
  await store.deleteMemberData("c@b.co");
  assert.equal(await store.countCheckins("2026-11-27"), 0);
  assert.equal(await store.countCheckins("2026-11-26"), 0);
});

test("push tokens: register, move to a new owner, list, remove, wiped with the member", { skip }, async () => {
  await pool.query("TRUNCATE push_tokens");
  await store.putPushToken("a@b.co", "T1", "ios", 1);
  await store.putPushToken("a@b.co", "T2", "android", 1);
  await store.putPushToken("c@b.co", "T3", "ios", 1);
  await store.putPushToken("c@b.co", "T1", "ios", 2); // same phone, new sign-in
  const all = (await store.listPushTokens()).map((t) => `${t.email}:${t.token}`).sort();
  assert.deepEqual(all, ["a@b.co:T2", "c@b.co:T1", "c@b.co:T3"]);
  await store.deletePushToken("T3");
  await store.deleteMemberData("a@b.co");
  assert.deepEqual(await store.listPushTokens(), [{ email: "c@b.co", token: "T1" }]);
});

test("points: awarded once per reason, spent only when covered, even under a race", { skip }, async () => {
  await pool.query("TRUNCATE points_ledger, redemptions, checkins");
  assert.equal(await store.addPoints("a@b.co", "checkin", "2026-11-27", 1, 1), true);
  assert.equal(await store.addPoints("a@b.co", "checkin", "2026-11-27", 1, 1), false);
  assert.equal(await store.addPoints("a@b.co", "streak", "7", 4, 1), true);
  assert.equal(await store.addPoints("z@b.co", "checkin", "2026-11-27", 1, 1), true);
  assert.equal(await store.pointsBalance("a@b.co"), 5);
  assert.equal(await store.pointsBalance("nobody@b.co"), 0);

  assert.equal(await store.spendPoints("a@b.co", 6, "r0", 2), false);
  // Ten claims at once for 3 points each, with 5 in the bank: exactly one wins.
  const results = await Promise.all(Array.from({ length: 10 }, (_, i) => store.spendPoints("a@b.co", 3, `r${i + 1}`, 2)));
  assert.equal(results.filter(Boolean).length, 1);
  assert.equal(await store.pointsBalance("a@b.co"), 2);

  await store.removePoints("a@b.co", "streak", "7");
  assert.equal(await store.pointsBalance("a@b.co"), -2); // the store reports the truth; the routes guard against this
  assert.equal(await store.pointsBalance("z@b.co"), 1);
});

test("check-in days list newest first, and redemptions save and wipe with the member", { skip }, async () => {
  await pool.query("TRUNCATE points_ledger, redemptions, checkins");
  for (const d of ["2026-11-25", "2026-11-27", "2026-11-26"]) await store.setCheckin("a@b.co", d, true);
  await store.setCheckin("z@b.co", "2026-11-27", true);
  assert.deepEqual(await store.listCheckinDays("a@b.co", 400), ["2026-11-27", "2026-11-26", "2026-11-25"]);
  assert.deepEqual(await store.listCheckinDays("a@b.co", 2), ["2026-11-27", "2026-11-26"]);

  const base = { email: "a@b.co", rewardId: "free_tin", title: "FREE TIN", cost: 90, url: "https://rivoxlabs.com/discount/X" };
  await store.putRedemption({ ...base, id: "1", code: "X1", createdAt: 1 });
  await store.putRedemption({ ...base, id: "2", code: "X2", createdAt: 2 });
  await store.putRedemption({ ...base, id: "3", email: "z@b.co", code: "Z1", createdAt: 3 });
  assert.deepEqual((await store.listRedemptions("a@b.co")).map((r) => r.code), ["X2", "X1"]);
  await store.addPoints("a@b.co", "checkin", "2026-11-27", 1, 1);

  await store.deleteMemberData("a@b.co");
  assert.deepEqual(await store.listRedemptions("a@b.co"), []);
  assert.equal(await store.pointsBalance("a@b.co"), 0);
  assert.deepEqual(await store.listCheckinDays("a@b.co", 400), []);
  assert.deepEqual((await store.listRedemptions("z@b.co")).map((r) => r.code), ["Z1"]);
});
