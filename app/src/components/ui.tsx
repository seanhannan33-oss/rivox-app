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
import { fonts, radius, themed, useColors, useTheme } from "../theme";

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
  const s = useS();
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
  const s = useS();
  return <Text accessibilityRole="header" {...rest} style={[s.headline, style]} />;
}

export function Body({ style, ...rest }: TextProps) {
  const s = useS();
  return <Text {...rest} style={[s.body, style]} />;
}

export function Label({ style, ...rest }: TextProps) {
  const s = useS();
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
  const s = useS();
  const colors = useColors();
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
        <ActivityIndicator color={primary ? colors.ink : colors.outline} />
      ) : (
        <Text style={[s.buttonText, { color: primary ? colors.ink : colors.outline }]}>{title}</Text>
      )}
    </Pressable>
  );
}

export function ErrorText({ children }: { children: string | null }) {
  const s = useS();
  if (!children) return null;
  return (
    <Text accessibilityLiveRegion="polite" style={s.error}>
      {children}
    </Text>
  );
}

/** Auto follows the phone. Light and Dark pin it. */
export function AppearancePicker() {
  const s = useS();
  const { mode, setMode } = useTheme();
  const options = [
    { id: "system", label: "AUTO" },
    { id: "light", label: "LIGHT" },
    { id: "dark", label: "DARK" },
  ] as const;
  return (
    <View style={s.modes} accessibilityRole="radiogroup" accessibilityLabel="Appearance">
      {options.map((o) => {
        const on = mode === o.id;
        return (
          <Pressable
            key={o.id}
            onPress={() => setMode(o.id)}
            accessibilityRole="radio"
            accessibilityState={{ selected: on }}
            accessibilityLabel={o.id === "system" ? "Match my phone" : `${o.label.toLowerCase()} mode`}
            style={[s.mode, on && s.modeOn]}
          >
            <Text style={[s.modeText, on && s.modeTextOn]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const useS = themed((colors) =>
  StyleSheet.create({
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
  outline: { borderWidth: 2, borderColor: colors.outline },
  off: { opacity: 0.45 },
  pressed: { transform: [{ scale: 0.98 }] },
  buttonText: { fontFamily: fonts.headline, fontSize: 20, letterSpacing: 0.5 },
  modes: {
    flexDirection: "row",
    alignSelf: "center",
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
  },
  mode: { minWidth: 72, minHeight: 40, alignItems: "center", justifyContent: "center", paddingHorizontal: 14 },
  modeOn: { backgroundColor: colors.yellow },
  modeText: { fontFamily: fonts.bold, color: colors.muted, fontSize: 12, letterSpacing: 1 },
  modeTextOn: { color: colors.ink },
  error: { fontFamily: fonts.medium, color: colors.alert, fontSize: 14, marginTop: 10 },
}),
);
