import * as SecureStore from "expo-secure-store";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { ApiError, fetchMe, type Access } from "./api";

const KEY = "rivox.session.v1";

type Stored = { token: string; email: string; access: Access };
export type Status = "loading" | "signedOut" | "locked" | "member";

interface SessionValue {
  status: Status;
  email: string | null;
  /** For calls that need to prove who's asking. Null when signed out. */
  token: string | null;
  access: Access | null;
  /** Save a fresh sign-in. */
  signIn: (token: string, email: string, access: Access) => Promise<void>;
  signOut: () => Promise<void>;
  /** Ask the server again. Throws so the screen can show why it failed. */
  recheck: () => Promise<Access>;
}

const SessionContext = createContext<SessionValue | null>(null);

async function load(): Promise<Stored | null> {
  try {
    const raw = await SecureStore.getItemAsync(KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as Partial<Stored>;
    if (typeof v.token !== "string" || typeof v.email !== "string" || !v.access) return null;
    return v as Stored;
  } catch {
    return null;
  }
}

async function save(v: Stored | null): Promise<void> {
  try {
    if (v) await SecureStore.setItemAsync(KEY, JSON.stringify(v));
    else await SecureStore.deleteItemAsync(KEY);
  } catch {
    // Storage failing should never crash the app. Worst case they sign in again.
  }
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [stored, setStored] = useState<Stored | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      const saved = await load();
      if (!saved) {
        if (alive) setLoading(false);
        return;
      }
      try {
        const me = await fetchMe(saved.token);
        const next = { ...saved, email: me.email, access: me.access };
        await save(next);
        if (alive) setStored(next);
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) {
          await save(null); // session expired or revoked
        } else if (alive) {
          setStored(saved); // offline or server down: trust the last answer we got
        }
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const signIn = useCallback(async (token: string, email: string, access: Access) => {
    const next = { token, email, access };
    await save(next);
    setStored(next);
  }, []);

  const signOut = useCallback(async () => {
    await save(null);
    setStored(null);
  }, []);

  const recheck = useCallback(async () => {
    if (!stored) throw new ApiError("unauthorized", 401);
    try {
      const me = await fetchMe(stored.token);
      const next = { ...stored, email: me.email, access: me.access };
      await save(next);
      setStored(next);
      return me.access;
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        await save(null);
        setStored(null);
      }
      throw err;
    }
  }, [stored]);

  const value = useMemo<SessionValue>(() => {
    const status: Status = loading ? "loading" : !stored ? "signedOut" : stored.access.allowed ? "member" : "locked";
    return { status, email: stored?.email ?? null, token: stored?.token ?? null, access: stored?.access ?? null, signIn, signOut, recheck };
  }, [loading, stored, signIn, signOut, recheck]);

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue {
  const v = useContext(SessionContext);
  if (!v) throw new Error("useSession must be used inside SessionProvider");
  return v;
}
