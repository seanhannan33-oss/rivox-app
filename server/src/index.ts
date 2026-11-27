import { serve } from "@hono/node-server";
import { createApp } from "./app.ts";
import { loadConfig } from "./config.ts";
import { ConsoleEmailSender, ResendEmailSender, type EmailSender } from "./email.ts";
import { HttpLoopClient } from "./loop.ts";
import { PostgresStore, createPool } from "./pg-store.ts";
import { MemoryStore, type Store } from "./store.ts";

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

const app = createApp({ config, store, loop: new HttpLoopClient(config.loop), email });

serve({ fetch: app.fetch, port: config.port }, (info) => {
  console.log(`Rivox app server listening on port ${info.port}`);
});
