// EXPO_PUBLIC_ values are baked into the app at build time. Never put secrets here.
export const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:8787").replace(/\/+$/, "");

// TODO(Sean): point these at the exact subscribe pages before launch.
export const LINKS = {
  noCurfew: process.env.EXPO_PUBLIC_NO_CURFEW_URL ?? "https://rivoxlabs.com",
  pouches: process.env.EXPO_PUBLIC_POUCHES_URL ?? "https://rivoxlabs.com",
  site: "https://rivoxlabs.com",
} as const;
