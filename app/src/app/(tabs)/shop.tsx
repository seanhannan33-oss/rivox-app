import * as Linking from "expo-linking";
import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Alert, Image, ImageBackground, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ApiError, errorMessage, fetchDrops, type Drop } from "../../api";
import { useRankLabel } from "../../components/Ranks";
import { CartBar, Shelf } from "../../components/Shelf";
import { Body, Button, Headline, Label } from "../../components/ui";
import { endsLabel, tagLink } from "../../lib/days";
import { disablePush, enablePush, pushAvailable, pushState, type PushState } from "../../lib/push";
import { useCart } from "../../lib/useCart";
import { useSession } from "../../session";
import { fonts, onPhoto, radius, themed, useColors } from "../../theme";

export default function Shop() {
  const s = useS();
  const colors = useColors();
  const { token, email, signOut } = useSession();
  const shop = useCart(email);
  const rankLabel = useRankLabel();
  const [reloadKey, setReloadKey] = useState(0);
  const [drops, setDrops] = useState<Drop[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetchDrops(token);
      setDrops(res.drops);
      setError(null);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        await signOut(); // session ran out
        return;
      }
      setError(
        err instanceof ApiError && err.code === "members_only"
          ? "Drops are for active members. Check your subscription."
          : errorMessage(err),
      );
    }
  }, [token, signOut]);

  // Fresh every time they open the tab, so a new drop shows without restarting the app.
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const now = Date.now();

  return (
    <View style={s.root}>
      <SafeAreaView style={s.flex} edges={["top"]}>
        <View style={s.pinkBar} />
        <ScrollView
          contentContainerStyle={s.content}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              tintColor={colors.accent}
              onRefresh={async () => {
                setRefreshing(true);
                setReloadKey((k) => k + 1); // the shelf reloads too
                await load();
                setRefreshing(false);
              }}
            />
          }
        >
          <ImageBackground
            source={require("../../../assets/brand/banner-drops.jpg")}
            style={s.banner}
            resizeMode="cover"
          >
            <View style={s.bannerShade} />
            <Image
              source={require("../../../assets/brand/logo.png")}
              style={s.logo}
              resizeMode="contain"
              accessibilityLabel="Rivox Labs"
            />
            <View style={s.pill}>
              <Text style={s.pillText}>{rankLabel}</Text>
            </View>
          </ImageBackground>

          <View style={s.body}>
            <Label>SHOP</Label>
            <Headline style={s.h1}>MEMBERS</Headline>
            <Headline style={s.yellow}>GO FIRST.</Headline>

            <Alerts token={token} />

            {error ? (
              <View style={s.state}>
                <Body>{error}</Body>
                <View style={s.retry}>
                  <Button title="TRY AGAIN" variant="outline" onPress={() => void load()} />
                </View>
              </View>
            ) : drops === null ? (
              <Body style={s.state}>Checking what's live.</Body>
            ) : drops.length === 0 ? (
              <View style={s.state}>
                <Text style={s.emptyTitle}>NO DROPS RIGHT NOW.</Text>
                <Body>When a deal or a new flavor lands, it lands here before anywhere else.</Body>
              </View>
            ) : (
              drops.map((d) => <DropCard key={d.id} drop={d} now={now} />)
            )}

            <Shelf shop={shop} reloadKey={reloadKey} />
          </View>
        </ScrollView>
        <CartBar
          cart={shop.cart}
          onCheckedOut={() =>
            Alert.alert("Order placed?", "If you finished checking out, we'll empty the cart.", [
              { text: "Not yet", style: "cancel" },
              { text: "Yes, empty it", onPress: shop.clear },
            ])
          }
        />
      </SafeAreaView>
    </View>
  );
}

