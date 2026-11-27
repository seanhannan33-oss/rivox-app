import assert from "node:assert/strict";
import { test } from "node:test";
import type { Subscription } from "../src/access.ts";
import { ACCESS_FRESH_MS, createApp } from "../src/app.ts";
import { CODE_TTL_MS, MAX_ATTEMPTS } from "../src/codes.ts";
import type { Config } from "../src/config.ts";
import { MemoryStore } from "../src/store.ts";
import type { PushMessage } from "../src/push.ts";
import type { RewardIssuer } from "../src/rewards.ts";
import type { MealEstimator } from "../src/vision.ts";

const config: Config = {
  port: 0,
  sessionSecret: "test-secret-test-secret-test-secret-1234",
  loop: {
    token: "t",
    base: "http://loop.test",
    authHeader: "X-Loop-Token",
    subscriptionsByEmailPath: "/customer/{email}/subscription",
    webhookSecret: "hook-secret",
    webhookSecretHeader: "X-Loop-Webhook-Secret",
  },
  noCurfewProductIds: ["111"],
  pouchProductIds: ["222"],
  emailProvider: "console",
  emailFrom: "",
  resendApiKey: "",
  databaseUrl: "",
  adminToken: "admin-token-admin-token-admin-token-1",
  linkHosts: ["rivoxlabs.com"],
  anthropicApiKey: "",
  visionModel: "test-model",
  photoDailyLimit: 2,
  trustedProxyHops: 1,
  codeDailyLimit: 4,
  expoAccessToken: "",
  points: {
    perCheckin: 1,
    streakBonus: { 3: 2 },
    rewards: [
      { id: "five_off", title: "$5 OFF", blurb: "", cost: 3 },
      { id: "free_tin", title: "FREE TIN", blurb: "", cost: 5 },
    ],
  },
  shopify: { storeDomain: "", adminToken: "", apiVersion: "x", siteUrl: "https://rivoxlabs.com", tinProductIds: [], redirectPath: "/" },
};

function setup(subsByEmail: Record<string, Subscription[]> = {}, meals?: MealEstimator, rewards?: RewardIssuer) {
  const sent: { to: string; code: string }[] = [];
  const pushed: { tokens: string[]; message: PushMessage }[] = [];
  const clock = { t: 1_800_000_000_000 };
  const loopState = { subs: subsByEmail, fail: false, calls: 0 };
  const app = createApp({
    config,
    store: new MemoryStore(),
    meals,
    rewards,
    push: {
      send: async (tokens, message) => {
        pushed.push({ tokens, message });
        const dead = tokens.filter((t) => t.includes("DEAD"));
        return { sent: tokens.length - dead.length, failed: dead.length, dead };
      },
    },
    now: () => clock.t,
    email: { sendCode: async (to, code) => void sent.push({ to, code }) },
    loop: {
      subscriptionsByEmail: async (email) => {
        loopState.calls++;
        if (loopState.fail) throw new Error("loop down");
        return loopState.subs[email] ?? [];
      },
    },
  });
  const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
    app.request(path, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
    });
  const signIn = async (email: string) => {
    await post("/auth/request-code", { email });
    const code = sent.at(-1)!.code;
    const res = await post("/auth/verify", { email, code });
    return { res, body: (await res.json()) as any };
  };
  return { app, post, signIn, sent, pushed, clock, loopState };
}

const active = (productId: string): Subscription => ({
  id: "s",
  status: "ACTIVE",
  productIds: [productId],
  productTitles: [],
  startedAt: null,
  nextBillingAt: null,
});

test("a subscriber signs in and gets access", async () => {
  const { signIn, app } = setup({ "dan@example.com": [active("111")] });
  const { res, body } = await signIn("Dan@Example.com ");
  assert.equal(res.status, 200);
  const expected = { allowed: true, products: ["no_curfew"], details: { no_curfew: { startedAt: null, nextBillingAt: null, paused: false } } };
  assert.deepEqual(body.access, expected);

  const me = await app.request("/me", { headers: { Authorization: `Bearer ${body.token}` } });
  assert.equal(me.status, 200);
  assert.deepEqual(await me.json(), { email: "dan@example.com", access: expected });
});

test("a non-subscriber can sign in but is locked out", async () => {
  const { signIn } = setup();
  const { res, body } = await signIn("nobody@example.com");
  assert.equal(res.status, 200);
  assert.deepEqual(body.access, { allowed: false, products: [], details: {} });
});

test("request-code answers the same for subscribers and strangers", async () => {
  const { post } = setup({ "dan@example.com": [active("111")] });
  const a = await post("/auth/request-code", { email: "dan@example.com" });
  const b = await post("/auth/request-code", { email: "stranger@example.com" });
  assert.equal(a.status, b.status);
  assert.deepEqual(await a.json(), await b.json());
});

