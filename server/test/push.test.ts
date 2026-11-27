import assert from "node:assert/strict";
import { test } from "node:test";
import { ExpoPushSender, inAudience, isPushToken, parsePush } from "../src/push.ts";

test("token format", () => {
  assert.equal(isPushToken("ExponentPushToken[abcDEF123_-xyz]"), true);
  assert.equal(isPushToken("ExpoPushToken[abcDEF123456]"), true);
  for (const bad of ["", "abc", "ExponentPushToken[]", "ExponentPushToken[a b c d e f]", 5, null]) assert.equal(isPushToken(bad), false);
});

test("parsePush trims, limits and defaults the tab", () => {
  const ok = parsePush({ title: "  New flavor ", body: " Sour Apple. ", audience: "pouches" });
  assert.deepEqual(ok, { ok: true, message: { title: "New flavor", body: "Sour Apple.", tab: "drops" }, audience: "pouches" });
  assert.equal(parsePush({ title: "x".repeat(51), body: "b", audience: "all" }).ok, false);
  assert.equal(parsePush({ title: "t", body: "", audience: "all" }).ok, false);
  assert.equal(parsePush({ title: "t", body: "b" }).ok, false);
  assert.equal(parsePush(null).ok, false);
  const today = parsePush({ title: "t", body: "b", audience: "all", tab: "today" });
  assert.ok(today.ok && today.message.tab === "today");
});

test("audience: members only, matched to their subscription", () => {
  const nc = { allowed: true, products: ["no_curfew" as const], details: {} };
  assert.equal(inAudience(nc, "all"), true);
  assert.equal(inAudience(nc, "no_curfew"), true);
  assert.equal(inAudience(nc, "pouches"), false);
  assert.equal(inAudience({ allowed: false, products: [], details: {} }, "all"), false);
  assert.equal(inAudience(undefined, "all"), false);
});

test("ExpoPushSender sends in batches of 100 and reports dead tokens", async () => {
  const calls: { url: string; headers: Record<string, string>; body: any[] }[] = [];
  const fake = (async (url: string | URL | Request, init?: RequestInit) => {
    const body = JSON.parse(String(init!.body)) as any[];
    calls.push({ url: String(url), headers: init!.headers as Record<string, string>, body });
    return new Response(
      JSON.stringify({
        data: body.map((m) =>
          m.to.includes("dead")
            ? { status: "error", details: { error: "DeviceNotRegistered" } }
            : m.to.includes("flaky")
              ? { status: "error", details: { error: "MessageRateExceeded" } }
              : { status: "ok", id: "x" },
        ),
      }),
      { status: 200 },
    );
  }) as typeof fetch;
  const tokens = Array.from({ length: 248 }, (_, i) => `ExponentPushToken[ok${i}]`).concat(["ExponentPushToken[dead1]", "ExponentPushToken[flaky1]"]);
  const result = await new ExpoPushSender("", fake).send(tokens, { title: "T", body: "B", tab: "drops" });
  assert.deepEqual(calls.map((c) => c.body.length), [100, 100, 50]);
  assert.equal(calls[0]!.url, "https://exp.host/--/api/v2/push/send");
  assert.equal(calls[0]!.headers.Authorization, undefined);
  assert.deepEqual(calls[0]!.body[0], { to: "ExponentPushToken[ok0]", title: "T", body: "B", sound: "default", data: { tab: "drops" } });
  assert.deepEqual(result, { sent: 248, failed: 2, dead: ["ExponentPushToken[dead1]"] }); // flaky is a failure, but not dead
});

test("ExpoPushSender uses the access token when given, and survives the service being down", async () => {
  let auth = "";
  const up = (async (_u: string | URL | Request, init?: RequestInit) => {
    auth = (init!.headers as Record<string, string>).Authorization ?? "";
    return new Response(JSON.stringify({ data: [{ status: "ok" }] }), { status: 200 });
  }) as typeof fetch;
  await new ExpoPushSender("secret", up).send(["ExponentPushToken[a]"], { title: "T", body: "B" });
  assert.equal(auth, "Bearer secret");

  const down = (async () => new Response("nope", { status: 503 })) as typeof fetch;
  assert.deepEqual(await new ExpoPushSender("", down).send(["a", "b"], { title: "T", body: "B" }), { sent: 0, failed: 2, dead: [] });
  const boom = (async () => {
    throw new Error("network");
  }) as typeof fetch;
  assert.deepEqual(await new ExpoPushSender("", boom).send(["a"], { title: "T", body: "B" }), { sent: 0, failed: 1, dead: [] });
  assert.deepEqual(await new ExpoPushSender("", boom).send([], { title: "T", body: "B" }), { sent: 0, failed: 0, dead: [] });
});
