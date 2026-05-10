import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { PinnedThreadsProvider } from "../src/pinnedThreads";
import { SettingsProvider } from "../src/settings";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 10_000
    }
  }
});

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <SettingsProvider>
        <PinnedThreadsProvider>
          <QueryClientProvider client={queryClient}>
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
        </PinnedThreadsProvider>
      </SettingsProvider>
    </SafeAreaProvider>
  );
}
