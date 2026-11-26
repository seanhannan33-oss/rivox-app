import * as Linking from "expo-linking";
import { useState } from "react";
import { Image, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { errorMessage, requestCode, verifyCode } from "../api";
import { Body, Button, ErrorText, Headline, Label, Screen } from "../components/ui";
import { LINKS } from "../config";
import { useSession } from "../session";
import { colors, fonts, radius } from "../theme";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function SignIn() {
  const { signIn } = useSession();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const address = email.trim().toLowerCase();

  async function send() {
    if (!EMAIL.test(address)) {
      setError("That is not an email. Try again.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await requestCode(address);
      setSentTo(address);
      setCode("");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function verify() {
    if (!sentTo) return;
    if (!/^\d{6}$/.test(code)) {
      setError("Six digits. That's the whole job.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { token, access } = await verifyCode(sentTo, code);
      await signIn(token, sentTo, access); // the layout swaps screens from here
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <Screen>
      <Image source={require("../../assets/brand/logo.png")} style={s.logo} resizeMode="contain" accessibilityLabel="Rivox Labs" />
      <Headline>MEMBERS ONLY.</Headline>
      <Headline style={s.yellow}>PROVE IT.</Headline>
      <Body style={s.intro}>
        Enter the email on your Rivox subscription. No Curfew or pouches, either one gets you in. We send a code. No
        password, because you would forget it.
      </Body>

      <Label style={s.label}>YOUR EMAIL</Label>
      <TextInput
        style={s.input}
        value={email}
        onChangeText={(t) => {
          setEmail(t);
          if (sentTo) setSentTo(null); // changed the email, so the old code is no good
        }}
        placeholder="you@email.com"
        placeholderTextColor={colors.muted}
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="email"
        textContentType="emailAddress"
        keyboardType="email-address"
        returnKeyType="send"
        onSubmitEditing={send}
        editable={!busy}
        accessibilityLabel="Your email"
      />

      {!sentTo ? (
        <View style={s.gap}>
          <Button title="SEND MY CODE" onPress={send} busy={busy} />
        </View>
      ) : (
        <>
          <Label style={s.label}>6-DIGIT CODE. CHECK YOUR INBOX.</Label>
          <TextInput
            autoFocus
            style={[s.input, s.code]}
            value={code}
            onChangeText={(t) => setCode(t.replace(/\D/g, "").slice(0, 6))}
            placeholder="000000"
            placeholderTextColor={colors.border}
            keyboardType="number-pad"
            autoComplete="one-time-code"
            textContentType="oneTimeCode"
            maxLength={6}
            returnKeyType="done"
            onSubmitEditing={verify}
            editable={!busy}
            accessibilityLabel="Six digit code"
          />
          <View style={s.gap}>
            <Button title="LET ME IN" onPress={verify} busy={busy} />
          </View>
          <Pressable onPress={send} disabled={busy} accessibilityRole="button" style={s.linkRow}>
            <Text style={s.link}>Didn't get it? Send another</Text>
          </Pressable>
        </>
      )}

      <ErrorText>{error}</ErrorText>

      <View style={s.spacer} />
      <Pressable onPress={() => Linking.openURL(LINKS.site)} accessibilityRole="link" style={s.linkRow}>
        <Text style={s.footer}>
          Not a member yet? <Text style={s.link}>See what you're missing</Text>
        </Text>
      </Pressable>
    </Screen>
  );
}

const s = StyleSheet.create({
  logo: { width: 140, height: 48, marginTop: 16, marginBottom: 32, alignSelf: "flex-start" },
  yellow: { color: colors.yellow },
  intro: { marginTop: 16 },
  label: { marginTop: 28, marginBottom: 8 },
  input: {
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    color: colors.text,
    fontFamily: fonts.medium,
    fontSize: 17,
    paddingHorizontal: 16,
    minHeight: 56,
  },
  code: { fontFamily: fonts.bold, fontSize: 26, letterSpacing: 10, textAlign: "center" },
  gap: { marginTop: 16 },
  linkRow: { paddingVertical: 14, alignItems: "center" },
  link: { fontFamily: fonts.bold, color: colors.yellow, fontSize: 14 },
  footer: { fontFamily: fonts.body, color: colors.muted, fontSize: 14 },
  spacer: { flexGrow: 1, minHeight: 24 },
});
