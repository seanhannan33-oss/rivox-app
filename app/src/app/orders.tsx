import { useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { ApiError, errorMessage, fetchOrders, type ShopOrder } from "../api";
import { openStore } from "../components/Shelf";
import { Body, Button, Headline, Label, Screen } from "../components/ui";
import { money, orderDate, orderStatusText } from "../lib/cart";
import { useSession } from "../session";
import { fonts, radius, themed, useColors } from "../theme";

export default function Orders() {
  const s = useS();
  const colors = useColors();
  const router = useRouter();
  const { token, signOut } = useSession();
  const [orders, setOrders] = useState<ShopOrder[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setError(null);
    try {
      setOrders((await fetchOrders(token)).orders);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        await signOut();
        return;
      }
      setError(errorMessage(err));
    }
  }, [token, signOut]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <Screen>
      <Pressable onPress={() => router.back()} accessibilityRole="button" hitSlop={10} style={s.back}>
        <Text style={s.backText}>‹ Back to the shop</Text>
      </Pressable>
      <Label>MY ORDERS</Label>
      <Headline style={s.h1}>WHERE'S</Headline>
      <Headline style={s.accent}>MY STUFF.</Headline>

      {error ? (
        <View style={s.gap}>
          <Body>{error}</Body>
          <View style={s.gap}>
            <Button title="TRY AGAIN" variant="outline" onPress={() => void load()} />
          </View>
        </View>
      ) : orders === null ? (
        <Body style={s.gap}>Checking the warehouse.</Body>
      ) : orders.length === 0 ? (
        <Body style={s.gap}>No orders on this email yet. The shelf is right there.</Body>
      ) : (
        orders.map((o) => (
          <View key={o.name} style={s.card}>
            <View style={s.top}>
              <Text style={s.name}>{o.name}</Text>
              <Text style={[s.status, o.status === "cancelled" ? s.statusOff : s.statusOn]}>{orderStatusText(o.status)}</Text>
            </View>
            <Text style={s.meta}>
              {orderDate(o.placedAt)} · {money(Number(o.total))}
            </Text>
            {o.items.map((i, n) => (
              <Text key={n} style={s.item}>
                {i.quantity} × {i.title}
              </Text>
            ))}
            {o.tracking ? (
              <View style={s.gap}>
                <Button title="TRACK IT" onPress={() => void openStore(o.tracking!.url, colors)} />
                <Text style={s.track}>
                  {o.tracking.company} {o.tracking.number}
                </Text>
              </View>
            ) : o.statusUrl ? (
              <View style={s.gap}>
                <Button title="ORDER DETAILS" variant="outline" onPress={() => void openStore(o.statusUrl!, colors)} />
              </View>
            ) : null}
          </View>
        ))
      )}
      <Text style={s.fine}>Your ten most recent orders on this email.</Text>
    </Screen>
  );
}

const useS = themed((colors) =>
  StyleSheet.create({
    back: { paddingVertical: 8, marginBottom: 12, alignSelf: "flex-start" },
    backText: { fontFamily: fonts.bold, color: colors.accent, fontSize: 15 },
    h1: { marginTop: 6 },
    accent: { color: colors.accent },
    gap: { marginTop: 14 },
    card: {
      backgroundColor: colors.panel,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.md,
      padding: 16,
      marginTop: 16,
    },
    top: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
    name: { fontFamily: fonts.headline, color: colors.text, fontSize: 22 },
    status: { fontFamily: fonts.bold, fontSize: 11, letterSpacing: 1 },
    statusOn: { color: colors.accent },
    statusOff: { color: colors.muted },
    meta: { fontFamily: fonts.body, color: colors.muted, fontSize: 13, marginTop: 2, marginBottom: 8 },
    item: { fontFamily: fonts.medium, color: colors.secondary, fontSize: 14, lineHeight: 20 },
    track: { fontFamily: fonts.body, color: colors.muted, fontSize: 12, textAlign: "center", marginTop: 8 },
    fine: { fontFamily: fonts.body, color: colors.muted, fontSize: 12, marginTop: 20, textAlign: "center" },
  }),
);
