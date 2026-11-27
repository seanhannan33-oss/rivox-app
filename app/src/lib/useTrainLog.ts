import { useCallback } from "react";
import { useSession } from "../session";
import { mergeTrain, readTrain } from "./sync";
import { pruneTrain, type SessionLog, type TrainLog } from "./train";
import { useSyncedDoc } from "./useSyncedDoc";

export const trainStorageKey = (email: string) => `rivox.train.v1.${email}`;
const emptyTrain = (): TrainLog => ({});

/** The member's training log: on the phone first, mirrored to the server. */
export function useTrainLog(today: string) {
  const { email, token } = useSession();
  const { ready, doc, change } = useSyncedDoc<TrainLog>({
    email,
    token,
    part: "train",
    storageKey: trainStorageKey,
    empty: emptyTrain,
    read: readTrain,
    merge: mergeTrain,
  });

  const update = useCallback(
    (key: string, fn: (prev: SessionLog | undefined) => SessionLog | undefined) =>
      change((prev) => {
        const before = prev[key];
        // An undone session is kept as "0 sets" rather than removed, so the undo also reaches the server.
        const value = fn(before) ?? { sets: 0, reps: before?.reps ?? 0 };
        return pruneTrain({ ...prev, [key]: { ...value, t: Date.now() } }, today);
      }),
    [change, today],
  );

  return { ready, log: doc ?? {}, update };
}
