import * as Linking from "expo-linking";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { errorMessage } from "../api";
import { Body, Button, ErrorText, Headline, Label, Screen } from "../components/ui";
import { LINKS } from "../config";
import { useSession } from "../session";
import { fonts, radius, themed } from "../theme";

const PERKS = [
  "Training plan and protein tracking",
  "App-only deals you won't see anywhere else",
  "First tins on every flavor drop",
];

export default function Locked() {
  const s = useS();
  const { email, recheck, signOut } = useSession();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  async function check() {
    setBusy(true);
    setNote(null);
    try {
      const access = await recheck(); // if it's active now, the layout lets them in
      if (!access.allowed) setNote("Still nothing on that email.");
    } catch (err) {
      setNote(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <Headline style={s.top}>NICE TRY.</Headline>
      <Headline style={s.pink}>MEMBERS ONLY.</Headline>
      <Body style={s.intro}>
        This app is free with any active Rivox subscription. That email does not have one. Yet.
      </Body>
      {email ? <Text style={s.email}>{email}</Text> : null}

      <View style={s.card}>
        <Text style={s.cardTitle}>NO CURFEW*</Text>
        <Body style={s.cardBody}>90-day supply. $119 every three months. That is $39.67 a bottle.</Body>
        <Button title="GET NO CURFEW" onPress={() => Linking.openURL(LINKS.noCurfew)} />
      </View>

      <View style={s.card}>
        <Text style={s.cardTitle}>FOCUS POUCHES</Text>
        <Body style={s.cardBody}>Subscribe: $41.94 first box, then 5 tins a month for $31.49.</Body>
        <Button title="GET POUCHES" variant="outline" onPress={() => Linking.openURL(LINKS.pouches)} />
      </View>

      <Label style={s.perksLabel}>WHAT'S BEHIND THE DOOR</Label>
      {PERKS.map((p) => (
        <View key={p} style={s.perk}>
          <View style={s.dot} />
          <Text style={s.perkText}>{p}</Text>
        </View>
      ))}

      <View style={s.again}>
        <Button title="I JUST SUBSCRIBED. CHECK AGAIN" variant="outline" onPress={check} busy={busy} />
        <ErrorText>{note}</ErrorText>
      </View>

      <Pressable onPress={signOut} disabled={busy} accessibilityRole="button" style={s.linkRow}>
        <Text style={s.footer}>
          Ordered with a different email? <Text style={s.link}>Try again</Text>
        </Text>
      </Pressable>

      <Text style={s.fda}>
        *These statements have not been evaluated by the Food and Drug Administration. This product is not intended to
        diagnose, treat, cure, or prevent any disease.
      </Text>
    </Screen>
  );
}

const useS = themed((colors) =>
  StyleSheet.create({
  top: { marginTop: 24 },
  pink: { color: colors.headlinePink },
  intro: { marginTop: 16 },
  email: { fontFamily: fonts.bold, color: colors.text, fontSize: 14, marginTop: 8 },
  card: {
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: 18,
    marginTop: 20,
  },
  cardTitle: { fontFamily: fonts.headline, color: colors.text, fontSize: 24 },
  cardBody: { marginTop: 6, marginBottom: 16 },
  perksLabel: { marginTop: 32, marginBottom: 12 },
  perk: { flexDirection: "row", alignItems: "center", marginBottom: 10 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.accent, marginRight: 12 },
  perkText: { fontFamily: fonts.medium, color: colors.text, fontSize: 15, flexShrink: 1 },
  again: { marginTop: 24 },
  linkRow: { paddingVertical: 18, alignItems: "center" },
  link: { fontFamily: fonts.bold, color: colors.accent, fontSize: 14 },
  footer: { fontFamily: fonts.body, color: colors.muted, fontSize: 14 },
  fda: { fontFamily: fonts.body, color: colors.muted, fontSize: 11, lineHeight: 16, marginTop: 8 },
}),
);
