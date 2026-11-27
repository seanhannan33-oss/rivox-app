import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import { getSync, putSync, type SyncPart } from "../api";

interface Options<T> {
  email: string | null;
  token: string | null;
  part: SyncPart;
  storageKey: (email: string) => string;
  /** These three must be stable (defined outside the component). */
  empty: () => T;
  read: (value: unknown) => T | null;
  merge: (local: T, remote: T) => T;
}

const PUSH_DELAY_MS = 1500;

/**
 * A document that lives on the phone first and is mirrored to the server.
 * The phone copy shows straight away, so the app works with no signal. The
 * server copy is merged in when it arrives, and changes are sent up shortly
 * after they're made. A failed send is simply retried on the next change or launch.
 */
export function useSyncedDoc<T>({ email, token, part, storageKey, empty, read, merge }: Options<T>) {
  const [doc, setDoc] = useState<T | null>(null);
  const latest = useRef<T | null>(null);
  const dirty = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const creds = useRef({ email, token });
  creds.current = { email, token };

  const push = useCallback(async () => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    const { token: tk } = creds.current;
    if (!tk || !dirty.current || latest.current === null) return;
    dirty.current = false;
    try {
      await putSync(tk, part, latest.current);
    } catch {
      dirty.current = true; // try again next time
    }
  }, [part]);

  const commit = useCallback(
    (next: T, sendUp: boolean) => {
      latest.current = next;
      const { email: em } = creds.current;
      if (em) AsyncStorage.setItem(storageKey(em), JSON.stringify(next)).catch(() => {});
      if (sendUp) {
        dirty.current = true;
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => void push(), PUSH_DELAY_MS);
      }
    },
    [push, storageKey],
  );

  // Load the phone copy, then fold in the server copy.
  useEffect(() => {
    if (!email) return;
    let alive = true;
    (async () => {
      let local = empty();
      try {
        const raw = await AsyncStorage.getItem(storageKey(email));
        local = (raw ? read(JSON.parse(raw)) : null) ?? local;
      } catch {
        // Unreadable data: start fresh rather than crash.
      }
      if (!alive) return;
      latest.current = local;
      setDoc(local);

      if (!token) return;
      try {
        const remote = read((await getSync(token, part)).data);
        if (!alive || latest.current === null) return;
        const merged = remote ? merge(latest.current, remote) : latest.current;
        setDoc(merged);
        commit(merged, true); // send the merged result back so both sides agree
      } catch {
        // No signal or server down: the phone copy is enough for now.
      }
    })();
    return () => {
      alive = false;
    };
  }, [email, token, part, storageKey, empty, read, merge, commit]);

  // Don't leave a change waiting when the app is put away.
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state !== "active") void push();
    });
    return () => {
      sub.remove();
      void push();
    };
  }, [push]);

  const change = useCallback(
    (fn: (prev: T) => T) => {
      if (latest.current === null) return;
      const next = fn(latest.current);
      setDoc(next);
      commit(next, true);
    },
    [commit],
  );

  return { ready: doc !== null, doc, change };
}