test("a wrong code is rejected and a code works only once", async () => {
  const { post, sent } = setup({ "dan@example.com": [active("111")] });
  await post("/auth/request-code", { email: "dan@example.com" });
  const code = sent[0]!.code;
  const wrong = code === "000000" ? "000001" : "000000";
  assert.equal((await post("/auth/verify", { email: "dan@example.com", code: wrong })).status, 401);
  assert.equal((await post("/auth/verify", { email: "dan@example.com", code })).status, 200);
  assert.equal((await post("/auth/verify", { email: "dan@example.com", code })).status, 401);
});

test("a code expires", async () => {
  const { post, sent, clock } = setup();
  await post("/auth/request-code", { email: "dan@example.com" });
  clock.t += CODE_TTL_MS + 1;
  const res = await post("/auth/verify", { email: "dan@example.com", code: sent[0]!.code });
  assert.equal(res.status, 401);
  assert.equal(((await res.json()) as any).error, "expired");
});

test("too many wrong guesses burns the code", async () => {
  const { post, sent } = setup();
  await post("/auth/request-code", { email: "dan@example.com" });
  const code = sent[0]!.code;
  const wrong = code === "000000" ? "000001" : "000000";
  for (let i = 0; i < MAX_ATTEMPTS; i++) await post("/auth/verify", { email: "dan@example.com", code: wrong });
  const res = await post("/auth/verify", { email: "dan@example.com", code });
  assert.equal(res.status, 401);
  assert.equal(((await res.json()) as any).error, "too_many_attempts");
});

test("asking again right away does not send a second email", async () => {
  const { post, sent } = setup();
  await post("/auth/request-code", { email: "dan@example.com" });
  await post("/auth/request-code", { email: "dan@example.com" });
  assert.equal(sent.length, 1);
});

test("bad input is refused", async () => {
  const { post } = setup();
  assert.equal((await post("/auth/request-code", { email: "not-an-email" })).status, 400);
  assert.equal((await post("/auth/verify", { email: "dan@example.com", code: "12" })).status, 400);
});

test("/me rejects a missing or forged token", async () => {
  const { app, signIn } = setup({ "dan@example.com": [active("111")] });
  assert.equal((await app.request("/me")).status, 401);
  const { body } = await signIn("dan@example.com");
  const forged = body.token.slice(0, -2) + "xx";
  assert.equal((await app.request("/me", { headers: { Authorization: `Bearer ${forged}` } })).status, 401);
});

test("cancelling locks the member out once the webhook arrives", async () => {
  const { app, post, signIn, loopState } = setup({ "dan@example.com": [active("111")] });
  const { body } = await signIn("dan@example.com");
  loopState.subs["dan@example.com"] = [{ ...active("111"), status: "CANCELLED" }];

  const denied = await post("/webhooks/loop", { customer: { email: "dan@example.com" } }, { "X-Loop-Webhook-Secret": "nope" });
  assert.equal(denied.status, 401);
  const hook = await post("/webhooks/loop", { customer: { email: "dan@example.com" } }, { "X-Loop-Webhook-Secret": "hook-secret" });
  assert.equal(hook.status, 200);

  const me = await app.request("/me", { headers: { Authorization: `Bearer ${body.token}` } });
  assert.deepEqual(((await me.json()) as any).access, { allowed: false, products: [], details: {} });
});

test("/me re-checks Loop only after the answer goes stale", async () => {
  const { app, signIn, loopState, clock } = setup({ "dan@example.com": [active("222")] });
  const { body } = await signIn("dan@example.com");
  const headers = { Authorization: `Bearer ${body.token}` };
  const before = loopState.calls;
  await app.request("/me", { headers });
  assert.equal(loopState.calls, before);
  clock.t += ACCESS_FRESH_MS + 1;
  await app.request("/me", { headers });
  assert.equal(loopState.calls, before + 1);
});

test("a Loop outage does not lock out a known member", async () => {
  const { app, signIn, loopState, clock } = setup({ "dan@example.com": [active("111")] });
  const { body } = await signIn("dan@example.com");
  clock.t += ACCESS_FRESH_MS + 1;
  loopState.fail = true;
  const me = await app.request("/me", { headers: { Authorization: `Bearer ${body.token}` } });
  assert.equal(me.status, 200);
  const json = (await me.json()) as any;
  assert.equal(json.access.allowed, true);
  assert.equal(json.stale, true);
});

test("a Loop outage during sign-in returns 503, not a false lockout", async () => {
  const { post, sent, loopState } = setup({ "dan@example.com": [active("111")] });
  await post("/auth/request-code", { email: "dan@example.com" });
  loopState.fail = true;
  const res = await post("/auth/verify", { email: "dan@example.com", code: sent[0]!.code });
  assert.equal(res.status, 503);
});

// ---- Drops ----

