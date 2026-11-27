import { Tabs } from "expo-router/js-tabs";
import { DayLogProvider } from "../../lib/useDayLog";
import { colors, fonts } from "../../theme";

export default function TabsLayout() {
  return (
    <DayLogProvider>
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.yellow,
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
      <Tabs.Screen name="drops" options={{ title: "DROPS" }} />
    </Tabs>
    </DayLogProvider>
  );
}
