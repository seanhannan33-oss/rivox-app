import * as Linking from "expo-linking";
import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { Image, ImageBackground, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ApiError, errorMessage, fetchDrops, type Drop } from "../../api";
import { Body, Button, Headline, Label } from "../../components/ui";
import { endsLabel, tagLink } from "../../lib/days";
import { useSession } from "../../session";
import { colors, fonts, radius } from "../../theme";

export default function Drops() {
  const { token, signOut } = useSession();
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
              tintColor={colors.yellow}
              onRefresh={async () => {
                setRefreshing(true);
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
              <Text style={s.pillText}>RIVOX MEMBER</Text>
            </View>
          </ImageBackground>

          <View style={s.body}>
            <Label>DROPS</Label>
            <Headline style={s.h1}>MEMBERS</Headline>
            <Headline style={s.yellow}>GO FIRST.</Headline>

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
                <Text style={s.emptyTitle}>NOTHING LIVE RIGHT NOW.</Text>
                <Body>When a deal or a new flavor lands, it lands here before anywhere else. Pull down to check.</Body>
              </View>
            ) : (
              drops.map((d) => <DropCard key={d.id} drop={d} now={now} />)
            )}
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

function DropCard({ drop, now }: { drop: Drop; now: number }) {
  const deal = drop.kind === "deal";
  const ends = endsLabel(drop.endsAt, now);
  const tag = [deal ? "APP-ONLY DEAL" : "FLAVOR DROP", ends].filter(Boolean).join(" · ");
  return (
    <View style={[s.card, deal ? s.cardDeal : s.cardFlavor]}>
      <Text style={[s.tag, { color: deal ? colors.yellow : colors.pink }]}>{tag}</Text>
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

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  pinkBar: { height: 6, backgroundColor: colors.pink },
  content: { flexGrow: 1, paddingBottom: 40 },
  banner: { height: 104, justifyContent: "center", paddingHorizontal: 24 },
  bannerShade: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0, backgroundColor: "rgba(7,18,36,0.55)" },
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
  yellow: { color: colors.yellow },
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
  cardDeal: { borderColor: colors.yellow },
  cardFlavor: { borderColor: colors.pink },
  tag: { fontFamily: fonts.bold, fontSize: 11, letterSpacing: 1.2 },
  cardTitle: { fontFamily: fonts.headline, color: colors.text, fontSize: 28, lineHeight: 32, marginTop: 8 },
  cardBody: { marginTop: 6, marginBottom: 16 },
});
