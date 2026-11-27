import assert from "node:assert/strict";
import { test } from "node:test";
import { WindowLimiter, clientIp } from "../src/limits.ts";

test("allows up to the max inside the window, then refuses, then recovers", () => {
  const l = new WindowLimiter(3, 1000);
  assert.equal(l.allow("a", 0), true);
  assert.equal(l.allow("a", 100), true);
  assert.equal(l.allow("a", 200), true);
  assert.equal(l.allow("a", 300), false);
  assert.equal(l.allow("b", 300), true); // other keys are separate
  assert.equal(l.allow("a", 1001), true); // the first hit has aged out
  assert.equal(l.allow("a", 1050), false);
});

test("refused attempts don't extend the lockout", () => {
  const l = new WindowLimiter(1, 1000);
  assert.equal(l.allow("a", 0), true);
  for (let t = 100; t <= 900; t += 100) assert.equal(l.allow("a", t), false);
  assert.equal(l.allow("a", 1001), true);
});

test("quiet keys are swept away", () => {
  const l = new WindowLimiter(5, 1000);
  for (let i = 0; i < 50; i++) l.allow(`k${i}`, 0);
  assert.equal(l.size, 50);
  l.allow("fresh", 5000);
  assert.equal(l.size, 1);
});

test("clientIp counts back from the end, past what a client can fake", () => {
  assert.equal(clientIp("1.1.1.1", 1), "1.1.1.1");
  assert.equal(clientIp("9.9.9.9, 1.1.1.1", 1), "1.1.1.1"); // 9.9.9.9 was typed in by the caller
  assert.equal(clientIp("9.9.9.9, 1.1.1.1, 10.0.0.1", 2), "1.1.1.1");
  assert.equal(clientIp("1.1.1.1", 3), "1.1.1.1");
  assert.equal(clientIp(undefined, 1), null);
  assert.equal(clientIp(" , ", 1), null);
});
