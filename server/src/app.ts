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
import { ADMIN_PAGE } from "./admin-page.ts";
import type { Config } from "./config.ts";
import { dropsFor, isLive, parseDrop } from "./drops.ts";
import type { EmailSender } from "./email.ts";
import type { LoopClient } from "./loop.ts";
import { createSession, readSession } from "./session.ts";
import type { Store } from "./store.ts";
import { MAX_IMAGE_BASE64, MEDIA_TYPES, type MealEstimator } from "./vision.ts";

/** How long a Loop answer is trusted before /me asks again. Webhooks update it sooner. */
export const ACCESS_FRESH_MS = 6 * 60 * 60 * 1000;

export interface Deps {
  config: Config;
  store: Store;
  loop: LoopClient;
  email: EmailSender;
  /** Missing when the meal photo feature is switched off. */
  meals?: MealEstimator;
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

  const SYNC_PARTS = ["days", "train"];
  const MAX_SYNC_BYTES = 300_000;
  const sessionEmail = (c: { req: { header(name: string): string | undefined } }) => {
    const header = c.req.header("Authorization") ?? "";
    return readSession(header.startsWith("Bearer ") ? header.slice(7) : undefined, config.sessionSecret, now());
  };

  // A member's check-ins and training log, so a new phone doesn't mean starting over.
  // The server stores what the app sends and hands it back. It never reads into it.
  app.get("/sync/:part", async (c) => {
    const address = sessionEmail(c);
    if (!address) return c.json({ error: "unauthorized" }, 401);
    const part = c.req.param("part");
    if (!SYNC_PARTS.includes(part)) return c.json({ error: "not_found" }, 404);
    return c.json({ data: (await store.getSync(address, part)) ?? null });
  });

  app.put("/sync/:part", async (c) => {
    const address = sessionEmail(c);
    if (!address) return c.json({ error: "unauthorized" }, 401);
    const part = c.req.param("part");
    if (!SYNC_PARTS.includes(part)) return c.json({ error: "not_found" }, 404);
    const member = await store.getMember(address);
    if (!member || !member.access.allowed) return c.json({ error: "members_only" }, 403);
    const raw = await c.req.text();
    if (raw.length > MAX_SYNC_BYTES) return c.json({ error: "too_big" }, 413);
    let body: unknown;
    try {
      body = JSON.parse(raw);
    } catch {
      return c.json({ error: "invalid_request" }, 400);
    }
    const data = (body as { data?: unknown } | null)?.data;
    if (!data || typeof data !== "object" || Array.isArray(data)) return c.json({ error: "invalid_request" }, 400);
    await store.putSync(address, part, data, now());
    return c.json({ ok: true });
  });

  // Account deletion. Wipes everything we hold for this email. It does not touch
  // their Rivox subscription, which lives in Loop and Shopify.
  app.delete("/me", async (c) => {
    const address = sessionEmail(c);
    if (!address) return c.json({ error: "unauthorized" }, 401);
    await store.deleteMemberData(address);
    return c.json({ ok: true });
  });

  // Live drops for the signed-in member. Only what's meant for their subscription.
  app.get("/drops", async (c) => {
    const header = c.req.header("Authorization") ?? "";
    const address = readSession(header.startsWith("Bearer ") ? header.slice(7) : undefined, config.sessionSecret, now());
    if (!address) return c.json({ error: "unauthorized" }, 401);
    const member = await store.getMember(address);
    if (!member || !member.access.allowed) return c.json({ error: "members_only" }, 403);
    return c.json({ drops: dropsFor(await store.listDrops(), member.access, now()) });
  });