const ADMIN = { Authorization: "Bearer admin-token-admin-token-admin-token-1" };
const dealBody = {
  kind: "deal",
  audience: "no_curfew",
  title: "20% off your next box",
  body: "Not on the site. Not in your inbox. Only here.",
  cta: "CLAIM IT",
  url: "https://rivoxlabs.com/discount/APP20",
};

test("admin routes refuse a missing or wrong token", async () => {
  const { app, post } = setup();
  assert.equal((await app.request("/admin/drops")).status, 401);
  assert.equal((await app.request("/admin/drops", { headers: { Authorization: "Bearer nope" } })).status, 401);
  assert.equal((await post("/admin/drops", dealBody)).status, 401);
  assert.equal((await app.request("/admin/drops/x", { method: "DELETE" })).status, 401);
});

test("the admin page is served without data, and locked down", async () => {
  const { app } = setup();
  const res = await app.request("/admin");
  assert.equal(res.status, 200);
  assert.match(res.headers.get("content-security-policy") ?? "", /default-src 'none'/);
  assert.equal(res.headers.get("x-frame-options"), "DENY");
  const html = await res.text();
  assert.match(html, /Rivox app admin/);
  assert.equal(html.includes("admin-token-admin-token"), false);
});

test("a posted deal reaches the right members only, then can be edited and removed", async () => {
  const { app, post, signIn } = setup({
    "nc@example.com": [active("111")],
    "pouch@example.com": [active("222")],
    "none@example.com": [],
  });
  const created = await post("/admin/drops", dealBody, ADMIN);
  assert.equal(created.status, 201);
  const id = ((await created.json()) as any).drop.id as string;

  const feed = async (email: string) => {
    const { body } = await signIn(email);
    const res = await app.request("/drops", { headers: { Authorization: `Bearer ${body.token}` } });
    return { status: res.status, body: (await res.json()) as any };
  };
  const nc = await feed("nc@example.com");
  assert.equal(nc.status, 200);
  assert.deepEqual(nc.body.drops.map((d: any) => d.title), ["20% off your next box"]);
  assert.deepEqual((await feed("pouch@example.com")).body.drops, []);
  assert.equal((await feed("none@example.com")).status, 403);
  assert.equal((await app.request("/drops")).status, 401);

  const edited = await app.request(`/admin/drops/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...ADMIN },
    body: JSON.stringify({ ...dealBody, audience: "all", title: "25% off" }),
  });
  assert.equal(edited.status, 200);
  assert.deepEqual((await feed("pouch@example.com")).body.drops.map((d: any) => d.title), ["25% off"]);

  assert.equal((await app.request(`/admin/drops/${id}`, { method: "DELETE", headers: ADMIN })).status, 200);
  assert.deepEqual((await feed("nc@example.com")).body.drops, []);
});

test("a drop with a link off our store is refused", async () => {
  const { post } = setup();
  const res = await post("/admin/drops", { ...dealBody, url: "https://evil.example/discount/APP20" }, ADMIN);
  assert.equal(res.status, 400);
  assert.match(((await res.json()) as any).message, /link/);
});

test("scheduled and expired drops stay hidden from members", async () => {
  const { app, post, signIn, clock } = setup({ "nc@example.com": [active("111")] });
  const start = new Date(clock.t + 3_600_000).toISOString();
  const end = new Date(clock.t + 7_200_000).toISOString();
  await post("/admin/drops", { ...dealBody, startsAt: start, endsAt: end }, ADMIN);
  const { body } = await signIn("nc@example.com");
  const count = async () =>
    ((await (await app.request("/drops", { headers: { Authorization: `Bearer ${body.token}` } })).json()) as any).drops
      .length;
  assert.equal(await count(), 0);
  clock.t += 3_600_001;
  assert.equal(await count(), 1);
  clock.t += 3_600_000;
  assert.equal(await count(), 0);
});

// ---- Meal photos ----

const PHOTO = "A".repeat(400);
const fakeMeals = (calls: { n: number }, fail = false): MealEstimator => ({
  estimate: async () => {
    calls.n++;
    if (fail) throw new Error("model down");
    return { isFood: true, label: "4 eggs, toast", items: [{ name: "eggs", proteinG: 24 }], proteinG: 31, confidence: "medium" };
  },
});

test("a member gets a protein estimate from a photo, up to the daily limit", async () => {
  const calls = { n: 0 };
  const { post, signIn, clock } = setup({ "nc@example.com": [active("111")] }, fakeMeals(calls));
  const { body } = await signIn("nc@example.com");
  const send = () => post("/fuel/estimate", { image: PHOTO, mediaType: "image/jpeg" }, { Authorization: `Bearer ${body.token}` });

  const first = await send();
  assert.equal(first.status, 200);
  const data = (await first.json()) as any;
  assert.equal(data.estimate.proteinG, 31);
  assert.equal(data.left, 1);
  assert.equal((await send()).status, 200);
  const third = await send();
  assert.equal(third.status, 429);
  assert.equal(((await third.json()) as any).error, "photo_limit");
  assert.equal(calls.n, 2); // the blocked one never reached the model

  clock.t += 24 * 3_600_000; // new day, fresh allowance
  assert.equal((await send()).status, 200);
});

test("meal photos are members only and refuse junk", async () => {
  const calls = { n: 0 };
  const { post, signIn } = setup({ "nc@example.com": [active("111")], "none@example.com": [] }, fakeMeals(calls));
  assert.equal((await post("/fuel/estimate", { image: PHOTO, mediaType: "image/jpeg" })).status, 401);
  const outsider = await signIn("none@example.com");
  const out = await post("/fuel/estimate", { image: PHOTO, mediaType: "image/jpeg" }, { Authorization: `Bearer ${outsider.body.token}` });
  assert.equal(out.status, 403);

  const { body } = await signIn("nc@example.com");
  const auth = { Authorization: `Bearer ${body.token}` };
  assert.equal((await post("/fuel/estimate", { image: PHOTO, mediaType: "image/gif" }, auth)).status, 400);
  assert.equal((await post("/fuel/estimate", { image: "not base64!!".repeat(20), mediaType: "image/png" }, auth)).status, 400);
  assert.equal((await post("/fuel/estimate", { mediaType: "image/png" }, auth)).status, 400);
  assert.equal(calls.n, 0);
});

test("photos are off without a key, and a model failure is reported plainly", async () => {
  const off = setup({ "nc@example.com": [active("111")] });
  const a = await off.signIn("nc@example.com");
  const res = await off.post("/fuel/estimate", { image: PHOTO, mediaType: "image/jpeg" }, { Authorization: `Bearer ${a.body.token}` });
  assert.equal(res.status, 503);
  assert.equal(((await res.json()) as any).error, "photo_unavailable");

  const broken = setup({ "nc@example.com": [active("111")] }, fakeMeals({ n: 0 }, true));
  const b = await broken.signIn("nc@example.com");
  const bad = await broken.post("/fuel/estimate", { image: PHOTO, mediaType: "image/jpeg" }, { Authorization: `Bearer ${b.body.token}` });
  assert.equal(bad.status, 502);
  assert.equal(((await bad.json()) as any).error, "photo_failed");
});

// ---- Sync and account deletion ----

test("a member's data syncs up and comes back, per part", async () => {
  const { app, signIn } = setup({ "nc@example.com": [active("111")] });
  const { body } = await signIn("nc@example.com");
  const auth = { Authorization: `Bearer ${body.token}`, "Content-Type": "application/json" };
  const get = async (part: string) => (await (await app.request(`/sync/${part}`, { headers: auth })).json()) as any;
  const put = (part: string, payload: unknown) =>
    app.request(`/sync/${part}`, { method: "PUT", headers: auth, body: JSON.stringify(payload) });

  assert.equal((await get("days")).data, null);
  const days = { firstDay: "2026-11-26", log: { "2026-11-26": { caps: true, t: 5 } } };
  assert.equal((await put("days", { data: days })).status, 200);
  assert.deepEqual((await get("days")).data, days);
  assert.equal((await get("train")).data, null); // parts are separate

  assert.equal((await put("fuel", { data: {} })).status, 404); // weight and food never sync
  assert.equal((await put("days", { data: [1, 2] })).status, 400);
  assert.equal((await put("days", { nope: true })).status, 400);
  assert.equal((await put("days", { data: { pad: "x".repeat(300_001) } })).status, 413);
  assert.equal((await app.request("/sync/days")).status, 401);
});

test("only members can save, and one member can't see another's data", async () => {
  const { app, signIn } = setup({ "a@example.com": [active("111")], "b@example.com": [active("111")], "none@example.com": [] });
  const hdr = async (email: string) => ({
    Authorization: `Bearer ${(await signIn(email)).body.token}`,
    "Content-Type": "application/json",
  });
  const a = await hdr("a@example.com");
  await app.request("/sync/days", { method: "PUT", headers: a, body: JSON.stringify({ data: { secret: 1 } }) });
  const b = await hdr("b@example.com");
  assert.equal(((await (await app.request("/sync/days", { headers: b })).json()) as any).data, null);
  const none = await hdr("none@example.com");
  const res = await app.request("/sync/days", { method: "PUT", headers: none, body: JSON.stringify({ data: {} }) });
  assert.equal(res.status, 403);
});

test("deleting the account wipes everything held for that email", async () => {
  const calls = { n: 0 };
  const { app, post, signIn } = setup({ "nc@example.com": [active("111")], "b@example.com": [active("111")] }, fakeMeals(calls));
  const { body } = await signIn("nc@example.com");
  const auth = { Authorization: `Bearer ${body.token}`, "Content-Type": "application/json" };
  await app.request("/sync/days", { method: "PUT", headers: auth, body: JSON.stringify({ data: { x: 1 } }) });
  await app.request("/sync/train", { method: "PUT", headers: auth, body: JSON.stringify({ data: { y: 1 } }) });
  await post("/fuel/estimate", { image: PHOTO, mediaType: "image/jpeg" }, auth);
  const other = await signIn("b@example.com");
  const otherAuth = { Authorization: `Bearer ${other.body.token}`, "Content-Type": "application/json" };
  await app.request("/sync/days", { method: "PUT", headers: otherAuth, body: JSON.stringify({ data: { keep: 1 } }) });

  assert.equal((await app.request("/me", { method: "DELETE" })).status, 401);
  assert.equal((await app.request("/me", { method: "DELETE", headers: auth })).status, 200);

  assert.equal(((await (await app.request("/sync/days", { headers: auth })).json()) as any).data, null);
  assert.equal(((await (await app.request("/sync/train", { headers: auth })).json()) as any).data, null);
  // Someone else's data is untouched.
  assert.deepEqual(((await (await app.request("/sync/days", { headers: otherAuth })).json()) as any).data, { keep: 1 });
});

// ---- Rate limits ----

test("one address can't request codes without end", async () => {
  const { app } = setup();
  const ask = (i: number, ip: string) =>
    app.request("/auth/request-code", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Forwarded-For": ip },
      body: JSON.stringify({ email: `p${i}@example.com` }),
    });
  for (let i = 0; i < 20; i++) assert.equal((await ask(i, "1.1.1.1")).status, 200);
  const blocked = await ask(99, "1.1.1.1");
  assert.equal(blocked.status, 429);
  assert.equal(((await blocked.json()) as any).error, "too_many_requests");
  assert.equal((await ask(100, "2.2.2.2")).status, 200); // someone else is unaffected
  // Faking the front of the header doesn't get around it.
  assert.equal((await ask(101, "7.7.7.7, 1.1.1.1")).status, 429);
});

test("one email gets a limited number of codes a day", async () => {
  const { app, sent, clock } = setup();
  const ask = (ip: string) =>
    app.request("/auth/request-code", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Forwarded-For": ip },
      body: JSON.stringify({ email: "dan@example.com" }),
    });
  for (let i = 0; i < 4; i++) {
    assert.equal((await ask(`3.3.3.${i}`)).status, 200);
    clock.t += 61_000; // past the resend wait each time
  }
  assert.equal(sent.length, 4);
  assert.equal((await ask("3.3.3.9")).status, 429);
  assert.equal(sent.length, 4); // no fifth email went out
  clock.t += 24 * 3_600_000;
  assert.equal((await ask("3.3.3.10")).status, 200); // new day
});

test("code guessing from one address is cut off", async () => {
  const { app } = setup();
  const guess = () =>
    app.request("/auth/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Forwarded-For": "4.4.4.4" },
      body: JSON.stringify({ email: "dan@example.com", code: "000000" }),
    });
  for (let i = 0; i < 60; i++) assert.notEqual((await guess()).status, 429);
  assert.equal((await guess()).status, 429);
});

test("the admin can see which address the server thinks they are", async () => {
  const { app } = setup();
  const res = await app.request("/admin/whoami", { headers: { ...ADMIN, "X-Forwarded-For": "9.9.9.9, 5.5.5.5" } });
  assert.deepEqual(await res.json(), { ip: "5.5.5.5", forwarded: 2, trustedHops: 1 });
  assert.equal((await app.request("/admin/whoami")).status, 401);
});

// ---- Check-in count ----

test("check-ins count each member once a day and can be undone", async () => {
  const { app, signIn, clock } = setup({
    "a@example.com": [active("111")],
    "b@example.com": [active("222")],
    "none@example.com": [],
  });
  const day = new Date(clock.t).toISOString().slice(0, 10);
  const tokens: Record<string, string> = {};
  const put = async (email: string, body: unknown) => {
    tokens[email] ??= (await signIn(email)).body.token; // sign in once per person
    const res = await app.request("/checkin", {
      method: "PUT",
      headers: { Authorization: `Bearer ${tokens[email]}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return { status: res.status, body: (await res.json()) as any };
  };
  assert.equal((await put("a@example.com", { day, done: true })).body.count, 1);
  assert.equal((await put("a@example.com", { day, done: true })).body.count, 1); // tapping twice isn't two people
  assert.equal((await put("b@example.com", { day, done: true })).body.count, 2);
  assert.equal((await put("b@example.com", { day, done: false })).body.count, 1); // asking with done:false also reads the count
  assert.equal((await put("a@example.com", { day, done: false })).body.count, 0);

  assert.equal((await put("none@example.com", { day, done: true })).status, 403);
  assert.equal((await put("a@example.com", { day: "2020-01-01", done: true })).status, 400); // can't stuff old days
  assert.equal((await put("a@example.com", { day: "soon", done: true })).status, 400);
  assert.equal((await put("a@example.com", { day })).status, 400);
  assert.equal((await app.request("/checkin", { method: "PUT" })).status, 401);
});

