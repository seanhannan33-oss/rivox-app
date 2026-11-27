import { useState } from "react";
import { Image, ImageBackground, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { ApiError, errorMessage, estimateMeal, type MealEstimate } from "../../api";
import { Body, Button, ErrorText, Label, Screen } from "../../components/ui";
import {
  SLOTS,
  bySlot,
  clampGrams,
  statusLine,
  targetFor,
  timeLabel,
  total,
  weightOk,
  type Unit,
} from "../../lib/fuel";
import { getMealPhoto } from "../../lib/photo";
import { useDayLog } from "../../lib/useDayLog";
import { useFuel } from "../../lib/useFuel";
import { useSession } from "../../session";
import { fonts, onPhoto, radius, themed, useColors } from "../../theme";

const QUICK = [10, 20, 30, 40];

export default function Fuel() {
  const s = useS();
  const { email, token, access, signOut } = useSession();
  const { today, entry: dayEntry } = useDayLog();
  const { ready, profile, entries, setProfile, add, remove } = useFuel(email, today);
  const hasNoCurfew = (access?.products ?? []).includes("no_curfew");

  const [editingWeight, setEditingWeight] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<{ estimate: MealEstimate; grams: number } | null>(null);

  async function snap(from: "camera" | "library") {
    if (!token || busy) return;
    setError(null);
    setPending(null);
    setBusy(true);
    try {
      const photo = await getMealPhoto(from);
      if (photo.kind === "cancelled") return;
      if (photo.kind === "denied") {
        setError("Camera's blocked. Allow it in Settings, or pick a photo instead.");
        return;
      }
      const { estimate } = await estimateMeal(token, photo.base64);
      if (!estimate.isFood) {
        setError("That's not food. Nice try.");
        return;
      }
      setPending({ estimate, grams: estimate.proteinG });
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        await signOut();
        return;
      }
      setError(err instanceof ApiError ? errorMessage(err) : "Couldn't read that plate. Try again, or tap a number.");
    } finally {
      setBusy(false);
    }
  }

  const sum = total(entries);
  const slots = bySlot(entries);

  return (
    <Screen bottomInset={false} flush>
      <ImageBackground source={require("../../../assets/brand/banner-fuel.jpg")} style={s.banner} resizeMode="cover">
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
        <Label>FUEL</Label>
        <Text style={s.h1}>PROTEIN</Text>
        <Text style={[s.h1, s.yellow]}>FIRST.</Text>
        <Body style={s.intro}>No fads. No cleanses. Hit the number. Eat like a grown man.</Body>

        {!ready ? null : !profile || editingWeight ? (
          <WeightCard
            initial={profile}
            onCancel={profile ? () => setEditingWeight(false) : undefined}
            onSave={(weight, unit) => {
              setProfile({ weight, unit, target: targetFor(weight, unit) });
              setEditingWeight(false);
            }}
          />
        ) : (
          <>
            <View style={s.totalRow}>
              <Text style={s.total}>{sum}</Text>
              <Text style={s.target}>/ {profile.target} g</Text>
            </View>
            <Text style={s.status}>{statusLine(sum, profile.target)}</Text>

            <View style={s.bar} accessibilityLabel={`${sum} of ${profile.target} grams of protein today`}>
              {SLOTS.map((slot) => (
                <View key={slot} style={[s.seg, slots[slot] > 0 && s.segOn]}>
                  <Text style={[s.segName, slots[slot] > 0 && s.segTextOn]}>{slot}</Text>
                  <Text style={[s.segNum, slots[slot] > 0 && s.segTextOn]}>{slots[slot] > 0 ? slots[slot] : "?"}</Text>
                </View>
              ))}
            </View>

            {pending ? (
              <View style={s.pending}>
                <Label>WE SEE</Label>
                <Text style={s.pendingLabel}>{pending.estimate.label}</Text>
                <View style={s.adjust}>
                  <Round label="Less" sign="-" onPress={() => setPending({ ...pending, grams: clampGrams(pending.grams - 5) })} />
                  <Text style={s.pendingGrams}>{pending.grams} g</Text>
                  <Round label="More" sign="+" onPress={() => setPending({ ...pending, grams: clampGrams(pending.grams + 5) })} />
                </View>
                <Text style={s.hint}>
                  {pending.estimate.confidence === "low"
                    ? "Rough guess from a photo. Fix it if you know better."
                    : "Estimated from the photo. Nudge it if it's off."}
                </Text>
                <Button
                  title={`ADD ${pending.grams} g`}
                  disabled={pending.grams === 0}
                  onPress={() => {
                    add({ grams: pending.grams, label: pending.estimate.label, source: "photo" });
                    setPending(null);
                  }}
                />
                <Pressable onPress={() => setPending(null)} accessibilityRole="button" style={s.linkRow}>
                  <Text style={s.link}>Toss it</Text>
                </Pressable>
              </View>
            ) : (
              <>
                <Button title={busy ? "READING YOUR PLATE" : "SNAP YOUR PLATE"} busy={busy} onPress={() => void snap("camera")} />
                <Pressable onPress={() => void snap("library")} disabled={busy} accessibilityRole="button" style={s.linkRow}>
                  <Text style={s.link}>Or pick a photo you already took</Text>
                </Pressable>
              </>
            )}
            <ErrorText>{error}</ErrorText>

            <Label style={s.section}>NO CAMERA? TAP IT IN.</Label>
            <View style={s.quick}>
              {QUICK.map((g) => (
                <Pressable
                  key={g}
                  onPress={() => add({ grams: g, label: "Quick add", source: "quick" })}
                  accessibilityRole="button"
                  accessibilityLabel={`Add ${g} grams of protein`}
                  style={({ pressed }) => [s.quickBtn, pressed && s.pressed]}
                >
                  <Text style={s.quickText}>+{g} g</Text>
                </Pressable>
              ))}
            </View>

            <Label style={s.section}>TODAY'S PLATES</Label>
            {hasNoCurfew ? (
              <View style={s.row}>
                <View style={s.rowText}>
                  <Text style={s.rowTitle}>No Curfew, 5 caps*</Text>
                  <Text style={s.rowSub}>D3, K1, K2 100 mcg each · Zinc 30 mg · Boron 10 mg</Text>
                </View>
                <Text style={[s.rowState, dayEntry.caps && s.yellow]}>{dayEntry.caps ? "LOGGED" : "NOT YET"}</Text>
              </View>
            ) : null}
            {entries.length === 0 ? (
              <Body style={s.empty}>Nothing yet. The plate's not going to photograph itself.</Body>
            ) : (
              [...entries].reverse().map((e) => (
                <View key={e.id} style={s.row}>
                  <View style={s.rowText}>
                    <Text style={s.rowTitle}>{e.label}</Text>
                    <Text style={s.rowSub}>{timeLabel(e.at)}</Text>
                  </View>
                  <Text style={s.rowGrams}>{e.grams} g</Text>
                  <Pressable
                    onPress={() => remove(e.id)}
                    accessibilityRole="button"
                    accessibilityLabel={`Remove ${e.label}, ${e.grams} grams`}
                    hitSlop={10}
                    style={s.x}
                  >
                    <Text style={s.xText}>×</Text>
                  </Pressable>
                </View>
              ))
            )}

            <Pressable onPress={() => setEditingWeight(true)} accessibilityRole="button" style={s.linkRow}>
              <Text style={s.muted}>
                Target: {profile.target} g a day, from {profile.weight} {profile.unit}. <Text style={s.link}>Change</Text>
              </Text>
            </Pressable>
          </>
        )}

        <Text style={s.fine}>
          Protein numbers from photos are estimates. The target is a general guide for healthy adults, not medical
          advice. If you have a kidney condition or a doctor has given you a number, use theirs.
        </Text>
        {hasNoCurfew ? (
          <Text style={s.fine}>
            *These statements have not been evaluated by the Food and Drug Administration. This product is not intended
            to diagnose, treat, cure, or prevent any disease.
          </Text>
        ) : null}
      </View>
    </Screen>
  );
}

