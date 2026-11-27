import assert from "node:assert/strict";
import { test } from "node:test";
import {
  addDays,
  badgeEarnedToday,
  bestStreak,
  crowdLine,
  dateKey,
  dayNumber,
  daysBetween,
  daysUntil,
  earliestStart,
  endsLabel,
  inDays,
  nextReward,
  nextBadge,
  prune,
  savesLine,
  streak,
  streakState,
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

const run = (from: string, n: number) => {
  const log: Record<string, { caps: boolean }> = {};
  for (let i = 0; i < n; i++) log[addDays(from, i)] = { caps: true };
  return log;
};

test("bestStreak finds the longest run and survives a later miss", () => {
  assert.equal(bestStreak({}, "2026-11-30"), 0);
  assert.equal(bestStreak(run("2026-11-01", 7), "2026-11-07"), 7);
  const log = { ...run("2026-10-01", 14), ...run("2026-11-20", 3) }; // 14, a gap, then 3
  assert.equal(bestStreak(log, "2026-11-22"), 14);
  assert.equal(streak(log, "2026-11-22"), 3);
  assert.equal(
    bestStreak({ "2026-11-01": { caps: true }, "2026-11-02": { habits: ["sleep"] }, "2026-11-03": { caps: true } }, "2026-11-03"),
    1,
  );
  assert.equal(bestStreak(run("2026-12-28", 6), "2027-01-02"), 6); // across a year end
});

test("a badge is earned on the day the streak lands on it, not before or after", () => {
  assert.equal(badgeEarnedToday(run("2026-11-01", 7), "2026-11-07"), 7);
  assert.equal(badgeEarnedToday(run("2026-11-01", 6), "2026-11-06"), null);
  assert.equal(badgeEarnedToday(run("2026-11-01", 8), "2026-11-08"), null);
  assert.equal(badgeEarnedToday(run("2026-11-01", 6), "2026-11-07"), null); // today not done yet
  assert.equal(badgeEarnedToday(run("2026-11-01", 30), "2026-11-30"), 30);
});

test("the crowd line only appears when there's a real crowd", () => {
  assert.equal(crowdLine(null, false), null);
  assert.equal(crowdLine(3, false), null);
  assert.equal(crowdLine(5, false), "5 beat you to it today.");
  assert.equal(crowdLine(5, true), null); // that's only 4 others
  assert.equal(crowdLine(313, true), "You and 312 others checked in today.");
  assert.equal(crowdLine(312, false), "312 beat you to it today.");
});

test("nextReward points at the nearest reward still out of reach", () => {
  const rewards = [{ id: "tin", cost: 90 }, { id: "five", cost: 60 }];
  assert.deepEqual(nextReward(0, rewards), { reward: { id: "five", cost: 60 }, left: 60, progress: 0 });
  assert.deepEqual(nextReward(45, rewards), { reward: { id: "five", cost: 60 }, left: 15, progress: 0.75 });
  assert.equal(nextReward(60, rewards)!.reward.id, "tin");
  assert.equal(nextReward(60, rewards)!.left, 30);
  assert.equal(nextReward(90, rewards), null);
  assert.equal(nextReward(10, []), null);
});

const plus = (day: string, n: number) => addDays(day, n);
const span = (from: string, n: number) => Array.from({ length: n }, (_, i) => plus(from, i));

test("streak saves: none earned, so a missed day ends the run", () => {
  assert.deepEqual(streakState([], "2026-11-27"), { streak: 0, best: 0, saves: 0, saved: [] });
  assert.deepEqual(streakState(span("2026-11-01", 5), "2026-11-05"), { streak: 5, best: 5, saves: 0, saved: [] });
  assert.equal(streakState(span("2026-11-01", 5), "2026-11-06").streak, 5); // today not done yet is not a miss
  assert.deepEqual(streakState(span("2026-11-01", 5), "2026-11-07"), { streak: 0, best: 5, saves: 0, saved: [] });
});

test("streak saves: one is earned every 14 check-ins, two at most", () => {
  assert.equal(streakState(span("2026-10-01", 13), "2026-10-13").saves, 0);
  assert.equal(streakState(span("2026-10-01", 14), "2026-10-14").saves, 1);
  assert.equal(streakState(span("2026-10-01", 28), "2026-10-28").saves, 2);
  assert.equal(streakState(span("2026-10-01", 60), "2026-11-29").saves, 2); // capped
});

test("streak saves: a save covers a missed day and the run carries on", () => {
  // 14 days, miss the 15th, back on the 16th.
  const days = [...span("2026-10-01", 14), "2026-10-16"];
  assert.deepEqual(streakState(days, "2026-10-16"), { streak: 15, best: 15, saves: 0, saved: ["2026-10-15"] });
  // The morning after the miss, before checking in: already covered.
  assert.deepEqual(streakState(span("2026-10-01", 14), "2026-10-16"), { streak: 14, best: 14, saves: 0, saved: ["2026-10-15"] });
  // Miss a second day with no saves left: gone.
  assert.deepEqual(streakState(span("2026-10-01", 14), "2026-10-17"), { streak: 0, best: 14, saves: 0, saved: ["2026-10-15"] });
});

test("streak saves: two saves cover two days running, a third miss ends it", () => {
  const base = span("2026-10-01", 28); // through Oct 28, two saves in hand
  assert.deepEqual(streakState(base, "2026-10-31"), { streak: 28, best: 28, saves: 0, saved: ["2026-10-29", "2026-10-30"] });
  assert.equal(streakState(base, "2026-11-01").streak, 0);
  assert.equal(streakState([...base, "2026-10-31"], "2026-10-31").streak, 29);
});

test("streak saves: a used save is earned back, and saves never rescue a run that's already dead", () => {
  // Use one after 14 days, then 14 more check-ins earns another.
  const days = [...span("2026-10-01", 14), ...span("2026-10-16", 14)];
  assert.deepEqual(streakState(days, "2026-10-29"), { streak: 28, best: 28, saves: 1, saved: ["2026-10-15"] });
  // A lone check-in after a long gap starts from one.
  const gap = [...span("2026-09-01", 3), "2026-11-27"];
  assert.deepEqual(streakState(gap, "2026-11-27"), { streak: 1, best: 3, saves: 0, saved: [] });
  // Across a year end.
  assert.equal(streakState(span("2026-12-20", 20), "2027-01-08").streak, 20);
});

test("savesLine says what matters and stays quiet otherwise", () => {
  assert.equal(savesLine({ streak: 5, best: 5, saves: 0, saved: [] }, "2026-11-27"), null);
  assert.equal(savesLine({ streak: 14, best: 14, saves: 1, saved: [] }, "2026-11-27"), "1 streak save banked.");
  assert.equal(savesLine({ streak: 28, best: 28, saves: 2, saved: [] }, "2026-11-27"), "2 streak saves banked.");
  assert.equal(
    savesLine({ streak: 14, best: 14, saves: 0, saved: ["2026-11-26"] }, "2026-11-27"),
    "You missed yesterday. A save covered it. 0 saves left.",
  );
  assert.equal(
    savesLine({ streak: 28, best: 28, saves: 1, saved: ["2026-11-26"] }, "2026-11-27"),
    "You missed yesterday. A save covered it. 1 save left.",
  );
  assert.equal(savesLine({ streak: 0, best: 14, saves: 0, saved: ["2026-11-26"] }, "2026-11-27"), null); // the run died anyway
  assert.equal(savesLine({ streak: 20, best: 20, saves: 1, saved: ["2026-11-10"] }, "2026-11-27"), "1 streak save banked.");
});
