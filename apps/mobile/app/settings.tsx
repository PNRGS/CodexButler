import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Text, TextInput, View } from "react-native";
import { health } from "../src/api";
import { useSettings } from "../src/settings";
import { PrimaryButton, Screen, colors, styles } from "../src/ui";

export default function SettingsScreen() {
  const settings = useSettings();
  const [backendUrl, setBackendUrl] = useState(settings.backendUrl);
  const [token, setToken] = useState(settings.token);
  const healthQuery = useQuery({
    queryKey: ["health", settings.backendUrl, settings.token],
    enabled: settings.ready,
    queryFn: () => health(settings)
  });
  const session = healthQuery.data?.session;

  return (
    <Screen>
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
        <View style={styles.headerRow}>
          <Text style={styles.rowTitle}>Connection</Text>
          <View style={[styles.pill, healthQuery.data?.ok ? null : styles.dangerPill]}>
            <Text style={[styles.pillText, healthQuery.data?.ok ? null : styles.dangerText]}>
              {healthQuery.data?.ok ? "healthy" : "unknown"}
            </Text>
          </View>
        </View>
        <Text style={styles.muted}>
          {healthQuery.isError
            ? healthQuery.error.message
            : session
              ? `Codex connected: ${session.codexConnected ? "yes" : "no"} | Mode: ${session.codexConnectionMode} | Bridge: ${
                  session.codexBridgeStatus
                }`
              : "Test the backend health endpoint after saving settings."}
        </Text>
        {session?.codexConnectionDetail ? <Text style={styles.pathText}>{session.codexConnectionDetail}</Text> : null}
        <PrimaryButton onPress={() => healthQuery.refetch()}>Test health</PrimaryButton>
      </View>
    </Screen>
  );
}

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
