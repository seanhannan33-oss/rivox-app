import { useState } from "react";
import { Alert, Image, ImageBackground, Pressable, StyleSheet, Text, View } from "react-native";
import { Rewards } from "../../components/Rewards";
import { Body, Button, Label, Screen } from "../../components/ui";
import {
  BADGES,
  checkedIn,
  crowdLine,
  dayLine,
  dayNumber,
  daysUntil,
  earliestStart,
  inDays,
  nextBadge,
  toggleHabit,
} from "../../lib/days";
import { useDayLog } from "../../lib/useDayLog";
import { errorMessage, type ProductDetail } from "../../api";
import { useSession } from "../../session";
import { colors, fonts, radius } from "../../theme";

const HABITS = [
  { id: "sleep", label: "Slept 7 hours" },
  { id: "lift", label: "Lifted something heavy" },
  { id: "sun", label: "Sunlight before screens" },
] as const;

const MG_PER_POUCH = 60;

export default function Today() {
  const { email, access, signOut, deleteAccount } = useSession();
  const { ready, entry, streak, best, earnedToday, crowd, today, firstDay, update } = useDayLog();
  const products = access?.products ?? [];
  const hasNoCurfew = products.includes("no_curfew");
  const hasPouches = products.includes("pouches");

  // Day 1 is the day they subscribed. If Loop didn't give a date, fall back to their first day in the app.
  const noCurfew = access?.details?.no_curfew;
  const pouchSub = access?.details?.pouches;
  const day = dayNumber(earliestStart([noCurfew?.startedAt, pouchSub?.startedAt]) ?? firstDay, today);

  const [deleting, setDeleting] = useState(false);
  function confirmDelete() {
    Alert.alert(
      "Delete your account?",
      "This wipes your check-ins, training log and protein log from this phone and our servers. It can't be undone. Your Rivox subscription is not cancelled.",
      [
        { text: "Keep it", style: "cancel" },
        {
          text: "Delete everything",
          style: "destructive",
          onPress: async () => {
            setDeleting(true);
            try {
              await deleteAccount(); // signs them out when it's done
            } catch (err) {
              setDeleting(false);
              Alert.alert("Couldn't delete", `${errorMessage(err)} Nothing was removed.`);
            }
          },
        },
      ],
    );
  }

  const pouches = entry.pouches ?? 0;
  const badge = nextBadge(streak);
  const streakLine =
    `${streak} day streak.` + (badge ? ` Next badge: day ${badge}.` : " You ran out of badges. Show-off.");
  const crowdText = crowdLine(crowd, checkedIn(entry));

  return (
    <Screen bottomInset={false} flush>
      <ImageBackground source={require("../../../assets/brand/banner-today.jpg")} style={s.banner} resizeMode="cover">
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
        <Label>{hasNoCurfew ? "YOUR 90 DAYS" : "ZERO NICOTINE. STILL STANDING."}</Label>
        <View style={s.dayRow}>
          <Text style={s.dayWord}>DAY</Text>
          <Text style={s.dayNum}>{ready ? day : " "}</Text>
        </View>
        <Body>{dayLine(day)}</Body>
        <Text style={s.streak}>{streakLine}</Text>
        {crowdText ? <Text style={s.crowd}>{crowdText}</Text> : null}

        {earnedToday ? (
          <View style={s.earned} accessibilityRole="alert">
            <Text style={s.earnedTitle}>DAY {earnedToday} BADGE. EARNED.</Text>
            <Text style={s.earnedLine}>{earnedToday} days straight. Don't make it weird. Show up tomorrow.</Text>
          </View>
        ) : null}

        <View style={s.badges} accessibilityLabel={`Badges earned: ${BADGES.filter((b) => best >= b).length} of ${BADGES.length}`}>
          {BADGES.map((b) => {
            const got = best >= b;
            return (
              <View key={b} style={[s.badge, got && s.badgeGot]}>
                <Text style={[s.badgeNum, got && s.badgeNumGot]}>{b}</Text>
              </View>
            );
          })}
        </View>

        {hasNoCurfew ? (
          <View style={s.card}>
            <Text style={s.cardTitle}>FIVE CAPS. WITH FOOD.*</Text>
            <View style={s.cardGap}>
              {entry.caps ? (
                <Pressable
                  onPress={() => update((e) => ({ ...e, caps: false }))}
                  accessibilityRole="button"
                  accessibilityLabel="Caps taken today. Tap to undo."
                  style={s.done}
                >
                  <Text style={s.doneText}>GOOD. NOBODY'S CLAPPING.</Text>
                  <Text style={s.undo}>Tap to undo</Text>
                </Pressable>
              ) : (
                <Button title="TOOK 'EM" onPress={() => update((e) => ({ ...e, caps: true }))} disabled={!ready} />
              )}
            </View>
            <Label style={s.panelLabel}>IN TODAY'S FIVE CAPS</Label>
            <View style={s.panel}>
              <Dose amount="100 mcg" what="EACH: D3, K1, K2" />
              <Dose amount="30 mg" what="ZINC" />
              <Dose amount="10 mg" what="BORON" />
            </View>
          </View>
        ) : null}
        {hasNoCurfew ? (
          <NextBox what="NEXT BOX" detail={noCurfew} today={today} line="You do nothing. We handle it. Try to keep up." />
        ) : null}

        {hasPouches ? (
          <View style={s.card}>
            <Text style={s.cardTitle}>POUCH COUNT</Text>
            <View style={s.countRow}>
              <Text style={s.count}>
                {pouches} {pouches === 1 ? "POUCH" : "POUCHES"}
              </Text>
              <Text style={s.mg}>{pouches * MG_PER_POUCH} mg caffeine</Text>
            </View>
            <Button
              title="POUCH IN. LOG IT."
              onPress={() => update((e) => ({ ...e, pouches: (e?.pouches ?? 0) + 1 }))}
              disabled={!ready}
            />
            {pouches > 0 ? (
              <Pressable
                onPress={() => update((e) => ({ ...e, pouches: Math.max(0, (e?.pouches ?? 0) - 1) }))}
                accessibilityRole="button"
                style={s.minus}
              >
                <Text style={s.undo}>Logged one too many? Take one off</Text>
              </Pressable>
            ) : null}
            <Text style={s.note}>{MG_PER_POUCH} mg caffeine a pouch. Count it with your coffee.</Text>
          </View>
        ) : null}
        {hasPouches ? (
          <NextBox what="NEXT 5 TINS" detail={pouchSub} today={today} line="Already handled. Try not to run out first." />
        ) : null}

        <Rewards />

        <Label style={s.section}>THE BORING STUFF YOU KEEP SKIPPING</Label>
        {HABITS.map((h) => {
          const on = (entry.habits ?? []).includes(h.id);
          return (
            <Pressable
              key={h.id}
              onPress={() => update((e) => toggleHabit(e, h.id))}
              disabled={!ready}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: on }}
              accessibilityLabel={h.label}
              style={[s.habit, on && s.habitOn]}
            >
              <Text style={s.habitText}>{h.label}</Text>
              <Text style={[s.habitState, on && s.habitStateOn]}>{on ? "DONE" : "STILL WAITING"}</Text>
            </Pressable>
          );
        })}

        <View style={s.account}>
          <Text style={s.signOutText}>{email}</Text>
          <View style={s.accountRow}>
            <Pressable onPress={signOut} disabled={deleting} accessibilityRole="button" hitSlop={10}>
              <Text style={s.accountLink}>Sign out</Text>
            </Pressable>
            <Text style={s.signOutText}>·</Text>
            <Pressable onPress={confirmDelete} disabled={deleting} accessibilityRole="button" hitSlop={10}>
              <Text style={s.accountLink}>{deleting ? "Deleting" : "Delete my account"}</Text>
            </Pressable>
          </View>
        </View>

        {hasNoCurfew ? (
          <Text style={s.fda}>
            *These statements have not been evaluated by the Food and Drug Administration. This product is not intended
            to diagnose, treat, cure, or prevent any disease.
          </Text>
        ) : null}
      </View>
    </Screen>
  );
}

