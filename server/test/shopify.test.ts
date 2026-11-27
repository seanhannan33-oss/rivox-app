import assert from "node:assert/strict";
import { test } from "node:test";
import { shopifyGql, shopifyReady, type ShopifyConfig } from "../src/shopify.ts";

const base: ShopifyConfig = {
  storeDomain: "x.myshopify.com",
  adminToken: "",
  clientId: "cid",
  clientSecret: "csecret",
  apiVersion: "2026-10",
  siteUrl: "https://rivoxlabs.com",
  tinProductIds: [],
  redirectPath: "/",
  hiddenProductIds: [],
};

function fakeShopify(opts: { rejectFirstApiCall?: boolean; tokenStatus?: number } = {}) {
  const log: string[] = [];
  let issued = 0;
  let rejected = false;
  const doFetch = (async (url: string | URL | Request, init?: RequestInit) => {
    const u = String(url);
    if (u.endsWith("/admin/oauth/access_token")) {
      log.push(`token:${String(init!.body)}`);
      if (opts.tokenStatus) return new Response("bad client", { status: opts.tokenStatus });
      issued += 1;
      return new Response(JSON.stringify({ access_token: `tok${issued}`, scope: "read_products", expires_in: 86399 }), { status: 200 });
    }
    const used = (init!.headers as Record<string, string>)["X-Shopify-Access-Token"];
    log.push(`api:${used}`);
    if (opts.rejectFirstApiCall && !rejected) {
      rejected = true;
      return new Response("unauthorized", { status: 401 });
    }
    return new Response(JSON.stringify({ data: { ok: true } }), { status: 200 });
  }) as typeof fetch;
  return { log, doFetch };
}

test("ready with a client ID and secret, or with a fixed token, and not otherwise", () => {
  assert.equal(shopifyReady(base), true);
  assert.equal(shopifyReady({ ...base, clientId: "", clientSecret: "", adminToken: "shpat_x" }), true);
  assert.equal(shopifyReady({ ...base, clientSecret: "" }), false);
  assert.equal(shopifyReady({ ...base, storeDomain: "" }), false);
});

test("swaps the client ID and secret for a token, reuses it, and renews before it expires", async () => {
  let t = 0;
  const { log, doFetch } = fakeShopify();
  const gql = shopifyGql(base, doFetch, () => t);
  await gql("query { a }", {});
  await gql("query { b }", {});
  assert.deepEqual(log, ["token:grant_type=client_credentials&client_id=cid&client_secret=csecret", "api:tok1", "api:tok1"]);

  t += 23 * 3_600_000; // still inside the 24 hours
  await gql("query { c }", {});
  assert.equal(log.at(-1), "api:tok1");

  t += 56 * 60_000; // inside the last five minutes: renew early
  await gql("query { d }", {});
  assert.deepEqual(log.slice(-2), ["token:grant_type=client_credentials&client_id=cid&client_secret=csecret", "api:tok2"]);
});

test("requests arriving together share one token request", async () => {
  const { log, doFetch } = fakeShopify();
  const gql = shopifyGql(base, doFetch, () => 0);
  await Promise.all([gql("query { a }", {}), gql("query { b }", {}), gql("query { c }", {})]);
  assert.equal(log.filter((l) => l.startsWith("token:")).length, 1);
});

test("a rejected token is replaced and the call retried once", async () => {
  const { log, doFetch } = fakeShopify({ rejectFirstApiCall: true });
  const gql = shopifyGql(base, doFetch, () => 0);
  assert.deepEqual(await gql("query { a }", {}), { ok: true });
  assert.deepEqual(log.map((l) => l.split(":")[0] + ":" + (l.startsWith("api") ? l.split(":")[1] : "")), ["token:", "api:tok1", "token:", "api:tok2"]);
});

test("a fixed token is used as is, and a bad client secret is reported plainly", async () => {
  const fixed = fakeShopify();
  await shopifyGql({ ...base, adminToken: "shpat_old" }, fixed.doFetch)("query { a }", {});
  assert.deepEqual(fixed.log, ["api:shpat_old"]);

  const bad = fakeShopify({ tokenStatus: 400 });
  await assert.rejects(shopifyGql(base, bad.doFetch)("query { a }", {}), /refused to issue a token \(400\)/);
});
