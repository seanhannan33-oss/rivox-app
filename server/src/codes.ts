// One-time sign-in codes. Six digits, short-lived, hashed at rest.
import { createHmac, randomInt, timingSafeEqual } from "node:crypto";

export const CODE_TTL_MS = 10 * 60 * 1000;
export const MAX_ATTEMPTS = 5;
export const RESEND_WAIT_MS = 60 * 1000;

export interface StoredCode {
  hash: string;
  expiresAt: number;
  attempts: number;
  sentAt: number;
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isValidEmail(email: string): boolean {
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function generateCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

export function hashCode(email: string, code: string, secret: string): string {
  return createHmac("sha256", secret).update(`${email}:${code}`).digest("hex");
}

export function newStoredCode(email: string, code: string, secret: string, now: number): StoredCode {
  return { hash: hashCode(email, code, secret), expiresAt: now + CODE_TTL_MS, attempts: 0, sentAt: now };
}

export type VerifyResult = "ok" | "wrong" | "expired" | "too_many_attempts" | "none";

/** Checks a code. The caller must persist the attempt count and delete the code on "ok". */
export function verifyCode(
  stored: StoredCode | undefined,
  email: string,
  code: string,
  secret: string,
  now: number,
): VerifyResult {
  if (!stored) return "none";
  if (now > stored.expiresAt) return "expired";
  if (stored.attempts >= MAX_ATTEMPTS) return "too_many_attempts";
  const expected = Buffer.from(stored.hash, "hex");
  const given = Buffer.from(hashCode(email, code, secret), "hex");
  if (expected.length === given.length && timingSafeEqual(expected, given)) return "ok";
  return "wrong";
}
