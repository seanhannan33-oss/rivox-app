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

export interface Drop {
  id: string;
  kind: "deal" | "flavor";
  audience: "all" | Product;
  title: string;
  body: string;
  cta: string;
  url: string;
  startsAt: number;
  endsAt: number | null;
}

export function fetchDrops(token: string): Promise<{ drops: Drop[] }> {
  return call("/drops", { headers: { authorization: `Bearer ${token}` } });
}

export interface MealEstimate {
  isFood: boolean;
  label: string;
  items: { name: string; proteinG: number }[];
  proteinG: number;
  confidence: "low" | "medium" | "high";
}

/** Sends one meal photo (base64 JPEG) for a protein estimate. The server does not keep the photo. */
export function estimateMeal(token: string, imageBase64: string): Promise<{ estimate: MealEstimate; left: number }> {
  return call("/fuel/estimate", {
    method: "POST",
    headers: { authorization: `Bearer ${token}` },
    body: JSON.stringify({ image: imageBase64, mediaType: "image/jpeg" }),
  });
}

export type SyncPart = "days" | "train";

export function getSync(token: string, part: SyncPart): Promise<{ data: unknown }> {
  return call(`/sync/${part}`, { headers: { authorization: `Bearer ${token}` } });
}

export function putSync(token: string, part: SyncPart, data: unknown): Promise<{ ok: true }> {
  return call(`/sync/${part}`, {
    method: "PUT",
    headers: { authorization: `Bearer ${token}` },
    body: JSON.stringify({ data }),
  });
}

/** Tells the server whether they've checked in today. Returns how many members have, them included, and their points. */
export function putCheckin(
  token: string,
  day: string,
  done: boolean,
): Promise<{ count: number; points?: number; earned?: number }> {
  return call("/checkin", {
    method: "PUT",
    headers: { authorization: `Bearer ${token}` },
    body: JSON.stringify({ day, done }),
  });
}

export function registerPush(token: string, pushToken: string, platform: "ios" | "android"): Promise<{ ok: true }> {
  return call("/push/register", {
    method: "POST",
    headers: { authorization: `Bearer ${token}` },
    body: JSON.stringify({ token: pushToken, platform }),
  });
}

export function unregisterPush(token: string, pushToken: string): Promise<{ ok: true }> {
  return call("/push/unregister", {
    method: "POST",
    headers: { authorization: `Bearer ${token}` },
    body: JSON.stringify({ token: pushToken }),
  });
}

export interface Reward {
  id: string;
  title: string;
  blurb: string;
  cost: number;
}
export interface ClaimedReward {
  id: string;
  rewardId: string;
  title: string;
  cost: number;
  code: string;
  url: string;
  createdAt: number;
}
export interface RewardsView {
  points: number;
  rewards: Reward[];
  /** False until the server can create reward codes. Points still add up. */
  open: boolean;
  claimed: ClaimedReward[];
}

export function fetchRewards(token: string): Promise<RewardsView> {
  return call("/rewards", { headers: { authorization: `Bearer ${token}` } });
}

export function redeemReward(token: string, rewardId: string): Promise<{ claimed: ClaimedReward; points: number }> {
  return call("/rewards/redeem", {
    method: "POST",
    headers: { authorization: `Bearer ${token}` },
    body: JSON.stringify({ rewardId }),
  });
}

/** Deletes everything the server holds for this account. Their subscription is not affected. */
export function deleteAccount(token: string): Promise<{ ok: true }> {
  return call("/me", { method: "DELETE", headers: { authorization: `Bearer ${token}` } });
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
    case "photo_unavailable":
      return "Photos aren't switched on yet. Tap a number instead.";
    case "photo_limit":
      return "That's enough photos for one day. Tap a number instead.";
    case "photo_too_big":
    case "invalid_photo":
      return "That photo didn't go through. Try another.";
    case "photo_failed":
      return "Couldn't read that plate. Try again, or tap a number.";
    case "not_enough_points":
      return "Not enough points yet. Keep showing up.";
    case "rewards_unavailable":
      return "Redeeming isn't open yet. Your points are safe.";
    case "reward_failed":
      return "Couldn't make your code. Your points are back. Try again.";
    case "members_only":
      return "That's for active members. Check your subscription.";
    case "too_many_requests":
      return "Too many tries. Give it a few minutes.";
    case "network":
      return "No connection. Find some bars and try again.";
    default:
      return "Something broke on our end. Try again.";
  }
}
