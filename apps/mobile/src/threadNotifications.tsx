import AsyncStorage from "@react-native-async-storage/async-storage";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type PropsWithChildren } from "react";
import Constants from "expo-constants";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import type { NotificationAddressMode, NotificationDevicePlatform } from "@codexbutler/shared";
import {
  registerNotificationDevice,
  updateNotificationDevicePreferences,
  updateNotificationThreadPreference
} from "./api";
import { ensureLocalNotificationPermissions } from "./localNotifications";
import { useSettings } from "./settings";

const THREAD_NOTIFICATIONS_KEY = "codexbutler.threadNotificationIds";
const ADDRESS_MODE_KEY = "codexbutler.notificationAddressMode";
const DEVICE_ID_KEY = "codexbutler.notificationDeviceId";
const DEFAULT_ADDRESS_MODE: NotificationAddressMode = "monsieur";

type PushRegistrationStatus = "idle" | "registered" | "permissionDenied" | "unavailable" | "failed";

interface ThreadNotificationsContextValue {
  notifiedThreadIds: string[];
  addressMode: NotificationAddressMode;
  deviceId: string | null;
  pushRegistrationStatus: PushRegistrationStatus;
  pushRegistrationError: string | null;
  ready: boolean;
  isThreadNotificationsEnabled: (threadId: string) => boolean;
  toggleThreadNotifications: (threadId: string) => Promise<void>;
  setAddressMode: (mode: NotificationAddressMode) => Promise<void>;
}

const ThreadNotificationsContext = createContext<ThreadNotificationsContextValue | null>(null);

function parseStoredThreadIds(value: string | null): string[] {
  if (!value) {
    return [];
  }

  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return [...new Set(parsed.filter((item): item is string => typeof item === "string" && item.length > 0))];
  } catch {
    return [];
  }
}

async function loadStoredThreadNotificationIds(): Promise<string[]> {
  return parseStoredThreadIds(await AsyncStorage.getItem(THREAD_NOTIFICATIONS_KEY));
}

function parseStoredAddressMode(value: string | null): NotificationAddressMode {
  return value === "monsieur" || value === "madame" || value === "neutral" ? value : DEFAULT_ADDRESS_MODE;
}

function notificationPlatform(): NotificationDevicePlatform {
  switch (Platform.OS) {
    case "ios":
    case "android":
    case "web":
      return Platform.OS;
    default:
      return "unknown";
  }
}

function expoProjectId(): string | undefined {
  const extra = Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined;
  return extra?.eas?.projectId ?? Constants.easConfig?.projectId;
}

