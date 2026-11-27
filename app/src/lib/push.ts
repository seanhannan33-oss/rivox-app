// Drop alerts. Everything here is opt-in: nothing asks for permission until the member taps the button.
//
// Push needs a real installed build and an Expo project id. Inside Expo Go, or before the project is
// set up, pushAvailable() is false, the notifications library is never loaded and the UI stays hidden.
import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants, { ExecutionEnvironment } from "expo-constants";
import { Platform } from "react-native";
import { registerPush, unregisterPush } from "../api";

const STORED = "rivox.push.token.v1";

function projectId(): string | null {
  const extra = Constants.expoConfig?.extra as { eas?: { projectId?: unknown } } | undefined;
  const id = extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  return typeof id === "string" && id.length > 0 ? id : null;
}

export function pushAvailable(): boolean {
  if (Platform.OS !== "ios" && Platform.OS !== "android") return false;
  if (Constants.executionEnvironment === ExecutionEnvironment.StoreClient) return false; // Expo Go
  return projectId() !== null;
}

const lib = () => import("expo-notifications");

export type PushState = "on" | "off" | "blocked";

/** Whether this phone is signed up for alerts right now. */
export async function pushState(): Promise<PushState> {
  const N = await lib();
  const perm = await N.getPermissionsAsync();
  if (!perm.granted) return perm.canAskAgain ? "off" : "blocked";
  return (await AsyncStorage.getItem(STORED)) ? "on" : "off";
}

/** Asks for permission if needed, then signs this phone up with the server. */
export async function enablePush(sessionToken: string): Promise<PushState> {
  const id = projectId();
  if (!id) return "off";
  const N = await lib();
  let perm = await N.getPermissionsAsync();
  if (!perm.granted && perm.canAskAgain) perm = await N.requestPermissionsAsync();
  if (!perm.granted) return "blocked";
  if (Platform.OS === "android") {
    await N.setNotificationChannelAsync("default", { name: "Drops and deals", importance: N.AndroidImportance.DEFAULT });
  }
  const { data } = await N.getExpoPushTokenAsync({ projectId: id });
  await registerPush(sessionToken, data, Platform.OS === "android" ? "android" : "ios");
  await AsyncStorage.setItem(STORED, data);
  return "on";
}

export async function disablePush(sessionToken: string): Promise<PushState> {
  await forgetPush(sessionToken);
  return "off";
}

/** Stops alerts for this phone. Used when alerts are switched off, on sign out and on account deletion. Never throws. */
export async function forgetPush(sessionToken: string | null): Promise<void> {
  try {
    const stored = await AsyncStorage.getItem(STORED);
    if (!stored) return;
    await AsyncStorage.removeItem(STORED);
    if (sessionToken) await unregisterPush(sessionToken, stored);
  } catch {
    // Best effort. A token the server can't reach gets cleaned up the next time a push to it fails.
  }
}

/** Shows alerts while the app is open, and sends a tap to the right tab. Returns a cleanup function. */
export async function listenForPushes(openTab: (tab: "drops" | "today") => void): Promise<() => void> {
  const N = await lib();
  N.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });
  const go = (data: unknown) => {
    const tab = (data as { tab?: unknown } | null | undefined)?.tab;
    openTab(tab === "today" ? "today" : "drops");
  };
  // The app may have been opened by tapping an alert.
  const last = N.getLastNotificationResponse();
  if (last) {
    go(last.notification.request.content.data);
    N.clearLastNotificationResponse();
  }
  const sub = N.addNotificationResponseReceivedListener((r) => go(r.notification.request.content.data));
  return () => sub.remove();
}
