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
