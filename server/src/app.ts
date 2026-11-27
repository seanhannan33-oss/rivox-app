import { Hono } from "hono";
import { timingSafeEqual } from "node:crypto";
import { decideAccess, type Access } from "./access.ts";
import {
  RESEND_WAIT_MS,
  generateCode,
  isValidEmail,
  newStoredCode,
  normalizeEmail,
  verifyCode,
} from "./codes.ts";
import type { Config } from "./config.ts";
import type { EmailSender } from "./email.ts";
import type { LoopClient } from "./loop.ts";
import { createSession, readSession } from "./session.ts";
import type { Store } from "./store.ts";

/** How long a Loop answer is trusted before /me asks again. Webhooks update it sooner. */
export const ACCESS_FRESH_MS = 6 * 60 * 60 * 1000;

export interface Deps {
  config: Config;
  store: Store;
  loop: LoopClient;
  email: EmailSender;
  now?: () => number;
}

function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export function createApp(deps: Deps) {
  const { config, store, loop, email } = deps;
  const now = deps.now ?? Date.now;
  const map = { noCurfewProductIds: config.noCurfewProductIds, pouchProductIds: config.pouchProductIds };
  const app = new Hono();

  async function refreshAccess(address: string): Promise<Access> {
    const access = decideAccess(await loop.subscriptionsByEmail(address), map, now());
    await store.putMember({ email: address, access, checkedAt: now() });
    return access;
  }

  app.get("/health", (c) => c.json({ ok: true }));

  // Step 1 of sign-in. Always answers the same way, whether or not the email
  // has a subscription, so the endpoint can't be used to look people up.
  app.post("/auth/request-code", async (c) => {
    const body = (await c.req.json().catch(() => null)) as { email?: unknown } | null;
    const address = normalizeEmail(typeof body?.email === "string" ? body.email : "");
    if (!isValidEmail(address)) return c.json({ error: "invalid_email" }, 400);

    const existing = await store.getCode(address);
    if (existing && now() - existing.sentAt < RESEND_WAIT_MS) {
      return c.json({ ok: true });
    }
    const code = generateCode();
    await store.putCode(address, newStoredCode(address, code, config.sessionSecret, now()));
    try {
      await email.sendCode(address, code);
    } catch (err) {
      // Drop the code so they can ask again right away instead of waiting out the resend timer.
      await store.deleteCode(address);
      console.error("Sending a sign-in code failed:", err);
      return c.json({ error: "email_unavailable" }, 503);
    }
    return c.json({ ok: true });
  });

  // Step 2 of sign-in. A correct code proves the email. Loop decides access.
  app.post("/auth/verify", async (c) => {
    const body = (await c.req.json().catch(() => null)) as { email?: unknown; code?: unknown } | null;
    const address = normalizeEmail(typeof body?.email === "string" ? body.email : "");
    const code = typeof body?.code === "string" ? body.code.trim() : "";
    if (!isValidEmail(address) || !/^\d{6}$/.test(code)) return c.json({ error: "invalid_request" }, 400);

    const stored = await store.getCode(address);
    const result = verifyCode(stored, address, code, config.sessionSecret, now());
    if (result !== "ok") {
      if (stored && result === "wrong") {
        await store.putCode(address, { ...stored, attempts: stored.attempts + 1 });
      }
      return c.json({ error: result === "wrong" || result === "none" ? "wrong_code" : result }, 401);
    }
    await store.deleteCode(address);

    let access: Access;
    try {
      access = await refreshAccess(address);
    } catch (err) {
      console.error("Loop lookup failed during sign-in:", err);
      return c.json({ error: "subscription_check_unavailable" }, 503);
    }
    return c.json({ token: createSession(address, config.sessionSecret, now()), access });
  });

  // Who am I, and what do I have access to. The app calls this on open.
  app.get("/me", async (c) => {
    const header = c.req.header("Authorization") ?? "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : undefined;
    const address = readSession(token, config.sessionSecret, now());
    if (!address) return c.json({ error: "unauthorized" }, 401);

    const member = await store.getMember(address);
    // A record saved before dates were tracked has no details: treat it as due for a re-check.
    if (member && member.access.details && now() - member.checkedAt < ACCESS_FRESH_MS) {
      return c.json({ email: address, access: member.access });
    }
    try {
      return c.json({ email: address, access: await refreshAccess(address) });
    } catch (err) {
      console.error("Loop lookup failed during /me:", err);
      // Loop being down should not lock out someone we recently confirmed.
      if (member) return c.json({ email: address, access: member.access, stale: true });
      return c.json({ error: "subscription_check_unavailable" }, 503);
    }
  });

  // Loop calls this when a subscription is paused, resumed or cancelled.
  // We don't trust the payload for the decision: it only tells us whose
  // access to re-check with Loop.
  app.post("/webhooks/loop", async (c) => {
    const secret = config.loop.webhookSecret;
    const given = c.req.header(config.loop.webhookSecretHeader) ?? "";
    if (!secret || !safeEqual(secret, given)) return c.json({ error: "unauthorized" }, 401);

    const body = (await c.req.json().catch(() => null)) as Record<string, unknown> | null;
    const customer = (body?.customer ?? {}) as Record<string, unknown>;
    const raw = body?.email ?? customer.email;
    const address = normalizeEmail(typeof raw === "string" ? raw : "");
    if (!isValidEmail(address)) return c.json({ ok: true, ignored: "no_email" });

    try {
      await refreshAccess(address);
    } catch (err) {
      console.error("Loop lookup failed during webhook:", err);
      return c.json({ error: "subscription_check_unavailable" }, 503);
    }
    return c.json({ ok: true });
  });

  return app;
}
