import { useRouter } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { useCallback, useEffect, useState } from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { ApiError, errorMessage, fetchProducts, type ShopProduct } from "../api";
import { cartCount, cartTotal, checkoutUrl, money, thumb, type Cart } from "../lib/cart";
import { useSession } from "../session";
import { fonts, radius, themed, useColors } from "../theme";
import { Body, Button, Label } from "./ui";

interface CartApi {
  cart: Cart;
  add: (line: { variantId: string; title: string; price: number }) => void;
  change: (variantId: string, by: number) => void;
  favs: string[];
  toggleFav: (productId: string) => void;
}

/** Opens a store page inside the app, in the brand colors. */
export function openStore(url: string, colors: { bg: string; accent: string }) {
  return WebBrowser.openBrowserAsync(url, { toolbarColor: colors.bg, controlsColor: colors.accent }).catch(() => {});
}

/** Products for sale, with add-to-cart and save. */
export function Shelf({ shop, reloadKey }: { shop: CartApi; reloadKey: number }) {
  const s = useS();
  const colors = useColors();
  const router = useRouter();
  const { token } = useSession();
  const [products, setProducts] = useState<ShopProduct[] | null>(null);
  const [closed, setClosed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedOnly, setSavedOnly] = useState(false);
  // Which flavor or color is picked on products that come in more than one.
  const [picked, setPicked] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetchProducts(token);
      setProducts(res.products);
      setSite(res.site);
      setClosed(false);
      setError(null);
    } catch (err) {
      if (err instanceof ApiError && err.code === "shop_unavailable") setClosed(true);
      else setError(errorMessage(err));
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load, reloadKey]);

  // The shop isn't switched on yet: send them to the site instead of showing a dead shelf.
  if (closed) {
    return (
      <View style={s.wrap}>
        <Label>THE SHELF</Label>
        <Body style={s.gapTop}>The in-app shop opens soon. The full store is one tap away.</Body>
        <View style={s.gapTop}>
          <Button title="SHOP RIVOXLABS.COM" variant="outline" onPress={() => void openStore(SITE_FALLBACK, colors)} />
        </View>
      </View>
    );
  }

  const list = (products ?? []).filter((p) => !savedOnly || shop.favs.includes(p.id));
  // The server sends products already in section order: start a new section each time the name changes.
  const sections: { name: string; items: ShopProduct[] }[] = [];
  for (const p of list) {
    const name = p.group ?? "";
    const last = sections[sections.length - 1];
    if (last && last.name === name) last.items.push(p);
    else sections.push({ name, items: [p] });
  }

  return (
    <View style={s.wrap}>
      <View style={s.head}>
        <Label>THE SHELF</Label>
        <View style={s.headLinks}>
          {shop.favs.length > 0 ? (
            <Pressable onPress={() => setSavedOnly((v) => !v)} accessibilityRole="button" hitSlop={8}>
              <Text style={s.link}>{savedOnly ? "Show all" : `Saved (${shop.favs.length})`}</Text>
            </Pressable>
          ) : null}
          <Pressable onPress={() => router.push("/orders")} accessibilityRole="button" hitSlop={8}>
            <Text style={s.link}>My orders</Text>
          </Pressable>
        </View>
      </View>

      {error ? (
        <View style={s.gapTop}>
          <Body>{error}</Body>
          <View style={s.gapTop}>
            <Button title="TRY AGAIN" variant="outline" onPress={() => void load()} />
          </View>
        </View>
      ) : products === null ? (
        <Body style={s.gapTop}>Stocking the shelf.</Body>
      ) : list.length === 0 ? (
        <Body style={s.gapTop}>{savedOnly ? "Nothing saved yet." : "Nothing on the shelf right now."}</Body>
      ) : (
        sections.map((section) => (
          <View key={section.name || "all"}>
            {section.name ? (
              <View style={s.sectionRow} accessibilityRole="header">
                <Text style={s.section}>{section.name.toUpperCase()}</Text>
                <View style={s.rule} />
              </View>
            ) : null}
            <View style={s.grid}>
              {section.items.map((p) => {
            const v =
              p.variants.find((x) => x.id === picked[p.id]) ?? p.variants.find((x) => x.available) ?? p.variants[0]!;
            const itemTitle = v.title ? `${p.title} (${v.title})` : p.title;
            const inCart = shop.cart.find((l) => l.variantId === v.id)?.qty ?? 0;
            const saved = shop.favs.includes(p.id);
            return (
              <View key={p.id} style={s.card}>
                <Pressable onPress={() => void openStore(p.url, colors)} accessibilityRole="link" accessibilityLabel={`${p.title}. Opens the product page.`}>
                  {p.image ? (
                    <Image source={{ uri: thumb(p.image, 400) }} style={s.photo} resizeMode="cover" />
                  ) : (
                    <View style={[s.photo, s.noPhoto]} />
                  )}
                  <Text style={s.title} numberOfLines={2}>
                    {p.title}
                  </Text>
                </Pressable>
                {p.variants.length > 1 ? (
                  <View style={s.chips}>
                    {p.variants.map((x) => (
                      <Pressable
                        key={x.id}
                        onPress={() => setPicked((cur) => ({ ...cur, [p.id]: x.id }))}
                        accessibilityRole="button"
                        accessibilityState={{ selected: x.id === v.id }}
                        accessibilityLabel={`${p.title}, ${x.title}`}
                        hitSlop={4}
                        style={[s.chip, x.id === v.id && s.chipOn]}
                      >
                        <Text style={[s.chipText, x.id === v.id && s.chipTextOn]} numberOfLines={1}>
                          {x.title}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                ) : null}
                <View style={s.priceRow}>
                  <Text style={s.price}>${v.price}</Text>
                  <Pressable
                    onPress={() => shop.toggleFav(p.id)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: saved }}
                    accessibilityLabel={saved ? `Remove ${p.title} from saved` : `Save ${p.title}`}
                    hitSlop={8}
                  >
                    <Text style={[s.save, saved && s.saveOn]}>{saved ? "SAVED" : "SAVE"}</Text>
                  </Pressable>
                </View>
                {!v.available ? (
                  <Text style={s.soldOut}>SOLD OUT</Text>
                ) : inCart > 0 ? (
                  <View style={s.stepper}>
                    <Step label={`One less ${p.title}`} sign="-" onPress={() => shop.change(v.id, -1)} />
                    <Text style={s.qty}>{inCart}</Text>
                    <Step label={`One more ${p.title}`} sign="+" onPress={() => shop.change(v.id, 1)} />
                  </View>
                ) : (
                  <Pressable
                    onPress={() => shop.add({ variantId: v.id, title: itemTitle, price: Number(v.price) })}
                    accessibilityRole="button"
                    accessibilityLabel={`Add ${itemTitle} to cart`}
                    style={({ pressed }) => [s.add, pressed && s.pressed]}
                  >
                    <Text style={s.addText}>ADD</Text>
                  </Pressable>
                )}
              </View>
            );
          })}
            </View>
          </View>
        ))
      )}
      <Text style={s.fine}>One-time orders. To subscribe and save, tap a product.</Text>
    </View>
  );
}

function Step({ sign, label, onPress }: { sign: string; label: string; onPress: () => void }) {
  const s = useS();
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} hitSlop={6} style={s.step}>
      <Text style={s.stepText}>{sign}</Text>
    </Pressable>
  );
}

