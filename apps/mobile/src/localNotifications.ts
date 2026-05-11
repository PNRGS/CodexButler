import type { NotificationAddressMode } from "@codexbutler/shared";
import * as Notifications from "expo-notifications";
import { AppState, Platform } from "react-native";

const CHANNEL_ID = "codexbutler-events";

let permissionRequest: Promise<boolean> | null = null;
let channelReady = false;

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: AppState.currentState !== "active",
    shouldShowList: AppState.currentState !== "active",
    shouldPlaySound: AppState.currentState !== "active",
    shouldSetBadge: false
  })
});

export function attentionNotificationText(addressMode: NotificationAddressMode): string {
  switch (addressMode) {
    case "monsieur":
      return "Monsieur ? Your attention please.";
    case "madame":
      return "Madame ? Your attention please.";
    case "neutral":
      return "Your attention please.";
  }
}

function permissionsGranted(status: Notifications.NotificationPermissionsStatus): boolean {
  return status.granted || status.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL;
}

async function ensureAndroidChannel(): Promise<void> {
  if (channelReady || Platform.OS !== "android") {
    return;
  }

  await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
    name: "CodexButler events",
    importance: Notifications.AndroidImportance.DEFAULT
  });
  channelReady = true;
}

export async function ensureLocalNotificationPermissions(): Promise<boolean> {
  if (!permissionRequest) {
    permissionRequest = (async () => {
      try {
        await ensureAndroidChannel();
        const existing = await Notifications.getPermissionsAsync();
        if (permissionsGranted(existing)) {
          return true;
        }
        if (!existing.canAskAgain) {
          return false;
        }
        const requested = await Notifications.requestPermissionsAsync();
        return permissionsGranted(requested);
      } catch {
        return false;
      }
    })();
  }

  return permissionRequest;
}

export function primeLocalNotifications(): void {
  void ensureLocalNotificationPermissions();
}

export async function notifyAttention(addressMode: NotificationAddressMode): Promise<void> {
  if (AppState.currentState === "active") {
    return;
  }

  if (!(await ensureLocalNotificationPermissions())) {
    return;
  }

  await Notifications.scheduleNotificationAsync({
    content: {
      title: attentionNotificationText(addressMode),
      sound: true
    },
    trigger: Platform.OS === "android" ? { channelId: CHANNEL_ID } : null
  });
}
