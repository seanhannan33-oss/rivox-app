# Rivox app

The Rivox member app. Free with any active Rivox subscription (No Curfew or Focus Pouches).

## What's here

| Folder | What it is | State |
|---|---|---|
| `server/` | Sign-in and subscription check | Build step 1: written and tested |
| `app/` | The phone app (Expo, iPhone and Android) | Blank Expo project plus brand assets. Screens not built yet |

## How sign-in works

1. The member enters the email on their Rivox subscription.
2. The server emails a six-digit code, good for 10 minutes.
3. A correct code proves the email. The server then asks Loop which subscriptions that email has.
4. An active or paused No Curfew or pouch subscription unlocks the app. Cancelled or expired does not.
5. Loop webhooks re-check a member when their subscription is paused, resumed or cancelled.

## Run the server

```bash
cd server
npm install
cp .env.example .env   # then fill in SESSION_SECRET at minimum
npm test               # 26 tests
npm run dev
```

In development the sign-in code is printed to the server log, not emailed.

## Not done yet

- **Loop details are unverified.** The base URL, auth header, lookup path and response shape in `server/src/loop.ts` are best guesses held in config. Confirm them against Loop's API reference with a real token.
- **Storage is in memory.** Everything is lost on restart. Needs a real database before launch.
- **No real email sender.** Only the development console sender exists.
- **No rate limiting by IP** on the sign-in endpoints.
- **No hosting chosen** for the server.
- **The app screens** (sign-in, locked, Today, Train, Fuel, Drops) are designed but not coded.

## Secrets

Never commit `.env`. The Loop API token and session secret live only in the server's environment.

## App: what's built

- `app/src/app/sign-in.tsx`: email, then a 6-digit code.
- `app/src/app/locked.tsx`: shown when the email has no active subscription.
- `app/src/app/index.tsx`: placeholder home for members.
- `app/src/session.tsx`: keeps the sign-in on the phone (secure storage) and re-checks the subscription on launch.

Run it: `cd app && cp .env.example .env && npm install && npx expo start`.
Checks: `npm run typecheck`. Not yet run on a real phone.

## Server: going from test to real

- `DATABASE_URL`: Postgres connection string. Tables are created on start. Without it, storage is in memory.
- `EMAIL_PROVIDER=resend` with `RESEND_API_KEY` and `EMAIL_FROM` emails the sign-in codes. `console` prints them to the log.
- Database tests run only when `TEST_DATABASE_URL` points at a throwaway database.

## Drops

- Members see live drops on the Drops tab (`GET /drops`), filtered to their subscription.
- Post and remove them at `/admin` on the server. It needs `ADMIN_TOKEN` (32+ characters) set in the server settings; with no token the admin page does not exist.
- A drop's button can only link to hosts in `DROP_LINK_HOSTS` (default `rivoxlabs.com`).
- For a discount that applies itself, use a Shopify discount link: `https://rivoxlabs.com/discount/CODE?redirect=/path`. The admin page builds it from the code and the path.

## Fuel

- The protein target is 0.8 g per pound of body weight. Weight, target and the food log stay on the phone.
- Meal photos go to `POST /fuel/estimate`, which asks a vision model for a protein estimate. The photo is not stored.
- Set `ANTHROPIC_API_KEY` on the server to switch photos on. `PHOTO_DAILY_LIMIT` caps photos per member per day (default 12).

## Sync and account deletion

- Check-ins and the training log are kept on the phone and mirrored to the server (`/sync/days`, `/sync/train`). The newer change wins. Body weight and the food log are never sent.
- `DELETE /me` removes everything held for that email: member record, sign-in codes, synced data and usage counts. It does not touch the Loop subscription.

## Limits, check-ins, badges and push

- Sign-in is rate limited per caller address, per email per day and overall. `TRUSTED_PROXY_HOPS` must match the host (the admin page shows the address the server sees).
- `PUT /checkin` keeps one yes or no per member per day and returns the day's total. The app shows it only when at least five others have checked in.
- Badges at 7, 14, 30, 60, 90, 180 and 365 days are worked out on the phone from the longest streak.
- Push: the app registers a token only after the member taps "Turn on alerts", and only in a real build with an Expo project id (run `eas init`). The admin page sends pushes through Expo's push service. `EXPO_ACCESS_TOKEN` is optional.

## Points and rewards

- The server awards 1 point per checked-in day plus one-time streak bonuses (`STREAK_BONUS`). The phone cannot award points.
- Rewards: `$5 off` at 60 points and a free tin at 90 (`FIVE_OFF_COST`, `FREE_TIN_COST`).
- Redeeming re-checks the subscription with Loop, takes the points under a per-member lock, then creates a single-use Shopify discount code tied to the member. If the code can't be made the points are returned.
- Redeeming and the shop are off until `SHOPIFY_STORE_DOMAIN`, `SHOPIFY_CLIENT_ID` and `SHOPIFY_CLIENT_SECRET` are set (or `SHOPIFY_ADMIN_TOKEN` for a custom app made before 2026). The app needs write_discounts, read_customers, read_products and read_orders. Set `REWARD_TIN_PRODUCT_IDS` to the tin products.

## Ranks, streak saves and the shop

- Ranks: PUP, PACK, HUNTER, ALPHA, NO CURFEW at 7, 30, 60, 90 and 365 days, earned on the longest streak. Emblem images are in `app/assets/ranks`.
- Streak saves: one earned per 14 check-ins, two held at most. The same rule runs on the phone (`app/src/lib/days.ts`) and the server (`server/src/points.ts`).
- Shop: `GET /shop/products` and `GET /shop/orders` read from Shopify with the same key as rewards (the token also needs read_orders). The cart is on the phone and checkout opens a Shopify cart link in the in-app browser. `SHOP_HIDE_PRODUCT_IDS` hides products.
