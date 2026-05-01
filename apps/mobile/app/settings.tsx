import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Text, TextInput, View } from "react-native";
import { getSession } from "../src/api";
import { useSettings } from "../src/settings";
import { PrimaryButton, Screen, colors, styles } from "../src/ui";

export default function SettingsScreen() {
  const settings = useSettings();
  const [backendUrl, setBackendUrl] = useState(settings.backendUrl);
  const [token, setToken] = useState(settings.token);
  const sessionQuery = useQuery({
    queryKey: ["session", settings.backendUrl, settings.token],
    enabled: settings.ready,
    queryFn: () => getSession(settings)
  });
  const session = sessionQuery.data?.session;

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
