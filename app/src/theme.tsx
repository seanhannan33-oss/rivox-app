// Colors come from the live rivoxlabs.com styles. Dark is the brand look; light is the same brand on a pale page.
// Change colors here only.
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useColorScheme } from "react-native";

export interface Palette {
  bg: string;
  panel: string;
  border: string;
  text: string;
  secondary: string;
  muted: string;
  /** Fill for primary buttons and "done" chips. The same in both modes. */
  yellow: string;
  /** Text and icons that sit on yellow. */
  ink: string;
  /** Highlight text: big numbers, links, the second line of a headline. Yellow can't be read on a pale page, so light mode uses pink. */
  accent: string;
  /** Outline buttons and "selected" borders. */
  outline: string;
  /** The brand pink, for bars and borders. */
  pink: string;
  /** Pink text: errors and warnings. Tuned per mode so it stays readable. */
  alert: string;
  /** Pink for big headline words. Brand pink on navy, a deeper one on the pale page. */
  headlinePink: string;
  /** What sits behind the white logo when it isn't on a photo. */
  logoPlate: string;
}

export const dark: Palette = {
  bg: "#071224",
  panel: "#1C2638",
  border: "#2C3A52",
  text: "#FFFFFF",
  secondary: "#CBD5E0",
  muted: "#A0AEC0",
  yellow: "#FFE500",
  ink: "#071224",
  accent: "#FFE500",
  outline: "#FFE500",
  pink: "#ED145B",
  alert: "#FF6A97",
  headlinePink: "#ED145B",
  logoPlate: "transparent",
};

export const light: Palette = {
  bg: "#F4F6FA",
  panel: "#FFFFFF",
  border: "#D5DBE6",
  text: "#071224",
  secondary: "#39455A",
  muted: "#5B6679",
  yellow: "#FFE500",
  ink: "#071224",
  accent: "#C40F49",
  outline: "#071224",
  pink: "#ED145B",
  alert: "#C40F49",
  headlinePink: "#C40F49",
  logoPlate: "#071224",
};

/** Banner photos are dark in both modes, so what sits on them never changes. */
export const onPhoto = { shade: "rgba(7,18,36,0.55)", pill: "#FFE500", pillText: "#071224" } as const;

export const fonts = {
  headline: "LilitaOne_400Regular",
  body: "DMSans_400Regular",
  medium: "DMSans_500Medium",
  bold: "DMSans_700Bold",
} as const;

export const radius = { sm: 12, md: 16 } as const;

export type Mode = "system" | "light" | "dark";
const STORED = "rivox.appearance.v1";

interface ThemeValue {
  colors: Palette;
  scheme: "light" | "dark";
  mode: Mode;
  setMode: (mode: Mode) => void;
}

const ThemeContext = createContext<ThemeValue>({ colors: dark, scheme: "dark", mode: "system", setMode: () => {} });

export function ThemeProvider({ children }: { children: ReactNode }) {
  const system = useColorScheme();
  const [mode, setModeState] = useState<Mode>("system");

  useEffect(() => {
    AsyncStorage.getItem(STORED)
      .then((v) => {
        if (v === "light" || v === "dark" || v === "system") setModeState(v);
      })
      .catch(() => {});
  }, []);

  const setMode = useCallback((next: Mode) => {
    setModeState(next);
    AsyncStorage.setItem(STORED, next).catch(() => {});
  }, []);

  const value = useMemo<ThemeValue>(() => {
    // With no answer from the phone, stay on the brand look.
    const scheme = mode === "system" ? (system === "light" ? "light" : "dark") : mode;
    return { colors: scheme === "light" ? light : dark, scheme, mode, setMode };
  }, [mode, system, setMode]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export const useTheme = () => useContext(ThemeContext);
export const useColors = () => useContext(ThemeContext).colors;

/**
 * Styles that depend on the palette. Define once outside the component, call the
 * returned hook inside it. Each palette's styles are built once and reused.
 */
export function themed<T>(build: (colors: Palette) => T): () => T {
  const cache = new Map<Palette, T>();
  return function useThemedStyles() {
    const colors = useColors();
    let styles = cache.get(colors);
    if (!styles) {
      styles = build(colors);
      cache.set(colors, styles);
    }
    return styles;
  };
}
