import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useState } from "react";
import { Image, Modal, Pressable, Share, StyleSheet, Text, View, type ImageSourcePropType } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { RANKS, currentRank, nextRank, type Rank } from "../lib/days";
import { useDayLog } from "../lib/useDayLog";
import { useSession } from "../session";
import { fonts, radius, themed } from "../theme";
import { Button } from "./ui";

const ART: Record<Rank["id"], { lit: ImageSourcePropType; off: ImageSourcePropType }> = {
  pup: { lit: require("../../assets/ranks/pup-lit.png"), off: require("../../assets/ranks/pup-off.png") },
  pack: { lit: require("../../assets/ranks/pack-lit.png"), off: require("../../assets/ranks/pack-off.png") },
  hunter: { lit: require("../../assets/ranks/hunter-lit.png"), off: require("../../assets/ranks/hunter-off.png") },
  alpha: { lit: require("../../assets/ranks/alpha-lit.png"), off: require("../../assets/ranks/alpha-off.png") },
  nocurfew: { lit: require("../../assets/ranks/nocurfew-lit.png"), off: require("../../assets/ranks/nocurfew-off.png") },
};

export function RankEmblem({ id, lit, size }: { id: Rank["id"]; lit: boolean; size: number }) {
  return <Image source={lit ? ART[id].lit : ART[id].off} style={{ width: size, height: size }} resizeMode="contain" />;
}

/** The five ranks in a row, with a countdown to the next one. */
export function RankRow() {
  const s = useS();
  const { best, streak } = useDayLog();
  const next = nextRank(best, streak);
  const earned = RANKS.filter((r) => best >= r.days).length;

  return (
    <View style={s.wrap}>
      {next ? (
        <>
          <Text style={s.toGo}>
            {next.left} {next.left === 1 ? "day" : "days"} to {next.rank.name}.
          </Text>
          <View style={s.track}>
            <View style={[s.fill, { width: `${Math.round(next.progress * 100)}%` }]} />
          </View>
        </>
      ) : (
        <Text style={s.toGo}>Every rank earned. Nothing left to prove.</Text>
      )}
      <View style={s.row} accessibilityLabel={`${earned} of ${RANKS.length} ranks earned`}>
        {RANKS.map((r) => {
          const lit = best >= r.days;
          return (
            <View key={r.id} style={s.cell}>
              <RankEmblem id={r.id} lit={lit} size={54} />
              <Text style={[s.name, !lit && s.nameOff]} numberOfLines={1} adjustsFontSizeToFit>
                {r.name}
              </Text>
              <Text style={s.days}>DAY {r.days}</Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const seenKey = (email: string) => `rivox.rank.seen.v1.${email}`;

/**
 * Takes over the screen the day a new rank lands. Each rank is celebrated once:
 * rebuilding a streak past a rank they already hold doesn't fire it again.
 */
export function RankUp() {
  const s = useS();
  const { email } = useSession();
  const { earnedToday, points } = useDayLog();
  const [seen, setSeen] = useState<number | null>(null);

  useEffect(() => {
    if (!email) return;
    let alive = true;
    AsyncStorage.getItem(seenKey(email))
      .then((v) => {
        if (alive) setSeen(Number(v) || 0);
      })
      .catch(() => {
        if (alive) setSeen(0);
      });
    return () => {
      alive = false;
    };
  }, [email]);

  const rank = earnedToday ? RANKS.find((r) => r.days === earnedToday) : undefined;
  const show = Boolean(rank && seen !== null && rank.days > seen);
  if (!rank || !show) return null;

  function close() {
    if (!rank || !email) return;
    setSeen(rank.days);
    AsyncStorage.setItem(seenKey(email), String(rank.days)).catch(() => {});
  }

  return (
    <Modal visible animationType="fade" onRequestClose={close} statusBarTranslucent>
      <View style={s.modal}>
        <SafeAreaView style={s.modalInner}>
          <Text style={s.kicker}>RANK UP</Text>
          <RankEmblem id={rank.id} lit size={220} />
          <Text style={s.big}>DAY {rank.days}.</Text>
          <Text style={[s.big, s.bigAccent]}>{rank.name}.</Text>
          <Text style={s.line}>{rank.line}</Text>
          {points !== null ? <Text style={s.pts}>{points} POINTS AND COUNTING</Text> : null}
          <View style={s.buttons}>
            <Button title="KEEP GOING" onPress={close} />
            <View style={s.gap} />
            <Button
              title="SHOW IT OFF"
              variant="outline"
              onPress={() =>
                void Share.share({
                  message: `${rank.days} days straight. Just hit ${rank.name} rank in the Rivox app. rivoxlabs.com`,
                }).catch(() => {})
              }
            />
          </View>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

/** The name to show on the member pill: their rank once they have one. */
export function useRankLabel(): string {
  const { best } = useDayLog();
  return currentRank(best)?.name ?? "RIVOX MEMBER";
}

const useS = themed((colors) =>
  StyleSheet.create({
    wrap: { marginTop: 16 },
    toGo: { fontFamily: fonts.bold, color: colors.text, fontSize: 13 },
    track: { height: 8, borderRadius: 4, backgroundColor: colors.panel, overflow: "hidden", marginTop: 8 },
    fill: { height: 8, borderRadius: 4, backgroundColor: colors.yellow },
    row: { flexDirection: "row", justifyContent: "space-between", marginTop: 14 },
    cell: { alignItems: "center", width: 62 },
    name: { fontFamily: fonts.bold, color: colors.text, fontSize: 9, letterSpacing: 0.5, marginTop: 4 },
    nameOff: { color: colors.muted },
    days: { fontFamily: fonts.body, color: colors.muted, fontSize: 9, marginTop: 1 },
    modal: { flex: 1, backgroundColor: colors.bg },
    modalInner: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 28 },
    kicker: { fontFamily: fonts.bold, color: colors.muted, fontSize: 13, letterSpacing: 2, marginBottom: 18 },
    big: { fontFamily: fonts.headline, color: colors.text, fontSize: 52, lineHeight: 54, textAlign: "center" },
    bigAccent: { color: colors.accent },
    line: { fontFamily: fonts.body, color: colors.secondary, fontSize: 16, lineHeight: 24, textAlign: "center", marginTop: 14 },
    pts: {
      fontFamily: fonts.bold,
      color: colors.ink,
      backgroundColor: colors.yellow,
      fontSize: 12,
      letterSpacing: 1,
      borderRadius: radius.sm,
      overflow: "hidden",
      paddingHorizontal: 14,
      paddingVertical: 7,
      marginTop: 16,
    },
    buttons: { alignSelf: "stretch", marginTop: 28 },
    gap: { height: 10 },
  }),
);
