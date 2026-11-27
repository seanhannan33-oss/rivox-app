import assert from "node:assert/strict";
import { test } from "node:test";
import { addDays, dateKey, dayNumber, daysBetween, nextBadge, prune, streak, toggleHabit } from "./days.ts";

test("dateKey uses the local calendar day", () => {
  assert.equal(dateKey(new Date(2026, 10, 26, 23, 59)), "2026-11-26");
  assert.equal(dateKey(new Date(2026, 0, 5, 0, 1)), "2026-01-05");
});

test("addDays and daysBetween cross months, years and clock changes", () => {
  assert.equal(addDays("2026-11-30", 1), "2026-12-01");
  assert.equal(addDays("2026-01-01", -1), "2025-12-31");
  assert.equal(addDays("2026-03-08", 1), "2026-03-09"); // US spring forward
  assert.equal(daysBetween("2026-03-07", "2026-03-09"), 2);
  assert.equal(daysBetween("2026-10-31", "2026-11-02"), 2); // US fall back
});

test("streak counts back from today, or from yesterday when today isn't done", () => {
  const log = { "2026-11-24": { caps: true }, "2026-11-25": { pouches: 2 }, "2026-11-26": { caps: true } };
  assert.equal(streak(log, "2026-11-26"), 3);
  assert.equal(streak(log, "2026-11-27"), 3); // morning after, nothing logged yet
  assert.equal(streak(log, "2026-11-28"), 0); // missed a full day
});

test("a gap breaks the streak, and habits alone don't count", () => {
  const log = { "2026-11-23": { caps: true }, "2026-11-25": { habits: ["sleep"] }, "2026-11-26": { caps: true } };
  assert.equal(streak(log, "2026-11-26"), 1);
  assert.equal(streak({ "2026-11-26": { pouches: 0 } }, "2026-11-26"), 0);
});

test("badges, day number, prune and habit toggle", () => {
  assert.equal(nextBadge(0), 7);
  assert.equal(nextBadge(41), 60);
  assert.equal(nextBadge(365), null);
  assert.equal(dayNumber("2026-11-26", "2026-11-26"), 1);
  assert.equal(dayNumber("2026-10-17", "2026-11-26"), 41);
  assert.deepEqual(Object.keys(prune({ "2020-01-01": { caps: true }, "2026-11-20": { caps: true } }, "2026-11-26")), [
    "2026-11-20",
  ]);
  assert.deepEqual(toggleHabit({ caps: true }, "sleep"), { caps: true, habits: ["sleep"] });
  assert.deepEqual(toggleHabit({ habits: ["sleep"] }, "sleep"), { habits: [] });
});
