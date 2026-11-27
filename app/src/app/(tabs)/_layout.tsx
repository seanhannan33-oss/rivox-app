import { useRouter } from "expo-router";
import { Tabs } from "expo-router/js-tabs";
import { useEffect } from "react";
import { listenForPushes, pushAvailable } from "../../lib/push";
import { DayLogProvider } from "../../lib/useDayLog";
import { fonts, useColors } from "../../theme";

export default function TabsLayout() {
  const colors = useColors();
  const router = useRouter();
  // Tapping an alert opens the tab it was about.
  useEffect(() => {
    if (!pushAvailable()) return;
    let stop: (() => void) | undefined;
    let alive = true;
    listenForPushes((tab) => router.navigate(tab === "today" ? "/" : "/shop"))
      .then((cleanup) => {
        if (alive) stop = cleanup;
        else cleanup();
      })
      .catch(() => {});
    return () => {
      alive = false;
      stop?.();
    };
  }, [router]);

  return (
    <DayLogProvider>
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: { backgroundColor: colors.bg, borderTopColor: colors.border },
        tabBarLabelStyle: { fontFamily: fonts.headline, fontSize: 14, letterSpacing: 0.5 },
        tabBarIconStyle: { display: "none" },
        tabBarLabelPosition: "beside-icon",
        sceneStyle: { backgroundColor: colors.bg },
      }}
    >
      <Tabs.Screen name="index" options={{ title: "TODAY" }} />
      <Tabs.Screen name="train" options={{ title: "TRAIN" }} />
      <Tabs.Screen name="fuel" options={{ title: "FUEL" }} />
      <Tabs.Screen name="shop" options={{ title: "SHOP" }} />
    </Tabs>
    </DayLogProvider>
  );
}