  // Meal photo -> protein estimate. Members only, capped per day because each one costs money.
  app.post("/fuel/estimate", async (c) => {
    const header = c.req.header("Authorization") ?? "";
    const address = readSession(header.startsWith("Bearer ") ? header.slice(7) : undefined, config.sessionSecret, now());
    if (!address) return c.json({ error: "unauthorized" }, 401);
    const member = await store.getMember(address);
    if (!member || !member.access.allowed) return c.json({ error: "members_only" }, 403);
    if (!deps.meals) return c.json({ error: "photo_unavailable" }, 503);

    if (Number(c.req.header("Content-Length") ?? 0) > MAX_IMAGE_BASE64 + 2000) {
      return c.json({ error: "photo_too_big" }, 413);
    }
    const body = (await c.req.json().catch(() => null)) as { image?: unknown; mediaType?: unknown } | null;
    const image = typeof body?.image === "string" ? body.image : "";
    const mediaType = MEDIA_TYPES.find((m) => m === body?.mediaType);
    if (!mediaType || image.length < 100 || !/^[A-Za-z0-9+/]+={0,2}$/.test(image)) {
      return c.json({ error: "invalid_photo" }, 400);
    }
    if (image.length > MAX_IMAGE_BASE64) return c.json({ error: "photo_too_big" }, 413);

    const day = new Date(now()).toISOString().slice(0, 10);
    const used = await store.bumpUsage(address, "meal_photo", day);
    if (used > config.photoDailyLimit) return c.json({ error: "photo_limit" }, 429);

    try {
      const estimate = await deps.meals.estimate(image, mediaType);
      return c.json({ estimate, left: Math.max(0, config.photoDailyLimit - used) });
    } catch (err) {
      console.error("Meal estimate failed:", err);
      return c.json({ error: "photo_failed" }, 502);
    }
  });

  // Admin: post and remove drops. Off entirely unless ADMIN_TOKEN is set.
  const isAdmin = (c: { req: { header(name: string): string | undefined } }) => {
    const header = c.req.header("Authorization") ?? "";
    const given = header.startsWith("Bearer ") ? header.slice(7) : "";
    return config.adminToken !== "" && safeEqual(config.adminToken, given);
  };

  app.get("/admin", (c) => {
    if (!config.adminToken) return c.notFound();
    // The page holds no data and no secrets. It asks for the token and calls the API below.
    c.header("Cache-Control", "no-store");
    c.header("X-Frame-Options", "DENY");
    c.header("Referrer-Policy", "no-referrer");
    c.header("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'; form-action 'none'; base-uri 'none'");
    return c.html(ADMIN_PAGE);
  });

  app.get("/admin/drops", async (c) => {
    if (!isAdmin(c)) return c.json({ error: "unauthorized" }, 401);
    const t = now();
    const all = (await store.listDrops()).sort((a, b) => b.createdAt - a.createdAt);
    return c.json({ drops: all.map((d) => ({ ...d, live: isLive(d, t) })) });
  });

  app.post("/admin/drops", async (c) => {
    if (!isAdmin(c)) return c.json({ error: "unauthorized" }, 401);
    const parsed = parseDrop(await c.req.json().catch(() => null), config.linkHosts, now());
    if (!parsed.ok) return c.json({ error: "invalid_drop", message: parsed.error }, 400);
    await store.putDrop(parsed.drop);
    return c.json({ drop: parsed.drop }, 201);
  });

  app.put("/admin/drops/:id", async (c) => {
    if (!isAdmin(c)) return c.json({ error: "unauthorized" }, 401);
    const existing = await store.getDrop(c.req.param("id"));
    if (!existing) return c.json({ error: "not_found" }, 404);
    const parsed = parseDrop(await c.req.json().catch(() => null), config.linkHosts, now(), existing);
    if (!parsed.ok) return c.json({ error: "invalid_drop", message: parsed.error }, 400);
    await store.putDrop(parsed.drop);
    return c.json({ drop: parsed.drop });
  });

  app.delete("/admin/drops/:id", async (c) => {
    if (!isAdmin(c)) return c.json({ error: "unauthorized" }, 401);
    await store.deleteDrop(c.req.param("id"));
    return c.json({ ok: true });
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