function WeightCard({
  initial,
  onSave,
  onCancel,
}: {
  initial: { weight: number; unit: Unit } | null;
  onSave: (weight: number, unit: Unit) => void;
  onCancel?: () => void;
}) {
  const s = useS();
  const colors = useColors();
  const [text, setText] = useState(initial ? String(initial.weight) : "");
  const [unit, setUnit] = useState<Unit>(initial?.unit ?? "lb");
  const [error, setError] = useState<string | null>(null);
  const weight = Number(text.replace(",", "."));
  const valid = text.trim() !== "" && weightOk(weight, unit);

  return (
    <View style={s.card}>
      <Text style={s.cardTitle}>WHAT DO YOU WEIGH?</Text>
      <Body style={s.cardBody}>One number and we do the math. It stays on your phone. We don't want it.</Body>
      <View style={s.weightRow}>
        <TextInput
          style={s.input}
          value={text}
          onChangeText={(t) => {
            setText(t.replace(/[^0-9.,]/g, "").slice(0, 5));
            setError(null);
          }}
          placeholder={unit === "lb" ? "200" : "90"}
          placeholderTextColor={colors.border}
          keyboardType="decimal-pad"
          returnKeyType="done"
          accessibilityLabel={`Your weight in ${unit === "lb" ? "pounds" : "kilograms"}`}
        />
        <View style={s.units} accessibilityRole="radiogroup">
          {(["lb", "kg"] as const).map((u) => (
            <Pressable
              key={u}
              onPress={() => setUnit(u)}
              accessibilityRole="radio"
              accessibilityState={{ selected: unit === u }}
              style={[s.unit, unit === u && s.unitOn]}
            >
              <Text style={[s.unitText, unit === u && s.unitTextOn]}>{u.toUpperCase()}</Text>
            </Pressable>
          ))}
        </View>
      </View>
      {valid ? <Text style={s.preview}>Your number: {targetFor(weight, unit)} g of protein a day.</Text> : null}
      <ErrorText>{error}</ErrorText>
      <View style={s.gap}>
        <Button
          title="SET MY NUMBER"
          onPress={() => (valid ? onSave(weight, unit) : setError("That's not a real weight. Try again."))}
        />
      </View>
      {onCancel ? (
        <Pressable onPress={onCancel} accessibilityRole="button" style={s.linkRow}>
          <Text style={s.link}>Never mind</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function Round({ sign, label, onPress }: { sign: string; label: string; onPress: () => void }) {
  const s = useS();
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`${label} protein`} hitSlop={8} style={s.round}>
      <Text style={s.roundText}>{sign}</Text>
    </Pressable>
  );
}

const useS = themed((colors) =>
  StyleSheet.create({
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
  h1: { fontFamily: fonts.headline, color: colors.text, fontSize: 52, lineHeight: 54 },
  yellow: { color: colors.accent },
  intro: { marginTop: 10 },
  totalRow: { flexDirection: "row", alignItems: "baseline", marginTop: 20 },
  total: { fontFamily: fonts.headline, color: colors.accent, fontSize: 84, lineHeight: 88 },
  target: { fontFamily: fonts.headline, color: colors.text, fontSize: 28, marginLeft: 10 },
  status: { fontFamily: fonts.bold, color: colors.text, fontSize: 15 },
  bar: { flexDirection: "row", gap: 6, marginTop: 16, marginBottom: 20 },
  seg: {
    flex: 1,
    alignItems: "center",
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingVertical: 10,
  },
  segOn: { backgroundColor: colors.yellow, borderColor: colors.outline },
  segName: { fontFamily: fonts.bold, color: colors.muted, fontSize: 9, letterSpacing: 0.6 },
  segNum: { fontFamily: fonts.headline, color: colors.muted, fontSize: 20, marginTop: 2 },
  segTextOn: { color: colors.ink },
  pending: {
    backgroundColor: colors.panel,
    borderWidth: 2,
    borderColor: colors.outline,
    borderRadius: radius.md,
    padding: 18,
  },
  pendingLabel: { fontFamily: fonts.headline, color: colors.text, fontSize: 22, marginTop: 6 },
  adjust: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 24, marginVertical: 14 },
  pendingGrams: { fontFamily: fonts.headline, color: colors.accent, fontSize: 48, minWidth: 130, textAlign: "center" },
  round: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  roundText: { fontFamily: fonts.headline, color: colors.text, fontSize: 26, lineHeight: 30 },
  hint: { fontFamily: fonts.body, color: colors.muted, fontSize: 12, textAlign: "center", marginBottom: 14 },
  linkRow: { alignItems: "center", paddingVertical: 14 },
  link: { fontFamily: fonts.bold, color: colors.accent, fontSize: 14 },
  muted: { fontFamily: fonts.body, color: colors.muted, fontSize: 13, textAlign: "center" },
  section: { marginTop: 24, marginBottom: 10 },
  quick: { flexDirection: "row", gap: 8 },
  quickBtn: {
    flex: 1,
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.sm,
    borderWidth: 2,
    borderColor: colors.outline,
  },
  quickText: { fontFamily: fonts.headline, color: colors.accent, fontSize: 16 },
  pressed: { transform: [{ scale: 0.97 }] },
  row: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 56,
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 8,
  },
  rowText: { flex: 1, paddingRight: 10 },
  rowTitle: { fontFamily: fonts.medium, color: colors.text, fontSize: 15 },
  rowSub: { fontFamily: fonts.body, color: colors.muted, fontSize: 12, marginTop: 2 },
  rowState: { fontFamily: fonts.bold, color: colors.muted, fontSize: 11, letterSpacing: 1 },
  rowGrams: { fontFamily: fonts.headline, color: colors.accent, fontSize: 18 },
  x: { marginLeft: 12, width: 28, height: 28, alignItems: "center", justifyContent: "center" },
  xText: { fontFamily: fonts.bold, color: colors.muted, fontSize: 22, lineHeight: 24 },
  empty: { marginBottom: 8 },
  card: {
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: 18,
    marginTop: 24,
  },
  cardTitle: { fontFamily: fonts.headline, color: colors.text, fontSize: 26 },
  cardBody: { marginTop: 6 },
  weightRow: { flexDirection: "row", gap: 10, marginTop: 16 },
  input: {
    flex: 1,
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    color: colors.text,
    fontFamily: fonts.headline,
    fontSize: 28,
    paddingHorizontal: 16,
    minHeight: 60,
  },
  units: { flexDirection: "row", borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, overflow: "hidden" },
  unit: { minWidth: 56, alignItems: "center", justifyContent: "center", paddingHorizontal: 12 },
  unitOn: { backgroundColor: colors.yellow },
  unitText: { fontFamily: fonts.headline, color: colors.muted, fontSize: 16 },
  unitTextOn: { color: colors.ink },
  preview: { fontFamily: fonts.bold, color: colors.accent, fontSize: 14, marginTop: 12 },
  gap: { marginTop: 16 },
  fine: { fontFamily: fonts.body, color: colors.muted, fontSize: 11, lineHeight: 16, marginTop: 12 },
}),
);
