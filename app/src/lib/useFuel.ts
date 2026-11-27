import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useState } from "react";
import { addDays } from "./days";
import { pruneFuel, type FuelDays, type FuelEntry, type Profile } from "./fuel";

interface Saved {
  profile: Profile | null;
  days: FuelDays;
}

const keyFor = (email: string) => `rivox.fuel.v1.${email}`;

/** Protein log and body-weight target. Kept on this phone only: nothing here is sent to the server. */
export function useFuel(email: string | null, today: string) {
  const [saved, setSaved] = useState<Saved | null>(null);

  useEffect(() => {
    if (!email) return;
    let alive = true;
    (async () => {
      let value: Saved = { profile: null, days: {} };
      try {
        const raw = await AsyncStorage.getItem(keyFor(email));
        const v = raw ? (JSON.parse(raw) as Partial<Saved>) : null;
        if (v && typeof v === "object" && v.days && typeof v.days === "object") {
          value = { profile: v.profile ?? null, days: v.days };
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

  const change = useCallback(
    (fn: (prev: Saved) => Saved) => {
      if (!email) return;
      setSaved((prev) => {
        if (!prev) return prev;
        const next = fn(prev);
        const pruned = { ...next, days: pruneFuel(next.days, addDays(today, -120)) };
        AsyncStorage.setItem(keyFor(email), JSON.stringify(pruned)).catch(() => {});
        return pruned;
      });
    },
    [email, today],
  );

  const setProfile = useCallback((profile: Profile) => change((p) => ({ ...p, profile })), [change]);

  const add = useCallback(
    (entry: Omit<FuelEntry, "id" | "at">) =>
      change((p) => {
        const at = Date.now();
        const id = `${at}-${Math.random().toString(36).slice(2, 8)}`;
        return { ...p, days: { ...p.days, [today]: [...(p.days[today] ?? []), { ...entry, id, at }] } };
      }),
    [change, today],
  );

  const remove = useCallback(
    (id: string) =>
      change((p) => ({ ...p, days: { ...p.days, [today]: (p.days[today] ?? []).filter((e) => e.id !== id) } })),
    [change, today],
  );

  return {
    ready: saved !== null,
    profile: saved?.profile ?? null,
    entries: saved?.days[today] ?? [],
    setProfile,
    add,
    remove,
  };
}
