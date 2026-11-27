import { rulesFromEnv, type PointsRules } from "./points.ts";
import type { ShopifyConfig } from "./rewards.ts";
export interface Config {
  port: number;
  sessionSecret: string;
  loop: {
    token: string;
    base: string;
    authHeader: string;
    subscriptionsByEmailPath: string;
    webhookSecret: string;
    webhookSecretHeader: string;
  };
  noCurfewProductIds: string[];
  pouchProductIds: string[];
  emailProvider: string;
  emailFrom: string;
  resendApiKey: string;
  databaseUrl: string;
  /** Unlocks the admin page. Empty means admin is switched off. */
  adminToken: string;
  /** Hosts a drop's button may link to. */
  linkHosts: string[];
  /** Key for the meal photo feature. Empty means photos are switched off. */
  anthropicApiKey: string;
  visionModel: string;
  /** Meal photos one member can send per day. */
  photoDailyLimit: number;
  /** Proxies between the internet and this server. Used to find the caller's real address. */
  trustedProxyHops: number;
  /** Sign-in codes one email can be sent per day. */
  codeDailyLimit: number;
  /** Optional token for Expo's push service. Only needed with enhanced security on. */
  expoAccessToken: string;
  points: PointsRules;
  /** Needed to hand out reward codes. adminToken empty means redeeming is switched off. */
  shopify: ShopifyConfig;
}

function list(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function adminToken(value: string | undefined): string {
  const t = (value ?? "").trim();
  if (t && t.length < 32) throw new Error("ADMIN_TOKEN must be at least 32 characters, or left unset.");
  return t;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const sessionSecret = env.SESSION_SECRET ?? "";
  if (sessionSecret.length < 32) {
    throw new Error("SESSION_SECRET must be set to a random string of at least 32 characters.");
  }
  return {
    port: Number(env.PORT ?? 8787),
    sessionSecret,
    loop: {
      token: env.LOOP_API_TOKEN ?? "",
      base: env.LOOP_API_BASE ?? "https://api.loopsubscriptions.com/admin/2026-04",
      authHeader: env.LOOP_AUTH_HEADER ?? "X-Loop-Token",
      subscriptionsByEmailPath: env.LOOP_SUBSCRIPTIONS_BY_EMAIL_PATH ?? "/customer/{email}/subscription",
      webhookSecret: env.LOOP_WEBHOOK_SECRET ?? "",
      webhookSecretHeader: env.LOOP_WEBHOOK_SECRET_HEADER ?? "X-Loop-Webhook-Secret",
    },
    noCurfewProductIds: list(env.NO_CURFEW_PRODUCT_IDS),
    pouchProductIds: list(env.POUCH_PRODUCT_IDS),
    emailProvider: env.EMAIL_PROVIDER ?? "console",
    emailFrom: env.EMAIL_FROM ?? "",
    resendApiKey: env.RESEND_API_KEY ?? "",
    databaseUrl: env.DATABASE_URL ?? "",
    adminToken: adminToken(env.ADMIN_TOKEN),
    linkHosts: list(env.DROP_LINK_HOSTS ?? "rivoxlabs.com").map((h) => h.toLowerCase()),
    anthropicApiKey: (env.ANTHROPIC_API_KEY ?? "").trim(),
    visionModel: (env.VISION_MODEL ?? "claude-haiku-5-5").trim(),
    photoDailyLimit: Math.max(1, Number(env.PHOTO_DAILY_LIMIT ?? 12) || 12),
    trustedProxyHops: Math.max(1, Number(env.TRUSTED_PROXY_HOPS ?? 1) || 1),
    codeDailyLimit: Math.max(1, Number(env.CODE_DAILY_LIMIT ?? 10) || 10),
    expoAccessToken: (env.EXPO_ACCESS_TOKEN ?? "").trim(),
    points: rulesFromEnv(env),
    shopify: {
      storeDomain: (env.SHOPIFY_STORE_DOMAIN ?? "").trim().replace(/^https?:\/\//, "").replace(/\/+$/, ""),
      adminToken: (env.SHOPIFY_ADMIN_TOKEN ?? "").trim(),
      apiVersion: (env.SHOPIFY_API_VERSION ?? "2026-10").trim(),
      siteUrl: (env.SITE_URL ?? "https://rivoxlabs.com").trim(),
      tinProductIds: list(env.REWARD_TIN_PRODUCT_IDS ?? ""),
      redirectPath: (env.REWARD_TIN_PATH ?? "/collections/all").trim(),
    },
  };
}
