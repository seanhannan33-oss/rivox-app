import assert from "node:assert/strict";
import { test } from "node:test";
import { mergeDays, mergeTrain, readDays, readTrain } from "./sync.ts";

test("days: the newer change wins per day, and both sides' days are kept", () => {
  const local = { firstDay: "2026-11-20", log: { "2026-11-25": { caps: true, t: 10 }, "2026-11-26": { caps: false, t: 50 } } };
  const remote = { firstDay: "2026-10-17", log: { "2026-11-24": { pouches: 3, t: 5 }, "2026-11-26": { caps: true, t: 40 } } };
  assert.deepEqual(mergeDays(local, remote), {
    firstDay: "2026-10-17",
    log: {
      "2026-11-24": { pouches: 3, t: 5 },
      "2026-11-25": { caps: true, t: 10 },
      "2026-11-26": { caps: false, t: 50 }, // the undo on the phone is newer, so it sticks
    },
  });
});

test("days: an older phone copy doesn't overwrite a newer server one, and ties go to the phone", () => {
  const a = mergeDays({ firstDay: "2026-11-26", log: { "2026-11-26": { caps: false, t: 1 } } }, { firstDay: "2026-11-26", log: { "2026-11-26": { caps: true, t: 9 } } });
  assert.equal(a.log["2026-11-26"]!.caps, true);
  const b = mergeDays({ firstDay: "2026-11-26", log: { "2026-11-26": { pouches: 2 } } }, { firstDay: "2026-11-26", log: { "2026-11-26": { pouches: 7 } } });
  assert.equal(b.log["2026-11-26"]!.pouches, 2);
});

test("train: newer wins, including a set that was undone", () => {
  const local = { "2026-11-22:push": { sets: 0, reps: 18, t: 30 }, "2026-11-22:pull": { sets: 2, reps: 9, t: 5 } };
  const remote = { "2026-11-22:push": { sets: 4, reps: 18, doneOn: "2026-11-23", t: 20 }, "2026-11-22:pull": { sets: 4, reps: 9, doneOn: "2026-11-25", t: 8 }, "2026-11-15:legs": { sets: 4, reps: 20, doneOn: "2026-11-20", t: 1 } };
  assert.deepEqual(mergeTrain(local, remote), {
    "2026-11-22:push": { sets: 0, reps: 18, t: 30 },
    "2026-11-22:pull": { sets: 4, reps: 9, doneOn: "2026-11-25", t: 8 },
    "2026-11-15:legs": { sets: 4, reps: 20, doneOn: "2026-11-20", t: 1 },
  });
});

test("readDays keeps good data and drops anything malformed", () => {
  assert.equal(readDays(null), null);
  assert.equal(readDays({ firstDay: "nope", log: {} }), null);
  assert.equal(readDays({ firstDay: "2026-11-26" }), null);
  assert.deepEqual(
    readDays({
      firstDay: "2026-11-26",
      extra: "ignored",
      log: {
        "2026-11-26": { caps: true, pouches: 2.4, habits: ["sleep", 7], t: 12, junk: 1 },
        "not-a-date": { caps: true },
        "2026-11-25": "nope",
        "2026-11-24": { pouches: 99999, caps: "yes" },
      },
    }),
    { firstDay: "2026-11-26", log: { "2026-11-26": { caps: true, pouches: 2, habits: ["sleep"], t: 12 }, "2026-11-24": { pouches: 200 } } },
  );
});

test("readTrain keeps good data and drops anything malformed", () => {
  assert.equal(readTrain([1]), null);
  assert.deepEqual(
    readTrain({
      "2026-11-22:push": { sets: 4, reps: 18, doneOn: "2026-11-23", t: 3 },
      "2026-11-22:arms": { sets: 4, reps: 18 },
      "2026-11-22:pull": { sets: "4", reps: 9 },
      "2026-11-22:legs": { sets: 99, reps: 20, doneOn: "soon" },
    }),
    { "2026-11-22:push": { sets: 4, reps: 18, doneOn: "2026-11-23", t: 3 }, "2026-11-22:legs": { sets: 10, reps: 20 } },
  );
});