test("deleting an account removes its check-in from the count", async () => {
  const { app, signIn, clock } = setup({ "a@example.com": [active("111")], "b@example.com": [active("111")] });
  const day = new Date(clock.t).toISOString().slice(0, 10);
  const hdr = async (email: string) => ({ Authorization: `Bearer ${(await signIn(email)).body.token}`, "Content-Type": "application/json" });
  const a = await hdr("a@example.com");
  const b = await hdr("b@example.com");
  const check = async (h: Record<string, string>, done: boolean) =>
    ((await (await app.request("/checkin", { method: "PUT", headers: h, body: JSON.stringify({ day, done }) })).json()) as any).count;
  await check(a, true);
  assert.equal(await check(b, true), 2);
  await app.request("/me", { method: "DELETE", headers: a });
  assert.equal(await check(b, true), 1);
});

// ---- Push ----

const tok = (name: string) => `ExponentPushToken[${name}xxxxxxxxxx]`;

test("phones register for alerts, and a push reaches only the right members", async () => {
  const { post, signIn, pushed } = setup({
    "nc@example.com": [active("111")],
    "pouch@example.com": [active("222")],
    "both@example.com": [active("111"), active("222")],
    "none@example.com": [],
  });
  const auth: Record<string, { Authorization: string }> = {};
  for (const email of ["nc@example.com", "pouch@example.com", "both@example.com", "none@example.com"]) {
    auth[email] = { Authorization: `Bearer ${(await signIn(email)).body.token}` };
  }
  assert.equal((await post("/push/register", { token: tok("nc"), platform: "ios" }, auth["nc@example.com"])).status, 200);
  assert.equal((await post("/push/register", { token: tok("pouch"), platform: "android" }, auth["pouch@example.com"])).status, 200);
  assert.equal((await post("/push/register", { token: tok("both") }, auth["both@example.com"])).status, 200);
  assert.equal((await post("/push/register", { token: tok("none") }, auth["none@example.com"])).status, 403);
  assert.equal((await post("/push/register", { token: "not-a-token" }, auth["nc@example.com"])).status, 400);
  assert.equal((await post("/push/register", { token: tok("x") })).status, 401);

  const msg = { title: "New flavor", body: "Sour Apple. First tins are yours." };
  const preview = await post("/admin/push", { ...msg, audience: "pouches", preview: true }, ADMIN);
  assert.deepEqual(await preview.json(), { phones: 2 });
  assert.equal(pushed.length, 0); // a preview sends nothing

  const sent = await post("/admin/push", { ...msg, audience: "pouches" }, ADMIN);
  assert.deepEqual(await sent.json(), { phones: 2, sent: 2, failed: 0 });
  assert.deepEqual(pushed[0]!.tokens.sort(), [tok("both"), tok("pouch")].sort());
  assert.deepEqual(pushed[0]!.message, { ...msg, tab: "drops" });

  await post("/admin/push", { ...msg, audience: "all" }, ADMIN);
  assert.equal(pushed[1]!.tokens.length, 3);
});

