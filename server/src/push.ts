// Push notifications, sent through Expo's push service.
import type { Access } from "./access.ts";
import type { Audience } from "./drops.ts";

export interface PushMessage {
  title: string;
  body: string;
  /** Where a tap should land in the app. */
  tab?: "drops" | "today";
}

export interface PushResult {
  sent: number;
  failed: number;
  /** Tokens the push service says are dead (app deleted, alerts revoked). Safe to forget. */
  dead: string[];
}

export interface PushSender {
  send(tokens: string[], message: PushMessage): Promise<PushResult>;
}

const TOKEN = /^Expo(nent)?PushToken\[[A-Za-z0-9_-]{10,}\]$/;
export const isPushToken = (value: unknown): value is string => typeof value === "string" && TOKEN.test(value);

export const PUSH_LIMITS = { title: 50, body: 150 };
const AUDIENCES: Audience[] = ["all", "no_curfew", "pouches"];

export type ParsedPush = { ok: true; message: PushMessage; audience: Audience } | { ok: false; error: string };

export function parsePush(input: unknown): ParsedPush {
  const b = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const title = typeof b.title === "string" ? b.title.trim() : "";
  const body = typeof b.body === "string" ? b.body.trim() : "";
  if (!title || title.length > PUSH_LIMITS.title) return { ok: false, error: `Title is required, ${PUSH_LIMITS.title} characters max.` };
  if (!body || body.length > PUSH_LIMITS.body) return { ok: false, error: `Message is required, ${PUSH_LIMITS.body} characters max.` };
  const audience = AUDIENCES.find((a) => a === b.audience);
  if (!audience) return { ok: false, error: "Pick who gets it." };
  const tab = b.tab === "today" ? "today" : "drops";
  return { ok: true, message: { title, body, tab }, audience };
}

/** Only current members, and only the ones the message is meant for. */
export function inAudience(access: Access | undefined, audience: Audience): boolean {
  if (!access || !access.allowed) return false;
  return audience === "all" || access.products.includes(audience);
}

type Fetch = typeof fetch;
const CHUNK = 100; // Expo's limit per request

export class ExpoPushSender implements PushSender {
  constructor(
    /** Optional. Only needed if "enhanced security" is switched on for the Expo project. */
    private readonly accessToken: string,
    private readonly doFetch: Fetch = fetch,
  ) {}

  async send(tokens: string[], message: PushMessage): Promise<PushResult> {
    const result: PushResult = { sent: 0, failed: 0, dead: [] };
    for (let i = 0; i < tokens.length; i += CHUNK) {
      const batch = tokens.slice(i, i + CHUNK);
      try {
        const res = await this.doFetch("https://exp.host/--/api/v2/push/send", {
          method: "POST",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
            ...(this.accessToken ? { Authorization: `Bearer ${this.accessToken}` } : {}),
          },
          body: JSON.stringify(
            batch.map((to) => ({
              to,
              title: message.title,
              body: message.body,
              sound: "default",
              data: { tab: message.tab ?? "drops" },
            })),
          ),
        });
        if (!res.ok) {
          const detail = (await res.text().catch(() => "")).slice(0, 200);
          console.error(`Expo push responded ${res.status}. ${detail}`);
          result.failed += batch.length;
          continue;
        }
        const body = (await res.json()) as { data?: { status?: string; details?: { error?: string } }[] };
        const tickets = Array.isArray(body.data) ? body.data : [];
        batch.forEach((token, n) => {
          const ticket = tickets[n];
          if (ticket?.status === "ok") {
            result.sent += 1;
          } else {
            result.failed += 1;
            if (ticket?.details?.error === "DeviceNotRegistered") result.dead.push(token);
          }
        });
      } catch (err) {
        console.error("Expo push request failed:", err);
        result.failed += batch.length;
      }
    }
    return result;
  }
}
