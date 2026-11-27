import type { ReactNode } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type TextProps,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors, fonts, radius } from "../theme";

/** Navy page with the pink bar across the top, same as the site. */
export function Screen({
  children,
  bottomInset = true,
  flush = false,
}: {
  children: ReactNode;
  /** Off inside tabs, where the tab bar already clears the home indicator. */
  bottomInset?: boolean;
  /** No side padding, for screens with an edge-to-edge banner. */
  flush?: boolean;
}) {
  return (
    <View style={s.root}>
      <SafeAreaView style={s.flex} edges={bottomInset ? ["top", "bottom"] : ["top"]}>
        <View style={s.pinkBar} />
        <KeyboardAvoidingView style={s.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <ScrollView contentContainerStyle={[s.content, flush && s.flush]} keyboardShouldPersistTaps="handled">
            {children}
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

export function Headline({ style, ...rest }: TextProps) {
  return <Text accessibilityRole="header" {...rest} style={[s.headline, style]} />;
}

export function Body({ style, ...rest }: TextProps) {
  return <Text {...rest} style={[s.body, style]} />;
}

export function Label({ style, ...rest }: TextProps) {
  return <Text {...rest} style={[s.label, style]} />;
}

export function Button({
  title,
  onPress,
  busy = false,
  disabled = false,
  variant = "primary",
}: {
  title: string;
  onPress: () => void;
  busy?: boolean;
  disabled?: boolean;
  variant?: "primary" | "outline";
}) {
  const off = disabled || busy;
  const primary = variant === "primary";
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: off, busy }}
      disabled={off}
      onPress={onPress}
      style={({ pressed }) => [
        s.button,
        primary ? s.primary : s.outline,
        off && s.off,
        pressed && s.pressed,
      ]}
    >
      {busy ? (
        <ActivityIndicator color={primary ? colors.ink : colors.yellow} />
      ) : (
        <Text style={[s.buttonText, { color: primary ? colors.ink : colors.yellow }]}>{title}</Text>
      )}
    </Pressable>
  );
}

export function ErrorText({ children }: { children: string | null }) {
  if (!children) return null;
  return (
    <Text accessibilityLiveRegion="polite" style={s.error}>
      {children}
    </Text>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  pinkBar: { height: 6, backgroundColor: colors.pink },
  content: { flexGrow: 1, padding: 24, paddingBottom: 40 },
  flush: { paddingHorizontal: 0, paddingTop: 0 },
  headline: { fontFamily: fonts.headline, color: colors.text, fontSize: 44, lineHeight: 46 },
  body: { fontFamily: fonts.body, color: colors.secondary, fontSize: 16, lineHeight: 24 },
  label: { fontFamily: fonts.bold, color: colors.muted, fontSize: 12, letterSpacing: 1.2 },
  button: {
    minHeight: 56,
    borderRadius: radius.sm,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 20,
  },
  primary: {
    backgroundColor: colors.yellow,
    shadowColor: colors.yellow,
    shadowOpacity: 0.45,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 0 },
    elevation: 6,
  },
  outline: { borderWidth: 2, borderColor: colors.yellow },
  off: { opacity: 0.45 },
  pressed: { transform: [{ scale: 0.98 }] },
  buttonText: { fontFamily: fonts.headline, fontSize: 20, letterSpacing: 0.5 },
  error: { fontFamily: fonts.medium, color: colors.pink, fontSize: 14, marginTop: 10 },
});