test("push needs the admin token and a real message", async () => {
  const { post } = setup();
  assert.equal((await post("/admin/push", { title: "t", body: "b", audience: "all" })).status, 401);
  assert.equal((await post("/admin/push", { title: "", body: "b", audience: "all" }, ADMIN)).status, 400);
  assert.equal((await post("/admin/push", { title: "t", body: "x".repeat(151), audience: "all" }, ADMIN)).status, 400);
  assert.equal((await post("/admin/push", { title: "t", body: "b", audience: "everyone" }, ADMIN)).status, 400);
});

test("dead tokens are forgotten, and a phone can turn alerts off", async () => {
  const { post, signIn, pushed } = setup({ "nc@example.com": [active("111")], "b@example.com": [active("111")] });
  const a = { Authorization: `Bearer ${(await signIn("nc@example.com")).body.token}` };
  const b = { Authorization: `Bearer ${(await signIn("b@example.com")).body.token}` };
  await post("/push/register", { token: tok("DEAD") }, a);
  await post("/push/register", { token: tok("live") }, a);
  await post("/push/register", { token: tok("bphone") }, b);
  const msg = { title: "t", body: "b", audience: "all" };
  assert.deepEqual(await (await post("/admin/push", msg, ADMIN)).json(), { phones: 3, sent: 2, failed: 1 });
  assert.deepEqual(await (await post("/admin/push", { ...msg, preview: true }, ADMIN)).json(), { phones: 2 });

  // b can't switch off a's phone, but a can.
  await post("/push/unregister", { token: tok("live") }, b);
  assert.deepEqual(await (await post("/admin/push", { ...msg, preview: true }, ADMIN)).json(), { phones: 2 });
  await post("/push/unregister", { token: tok("live") }, a);
  assert.deepEqual(await (await post("/admin/push", { ...msg, preview: true }, ADMIN)).json(), { phones: 1 });
  assert.ok(pushed.length >= 1);
});

