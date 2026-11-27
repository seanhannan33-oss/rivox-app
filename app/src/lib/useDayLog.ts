import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AppState } from "react-native";
import { dateKey, prune, streak, type DayEntry, type DayLog } from "./days";

interface Saved {
  firstDay: string;
  log: DayLog;
}

const keyFor = (email: string) => `rivox.days.v1.${email}`;

/** The member's check-ins, kept on this phone only. Nothing here is sent to the server yet. */
export function useDayLog(email: string | null) {
  const [today, setToday] = useState(() => dateKey(new Date()));
  const [saved, setSaved] = useState<Saved | null>(null);

  // Roll over to a new day if the app sits open past midnight or comes back from the background.
  useEffect(() => {
    const tick = () => setToday(dateKey(new Date()));
    const timer = setInterval(tick, 60_000);
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active") tick();
    });
    return () => {
      clearInterval(timer);
      sub.remove();
    };
  }, []);

  useEffect(() => {
    if (!email) return;
    let alive = true;
    (async () => {
      let value: Saved = { firstDay: dateKey(new Date()), log: {} };
      try {
        const raw = await AsyncStorage.getItem(keyFor(email));
        if (raw) {
          const v = JSON.parse(raw) as Partial<Saved>;
          if (typeof v.firstDay === "string" && v.log && typeof v.log === "object") value = v as Saved;
        }
      } catch {
        // Unreadable data: start fresh rather than crash.
      }
      if (alive) setSaved(value);
    })();
    return () => {
      alive = false;
    };
  }, [email]);

  const update = useCallback(
    (change: (entry: DayEntry | undefined) => DayEntry) => {
      if (!email) return;
      setSaved((prev) => {
        if (!prev) return prev;
        const next: Saved = { ...prev, log: prune({ ...prev.log, [today]: change(prev.log[today]) }, today) };
        AsyncStorage.setItem(keyFor(email), JSON.stringify(next)).catch(() => {});
        return next;
      });
    },
    [email, today],
  );

  return useMemo(
    () => ({
      ready: saved !== null,
      entry: saved?.log[today] ?? {},
      streak: saved ? streak(saved.log, today) : 0,
      today,
      /** The first day they used the app. The screen prefers the real subscription date when it has one. */
      firstDay: saved?.firstDay ?? today,
      update,
    }),
    [saved, today, update],
  );
}
