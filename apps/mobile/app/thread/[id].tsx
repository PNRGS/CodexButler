import { Stack, useLocalSearchParams } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { FlatList, Text, TextInput, View } from "react-native";
import { getThread, listTurns, sendPrompt } from "../../src/api";
import { useSettings } from "../../src/settings";
import { EmptyState, LoadingState, PrimaryButton, Screen, StatusPill, TimelineItem, colors, styles } from "../../src/ui";
import { useConciergeEvents } from "../../src/useConciergeEvents";

export default function ThreadDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const settings = useSettings();
  const queryClient = useQueryClient();
  const [promptText, setPromptText] = useState("");
  useConciergeEvents();
  const thread = useQuery({
    queryKey: ["thread", id, settings.backendUrl],
    enabled: settings.ready && Boolean(id),
    queryFn: () => getThread(settings, id)
  });
  const turns = useQuery({
    queryKey: ["turns", id, settings.backendUrl],
    enabled: settings.ready && Boolean(id),
    queryFn: () => listTurns(settings, id)
  });
  const promptMutation = useMutation({
    mutationFn: () => sendPrompt(settings, id, promptText),
    onSuccess: async () => {
      setPromptText("");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["threads"] }),
        queryClient.invalidateQueries({ queryKey: ["thread", id] }),
        queryClient.invalidateQueries({ queryKey: ["turns", id] })
      ]);
    }
  });

  if (!settings.ready || thread.isLoading || turns.isLoading) {
    return <LoadingState />;
  }

  if (thread.isError) {
    return (
      <Screen>
        <EmptyState title="Thread unavailable" body={thread.error.message} />
      </Screen>
    );
  }

  if (!thread.data) {
    return (
      <Screen>
        <EmptyState title="Thread unavailable" body="No thread data was returned by the backend." />
      </Screen>
    );
  }

  const trimmedPrompt = promptText.trim();
  const threadBusy = thread.data.status === "running" || thread.data.status === "waitingOnApproval" || thread.data.hasPendingApproval;
  const promptTooLong = trimmedPrompt.length > 4000;
  const canSendPrompt = trimmedPrompt.length > 0 && !promptTooLong && !threadBusy && !promptMutation.isPending;

  return (
    <Screen>
      <Stack.Screen options={{ title: thread.data.title }} />
      <View style={styles.row}>
        <View style={styles.headerRow}>
          <Text style={[styles.title, { fontSize: 22, lineHeight: 28, flex: 1 }]}>{thread.data.title}</Text>
          <StatusPill status={thread.data.status} urgent={thread.data.hasPendingApproval} />
        </View>
        <Text style={styles.muted}>{thread.data.summary}</Text>
      </View>

      <View style={styles.row}>
        <Text style={styles.rowTitle}>Add instruction</Text>
        <TextInput
          autoCapitalize="sentences"
          multiline
          onChangeText={setPromptText}
          placeholder="Send a short instruction"
          style={promptInputStyle}
          value={promptText}
        />
        {threadBusy ? <Text style={styles.muted}>This thread is busy or waiting on approval.</Text> : null}
        {promptTooLong ? <Text style={[styles.muted, { color: colors.danger }]}>Prompts are limited to 4,000 characters.</Text> : null}
        {promptMutation.isError ? <Text style={[styles.muted, { color: colors.danger }]}>{promptMutation.error.message}</Text> : null}
        <View style={styles.headerRow}>
          <Text style={styles.muted}>{trimmedPrompt.length}/4000</Text>
          <PrimaryButton disabled={!canSendPrompt} onPress={() => promptMutation.mutate()} style={{ minWidth: 92 }}>
            {promptMutation.isPending ? "Sending" : promptMutation.isSuccess ? "Sent" : "Send"}
          </PrimaryButton>
        </View>
      </View>

      <FlatList
        data={turns.data?.data.flatMap((turn) => turn.items.map((item) => ({ ...item, turnId: turn.id }))) ?? []}
        keyExtractor={(item) => `${item.turnId}:${item.id}`}
        contentContainerStyle={{ gap: 10, paddingBottom: 24 }}
        ListEmptyComponent={<EmptyState title="No recent turns" body="The thread has no readable turn history yet." />}
        renderItem={({ item }) => <TimelineItem item={item} />}
      />
    </Screen>
  );
}

const promptInputStyle = {
  minHeight: 96,
  borderWidth: 1,
  borderColor: colors.border,
  borderRadius: 8,
  paddingHorizontal: 12,
  paddingVertical: 10,
  color: colors.ink,
  backgroundColor: "#ffffff",
  fontSize: 15,
  lineHeight: 20,
  textAlignVertical: "top" as const
};