test("someone who cancelled stops getting pushes once their access is re-checked", async () => {
  const { post, signIn, clock, loopState } = setup({ "nc@example.com": [active("111")] });
  const a = { Authorization: `Bearer ${(await signIn("nc@example.com")).body.token}` };
  await post("/push/register", { token: tok("nc") }, a);
  const msg = { title: "t", body: "b", audience: "all", preview: true };
  assert.deepEqual(await (await post("/admin/push", msg, ADMIN)).json(), { phones: 1 });
  loopState.subs["nc@example.com"] = []; // they cancel
  assert.deepEqual(await (await post("/admin/push", msg, ADMIN)).json(), { phones: 1 }); // checked recently, still trusted
  clock.t += 25 * 3_600_000;
  assert.deepEqual(await (await post("/admin/push", msg, ADMIN)).json(), { phones: 0 });
});

test("deleting an account removes its phones", async () => {
  const { app, post, signIn } = setup({ "nc@example.com": [active("111")] });
  const a = { Authorization: `Bearer ${(await signIn("nc@example.com")).body.token}` };
  await post("/push/register", { token: tok("nc") }, a);
  await app.request("/me", { method: "DELETE", headers: a });
  const res = await post("/admin/push", { title: "t", body: "b", audience: "all", preview: true }, ADMIN);
  assert.deepEqual(await res.json(), { phones: 0 });
});

