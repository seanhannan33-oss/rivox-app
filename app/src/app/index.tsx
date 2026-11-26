import { StyleSheet, Text, View } from "react-native";
import { Body, Button, Headline, Screen } from "../components/ui";
import { useSession } from "../session";
import { colors, fonts } from "../theme";

const NAMES = { no_curfew: "No Curfew", pouches: "Focus Pouches" } as const;

// Placeholder until the Today screen is built. It proves the door works.
export default function Home() {
  const { email, access, signOut } = useSession();
  return (
    <Screen>
      <Headline style={s.top}>YOU'RE IN.</Headline>
      <Body style={s.intro}>Today, Train, Fuel and Drops land here next.</Body>
      <View style={s.box}>
        <Text style={s.small}>{email}</Text>
        <Text style={s.subs}>{(access?.products ?? []).map((p) => NAMES[p]).join(" + ") || "Member"}</Text>
      </View>
      <Button title="SIGN OUT" variant="outline" onPress={signOut} />
    </Screen>
  );
}

const s = StyleSheet.create({
  top: { marginTop: 24, color: colors.yellow },
  intro: { marginTop: 16 },
  box: { marginVertical: 28 },
  small: { fontFamily: fonts.body, color: colors.muted, fontSize: 14 },
  subs: { fontFamily: fonts.headline, color: colors.text, fontSize: 24, marginTop: 4 },
});
