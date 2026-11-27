import assert from "node:assert/strict";
import { test } from "node:test";
import {
  addDays,
  dateKey,
  dayNumber,
  daysBetween,
  daysUntil,
  earliestStart,
  endsLabel,
  inDays,
  nextBadge,
  prune,
  streak,
  tagLink,
  toggleHabit,
} from "./days.ts";

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

test("daysUntil counts calendar days and never goes negative", () => {
  assert.equal(daysUntil(new Date(2026, 10, 26, 23, 0).getTime(), "2026-11-26"), 0);
  assert.equal(daysUntil(new Date(2026, 10, 27, 0, 5).getTime(), "2026-11-26"), 1);
  assert.equal(daysUntil(new Date(2027, 0, 14, 9, 0).getTime(), "2026-11-26"), 49);
  assert.equal(daysUntil(new Date(2026, 10, 20).getTime(), "2026-11-26"), 0);
});

test("earliestStart picks the oldest known date and ignores gaps", () => {
  const a = new Date(2026, 9, 17, 10).getTime();
  const b = new Date(2026, 10, 1, 10).getTime();
  assert.equal(earliestStart([b, null, a, undefined]), "2026-10-17");
  assert.equal(earliestStart([null, undefined]), null);
  assert.equal(dayNumber(earliestStart([a])!, "2026-11-26"), 41);
});

test("inDays wording", () => {
  assert.equal(inDays(0), "TODAY");
  assert.equal(inDays(1), "IN 1 DAY");
  assert.equal(inDays(49), "IN 49 DAYS");
});

test("endsLabel reads sensibly at every distance", () => {
  const H = 3_600_000;
  assert.equal(endsLabel(null, 0), null);
  assert.equal(endsLabel(1000, 2000), "ENDED");
  assert.equal(endsLabel(30 * 60_000, 0), "ENDS WITHIN THE HOUR");
  assert.equal(endsLabel(5 * H, 0), "ENDS IN 5 HOURS");
  assert.equal(endsLabel(47 * H, 0), "ENDS IN 47 HOURS");
  assert.equal(endsLabel(48 * H, 0), "ENDS IN 2 DAYS");
  assert.equal(endsLabel(9 * 24 * H + H, 0), "ENDS IN 9 DAYS");
});

test("tagLink adds app tags once and keeps the rest of the link", () => {
  assert.equal(
    tagLink("https://rivoxlabs.com/discount/APP20?redirect=%2Fproducts%2Fx"),
    "https://rivoxlabs.com/discount/APP20?redirect=%2Fproducts%2Fx&utm_source=rivox_app&utm_medium=app&utm_campaign=drops",
  );
  assert.equal(
    tagLink("https://rivoxlabs.com/pages/x#top"),
    "https://rivoxlabs.com/pages/x?utm_source=rivox_app&utm_medium=app&utm_campaign=drops#top",
  );
  assert.equal(tagLink("https://rivoxlabs.com/?utm_source=email"), "https://rivoxlabs.com/?utm_source=email");
});