/** Shows only when Loop gave us something true to say. */
function NextBox({
  what,
  detail,
  today,
  line,
}: {
  what: string;
  detail: ProductDetail | undefined;
  today: string;
  line: string;
}) {
  if (!detail) return null;
  if (detail.paused) {
    return (
      <View style={s.nextBox}>
        <Text style={s.nextTitle}>{what} ON HOLD</Text>
        <Text style={s.nextLine}>You paused it. It will be here when you're done hiding.</Text>
      </View>
    );
  }
  if (detail.nextBillingAt === null) return null;
  return (
    <View style={s.nextBox}>
      <Text style={s.nextTitle}>
        {what} BILLS {inDays(daysUntil(detail.nextBillingAt, today))}
      </Text>
      <Text style={s.nextLine}>{line}</Text>
    </View>
  );
}

function Dose({ amount, what }: { amount: string; what: string }) {
  return (
    <View style={s.dose}>
      <Text style={s.doseAmount}>{amount}</Text>
      <Text style={s.doseWhat}>{what}</Text>
    </View>
  );
}

const s = StyleSheet.create({
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
  dayRow: { flexDirection: "row", alignItems: "baseline", marginTop: 4, marginBottom: 8 },
  dayWord: { fontFamily: fonts.headline, color: colors.text, fontSize: 44, marginRight: 12 },
  dayNum: { fontFamily: fonts.headline, color: colors.yellow, fontSize: 84, lineHeight: 88 },
  streak: { fontFamily: fonts.bold, color: colors.text, fontSize: 14, marginTop: 10 },
  crowd: { fontFamily: fonts.medium, color: colors.secondary, fontSize: 14, marginTop: 4 },
  earned: {
    backgroundColor: colors.yellow,
    borderRadius: radius.md,
    padding: 16,
    marginTop: 16,
  },
  earnedTitle: { fontFamily: fonts.headline, color: colors.ink, fontSize: 24 },
  earnedLine: { fontFamily: fonts.medium, color: colors.ink, fontSize: 14, marginTop: 2 },
  badges: { flexDirection: "row", gap: 6, marginTop: 16 },
  badge: {
    flex: 1,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.panel,
  },
  badgeGot: { backgroundColor: colors.yellow, borderColor: colors.yellow },
  badgeNum: { fontFamily: fonts.headline, color: colors.muted, fontSize: 15 },
  badgeNumGot: { color: colors.ink },
  card: {
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: 18,
    marginTop: 24,
  },
  cardTitle: { fontFamily: fonts.headline, color: colors.text, fontSize: 26 },
  cardGap: { marginTop: 14 },
  done: {
    minHeight: 56,
    borderRadius: radius.sm,
    borderWidth: 2,
    borderColor: colors.pink,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 8,
  },
  doneText: { fontFamily: fonts.headline, color: colors.pink, fontSize: 18 },
  undo: { fontFamily: fonts.body, color: colors.muted, fontSize: 12, marginTop: 2 },
  panelLabel: { marginTop: 18, marginBottom: 8 },
  panel: { flexDirection: "row", gap: 8 },
  dose: {
    flex: 1,
    backgroundColor: colors.bg,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 10,
  },
  doseAmount: { fontFamily: fonts.headline, color: colors.yellow, fontSize: 18 },
  doseWhat: { fontFamily: fonts.bold, color: colors.secondary, fontSize: 10, letterSpacing: 0.6, marginTop: 2 },
  countRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
    marginTop: 10,
    marginBottom: 14,
  },
  count: { fontFamily: fonts.headline, color: colors.text, fontSize: 36 },
  mg: { fontFamily: fonts.bold, color: colors.yellow, fontSize: 15 },
  minus: { alignItems: "center", paddingTop: 12, paddingBottom: 2 },
  note: { fontFamily: fonts.body, color: colors.secondary, fontSize: 13, textAlign: "center", marginTop: 12 },
  nextBox: {
    borderLeftWidth: 4,
    borderLeftColor: colors.pink,
    backgroundColor: colors.panel,
    borderRadius: radius.sm,
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginTop: 12,
  },
  nextTitle: { fontFamily: fonts.headline, color: colors.text, fontSize: 18 },
  nextLine: { fontFamily: fonts.body, color: colors.secondary, fontSize: 13, marginTop: 4 },
  section: { marginTop: 32, marginBottom: 10 },
  habit: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    minHeight: 52,
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  habitOn: { borderColor: colors.yellow },
  habitText: { fontFamily: fonts.medium, color: colors.text, fontSize: 15, flexShrink: 1 },
  habitState: { fontFamily: fonts.bold, color: colors.muted, fontSize: 11, letterSpacing: 1, marginLeft: 12 },
  habitStateOn: { color: colors.yellow },
  account: { alignItems: "center", paddingVertical: 24 },
  accountRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 6 },
  accountLink: { fontFamily: fonts.bold, color: colors.muted, fontSize: 13, textDecorationLine: "underline" },
  signOutText: { fontFamily: fonts.body, color: colors.muted, fontSize: 13 },
  fda: { fontFamily: fonts.body, color: colors.muted, fontSize: 11, lineHeight: 16 },
});
