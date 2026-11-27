import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { AppState } from "react-native";
import { useSession } from "../session";
import { dateKey, prune, streak, type DayEntry } from "./days";
import { mergeDays, readDays, type DaysDoc } from "./sync";
import { useSyncedDoc } from "./useSyncedDoc";

export const daysStorageKey = (email: string) => `rivox.days.v1.${email}`;
const emptyDays = (): DaysDoc => ({ firstDay: dateKey(new Date()), log: {} });

interface DayLogValue {
  ready: boolean;
  today: string;
  /** The first day they used the app. Screens prefer the real subscription date when they have one. */
  firstDay: string;
  entry: DayEntry;
  streak: number;
  update: (change: (entry: DayEntry | undefined) => DayEntry) => void;
}

const DayLogContext = createContext<DayLogValue | null>(null);

/** One shared copy of the member's check-ins, so every tab sees the same thing at the same time. */
export function DayLogProvider({ children }: { children: ReactNode }) {
  const { email, token } = useSession();
  const [today, setToday] = useState(() => dateKey(new Date()));

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

  const { ready, doc, change } = useSyncedDoc<DaysDoc>({
    email,
    token,
    part: "days",
    storageKey: daysStorageKey,
    empty: emptyDays,
    read: readDays,
    merge: mergeDays,
  });

  const update = useCallback(
    (fn: (entry: DayEntry | undefined) => DayEntry) =>
      change((prev) => ({
        ...prev,
        log: prune({ ...prev.log, [today]: { ...fn(prev.log[today]), t: Date.now() } }, today),
      })),
    [change, today],
  );

  const value = useMemo<DayLogValue>(
    () => ({
      ready,
      today,
      firstDay: doc?.firstDay ?? today,
      entry: doc?.log[today] ?? {},
      streak: doc ? streak(doc.log, today) : 0,
      update,
    }),
    [ready, today, doc, update],
  );

  return <DayLogContext.Provider value={value}>{children}</DayLogContext.Provider>;
}

export function useDayLog(): DayLogValue {
  const v = useContext(DayLogContext);
  if (!v) throw new Error("useDayLog must be used inside DayLogProvider");
  return v;
}
