import { Image, ImageBackground, Pressable, StyleSheet, Text, View } from "react-native";
import { Body, Button, Label, Screen } from "../../components/ui";
import { dayLine, nextBadge, toggleHabit } from "../../lib/days";
import { useDayLog } from "../../lib/useDayLog";
import { useSession } from "../../session";
import { colors, fonts, radius } from "../../theme";

const HABITS = [
  { id: "sleep", label: "Slept 7 hours" },
  { id: "lift", label: "Lifted something heavy" },
  { id: "sun", label: "Sunlight before screens" },
] as const;

const MG_PER_POUCH = 60;

export default function Today() {
  const { email, access, signOut } = useSession();
  const { ready, entry, streak, day, update } = useDayLog(email);
  const products = access?.products ?? [];
  const hasNoCurfew = products.includes("no_curfew");
  const hasPouches = products.includes("pouches");

  const pouches = entry.pouches ?? 0;
  const badge = nextBadge(streak);
  const streakLine =
    `${streak} day streak.` + (badge ? ` Next badge: day ${badge}.` : " You ran out of badges. Show-off.");

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

        <Pressable onPress={signOut} accessibilityRole="button" style={s.signOut}>
          <Text style={s.signOutText}>{email} · Sign out</Text>
        </Pressable>

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
  signOut: { alignItems: "center", paddingVertical: 24 },
  signOutText: { fontFamily: fonts.body, color: colors.muted, fontSize: 13 },
  fda: { fontFamily: fonts.body, color: colors.muted, fontSize: 11, lineHeight: 16 },
});
