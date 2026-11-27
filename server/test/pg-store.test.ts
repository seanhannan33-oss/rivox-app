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
