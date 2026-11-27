import * as Linking from "expo-linking";
import { useCallback, useEffect, useState } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { errorMessage, fetchRewards, redeemReward, type RewardsView } from "../api";
import { nextReward, tagLink } from "../lib/days";
import { useDayLog } from "../lib/useDayLog";
import { useSession } from "../session";
import { colors, fonts, radius } from "../theme";
import { Button, Label } from "./ui";

/** Points earned by checking in, what they buy, and the codes already claimed. */
export function Rewards() {
  const { token } = useSession();
  const { points: livePoints } = useDayLog();
  const [view, setView] = useState<RewardsView | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    try {
      setView(await fetchRewards(token));
    } catch {
      // No signal: the section just stays as it was.
    }
  }, [token]);

  // Refresh when a check-in changes the balance.
  useEffect(() => {
    void load();
  }, [load, livePoints]);

  if (!view) return null;
  const points = view.points;
  const next = nextReward(points, view.rewards);

  function confirm(id: string, title: string, cost: number) {
    Alert.alert(`Spend ${cost} points?`, `You get: ${title}. It comes as a one-time code for a store order.`, [
      { text: "Not yet", style: "cancel" },
      {
        text: "Spend them",
        onPress: async () => {
          if (!token) return;
          setBusy(id);
          setNote(null);
          try {
            const res = await redeemReward(token, id);
            setView((v) => (v ? { ...v, points: res.points, claimed: [res.claimed, ...v.claimed] } : v));
            setNote("Done. Your code is below. Tap it to use it.");
          } catch (err) {
            setNote(errorMessage(err));
            void load();
          } finally {
            setBusy(null);
          }
        },
      },
    ]);
  }

  return (
    <View style={s.card}>
      <Label>POINTS</Label>
      <View style={s.top}>
        <Text style={s.points}>{points}</Text>
        <Text style={s.earn}>1 a day for showing up.{"\n"}Streaks pay extra.</Text>
      </View>

      {next ? (
        <>
          <View style={s.track} accessibilityLabel={`${points} of ${next.reward.cost} points toward ${next.reward.title}`}>
            <View style={[s.fill, { width: `${Math.round(next.progress * 100)}%` }]} />
          </View>
          <Text style={s.toGo}>
            {next.left} to go for {next.reward.title}.
          </Text>
        </>
      ) : null}

      {view.rewards.map((r) => {
        const can = points >= r.cost;
        return (
          <View key={r.id} style={s.reward}>
            <View style={s.rewardText}>
              <Text style={s.rewardTitle}>{r.title}</Text>
              <Text style={s.rewardBlurb}>{r.blurb}</Text>
            </View>
            {can && view.open ? (
              <View style={s.rewardBtn}>
                <Button title={`${r.cost} PTS`} busy={busy === r.id} disabled={busy !== null} onPress={() => confirm(r.id, r.title, r.cost)} />
              </View>
            ) : (
              <Text style={[s.cost, can && s.costReady]}>{r.cost} PTS</Text>
            )}
          </View>
        );
      })}

      {!view.open ? <Text style={s.hint}>Redeeming opens soon. Your points are stacking either way.</Text> : null}
      {note ? (
        <Text style={s.note} accessibilityLiveRegion="polite">
          {note}
        </Text>
      ) : null}

      {view.claimed.length > 0 ? (
        <>
          <Label style={s.claimedLabel}>YOURS TO USE</Label>
          {view.claimed.map((c) => (
            <Pressable
              key={c.id}
              onPress={() => void Linking.openURL(tagLink(c.url))}
              accessibilityRole="link"
              accessibilityLabel={`${c.title}. Code ${c.code}. Opens the store with it applied.`}
              style={({ pressed }) => [s.claimed, pressed && s.pressed]}
            >
              <View style={s.rewardText}>
                <Text style={s.rewardTitle}>{c.title}</Text>
                <Text style={s.code} selectable>
                  {c.code}
                </Text>
              </View>
              <Text style={s.use}>USE IT</Text>
            </Pressable>
          ))}
          <Text style={s.hint}>Each code works once, on a one-time order. Tap one and it's applied for you.</Text>
        </>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  card: {
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: 18,
    marginTop: 24,
  },
  top: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 2 },
  points: { fontFamily: fonts.headline, color: colors.yellow, fontSize: 56, lineHeight: 60 },
  earn: { fontFamily: fonts.body, color: colors.secondary, fontSize: 13, lineHeight: 18, textAlign: "right" },
  track: { height: 10, borderRadius: 5, backgroundColor: colors.bg, overflow: "hidden", marginTop: 10 },
  fill: { height: 10, borderRadius: 5, backgroundColor: colors.yellow },
  toGo: { fontFamily: fonts.bold, color: colors.text, fontSize: 13, marginTop: 8 },
  reward: {
    flexDirection: "row",
    alignItems: "center",
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 14,
    marginTop: 14,
  },
  rewardText: { flex: 1, paddingRight: 12 },
  rewardTitle: { fontFamily: fonts.headline, color: colors.text, fontSize: 20 },
  rewardBlurb: { fontFamily: fonts.body, color: colors.secondary, fontSize: 13, marginTop: 2 },
  rewardBtn: { minWidth: 110 },
  cost: { fontFamily: fonts.headline, color: colors.muted, fontSize: 16 },
  costReady: { color: colors.yellow },
  hint: { fontFamily: fonts.body, color: colors.muted, fontSize: 12, marginTop: 12 },
  note: { fontFamily: fonts.medium, color: colors.yellow, fontSize: 13, marginTop: 12 },
  claimedLabel: { marginTop: 20, marginBottom: 8 },
  claimed: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.yellow,
    borderRadius: radius.sm,
    padding: 12,
    marginBottom: 8,
  },
  code: { fontFamily: fonts.bold, color: colors.yellow, fontSize: 14, letterSpacing: 1, marginTop: 2 },
  use: { fontFamily: fonts.headline, color: colors.yellow, fontSize: 16 },
  pressed: { transform: [{ scale: 0.98 }] },
});
