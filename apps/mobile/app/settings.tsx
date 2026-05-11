import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import type { NotificationAddressMode } from "@codexbutler/shared";
import { getSession } from "../src/api";
import { useSettings } from "../src/settings";
import { useThreadNotifications } from "../src/threadNotifications";
import { PrimaryButton, Screen, SecondaryButton, colors, styles } from "../src/ui";

const SESSION_REFRESH_INTERVAL_MS = 5000;
const ADDRESS_OPTIONS: Array<{ mode: NotificationAddressMode; label: string; preview: string }> = [
  { mode: "monsieur", label: "Monsieur", preview: "Monsieur ? Your attention please." },
  { mode: "madame", label: "Madame", preview: "Madame ? Your attention please." },
  { mode: "neutral", label: "Non genré", preview: "Your attention please." }
];

function pushRegistrationMessage(status: string, error: string | null): string {
  if (status === "registered") {
    return "Push notifications are registered for this backend.";
  }
  if (status === "permissionDenied") {
    return "Notifications are disabled by the operating system.";
  }
  if (status === "failed") {
    const normalizedError = error?.toLowerCase() ?? "";
    if (
      normalizedError.includes("firebase") ||
      normalizedError.includes("fcm") ||
      normalizedError.includes("initializeapp") ||
      normalizedError.includes("docs.expo.dev")
    ) {
      return "Remote push is not configured for this Android build. It is only needed for alerts when the app is closed; local use can continue without it.";
    }
    return error ?? "Push registration failed.";
  }
  return "Push registration starts after saving backend settings.";
}

export default function SettingsScreen() {
  const settings = useSettings();
  const notifications = useThreadNotifications();
  const [backendUrl, setBackendUrl] = useState(settings.backendUrl);
  const [token, setToken] = useState(settings.token);
  const sessionQuery = useQuery({
    queryKey: ["session", settings.backendUrl, settings.token],
    enabled: settings.ready,
    queryFn: () => getSession(settings),
    refetchInterval: SESSION_REFRESH_INTERVAL_MS
  });
  const session = sessionQuery.data?.session;

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={settingsStyles.content}
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
        style={settingsStyles.scroller}
      >
        <View>
          <Text style={styles.title}>Settings</Text>
          <Text style={styles.subtitle}>Backend host and access token for this phone</Text>
        </View>

        <View style={styles.row}>
          <Text style={styles.rowTitle}>Backend URL</Text>
          <TextInput
            autoCapitalize="none"
            autoCorrect={false}
            value={backendUrl}
            onChangeText={setBackendUrl}
            placeholder="http://192.168.1.20:4545"
            style={inputStyle}
          />
          <Text style={styles.rowTitle}>Bearer token</Text>
          <TextInput
            autoCapitalize="none"
            autoCorrect={false}
            value={token}
            onChangeText={setToken}
            secureTextEntry
            style={inputStyle}
          />
          <PrimaryButton onPress={() => settings.saveSettings(backendUrl, token)}>Save settings</PrimaryButton>
        </View>

        <View style={styles.row}>
          <Text style={styles.rowTitle}>Notifications</Text>
          <Text style={styles.muted}>
            Push alerts use only a generic butler message. No command, thread name, cwd, or approval detail is sent.
          </Text>
          <View style={styles.actionColumn}>
            {ADDRESS_OPTIONS.map((option) => (
              <SecondaryButton
                key={option.mode}
                onPress={() => void notifications.setAddressMode(option.mode)}
                style={{
                  backgroundColor: notifications.addressMode === option.mode ? "#dcefe9" : "#fffdf8",
                  borderColor: notifications.addressMode === option.mode ? "#b7d8cc" : colors.border
                }}
              >
                {option.label}
              </SecondaryButton>
            ))}
          </View>
          <Text style={styles.commandText}>{ADDRESS_OPTIONS.find((option) => option.mode === notifications.addressMode)?.preview}</Text>
          <Text style={styles.muted}>{pushRegistrationMessage(notifications.pushRegistrationStatus, notifications.pushRegistrationError)}</Text>
        </View>

        <View style={styles.row}>
          <View style={styles.headerRow}>
            <Text style={styles.rowTitle}>Connection</Text>
            <View style={[styles.pill, sessionQuery.data?.ok ? null : styles.dangerPill]}>
              <Text style={[styles.pillText, sessionQuery.data?.ok ? null : styles.dangerText]}>
                {sessionQuery.data?.ok ? "healthy" : "unknown"}
              </Text>
            </View>
          </View>
          <Text style={styles.muted}>
            {sessionQuery.isError
              ? sessionQuery.error.message
              : session
                ? `Codex connected: ${session.codexConnected ? "yes" : "no"} | Mode: ${session.codexConnectionMode} | Bridge: ${
                    session.codexBridgeStatus
                  }`
                : "Test the backend connection after saving settings."}
          </Text>
          {session?.codexConnectionDetail ? <Text style={styles.pathText}>{session.codexConnectionDetail}</Text> : null}
          <PrimaryButton onPress={() => sessionQuery.refetch()}>Test connection</PrimaryButton>
        </View>
      </ScrollView>
    </Screen>
  );
}

const settingsStyles = StyleSheet.create({
  scroller: {
    flex: 1
  },
  content: {
    gap: 12,
    paddingBottom: 24
  }
});

const inputStyle = {
  minHeight: 44,
  borderWidth: 1,
  borderColor: colors.border,
  borderRadius: 8,
  paddingHorizontal: 12,
  color: colors.ink,
  backgroundColor: "#ffffff",
  fontSize: 15
};
