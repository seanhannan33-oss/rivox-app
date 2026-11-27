// The cart. Pure logic. Checkout itself happens on Shopify's own page.

export interface CartLine {
  /** Shopify variant ID. */
  variantId: string;
  title: string;
  price: number;
  qty: number;
}
export type Cart = CartLine[];

export const MAX_QTY = 12;

export function addToCart(cart: Cart, line: Omit<CartLine, "qty">): Cart {
  const found = cart.find((l) => l.variantId === line.variantId);
  if (!found) return [...cart, { ...line, qty: 1 }];
  return cart.map((l) => (l.variantId === line.variantId ? { ...l, qty: Math.min(MAX_QTY, l.qty + 1) } : l));
}

/** Changes a line's quantity by `by`. Dropping to zero removes it. */
export function changeQty(cart: Cart, variantId: string, by: number): Cart {
  return cart
    .map((l) => (l.variantId === variantId ? { ...l, qty: Math.min(MAX_QTY, l.qty + by) } : l))
    .filter((l) => l.qty > 0);
}

export const cartCount = (cart: Cart) => cart.reduce((n, l) => n + l.qty, 0);
export const cartTotal = (cart: Cart) => Math.round(cart.reduce((n, l) => n + l.price * l.qty, 0) * 100) / 100;
export const money = (n: number) => `$${n.toFixed(2)}`;

/**
 * A Shopify cart link: opens checkout with exactly these items. Tagged so app
 * orders can be told apart. Returns null for an empty cart.
 */
export function checkoutUrl(site: string, cart: Cart): string | null {
  const lines = cart.filter((l) => /^\d+$/.test(l.variantId) && l.qty > 0);
  if (lines.length === 0) return null;
  const base = site.replace(/\/+$/, "");
  const items = lines.map((l) => `${l.variantId}:${l.qty}`).join(",");
  return `${base}/cart/${items}?utm_source=rivox_app&utm_medium=app&utm_campaign=shop`;
}

/** Drops anything malformed from a cart read off storage. */
export function readCart(value: unknown): Cart {
  if (!Array.isArray(value)) return [];
  return value
    .filter(
      (l): l is CartLine =>
        Boolean(l) &&
        typeof l.variantId === "string" &&
        /^\d+$/.test(l.variantId) &&
        typeof l.title === "string" &&
        typeof l.price === "number" &&
        Number.isFinite(l.price) &&
        Number.isInteger(l.qty) &&
        l.qty > 0,
    )
    .map((l) => ({ variantId: l.variantId, title: l.title.slice(0, 120), price: l.price, qty: Math.min(MAX_QTY, l.qty) }))
    .slice(0, 30);
}

/** Shopify image links accept a width, which keeps thumbnails small on mobile data. */
export function thumb(url: string, width: number): string {
  if (!/^https:\/\/cdn\.shopify\.com\//.test(url)) return url;
  return `${url}${url.includes("?") ? "&" : "?"}width=${width}`;
}

const STATUS_TEXT = { preparing: "GETTING PACKED", shipped: "ON ITS WAY", delivered: "SHIPPED", cancelled: "CANCELLED" } as const;
export const orderStatusText = (status: keyof typeof STATUS_TEXT) => STATUS_TEXT[status];

export function orderDate(ms: number): string {
  const d = new Date(ms);
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${months[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}
