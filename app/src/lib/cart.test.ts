import assert from "node:assert/strict";
import { test } from "node:test";
import { MAX_QTY, addToCart, cartCount, cartTotal, changeQty, checkoutUrl, money, orderDate, readCart, thumb, type Cart } from "./cart.ts";

const mint = { variantId: "43011084648514", title: "Cool Mint", price: 7.99 };
const melon = { variantId: "43011088678978", title: "Watermelon", price: 7.99 };

test("adding stacks the same item and caps the quantity", () => {
  let cart: Cart = addToCart([], mint);
  cart = addToCart(cart, mint);
  cart = addToCart(cart, melon);
  assert.deepEqual(cart.map((l) => [l.title, l.qty]), [["Cool Mint", 2], ["Watermelon", 1]]);
  assert.equal(cartCount(cart), 3);
  assert.equal(cartTotal(cart), 23.97);
  assert.equal(money(cartTotal(cart)), "$23.97");
  for (let i = 0; i < 30; i++) cart = addToCart(cart, mint);
  assert.equal(cart[0]!.qty, MAX_QTY);
});

test("changing quantity down to zero removes the line", () => {
  let cart: Cart = addToCart(addToCart([], mint), melon);
  cart = changeQty(cart, mint.variantId, 2);
  assert.equal(cart[0]!.qty, 3);
  cart = changeQty(cart, mint.variantId, -3);
  assert.deepEqual(cart.map((l) => l.title), ["Watermelon"]);
  assert.deepEqual(changeQty(cart, "nope", 1), cart);
  assert.equal(cartTotal([]), 0);
});

test("the checkout link carries exactly the cart, tagged as from the app", () => {
  const cart: Cart = [{ ...mint, qty: 2 }, { ...melon, qty: 1 }];
  assert.equal(
    checkoutUrl("https://rivoxlabs.com/", cart),
    "https://rivoxlabs.com/cart/43011084648514:2,43011088678978:1?utm_source=rivox_app&utm_medium=app&utm_campaign=shop",
  );
  assert.equal(checkoutUrl("https://rivoxlabs.com", []), null);
  // A bad ID can't smuggle anything into the link.
  assert.equal(checkoutUrl("https://rivoxlabs.com", [{ variantId: "1:99,evil", title: "x", price: 1, qty: 1 }]), null);
});

test("a cart read back from storage is cleaned", () => {
  assert.deepEqual(readCart(null), []);
  assert.deepEqual(readCart("nope"), []);
  assert.deepEqual(
    readCart([{ ...mint, qty: 2 }, { variantId: "abc", title: "x", price: 1, qty: 1 }, { ...melon, qty: 0 }, { ...melon, qty: 99 }, null, { ...melon, price: "free", qty: 1 }]),
    [{ ...mint, qty: 2 }, { ...melon, qty: MAX_QTY }],
  );
});

test("thumbnails and order dates", () => {
  assert.equal(thumb("https://cdn.shopify.com/s/files/x.png?v=1", 400), "https://cdn.shopify.com/s/files/x.png?v=1&width=400");
  assert.equal(thumb("https://cdn.shopify.com/s/files/x.png", 400), "https://cdn.shopify.com/s/files/x.png?width=400");
  assert.equal(thumb("https://example.com/x.png", 400), "https://example.com/x.png");
  assert.equal(orderDate(new Date(2026, 10, 27, 9).getTime()), "Nov 27, 2026");
});