// ---- Points and rewards ----

const dayAt = (t: number) => new Date(t).toISOString().slice(0, 10);
const DAY_MS = 24 * 3_600_000;

function rewardsRig(subs: Record<string, Subscription[]>, issuer?: RewardIssuer) {
  const rig = setup(subs, undefined, issuer);
  const tokens: Record<string, string> = {};
  const auth = async (email: string) => {
    tokens[email] ??= (await rig.signIn(email)).body.token;
    return { Authorization: `Bearer ${tokens[email]}`, "Content-Type": "application/json" };
  };
  const checkin = async (email: string, done = true, day = dayAt(rig.clock.t)) => {
    const res = await rig.app.request("/checkin", { method: "PUT", headers: await auth(email), body: JSON.stringify({ day, done }) });
    return (await res.json()) as any;
  };
  const rewards = async (email: string) => (await (await rig.app.request("/rewards", { headers: await auth(email) })).json()) as any;
  const redeem = async (email: string, rewardId: string) => {
    const res = await rig.app.request("/rewards/redeem", { method: "POST", headers: await auth(email), body: JSON.stringify({ rewardId }) });
    return { status: res.status, body: (await res.json()) as any };
  };
  return { ...rig, auth, checkin, rewards, redeem };
}

const goodIssuer = (issued: string[]): RewardIssuer => ({
  issue: async (rewardId, email) => {
    issued.push(`${rewardId}:${email}`);
    return { code: `CODE${issued.length}`, url: `https://rivoxlabs.com/discount/CODE${issued.length}` };
  },
});

test("a check-in is worth a point once a day, and a streak pays its bonus once", async () => {
  const r = rewardsRig({ "a@example.com": [active("111")] });
  assert.deepEqual(await r.checkin("a@example.com"), { count: 1, points: 1, earned: 1 });
  assert.deepEqual(await r.checkin("a@example.com"), { count: 1, points: 1, earned: 0 }); // tapping again earns nothing
  r.clock.t += DAY_MS;
  assert.equal((await r.checkin("a@example.com")).points, 2);
  r.clock.t += DAY_MS;
  assert.deepEqual(await r.checkin("a@example.com"), { count: 1, points: 5, earned: 3 }); // day 3: 1 point + 2 bonus
  r.clock.t += DAY_MS;
  assert.deepEqual(await r.checkin("a@example.com"), { count: 1, points: 6, earned: 1 }); // bonus isn't paid again
  // Break the streak, rebuild it: still no second bonus.
  r.clock.t += 3 * DAY_MS;
  for (let i = 0; i < 3; i++) {
    await r.checkin("a@example.com");
    r.clock.t += DAY_MS;
  }
  assert.equal((await r.rewards("a@example.com")).points, 9);
});

test("undoing a check-in takes the point back", async () => {
  const r = rewardsRig({ "a@example.com": [active("111")] });
  await r.checkin("a@example.com");
  assert.equal((await r.checkin("a@example.com", false)).points, 0);
  assert.equal((await r.checkin("a@example.com", false)).points, 0); // can't go negative by undoing twice
  assert.equal((await r.checkin("a@example.com")).points, 1);
});

test("points can't be farmed by sending far-off dates", async () => {
  const r = rewardsRig({ "a@example.com": [active("111")] });
  const headers = await r.auth("a@example.com");
  for (const offset of [-30, -10, -3, 3, 10, 30]) {
    const res = await r.app.request("/checkin", {
      method: "PUT",
      headers,
      body: JSON.stringify({ day: dayAt(r.clock.t + offset * DAY_MS), done: true }),
    });
    assert.equal(res.status, 400, `offset ${offset}`);
  }
  assert.equal((await r.rewards("a@example.com")).points, 0);
});

