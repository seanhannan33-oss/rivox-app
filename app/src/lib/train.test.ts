import assert from "node:assert/strict";
import { test } from "node:test";
import {
  PLAN,
  SETS,
  clock,
  comingUp,
  daysToNextDrop,
  lastWeek,
  logSet,
  pruneTrain,
  repsFor,
  sessionKey,
  stateOf,
  undoSet,
  upNext,
  weekNumber,
  weekStart,
  weekdayOf,
  type TrainLog,
} from "./train.ts";

// 2026-11-22 is a Sunday. Mon 23, Wed 25, Thu 26, Fri 27, Sat 28.
const SUN = "2026-11-22";
const [push, pull, legs] = PLAN as [(typeof PLAN)[0], (typeof PLAN)[0], (typeof PLAN)[0]];
const done = (reps: number, on: string) => ({ sets: SETS, reps, doneOn: on });

test("weeks start on Sunday", () => {
  assert.equal(weekdayOf(SUN), 0);
  assert.equal(weekStart("2026-11-26"), SUN);
  assert.equal(weekStart(SUN), SUN);
  assert.equal(weekStart("2026-11-28"), SUN);
  assert.equal(weekStart("2026-11-29"), "2026-11-29");
  assert.equal(weekStart("2027-01-01"), "2026-12-27");
});

test("week number counts Sundays crossed since they started", () => {
  assert.equal(weekNumber("2026-11-26", "2026-11-26"), 1);
  assert.equal(weekNumber("2026-11-26", "2026-11-28"), 1);
  assert.equal(weekNumber("2026-11-26", "2026-11-29"), 2); // started Thursday, new week Sunday
  assert.equal(weekNumber("2026-10-17", "2026-11-26"), 7);
  assert.equal(weekNumber("2026-12-01", "2026-11-26"), 1); // never below 1
});

test("next drop is always the coming Sunday", () => {
  assert.equal(daysToNextDrop(SUN), 7);
  assert.equal(daysToNextDrop("2026-11-25"), 4);
  assert.equal(daysToNextDrop("2026-11-28"), 1);
});

test("reps climb each week and stop at the cap", () => {
  assert.equal(repsFor(push, 1), 8);
  assert.equal(repsFor(push, 6), 18);
  assert.equal(repsFor(push, 50), 30);
  assert.equal(repsFor(pull, 1), 5);
  assert.equal(repsFor(pull, 40), 15);
  assert.equal(repsFor(legs, 2), 14);
  assert.equal(repsFor(push, 0), 8);
});

test("upNext: today's session, then anything skipped, else nothing", () => {
  const log: TrainLog = {};
  assert.equal(upNext(log, SUN), null); // Sunday, nothing scheduled yet
  assert.equal(upNext(log, "2026-11-23")!.move, "push");
  assert.equal(upNext(log, "2026-11-24")!.move, "push"); // Tuesday, Monday skipped
  assert.equal(upNext(log, "2026-11-25")!.move, "pull"); // today's comes before the one owed
  log[sessionKey(SUN, "pull")] = done(5, "2026-11-25");
  assert.equal(upNext(log, "2026-11-25")!.move, "push"); // then catch up
  log[sessionKey(SUN, "push")] = done(8, "2026-11-25");
  assert.equal(upNext(log, "2026-11-25"), null);
  assert.equal(upNext(log, "2026-11-27")!.move, "legs");
});

test("day states and what's coming", () => {
  assert.equal(stateOf(push, undefined, 3), "owed");
  assert.equal(stateOf(pull, undefined, 3), "today");
  assert.equal(stateOf(legs, undefined, 3), "ahead");
  assert.equal(stateOf(push, done(8, "x"), 3), "done");
  assert.equal(stateOf(push, { sets: 2, reps: 8 }, 1), "today"); // half done isn't done
  assert.equal(comingUp("2026-11-24")!.move, "pull");
  assert.equal(comingUp("2026-11-27"), null);
});

test("logging sets finishes the session on the last one, and undo walks it back", () => {
  let s = logSet(undefined, 18, "2026-11-23");
  assert.deepEqual(s, { sets: 1, reps: 18 });
  s = logSet(logSet(s, 18, "2026-11-23"), 18, "2026-11-23");
  assert.equal(s.doneOn, undefined);
  s = logSet(s, 18, "2026-11-23");
  assert.deepEqual(s, { sets: 4, reps: 18, doneOn: "2026-11-23" });
  assert.deepEqual(logSet(s, 18, "2026-11-24"), s); // can't go past four, keeps the day
  assert.deepEqual(undoSet(s), { sets: 3, reps: 18 });
  assert.equal(undoSet({ sets: 1, reps: 18 }), undefined);
  assert.equal(undoSet(undefined), undefined);
});

test("last week only counts if they finished it", () => {
  const prevWeek = "2026-11-15";
  const log: TrainLog = { [sessionKey(prevWeek, "push")]: done(16, "2026-11-16"), [sessionKey(prevWeek, "pull")]: { sets: 2, reps: 9 } };
  assert.deepEqual(lastWeek(log, "2026-11-23", "push"), done(16, "2026-11-16"));
  assert.equal(lastWeek(log, "2026-11-23", "pull"), null);
  assert.equal(lastWeek(log, "2026-11-23", "legs"), null);
});

test("clock and prune", () => {
  assert.equal(clock(45), "0:45");
  assert.equal(clock(60.2), "1:01");
  assert.equal(clock(4.1), "0:05");
  assert.equal(clock(-3), "0:00");
  const kept = pruneTrain({ "2024-01-07:push": done(8, "x"), "2026-11-15:push": done(8, "x") }, "2026-11-26");
  assert.deepEqual(Object.keys(kept), ["2026-11-15:push"]);
});
