import { DMSans_400Regular, DMSans_500Medium, DMSans_700Bold } from "@expo-google-fonts/dm-sans";
import { LilitaOne_400Regular } from "@expo-google-fonts/lilita-one";
import { useFonts } from "expo-font";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { SessionProvider, useSession } from "../session";
import { ThemeProvider, useColors, useTheme } from "../theme";

SplashScreen.preventAutoHideAsync().catch(() => {});

function Routes({ fontsReady }: { fontsReady: boolean }) {
  const colors = useColors();
  const { status } = useSession();
  const ready = fontsReady && status !== "loading";

  useEffect(() => {
    if (ready) SplashScreen.hideAsync().catch(() => {});
  }, [ready]);

  if (!ready) return null;

  // Each screen exists only for the state it belongs to, so nobody can
  // deep-link past the door.
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
      <Stack.Protected guard={status === "member"}>
        <Stack.Screen name="(tabs)" />
      </Stack.Protected>
      <Stack.Protected guard={status === "locked"}>
        <Stack.Screen name="locked" />
      </Stack.Protected>
      <Stack.Protected guard={status === "signedOut"}>
        <Stack.Screen name="sign-in" />
      </Stack.Protected>
    </Stack>
  );
}

/** Dark clock and battery on the pale page, light ones on the navy page. */
function ThemedStatusBar() {
  const { scheme } = useTheme();
  return <StatusBar style={scheme === "light" ? "dark" : "light"} />;
}

export default function RootLayout() {
  const [loaded, error] = useFonts({ LilitaOne_400Regular, DMSans_400Regular, DMSans_500Medium, DMSans_700Bold });
  return (
    <SafeAreaProvider>
      <ThemeProvider>
      <SessionProvider>
        <ThemedStatusBar />
        {/* If fonts fail we still open the app on system fonts. */}
        <Routes fontsReady={loaded || error != null} />
      </SessionProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