const SITE_FALLBACK = "https://rivoxlabs.com/?utm_source=rivox_app&utm_medium=app&utm_campaign=shop";
let site = "https://rivoxlabs.com";
const setSite = (value: string) => {
  if (/^https:\/\//.test(value)) site = value;
};

/** Pinned above the tab bar once there's something in the cart. */
export function CartBar({ cart, onCheckedOut }: { cart: Cart; onCheckedOut: () => void }) {
  const s = useS();
  const colors = useColors();
  const count = cartCount(cart);
  if (count === 0) return null;
  const url = checkoutUrl(site, cart);
  return (
    <View style={s.bar}>
      <View style={s.barText}>
        <Text style={s.barCount}>
          {count} {count === 1 ? "ITEM" : "ITEMS"}
        </Text>
        <Text style={s.barTotal}>{money(cartTotal(cart))}</Text>
      </View>
      <View style={s.barBtn}>
        <Button
          title="CHECK OUT"
          onPress={async () => {
            if (!url) return;
            await openStore(url, colors);
            onCheckedOut(); // back from checkout: ask whether to empty the cart
          }}
        />
      </View>
    </View>
  );
}

const useS = themed((colors) =>
  StyleSheet.create({
    wrap: { marginTop: 32 },
    head: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
    headLinks: { flexDirection: "row", gap: 16 },
    link: { fontFamily: fonts.bold, color: colors.accent, fontSize: 13 },
    gapTop: { marginTop: 12 },
    grid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", marginTop: 10 },
    sectionRow: { flexDirection: "row", alignItems: "center", gap: 12, marginTop: 22 },
    section: { fontFamily: fonts.headline, color: colors.text, fontSize: 20, letterSpacing: 0.5 },
    rule: { flex: 1, height: 2, backgroundColor: colors.yellow },
    chips: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 6 },
    chip: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, paddingHorizontal: 8, paddingVertical: 6 },
    chipOn: { borderColor: colors.accent },
    chipText: { fontFamily: fonts.medium, color: colors.secondary, fontSize: 11 },
    chipTextOn: { color: colors.text },
    card: {
      width: "48.5%",
      backgroundColor: colors.panel,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.md,
      padding: 10,
      marginBottom: 12,
    },
    photo: { width: "100%", aspectRatio: 1, borderRadius: radius.sm, backgroundColor: colors.bg },
    noPhoto: { borderWidth: 1, borderColor: colors.border },
    title: { fontFamily: fonts.medium, color: colors.text, fontSize: 13, lineHeight: 17, marginTop: 8, minHeight: 34 },
    priceRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 6, marginBottom: 8 },
    price: { fontFamily: fonts.headline, color: colors.text, fontSize: 18 },
    save: { fontFamily: fonts.bold, color: colors.muted, fontSize: 10, letterSpacing: 1 },
    saveOn: { color: colors.accent },
    add: {
      minHeight: 44,
      borderRadius: radius.sm,
      backgroundColor: colors.yellow,
      alignItems: "center",
      justifyContent: "center",
    },
    addText: { fontFamily: fonts.headline, color: colors.ink, fontSize: 16 },
    pressed: { transform: [{ scale: 0.97 }] },
    soldOut: { fontFamily: fonts.bold, color: colors.muted, fontSize: 12, letterSpacing: 1, textAlign: "center", paddingVertical: 14 },
    stepper: {
      minHeight: 44,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      borderRadius: radius.sm,
      borderWidth: 2,
      borderColor: colors.outline,
      paddingHorizontal: 6,
    },
    step: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
    stepText: { fontFamily: fonts.headline, color: colors.text, fontSize: 22, lineHeight: 26 },
    qty: { fontFamily: fonts.headline, color: colors.text, fontSize: 18 },
    fine: { fontFamily: fonts.body, color: colors.muted, fontSize: 12, marginTop: 4 },
    bar: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: colors.panel,
      borderTopWidth: 1,
      borderTopColor: colors.border,
      paddingHorizontal: 20,
      paddingVertical: 10,
    },
    barText: { flex: 1 },
    barCount: { fontFamily: fonts.bold, color: colors.muted, fontSize: 11, letterSpacing: 1 },
    barTotal: { fontFamily: fonts.headline, color: colors.text, fontSize: 22 },
    barBtn: { minWidth: 160 },
  }),
);
