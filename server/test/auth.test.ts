import assert from "node:assert/strict";
import { test } from "node:test";
import type { Subscription } from "../src/access.ts";
import { ACCESS_FRESH_MS, createApp } from "../src/app.ts";
import { CODE_TTL_MS, MAX_ATTEMPTS } from "../src/codes.ts";
import type { Config } from "../src/config.ts";
import { MemoryStore } from "../src/store.ts";

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
};

function setup(subsByEmail: Record<string, Subscription[]> = {}) {
  const sent: { to: string; code: string }[] = [];
  const clock = { t: 1_800_000_000_000 };
  const loopState = { subs: subsByEmail, fail: false, calls: 0 };
  const app = createApp({
    config,
    store: new MemoryStore(),
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
});

test("a subscriber signs in and gets access", async () => {
  const { signIn, app } = setup({ "dan@example.com": [active("111")] });
  const { res, body } = await signIn("Dan@Example.com ");
  assert.equal(res.status, 200);
  assert.deepEqual(body.access, { allowed: true, products: ["no_curfew"] });

  const me = await app.request("/me", { headers: { Authorization: `Bearer ${body.token}` } });
  assert.equal(me.status, 200);
  assert.deepEqual(await me.json(), { email: "dan@example.com", access: { allowed: true, products: ["no_curfew"] } });
});

test("a non-subscriber can sign in but is locked out", async () => {
  const { signIn } = setup();
  const { res, body } = await signIn("nobody@example.com");
  assert.equal(res.status, 200);
  assert.deepEqual(body.access, { allowed: false, products: [] });
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
  assert.deepEqual(((await me.json()) as any).access, { allowed: false, products: [] });
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
