import assert from "node:assert/strict";
import { test } from "node:test";
import type { Access } from "../src/access.ts";
import { dropsFor, isLive, linkAllowed, parseDrop, type Drop } from "../src/drops.ts";

const NOW = Date.UTC(2026, 10, 26);
const HOUR = 3_600_000;
const hosts = ["rivoxlabs.com"];
const good = {
  kind: "deal",
  audience: "all",
  title: "20% off your next box",
  body: "Not on the site. Not in your inbox. Only here.",
  cta: "CLAIM IT",
  url: "https://rivoxlabs.com/discount/APP20?redirect=%2Fproducts%2Fno-curfew-testosterone-support",
};
const member = (products: Access["products"]): Access => ({ allowed: true, products, details: {} });
const drop = (over: Partial<Drop>): Drop => ({
  id: "d",
  kind: "deal",
  audience: "all",
  title: "t",
  body: "b",
  cta: "c",
  url: "https://rivoxlabs.com/",
  startsAt: NOW - HOUR,
  endsAt: null,
  createdAt: NOW - HOUR,
  ...over,
});

test("links may only go to our own store, over https", () => {
  assert.equal(linkAllowed("https://rivoxlabs.com/discount/X", hosts), true);
  assert.equal(linkAllowed("https://www.rivoxlabs.com/pages/meet-no-curfew", hosts), true);
  for (const bad of [
    "http://rivoxlabs.com/",
    "https://rivoxlabs.com.evil.io/",
    "https://evilrivoxlabs.com/",
    "https://evil.io/?u=rivoxlabs.com",
    "https://user:pw@rivoxlabs.com/",
    "javascript:alert(1)",
    "rivoxlabs.com",
    "",
  ]) {
    assert.equal(linkAllowed(bad, hosts), false, bad);
  }
});

test("a good drop parses, starts now by default and has no end", () => {
  const r = parseDrop(good, hosts, NOW);
  assert.ok(r.ok);
  assert.equal(r.drop.startsAt, NOW);
  assert.equal(r.drop.endsAt, null);
  assert.equal(r.drop.title, "20% off your next box");
  assert.match(r.drop.id, /^[0-9a-f-]{36}$/);
});

test("bad drops are refused with a plain reason", () => {
  const bad = (over: Record<string, unknown>) => {
    const r = parseDrop({ ...good, ...over }, hosts, NOW);
    assert.equal(r.ok, false);
    return r.ok ? "" : r.error;
  };
  assert.match(bad({ kind: "news" }), /type/);
  assert.match(bad({ audience: "everyone" }), /who sees/);
  assert.match(bad({ title: "  " }), /Headline/);
  assert.match(bad({ title: "x".repeat(61) }), /Headline/);
  assert.match(bad({ body: "" }), /Details/);
  assert.match(bad({ cta: "" }), /Button/);
  assert.match(bad({ url: "https://evil.io/" }), /link/);
  assert.match(bad({ startsAt: "whenever" }), /Start/);
  assert.match(bad({ endsAt: "whenever" }), /End/);
  assert.match(bad({ startsAt: "2026-12-02T00:00:00Z", endsAt: "2026-12-01T00:00:00Z" }), /end after/);
  assert.equal(parseDrop(null, hosts, NOW).ok, false);
});

test("editing keeps the id and created date", () => {
  const first = parseDrop(good, hosts, NOW);
  assert.ok(first.ok);
  const second = parseDrop({ ...good, title: "New headline" }, hosts, NOW + HOUR, first.drop);
  assert.ok(second.ok);
  assert.equal(second.drop.id, first.drop.id);
  assert.equal(second.drop.createdAt, NOW);
  assert.equal(second.drop.title, "New headline");
});

test("a drop is live only inside its window", () => {
  assert.equal(isLive(drop({ startsAt: NOW + HOUR }), NOW), false);
  assert.equal(isLive(drop({ startsAt: NOW }), NOW), true);
  assert.equal(isLive(drop({ endsAt: NOW }), NOW), false);
  assert.equal(isLive(drop({ endsAt: NOW + 1 }), NOW), true);
});

test("members see only live drops meant for them, ending soonest first", () => {
  const all = [
    drop({ id: "open" }),
    drop({ id: "soon", endsAt: NOW + HOUR }),
    drop({ id: "later", endsAt: NOW + 5 * HOUR }),
    drop({ id: "pouch", audience: "pouches", endsAt: NOW + 2 * HOUR }),
    drop({ id: "nc", audience: "no_curfew" }),
    drop({ id: "future", startsAt: NOW + HOUR }),
    drop({ id: "over", endsAt: NOW - 1 }),
  ];
  const ids = (a: Access) => dropsFor(all, a, NOW).map((d) => d.id);
  assert.deepEqual(ids(member(["no_curfew"])), ["soon", "later", "open", "nc"]);
  assert.deepEqual(ids(member(["pouches"])), ["soon", "pouch", "later", "open"]);
  assert.deepEqual(ids(member(["no_curfew", "pouches"])), ["soon", "pouch", "later", "open", "nc"]);
  assert.deepEqual(ids({ allowed: false, products: [], details: {} }), []);
});
