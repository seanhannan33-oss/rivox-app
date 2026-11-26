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
}

function list(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
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
      base: env.LOOP_API_BASE ?? "https://api.loopsubscriptions.com/admin/2023-10",
      authHeader: env.LOOP_AUTH_HEADER ?? "X-Loop-Token",
      subscriptionsByEmailPath: env.LOOP_SUBSCRIPTIONS_BY_EMAIL_PATH ?? "/customer/{email}/subscription",
      webhookSecret: env.LOOP_WEBHOOK_SECRET ?? "",
      webhookSecretHeader: env.LOOP_WEBHOOK_SECRET_HEADER ?? "X-Loop-Webhook-Secret",
    },
    noCurfewProductIds: list(env.NO_CURFEW_PRODUCT_IDS),
    pouchProductIds: list(env.POUCH_PRODUCT_IDS),
    emailProvider: env.EMAIL_PROVIDER ?? "console",
    emailFrom: env.EMAIL_FROM ?? "",
  };
}
