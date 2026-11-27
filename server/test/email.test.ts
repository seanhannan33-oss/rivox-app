import assert from "node:assert/strict";
import { test } from "node:test";
import { ResendEmailSender } from "../src/email.ts";

test("ResendEmailSender posts the code to Resend with the key as a bearer token", async () => {
  const calls: { url: string; init: RequestInit }[] = [];
  const fake = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    return new Response(JSON.stringify({ id: "abc" }), { status: 200 });
  }) as typeof fetch;

  await new ResendEmailSender("re_test", "Rivox Labs <login@example.com>", fake).sendCode("a@b.co", "123456");

  assert.equal(calls.length, 1);
  const call = calls[0]!;
  assert.equal(call.url, "https://api.resend.com/emails");
  const headers = call.init.headers as Record<string, string>;
  assert.equal(headers.Authorization, "Bearer re_test");
  const body = JSON.parse(String(call.init.body));
  assert.deepEqual(body.to, ["a@b.co"]);
  assert.equal(body.from, "Rivox Labs <login@example.com>");
  assert.match(body.text, /123456/);
  assert.match(body.html, /123456/);
});

test("ResendEmailSender throws with the status when Resend refuses", async () => {
  const fake = (async () => new Response('{"message":"Invalid API key"}', { status: 401 })) as typeof fetch;
  await assert.rejects(
    new ResendEmailSender("bad", "x@example.com", fake).sendCode("a@b.co", "123456"),
    /Resend responded 401/,
  );
});
