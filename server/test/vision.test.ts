import assert from "node:assert/strict";
import { test } from "node:test";
import { AnthropicMealEstimator, parseEstimate } from "../src/vision.ts";

test("parses a clean reply", () => {
  const e = parseEstimate(
    '{"is_food": true, "label": "4 eggs, toast, coffee", "items": [{"name": "eggs", "protein_g": 24}, {"name": "toast", "protein_g": 6}], "protein_g": 31, "confidence": "high"}',
  );
  assert.deepEqual(e, {
    isFood: true,
    label: "4 eggs, toast, coffee",
    items: [
      { name: "eggs", proteinG: 24 },
      { name: "toast", proteinG: 6 },
    ],
    proteinG: 31,
    confidence: "high",
  });
});

test("tolerates wrapping text, odd numbers and missing fields", () => {
  const e = parseEstimate('Sure:\n```json\n{"items":[{"name":"chicken  breast","protein_g":"52.6"},{"name":"","protein_g":9}],"confidence":"certain"}\n```');
  assert.equal(e.isFood, true);
  assert.deepEqual(e.items, [{ name: "chicken breast", proteinG: 53 }]);
  assert.equal(e.proteinG, 53); // no total given, so the parts add up
  assert.equal(e.confidence, "low");
  assert.equal(e.label, "chicken breast");
});

test("clamps silly numbers and caps the item list", () => {
  const items = Array.from({ length: 10 }, (_, i) => ({ name: `f${i}`, protein_g: 5 }));
  const e = parseEstimate(JSON.stringify({ label: "x".repeat(200), items, protein_g: 9999 }));
  assert.equal(e.proteinG, 300);
  assert.equal(e.items.length, 6);
  assert.equal(e.label.length, 60);
  assert.equal(parseEstimate('{"protein_g": -4, "items": []}').proteinG, 0);
});

test("not food, and no JSON at all", () => {
  assert.deepEqual(parseEstimate('{"is_food": false}'), { isFood: false, label: "", items: [], proteinG: 0, confidence: "low" });
  assert.throws(() => parseEstimate("I can't help with that."), /no JSON/);
});

test("AnthropicMealEstimator sends the image and reads the text reply", async () => {
  const calls: { url: string; init: RequestInit }[] = [];
  const fake = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    return new Response(
      JSON.stringify({ content: [{ type: "text", text: '{"is_food":true,"label":"steak","items":[],"protein_g":48,"confidence":"medium"}' }] }),
      { status: 200 },
    );
  }) as typeof fetch;
  const e = await new AnthropicMealEstimator("sk-test", "some-model", fake).estimate("QUJD", "image/jpeg");
  assert.equal(e.proteinG, 48);
  const call = calls[0]!;
  assert.equal(call.url, "https://api.anthropic.com/v1/messages");
  const headers = call.init.headers as Record<string, string>;
  assert.equal(headers["x-api-key"], "sk-test");
  assert.equal(headers["anthropic-version"], "2023-06-01");
  const body = JSON.parse(String(call.init.body));
  assert.equal(body.model, "some-model");
  assert.deepEqual(body.messages[0].content[0], { type: "image", source: { type: "base64", media_type: "image/jpeg", data: "QUJD" } });
});

test("AnthropicMealEstimator throws with the status when the API refuses", async () => {
  const fake = (async () => new Response('{"error":"bad key"}', { status: 401 })) as typeof fetch;
  await assert.rejects(new AnthropicMealEstimator("bad", "m", fake).estimate("QUJD", "image/jpeg"), /responded 401/);
});
