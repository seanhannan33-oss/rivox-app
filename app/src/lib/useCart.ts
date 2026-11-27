import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useState } from "react";
import { addToCart, changeQty, readCart, type Cart, type CartLine } from "./cart";

const cartKey = (email: string) => `rivox.cart.v1.${email}`;
const favsKey = (email: string) => `rivox.favs.v1.${email}`;

/** The cart and saved products, kept on this phone. */
export function useCart(email: string | null) {
  const [cart, setCart] = useState<Cart>([]);
  const [favs, setFavs] = useState<string[]>([]);

  useEffect(() => {
    if (!email) return;
    let alive = true;
    (async () => {
      try {
        const [c, f] = await Promise.all([AsyncStorage.getItem(cartKey(email)), AsyncStorage.getItem(favsKey(email))]);
        if (!alive) return;
        setCart(readCart(c ? JSON.parse(c) : null));
        const parsed: unknown = f ? JSON.parse(f) : [];
        setFavs(Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string").slice(0, 200) : []);
      } catch {
        // Unreadable data: start empty rather than crash.
      }
    })();
    return () => {
      alive = false;
    };
  }, [email]);

  const saveCart = useCallback(
    (next: Cart) => {
      setCart(next);
      if (email) AsyncStorage.setItem(cartKey(email), JSON.stringify(next)).catch(() => {});
    },
    [email],
  );

  const add = useCallback((line: Omit<CartLine, "qty">) => saveCart(addToCart(cart, line)), [cart, saveCart]);
  const change = useCallback((variantId: string, by: number) => saveCart(changeQty(cart, variantId, by)), [cart, saveCart]);
  const clear = useCallback(() => saveCart([]), [saveCart]);

  const toggleFav = useCallback(
    (productId: string) => {
      setFavs((prev) => {
        const next = prev.includes(productId) ? prev.filter((id) => id !== productId) : [...prev, productId];
        if (email) AsyncStorage.setItem(favsKey(email), JSON.stringify(next)).catch(() => {});
        return next;
      });
    },
    [email],
  );

  return { cart, add, change, clear, favs, toggleFav };
}
