// EXPO_PUBLIC_ values are baked into the app at build time. Never put secrets here.
export const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:8787").replace(/\/+$/, "");

// Buy buttons go to the two sales pages, tagged so app orders show up on their own.
const TAG = "utm_source=rivox_app&utm_medium=app&utm_campaign=locked_screen";

export const LINKS = {
  noCurfew: process.env.EXPO_PUBLIC_NO_CURFEW_URL ?? `https://rivoxlabs.com/pages/meet-no-curfew?${TAG}`,
  pouches: process.env.EXPO_PUBLIC_POUCHES_URL ?? `https://rivoxlabs.com/pages/no-more-soft-7-reasons-trial?${TAG}`,
  site: "https://rivoxlabs.com/?utm_source=rivox_app&utm_medium=app&utm_campaign=sign_in",
} as const;