export function ThreadNotificationsProvider({ children }: PropsWithChildren) {
  const settings = useSettings();
  const [notifiedThreadIds, setNotifiedThreadIds] = useState<string[]>([]);
  const [addressMode, setAddressModeState] = useState<NotificationAddressMode>(DEFAULT_ADDRESS_MODE);
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [pushRegistrationStatus, setPushRegistrationStatus] = useState<PushRegistrationStatus>("idle");
  const [pushRegistrationError, setPushRegistrationError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const notifiedThreadIdsRef = useRef<string[]>([]);
  const addressModeRef = useRef<NotificationAddressMode>(DEFAULT_ADDRESS_MODE);

  useEffect(() => {
    notifiedThreadIdsRef.current = notifiedThreadIds;
  }, [notifiedThreadIds]);

  useEffect(() => {
    addressModeRef.current = addressMode;
  }, [addressMode]);

  useEffect(() => {
    let mounted = true;
    void Promise.all([
      loadStoredThreadNotificationIds(),
      AsyncStorage.getItem(ADDRESS_MODE_KEY),
      AsyncStorage.getItem(DEVICE_ID_KEY)
    ])
      .then(([storedThreadIds, storedAddressMode, storedDeviceId]) => {
        if (mounted) {
          setNotifiedThreadIds(storedThreadIds);
          setAddressModeState(parseStoredAddressMode(storedAddressMode));
          setDeviceId(storedDeviceId || null);
        }
      })
      .finally(() => {
        if (mounted) {
          setReady(true);
        }
      });

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!ready || !settings.ready || !settings.backendUrl || !settings.token) {
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        setPushRegistrationStatus("idle");
        setPushRegistrationError(null);
        if (!(await ensureLocalNotificationPermissions())) {
          if (!cancelled) {
            setPushRegistrationStatus("permissionDenied");
          }
          return;
        }

        const token = await Notifications.getExpoPushTokenAsync({ projectId: expoProjectId() });
        const localThreadIds = notifiedThreadIdsRef.current;
        const response = await registerNotificationDevice(settings, token.data, notificationPlatform(), addressModeRef.current);
        const mergedThreadIds = [...new Set([...localThreadIds, ...response.idleThreadIds])];
        await AsyncStorage.setItem(DEVICE_ID_KEY, response.device.id);
        await AsyncStorage.setItem(THREAD_NOTIFICATIONS_KEY, JSON.stringify(mergedThreadIds));
        await Promise.all(
          localThreadIds
            .filter((threadId) => !response.idleThreadIds.includes(threadId))
            .map((threadId) => updateNotificationThreadPreference(settings, response.device.id, threadId, true).catch(() => undefined))
        );
        if (!cancelled) {
          setDeviceId(response.device.id);
          setNotifiedThreadIds(mergedThreadIds);
          setAddressModeState(response.device.addressMode);
          setPushRegistrationStatus("registered");
        }
      } catch (error) {
        if (!cancelled) {
          setPushRegistrationStatus("failed");
          setPushRegistrationError(error instanceof Error ? error.message : "Push registration failed");
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [ready, settings]);

  const toggleThreadNotifications = useCallback(async (threadId: string) => {
    let nextThreadIds: string[] = [];
    let nextEnabled = false;
    setNotifiedThreadIds((current) => {
      nextEnabled = !current.includes(threadId);
      nextThreadIds = nextEnabled ? [threadId, ...current.filter((id) => id !== threadId)] : current.filter((id) => id !== threadId);
      return nextThreadIds;
    });
    await AsyncStorage.setItem(THREAD_NOTIFICATIONS_KEY, JSON.stringify(nextThreadIds)).catch(() => undefined);
    if (deviceId) {
      await updateNotificationThreadPreference(settings, deviceId, threadId, nextEnabled).catch((error: unknown) => {
        setPushRegistrationStatus("failed");
        setPushRegistrationError(error instanceof Error ? error.message : "Notification preference update failed");
      });
    }
  }, [deviceId, settings]);

  const setAddressMode = useCallback(
    async (mode: NotificationAddressMode) => {
      setAddressModeState(mode);
      await AsyncStorage.setItem(ADDRESS_MODE_KEY, mode).catch(() => undefined);
      if (deviceId) {
        await updateNotificationDevicePreferences(settings, deviceId, mode)
          .then((response) => {
            setAddressModeState(response.device.addressMode);
            setPushRegistrationStatus("registered");
            setPushRegistrationError(null);
          })
          .catch((error: unknown) => {
            setPushRegistrationStatus("failed");
            setPushRegistrationError(error instanceof Error ? error.message : "Notification preference update failed");
          });
      }
    },
    [deviceId, settings]
  );

  const isThreadNotificationsEnabled = useCallback(
    (threadId: string) => notifiedThreadIds.includes(threadId),
    [notifiedThreadIds]
  );

  const value = useMemo<ThreadNotificationsContextValue>(
    () => ({
      notifiedThreadIds,
      addressMode,
      deviceId,
      pushRegistrationStatus,
      pushRegistrationError,
      ready,
      isThreadNotificationsEnabled,
      toggleThreadNotifications,
      setAddressMode
    }),
    [
      addressMode,
      deviceId,
      isThreadNotificationsEnabled,
      notifiedThreadIds,
      pushRegistrationError,
      pushRegistrationStatus,
      ready,
      setAddressMode,
      toggleThreadNotifications
    ]
  );

  return <ThreadNotificationsContext.Provider value={value}>{children}</ThreadNotificationsContext.Provider>;
}

export function useThreadNotifications(): ThreadNotificationsContextValue {
  const value = useContext(ThreadNotificationsContext);
  if (!value) {
    throw new Error("useThreadNotifications must be used inside ThreadNotificationsProvider");
  }
  return value;
}
