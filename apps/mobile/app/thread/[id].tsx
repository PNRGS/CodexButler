import { Stack, useLocalSearchParams } from "expo-router";
import { Pin } from "lucide-react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { FlatList, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import type { Turn, TurnItem } from "@codexbutler/shared";
import { getThread, listTurns, sendPrompt } from "../../src/api";
import { usePinnedThreads } from "../../src/pinnedThreads";
import { useSettings } from "../../src/settings";
import { EmptyState, LoadingState, PrimaryButton, Screen, StatusPill, TimelineItem, colors, styles } from "../../src/ui";
import { useCodexButlerEvents } from "../../src/useCodexButlerEvents";

interface TimelineEntry extends TurnItem {
  turnId: string;
  turnCreatedAt: string;
  turnIndex: number;
  itemIndex: number;
}

function timestamp(value: string | null): number {
  if (!value) {
    return 0;
  }
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function orderedTimelineItems(turns: Turn[]): TimelineEntry[] {
  return turns
    .map((turn, sourceIndex) => ({ turn, sourceIndex }))
    .sort((a, b) => timestamp(a.turn.createdAt) - timestamp(b.turn.createdAt) || b.sourceIndex - a.sourceIndex)
    .flatMap(({ turn }, turnIndex) =>
      turn.items
        .map((item, itemIndex) => ({
          ...item,
          turnId: turn.id,
          turnCreatedAt: turn.createdAt,
          turnIndex,
          itemIndex
        }))
        .sort(
          (a, b) =>
            timestamp(a.createdAt) - timestamp(b.createdAt) ||
            timestamp(a.completedAt) - timestamp(b.completedAt) ||
            a.itemIndex - b.itemIndex
        )
    );
}

export default function ThreadDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const settings = useSettings();
  const pinnedThreads = usePinnedThreads();
  const queryClient = useQueryClient();
  const listRef = useRef<FlatList<TimelineEntry>>(null);
  const [promptText, setPromptText] = useState("");
  useCodexButlerEvents();
  const thread = useQuery({
    queryKey: ["thread", id, settings.backendUrl],
    enabled: settings.ready && Boolean(id),
    queryFn: () => getThread(settings, id),
    refetchInterval: (query) => {
      const thread = query.state.data;
      return thread?.status === "running" || thread?.status === "waitingOnApproval" || thread?.hasPendingApproval ? 2000 : false;
    }
  });
  const turns = useQuery({
    queryKey: ["turns", id, settings.backendUrl],
    enabled: settings.ready && Boolean(id),
    queryFn: () => listTurns(settings, id),
    refetchInterval: (query) => {
      const hasActiveTurn = query.state.data?.data.some((turn) => turn.status === "inProgress");
      return hasActiveTurn ? 2000 : false;
    }
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
  const timelineItems = useMemo(() => orderedTimelineItems(turns.data?.data ?? []), [turns.data?.data]);

  useEffect(() => {
    if (timelineItems.length === 0) {
      return;
    }

    const frame = requestAnimationFrame(() => {
      listRef.current?.scrollToEnd({ animated: false });
    });
    return () => cancelAnimationFrame(frame);
  }, [id, timelineItems.length]);

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
  const pinned = pinnedThreads.isPinned(thread.data.id);

  return (
    <Screen>
      <Stack.Screen options={{ title: thread.data.title }} />
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={88}
        style={threadStyles.layout}
      >
        <View style={styles.row}>
          <View style={styles.headerRow}>
            <Text style={[styles.title, { fontSize: 22, lineHeight: 28, flex: 1 }]}>{thread.data.title}</Text>
            <View style={threadStyles.headerActions}>
              <Pressable
                accessibilityLabel={pinned ? "Unpin thread" : "Pin thread"}
                accessibilityRole="button"
                onPress={() => void pinnedThreads.togglePinnedThread(thread.data.id)}
                style={({ pressed }) => [threadStyles.pinButton, pinned && threadStyles.pinnedPinButton, pressed && styles.buttonPressed]}
              >
                <Pin color={pinned ? colors.accent : colors.muted} fill={pinned ? colors.accent : "transparent"} size={18} />
              </Pressable>
              <StatusPill status={thread.data.status} urgent={thread.data.status === "waitingOnApproval" || thread.data.hasPendingApproval} />
            </View>
          </View>
          {thread.data.summary ? <Text style={styles.muted}>{thread.data.summary}</Text> : null}
          {thread.data.cwd ? (
            <Text style={styles.pathText} numberOfLines={1}>
              {thread.data.cwd}
            </Text>
          ) : null}
        </View>

        <FlatList
          ref={listRef}
          contentContainerStyle={timelineItems.length ? threadStyles.messagesContent : threadStyles.emptyMessagesContent}
          data={timelineItems}
          keyExtractor={(item) => `${item.turnId}:${item.id}`}
          ListEmptyComponent={<EmptyState title="No recent turns" body="The thread has no readable turn history yet." />}
          renderItem={({ item }) => <TimelineItem item={item} />}
          style={threadStyles.messagesList}
        />

        <View style={threadStyles.composer}>
          <TextInput
            autoCapitalize="sentences"
            multiline
            onChangeText={setPromptText}
            placeholder="Send a short instruction"
            style={threadStyles.promptInput}
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
      </KeyboardAvoidingView>
    </Screen>
  );
}

const threadStyles = StyleSheet.create({
  layout: {
    flex: 1,
    gap: 12
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8
  },
  pinButton: {
    width: 36,
    height: 36,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fffdf8",
    borderColor: colors.border,
    borderWidth: StyleSheet.hairlineWidth
  },
  pinnedPinButton: {
    backgroundColor: "#dcefe9",
    borderColor: "#b7d8cc"
  },
  messagesList: {
    flex: 1
  },
  messagesContent: {
    gap: 10,
    paddingVertical: 4
  },
  emptyMessagesContent: {
    flexGrow: 1,
    justifyContent: "center"
  },
  composer: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 8,
    padding: 10,
    gap: 8
  },
  promptInput: {
    minHeight: 74,
    maxHeight: 140,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: colors.ink,
    backgroundColor: "#ffffff",
    fontSize: 15,
    lineHeight: 20,
    textAlignVertical: "top"
  }
});
