import assert from "node:assert/strict";
import { test } from "node:test";
import { bySlot, clampGrams, pruneFuel, slotFor, statusLine, targetFor, timeLabel, total, weightOk, type FuelEntry } from "./fuel.ts";

const at = (h: number, m = 0) => new Date(2026, 10, 26, h, m).getTime();
const e = (h: number, grams: number, m = 0): FuelEntry => ({ id: `${h}${m}`, at: at(h, m), grams, label: "x", source: "quick" });

test("target is 0.8 g per pound, rounded to 5, in either unit", () => {
  assert.equal(targetFor(200, "lb"), 160);
  assert.equal(targetFor(225, "lb"), 180);
  assert.equal(targetFor(183, "lb"), 145);
  assert.equal(targetFor(90.7, "kg"), 160); // about 200 lb
  assert.equal(targetFor(90, "lb"), 80); // floor
  assert.equal(targetFor(450, "lb"), 250); // ceiling
});

test("weight sanity check", () => {
  assert.equal(weightOk(200, "lb"), true);
  assert.equal(weightOk(90, "kg"), true);
  assert.equal(weightOk(20, "lb"), false);
  assert.equal(weightOk(900, "lb"), false);
  assert.equal(weightOk(20, "kg"), false);
  assert.equal(weightOk(NaN, "lb"), false);
});

test("meals fall into slots by the clock", () => {
  assert.equal(slotFor(at(6, 10)), "BREAKFAST");
  assert.equal(slotFor(at(10, 29)), "BREAKFAST");
  assert.equal(slotFor(at(10, 30)), "LUNCH");
  assert.equal(slotFor(at(12, 40)), "LUNCH");
  assert.equal(slotFor(at(15, 15)), "SNACK");
  assert.equal(slotFor(at(17, 30)), "DINNER");
  assert.equal(slotFor(at(23, 59)), "DINNER");
  assert.deepEqual(bySlot([e(6, 31), e(12, 52), e(15, 29), e(7, 10)]), { BREAKFAST: 41, LUNCH: 52, SNACK: 29, DINNER: 0 });
  assert.equal(total([e(6, 31), e(12, 52), e(15, 29)]), 112);
});

test("status line", () => {
  assert.equal(statusLine(112, 180), "68 g short. Fix it.");
  assert.equal(statusLine(180, 180), "Number hit. Do it again tomorrow.");
  assert.equal(statusLine(195, 180), "15 g over. Nobody's mad.");
  assert.match(statusLine(0, 180), /Nothing logged/);
});

test("clamp, time label and prune", () => {
  assert.equal(clampGrams(31.6), 32);
  assert.equal(clampGrams(-5), 0);
  assert.equal(clampGrams(5000), 300);
  assert.equal(clampGrams(NaN), 0);
  assert.equal(timeLabel(at(6, 10)), "6:10 am");
  assert.equal(timeLabel(at(12, 40)), "12:40 pm");
  assert.equal(timeLabel(at(0, 5)), "12:05 am");
  assert.equal(timeLabel(at(15, 15)), "3:15 pm");
  assert.deepEqual(Object.keys(pruneFuel({ "2026-01-01": [e(6, 1)], "2026-11-26": [e(6, 1)], "2026-11-25": [] }, "2026-10-01")), ["2026-11-26"]);
});
