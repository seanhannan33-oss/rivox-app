import { API_URL } from "./config";

export type Product = "no_curfew" | "pouches";
export interface ProductDetail {
  /** ms since epoch, or null when Loop didn't say. */
  startedAt: number | null;
  nextBillingAt: number | null;
  paused: boolean;
}
export interface Access {
  allowed: boolean;
  products: Product[];
  /** Missing on sessions saved before the server tracked dates. */
  details?: Partial<Record<Product, ProductDetail>>;
}

export class ApiError extends Error {
  constructor(
    public readonly code: string,
    public readonly status: number,
  ) {
    super(code);
  }
}

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      ...init,
      headers: { "content-type": "application/json", ...(init.headers ?? {}) },
    });
  } catch {
    throw new ApiError("network", 0);
  }
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    // empty or non-JSON body
  }
  if (!res.ok) {
    const code =
      body && typeof body === "object" && "error" in body && typeof body.error === "string"
        ? body.error
        : "server";
    throw new ApiError(code, res.status);
  }
  return body as T;
}

export function requestCode(email: string): Promise<{ ok: true }> {
  return call("/auth/request-code", { method: "POST", body: JSON.stringify({ email }) });
}

export function verifyCode(email: string, code: string): Promise<{ token: string; access: Access }> {
  return call("/auth/verify", { method: "POST", body: JSON.stringify({ email, code }) });
}

export function fetchMe(token: string): Promise<{ email: string; access: Access; stale?: boolean }> {
  return call("/me", { headers: { authorization: `Bearer ${token}` } });
}

/** Plain words for every error code the server can send back. */
export function errorMessage(err: unknown): string {
  const code = err instanceof ApiError ? err.code : "unknown";
  switch (code) {
    case "invalid_email":
      return "That is not an email. Try again.";
    case "wrong_code":
      return "Wrong code. Look again.";
    case "expired":
      return "That code expired. Get a new one.";
    case "too_many_attempts":
    case "locked":
      return "Too many tries. Get a new code.";
    case "invalid_request":
      return "Six digits. That's the whole job.";
    case "subscription_check_unavailable":
      return "Can't check your subscription right now. Give it a minute.";
    case "email_unavailable":
      return "Couldn't send your code. Try again in a minute.";
    case "network":
      return "No connection. Find some bars and try again.";
    default:
      return "Something broke on our end. Try again.";
  }
}
