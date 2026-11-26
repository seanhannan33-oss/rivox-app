// Session tokens: a signed payload, no server-side session table needed.
import { createHmac, timingSafeEqual } from "node:crypto";

export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

interface Payload {
  email: string;
  exp: number;
}

function sign(body: string, secret: string): string {
  return createHmac("sha256", secret).update(body).digest("base64url");
}

export function createSession(email: string, secret: string, now: number): string {
  const payload: Payload = { email, exp: now + SESSION_TTL_MS };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${sign(body, secret)}`;
}

/** Returns the signed-in email, or null if the token is missing, forged or expired. */
export function readSession(token: string | undefined, secret: string, now: number): string | null {
  if (!token) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const expected = Buffer.from(sign(body, secret));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString()) as Payload;
    if (typeof payload.email !== "string" || typeof payload.exp !== "number") return null;
    if (now > payload.exp) return null;
    return payload.email;
  } catch {
    return null;
  }
}
