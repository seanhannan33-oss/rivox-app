import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useState } from "react";
import { pruneTrain, type SessionLog, type TrainLog } from "./train";

const keyFor = (email: string) => `rivox.train.v1.${email}`;

/** The member's training log, kept on this phone only. */
export function useTrainLog(email: string | null, today: string) {
  const [log, setLog] = useState<TrainLog | null>(null);

  useEffect(() => {
    if (!email) return;
    let alive = true;
    (async () => {
      let value: TrainLog = {};
      try {
        const raw = await AsyncStorage.getItem(keyFor(email));
        const parsed: unknown = raw ? JSON.parse(raw) : null;
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) value = parsed as TrainLog;
      } catch {
        // Unreadable data: start fresh rather than crash.
      }
      if (alive) setLog(value);
    })();
    return () => {
      alive = false;
    };
  }, [email]);

  const update = useCallback(
    (key: string, change: (prev: SessionLog | undefined) => SessionLog | undefined) => {
      if (!email) return;
      setLog((prev) => {
        if (!prev) return prev;
        const next = { ...prev };
        const value = change(prev[key]);
        if (value) next[key] = value;
        else delete next[key];
        const pruned = pruneTrain(next, today);
        AsyncStorage.setItem(keyFor(email), JSON.stringify(pruned)).catch(() => {});
        return pruned;
      });
    },
    [email, today],
  );

  return { ready: log !== null, log: log ?? {}, update };
}
