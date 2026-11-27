import { serve } from "@hono/node-server";
import { createApp } from "./app.ts";
import { loadConfig } from "./config.ts";
import { ConsoleEmailSender, ResendEmailSender, type EmailSender } from "./email.ts";
import { HttpLoopClient } from "./loop.ts";
import { PostgresStore, createPool } from "./pg-store.ts";
import { ExpoPushSender } from "./push.ts";
import { ShopifyRewardIssuer, type RewardIssuer } from "./rewards.ts";
import { ShopifyShop, type Shop } from "./shop.ts";
import { shopifyReady } from "./shopify.ts";
import { MemoryStore, type Store } from "./store.ts";
import { AnthropicMealEstimator, type MealEstimator } from "./vision.ts";

const config = loadConfig();

let store: Store;
if (config.databaseUrl) {
  const pgStore = new PostgresStore(createPool(config.databaseUrl));
  await pgStore.migrate();
  store = pgStore;
  console.log("Storage: Postgres.");
} else {
  store = new MemoryStore();
  console.warn("Storage: in memory. Everything is lost on restart. Set DATABASE_URL for real use.");
}

let email: EmailSender;
if (config.emailProvider === "resend") {
  if (!config.resendApiKey) throw new Error("EMAIL_PROVIDER is resend but RESEND_API_KEY is not set.");
  if (!config.emailFrom) throw new Error("EMAIL_PROVIDER is resend but EMAIL_FROM is not set.");
  email = new ResendEmailSender(config.resendApiKey, config.emailFrom);
  console.log("Email: Resend.");
} else if (config.emailProvider === "console") {
  email = new ConsoleEmailSender();
  console.warn("Email: console. Codes print to this log and are not emailed.");
} else {
  throw new Error(`EMAIL_PROVIDER "${config.emailProvider}" is not supported. Use "resend" or "console".`);
}

let meals: MealEstimator | undefined;
if (config.anthropicApiKey) {
  meals = new AnthropicMealEstimator(config.anthropicApiKey, config.visionModel);
  console.log(`Meal photos: on (${config.visionModel}, ${config.photoDailyLimit} a day per member).`);
} else {
  console.warn("Meal photos: off. Set ANTHROPIC_API_KEY to switch them on.");
}

let rewards: RewardIssuer | undefined;
let shop: Shop | undefined;
if (shopifyReady(config.shopify)) {
  rewards = new ShopifyRewardIssuer(config.shopify);
  shop = new ShopifyShop(config.shopify);
  console.log(`Rewards and shop: on (${config.shopify.storeDomain}).`);
} else {
  const missing = [
    ["SHOPIFY_STORE_DOMAIN", config.shopify.storeDomain],
    ["SHOPIFY_CLIENT_ID", config.shopify.clientId],
    ["SHOPIFY_CLIENT_SECRET", config.shopify.clientSecret],
  ].filter(([, value]) => !value).map(([name]) => name);
  // Names only, never values.
  console.warn(`Rewards and shop: off. Points still add up. Missing or empty: ${missing.join(", ")}.`);
}

const app = createApp({ config, store, loop: new HttpLoopClient(config.loop), email, meals, push: new ExpoPushSender(config.expoAccessToken), rewards, shop });

serve({ fetch: app.fetch, port: config.port }, (info) => {
  console.log(`Rivox app server listening on port ${info.port}`);
});
