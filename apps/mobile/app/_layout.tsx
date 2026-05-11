import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { PinnedThreadsProvider } from "../src/pinnedThreads";
import { SettingsProvider } from "../src/settings";
import { ThreadNotificationsProvider } from "../src/threadNotifications";
import { useCodexButlerEvents } from "../src/useCodexButlerEvents";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 10_000
    }
  }
});

function CodexButlerEventBridge() {
  useCodexButlerEvents();
  return null;
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <SettingsProvider>
        <PinnedThreadsProvider>
          <ThreadNotificationsProvider>
            <QueryClientProvider client={queryClient}>
              <CodexButlerEventBridge />
              <StatusBar style="light" />
              <Stack
                screenOptions={{
                  headerStyle: { backgroundColor: "#101820" },
                  headerTintColor: "#f8fafc",
                  headerTitleStyle: { fontWeight: "700" },
                  contentStyle: { backgroundColor: "#f4f0e8" }
                }}
              />
            </QueryClientProvider>
          </ThreadNotificationsProvider>
        </PinnedThreadsProvider>
      </SettingsProvider>
    </SafeAreaProvider>
  );
}