test("redeeming spends the points and hands back a code", async () => {
  const issued: string[] = [];
  const r = rewardsRig({ "a@example.com": [active("111")] }, goodIssuer(issued));
  for (let i = 0; i < 4; i++) {
    await r.checkin("a@example.com");
    r.clock.t += DAY_MS;
  }
  const before = await r.rewards("a@example.com"); // 4 check-ins + 2 streak bonus
  assert.equal(before.points, 6);
  assert.equal(before.open, true);
  assert.deepEqual(before.rewards.map((x: any) => [x.id, x.cost]), [["five_off", 3], ["free_tin", 5]]);

  const tin = await r.redeem("a@example.com", "free_tin");
  assert.equal(tin.status, 200);
  assert.equal(tin.body.points, 1);
  assert.equal(tin.body.claimed.code, "CODE1");
  assert.equal(tin.body.claimed.title, "FREE TIN");
  assert.equal("email" in tin.body.claimed, false);

  const short = await r.redeem("a@example.com", "five_off");
  assert.equal(short.status, 409);
  assert.equal(short.body.error, "not_enough_points");
  assert.deepEqual(issued, ["free_tin:a@example.com"]); // nothing was made for the failed one

  const after = await r.rewards("a@example.com");
  assert.equal(after.points, 1);
  assert.deepEqual(after.claimed.map((x: any) => x.code), ["CODE1"]);
  assert.equal((await r.redeem("a@example.com", "a_car")).status, 400);
});

test("if the code can't be made, the points come back", async () => {
  const r = rewardsRig({ "a@example.com": [active("111")] }, { issue: async () => Promise.reject(new Error("shopify down")) });
  for (let i = 0; i < 3; i++) {
    await r.checkin("a@example.com");
    r.clock.t += DAY_MS;
  }
  const res = await r.redeem("a@example.com", "five_off");
  assert.equal(res.status, 502);
  assert.equal(res.body.error, "reward_failed");
  const after = await r.rewards("a@example.com");
  assert.equal(after.points, 5);
  assert.deepEqual(after.claimed, []);
});

test("two taps at once can't spend the same points twice", async () => {
  const issued: string[] = [];
  const r = rewardsRig({ "a@example.com": [active("111")] }, goodIssuer(issued));
  for (let i = 0; i < 3; i++) {
    await r.checkin("a@example.com");
    r.clock.t += DAY_MS;
  }
  // 5 points. Two $5-off claims at 3 points each: only one can go through.
  const [x, y] = await Promise.all([r.redeem("a@example.com", "five_off"), r.redeem("a@example.com", "five_off")]);
  assert.deepEqual([x.status, y.status].sort(), [200, 409]);
  assert.equal(issued.length, 1);
  assert.equal((await r.rewards("a@example.com")).points, 2);
});

test("you have to still be subscribed to redeem, and points wait until the key is set", async () => {
  const issued: string[] = [];
  const r = rewardsRig({ "a@example.com": [active("111")] }, goodIssuer(issued));
  for (let i = 0; i < 3; i++) {
    await r.checkin("a@example.com");
    r.clock.t += DAY_MS;
  }
  r.loopState.subs["a@example.com"] = []; // cancelled
  assert.equal((await r.redeem("a@example.com", "five_off")).status, 403);
  assert.equal((await r.rewards("a@example.com")).points, 5); // points are kept, not spent
  assert.equal(issued.length, 0);

  const off = rewardsRig({ "b@example.com": [active("111")] });
  for (let i = 0; i < 3; i++) {
    await off.checkin("b@example.com");
    off.clock.t += DAY_MS;
  }
  const res = await off.redeem("b@example.com", "five_off");
  assert.equal(res.status, 503);
  assert.equal(res.body.error, "rewards_unavailable");
  const view = await off.rewards("b@example.com");
  assert.equal(view.open, false);
  assert.equal(view.points, 5);
  assert.equal((await off.app.request("/rewards")).status, 401);
});

test("deleting the account wipes points and claimed rewards", async () => {
  const r = rewardsRig({ "a@example.com": [active("111")] }, goodIssuer([]));
  for (let i = 0; i < 4; i++) {
    await r.checkin("a@example.com");
    r.clock.t += DAY_MS;
  }
  await r.redeem("a@example.com", "five_off");
  const before = await r.rewards("a@example.com");
  assert.equal(before.points, 3);
  assert.equal(before.claimed.length, 1);
  await r.app.request("/me", { method: "DELETE", headers: await r.auth("a@example.com") });
  const after = await r.rewards("a@example.com");
  assert.equal(after.points, 0);
  assert.deepEqual(after.claimed, []);
});
