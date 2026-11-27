import assert from "node:assert/strict";
import { test } from "node:test";
import type { Subscription } from "../src/access.ts";
import { ACCESS_FRESH_MS, createApp } from "../src/app.ts";
import { CODE_TTL_MS, MAX_ATTEMPTS } from "../src/codes.ts";
import type { Config } from "../src/config.ts";
import { MemoryStore } from "../src/store.ts";
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
};

function setup(subsByEmail: Record<string, Subscription[]> = {}, meals?: MealEstimator) {
  const sent: { to: string; code: string }[] = [];
  const clock = { t: 1_800_000_000_000 };
  const loopState = { subs: subsByEmail, fail: false, calls: 0 };
  const app = createApp({
    config,
    store: new MemoryStore(),
    meals,
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
  return { app, post, signIn, sent, clock, loopState };
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
