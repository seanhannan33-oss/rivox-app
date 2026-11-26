import { serve } from "@hono/node-server";
import { createApp } from "./app.ts";
import { loadConfig } from "./config.ts";
import { ConsoleEmailSender } from "./email.ts";
import { HttpLoopClient } from "./loop.ts";
import { MemoryStore } from "./store.ts";

const config = loadConfig();
if (config.emailProvider !== "console") {
  throw new Error(`EMAIL_PROVIDER "${config.emailProvider}" is not implemented yet. Use "console" for development.`);
}
console.warn("Using in-memory storage and console email. Development only: do not deploy like this.");

const app = createApp({
  config,
  store: new MemoryStore(),
  loop: new HttpLoopClient(config.loop),
  email: new ConsoleEmailSender(),
});

serve({ fetch: app.fetch, port: config.port }, (info) => {
  console.log(`Rivox app server listening on http://localhost:${info.port}`);
});