/** The opt-in for drop alerts. Hidden entirely until this build can actually receive them. */
function Alerts({ token }: { token: string | null }) {
  const s = useS();
  const [state, setState] = useState<PushState | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!pushAvailable()) return;
    let alive = true;
    pushState()
      .then((st) => {
        if (alive) setState(st);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  if (!pushAvailable() || state === null || !token) return null;

  async function flip() {
    if (!token) return;
    setBusy(true);
    setFailed(false);
    try {
      setState(state === "on" ? await disablePush(token) : await enablePush(token));
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  if (state === "on") {
    return (
      <View style={s.alerts}>
        <Text style={s.alertsOn}>ALERTS ON. YOU HEAR FIRST.</Text>
        <Pressable onPress={flip} disabled={busy} accessibilityRole="button" hitSlop={8}>
          <Text style={s.alertsLink}>Turn off</Text>
        </Pressable>
      </View>
    );
  }
  return (
    <View style={s.alertsCard}>
      <Text style={s.alertsTitle}>HEAR IT FIRST.</Text>
      <Body style={s.alertsBody}>
        {state === "blocked"
          ? "Alerts are blocked for Rivox. Switch them on in your phone's Settings."
          : "Deals and new flavors, the minute they land. Nothing else. We're not that needy."}
      </Body>
      {state === "blocked" ? (
        <Button title="OPEN SETTINGS" variant="outline" onPress={() => void Linking.openSettings()} />
      ) : (
        <Button title="TURN ON ALERTS" variant="outline" busy={busy} onPress={flip} />
      )}
      {failed ? <Text style={s.alertsFail}>Couldn't switch that on. Try again.</Text> : null}
    </View>
  );
}

function DropCard({ drop, now }: { drop: Drop; now: number }) {
  const s = useS();
  const colors = useColors();
  const deal = drop.kind === "deal";
  const ends = endsLabel(drop.endsAt, now);
  const tag = [deal ? "APP-ONLY DEAL" : "FLAVOR DROP", ends].filter(Boolean).join(" · ");
  return (
    <View style={[s.card, deal ? s.cardDeal : s.cardFlavor]}>
      <Text style={[s.tag, { color: deal ? colors.accent : colors.alert }]}>{tag}</Text>
      <Text style={s.cardTitle}>{drop.title}</Text>
      <Body style={s.cardBody}>{drop.body}</Body>
      <Button
        title={drop.cta}
        variant={deal ? "primary" : "outline"}
        onPress={() => void Linking.openURL(tagLink(drop.url))}
      />
    </View>
  );
}

const useS = themed((colors) =>
  StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  pinkBar: { height: 6, backgroundColor: colors.pink },
  content: { flexGrow: 1, paddingBottom: 40 },
  banner: { height: 104, justifyContent: "center", paddingHorizontal: 24 },
  bannerShade: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0, backgroundColor: onPhoto.shade },
  logo: { width: 120, height: 42 },
  pill: {
    position: "absolute",
    right: 24,
    top: 38,
    backgroundColor: colors.yellow,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  pillText: { fontFamily: fonts.bold, color: colors.ink, fontSize: 11, letterSpacing: 1 },
  body: { paddingHorizontal: 24, paddingTop: 24 },
  h1: { marginTop: 6 },
  yellow: { color: colors.accent },
  alerts: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 20 },
  alertsOn: { fontFamily: fonts.bold, color: colors.accent, fontSize: 12, letterSpacing: 1 },
  alertsLink: { fontFamily: fonts.bold, color: colors.muted, fontSize: 13, textDecorationLine: "underline" },
  alertsCard: {
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: 18,
    marginTop: 20,
  },
  alertsTitle: { fontFamily: fonts.headline, color: colors.text, fontSize: 22 },
  alertsBody: { marginTop: 4, marginBottom: 14 },
  alertsFail: { fontFamily: fonts.medium, color: colors.alert, fontSize: 13, marginTop: 10 },
  state: { marginTop: 28 },
  retry: { marginTop: 16 },
  emptyTitle: { fontFamily: fonts.headline, color: colors.text, fontSize: 22, marginBottom: 6 },
  card: {
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: 18,
    marginTop: 20,
  },
  cardDeal: { borderColor: colors.outline },
  cardFlavor: { borderColor: colors.pink },
  tag: { fontFamily: fonts.bold, fontSize: 11, letterSpacing: 1.2 },
  cardTitle: { fontFamily: fonts.headline, color: colors.text, fontSize: 28, lineHeight: 32, marginTop: 8 },
  cardBody: { marginTop: 6, marginBottom: 16 },
}),
);
