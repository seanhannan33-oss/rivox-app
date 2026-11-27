// Drops: app-only deals and flavor drops shown to members. Pure logic, no network.
import { randomUUID } from "node:crypto";
import type { Access, Product } from "./access.ts";

export type DropKind = "deal" | "flavor";
export type Audience = "all" | Product;

export interface Drop {
  id: string;
  kind: DropKind;
  /** Who sees it. "all" means every member. */
  audience: Audience;
  title: string;
  body: string;
  /** Button text. */
  cta: string;
  /** Where the button goes. For a deal, a link that applies the discount by itself. */
  url: string;
  /** ms since epoch. Hidden before this. */
  startsAt: number;
  /** ms since epoch. Hidden after this. Null means it runs until removed. */
  endsAt: number | null;
  createdAt: number;
}

const KINDS: DropKind[] = ["deal", "flavor"];
const AUDIENCES: Audience[] = ["all", "no_curfew", "pouches"];
const LIMITS = { title: 60, body: 240, cta: 28 };

function text(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const t = value.trim();
  return t.length > 0 && t.length <= max ? t : null;
}

function time(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) return value;
  if (typeof value === "string" && value.trim()) {
    const t = Date.parse(value);
    return Number.isNaN(t) ? null : t;
  }
  return null;
}

/** Members tap these links, so they may only point at our own store. */
export function linkAllowed(raw: string, allowedHosts: string[]): boolean {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return false;
  }
  if (u.protocol !== "https:" || u.username || u.password) return false;
  const host = u.hostname.toLowerCase();
  return allowedHosts.some((h) => host === h || host.endsWith(`.${h}`));
}

export type ParseResult = { ok: true; drop: Drop } | { ok: false; error: string };

/** Validates what the admin page sends. `existing` is set when editing. */
export function parseDrop(input: unknown, allowedHosts: string[], now: number, existing?: Drop): ParseResult {
  const b = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const kind = KINDS.find((k) => k === b.kind);
  if (!kind) return { ok: false, error: "Pick a type: deal or flavor." };
  const audience = AUDIENCES.find((a) => a === b.audience);
  if (!audience) return { ok: false, error: "Pick who sees it." };
  const title = text(b.title, LIMITS.title);
  if (!title) return { ok: false, error: `Headline is required, ${LIMITS.title} characters max.` };
  const body = text(b.body, LIMITS.body);
  if (!body) return { ok: false, error: `Details are required, ${LIMITS.body} characters max.` };
  const cta = text(b.cta, LIMITS.cta);
  if (!cta) return { ok: false, error: `Button text is required, ${LIMITS.cta} characters max.` };
  const url = typeof b.url === "string" ? b.url.trim() : "";
  if (!linkAllowed(url, allowedHosts)) {
    return { ok: false, error: `The link must be an https link on ${allowedHosts.join(" or ")}.` };
  }
  const startsAt = b.startsAt === undefined || b.startsAt === null || b.startsAt === "" ? now : time(b.startsAt);
  if (startsAt === null) return { ok: false, error: "Start date isn't a date." };
  const endsAt = b.endsAt === undefined || b.endsAt === null || b.endsAt === "" ? null : time(b.endsAt);
  if (b.endsAt && endsAt === null) return { ok: false, error: "End date isn't a date." };
  if (endsAt !== null && endsAt <= startsAt) return { ok: false, error: "It has to end after it starts." };
  return {
    ok: true,
    drop: {
      id: existing?.id ?? randomUUID(),
      kind,
      audience,
      title,
      body,
      cta,
      url,
      startsAt,
      endsAt,
      createdAt: existing?.createdAt ?? now,
    },
  };
}

export function isLive(drop: Drop, now: number): boolean {
  return drop.startsAt <= now && (drop.endsAt === null || drop.endsAt > now);
}

/** What one member should see right now: live, meant for them, ending soonest first. */
export function dropsFor(all: Drop[], access: Access, now: number): Drop[] {
  if (!access.allowed) return [];
  return all
    .filter((d) => isLive(d, now) && (d.audience === "all" || access.products.includes(d.audience)))
    .sort((a, b) => (a.endsAt ?? Infinity) - (b.endsAt ?? Infinity) || b.startsAt - a.startsAt);
}
