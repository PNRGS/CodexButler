import { Link, useRouter } from "expo-router";
import { Settings } from "lucide-react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import type { ApprovalDecisionKind, ApprovalRequest, Project, Thread } from "@codexbutler/shared";
import { createThread, decideApproval, listApprovals, listProjects, listRecentApprovals, listThreads } from "../src/api";
import { usePinnedThreads } from "../src/pinnedThreads";
import { useSettings } from "../src/settings";
import {
  ApprovalCard,
  EmptyState,
  LoadingState,
  PrimaryButton,
  RecentDecisionRow,
  Screen,
  SectionHeader,
  ThreadRow,
  colors,
  styles
} from "../src/ui";
import { useCodexButlerEvents } from "../src/useCodexButlerEvents";

const INBOX_REFRESH_INTERVAL_MS = 10000;

interface ThreadProjectGroup {
  key: string;
  name: string;
  cwd: string | null;
  threads: Thread[];
  updatedAt: string;
}

function uniqueProjectsByCwd(projects: Project[]): Project[] {
  return [...new Map(projects.map((project) => [project.cwd, project])).values()];
}

function sortThreadsByUpdatedAt(threads: Thread[]): Thread[] {
  return [...threads].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

function projectNameFromCwd(cwd: string | null): string {
  if (!cwd) {
    return "Unknown project";
  }
  return cwd.split(/[\\/]/).filter(Boolean).at(-1) ?? cwd;
}

function groupThreadsByProject(threads: Thread[], projects: Project[]): ThreadProjectGroup[] {
  const projectsById = new Map(projects.map((project) => [project.id, project]));
  const projectsByCwd = new Map(projects.map((project) => [project.cwd, project]));
  const groups = new Map<string, ThreadProjectGroup>();

  for (const thread of sortThreadsByUpdatedAt(threads)) {
    const project = thread.projectId ? projectsById.get(thread.projectId) : thread.cwd ? projectsByCwd.get(thread.cwd) : undefined;
    const key = project?.id ?? thread.projectId ?? thread.cwd ?? "unknown";
    const existing = groups.get(key);

    if (existing) {
      existing.threads.push(thread);
      if (thread.updatedAt.localeCompare(existing.updatedAt) > 0) {
        existing.updatedAt = thread.updatedAt;
      }
      continue;
    }

    groups.set(key, {
      key,
      name: project?.name ?? projectNameFromCwd(thread.cwd),
      cwd: project?.cwd ?? thread.cwd,
      threads: [thread],
      updatedAt: thread.updatedAt
    });
  }

  return [...groups.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export default function ThreadsScreen() {
  const settings = useSettings();
  const pinnedThreads = usePinnedThreads();
  const queryClient = useQueryClient();
  const router = useRouter();
  const [newThreadText, setNewThreadText] = useState("");
  const [selectedCwd, setSelectedCwd] = useState<string | null>(null);
  const [useCustomCwd, setUseCustomCwd] = useState(false);
  const [customCwd, setCustomCwd] = useState("");
  useCodexButlerEvents();
  const threads = useQuery({
    queryKey: ["threads", settings.backendUrl],
    enabled: settings.ready,
    queryFn: () => listThreads(settings),
    refetchInterval: INBOX_REFRESH_INTERVAL_MS
  });
  const approvals = useQuery({
    queryKey: ["approvals", settings.backendUrl],
    enabled: settings.ready,
    queryFn: () => listApprovals(settings),
    refetchInterval: INBOX_REFRESH_INTERVAL_MS
  });
  const recentApprovals = useQuery({
    queryKey: ["approvals", "recent", settings.backendUrl],
    enabled: settings.ready,
    queryFn: () => listRecentApprovals(settings),
    refetchInterval: INBOX_REFRESH_INTERVAL_MS
  });
  const projects = useQuery({
    queryKey: ["projects", settings.backendUrl],
    enabled: settings.ready,
    queryFn: () => listProjects(settings),
    refetchInterval: INBOX_REFRESH_INTERVAL_MS
  });
  const createThreadMutation = useMutation({
    mutationFn: () => createThread(settings, newThreadText, useCustomCwd ? customCwd.trim() : selectedCwd),
    onSuccess: async (result) => {
      setNewThreadText("");
      await queryClient.invalidateQueries({ queryKey: ["threads"] });
      router.push({ pathname: "/thread/[id]", params: { id: result.thread.id } });
    }
  });
  const decision = useMutation({
    mutationFn: ({
      approval,
      decision,
      followUpText
    }: {
      approval: ApprovalRequest;
      decision: ApprovalDecisionKind;
      followUpText?: string;
    }) =>
      decideApproval(
        settings,
        approval.id,
        decision,
        decision === "alwaysAllowRule" ? approval.proposedRule ?? undefined : undefined,
        followUpText
      ),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["approvals"] }),
        queryClient.invalidateQueries({ queryKey: ["threads"] })
      ]);
    }
  });

  if (!settings.ready || threads.isLoading) {
    return <LoadingState />;
  }

  const pendingApprovals = approvals.data?.data ?? [];
  const allThreads = threads.data?.data ?? [];
  const recentDecisions = recentApprovals.data?.data ?? [];
  const trimmedNewThreadText = newThreadText.trim();
  const trimmedCustomCwd = customCwd.trim();
  const projectOptions = uniqueProjectsByCwd(projects.data?.data ?? []);
  const knownPinnedThreads = sortThreadsByUpdatedAt(
    allThreads.filter((thread) => pinnedThreads.pinnedThreadIds.includes(thread.id))
  ).sort((a, b) => pinnedThreads.pinnedThreadIds.indexOf(a.id) - pinnedThreads.pinnedThreadIds.indexOf(b.id));
  const unpinnedThreads = allThreads.filter((thread) => !pinnedThreads.isPinned(thread.id));
  const activeThreads = sortThreadsByUpdatedAt(
    unpinnedThreads.filter((thread) => thread.status === "running" || thread.status === "waitingOnApproval")
  );
  const recentThreads = unpinnedThreads.filter((thread) => thread.status !== "running" && thread.status !== "waitingOnApproval");
  const recentThreadGroups = groupThreadsByProject(recentThreads, projectOptions);
  const newThreadTooLong = trimmedNewThreadText.length > 4000;
  const customCwdInvalid = useCustomCwd && trimmedCustomCwd.length === 0;
  const canCreateThread = trimmedNewThreadText.length > 0 && !newThreadTooLong && !customCwdInvalid && !createThreadMutation.isPending;
  const openThread = (threadId: string) => router.push({ pathname: "/thread/[id]", params: { id: threadId } });
  const togglePinnedThread = (threadId: string) => {
    void pinnedThreads.togglePinnedThread(threadId);
  };

  return (
    <Screen>
      <View style={styles.headerRow}>
        <View>
          <Text style={styles.title}>Inbox</Text>
          <Text style={styles.subtitle}>What needs attention on this host</Text>
        </View>
        <Link href="/settings" asChild>
          <Pressable style={{ padding: 8 }}>
            <Settings color={colors.ink} size={22} />
          </Pressable>
        </Link>
      </View>

      {threads.isError ? (
        <EmptyState title="Backend unavailable" body={threads.error.message} />
      ) : (
        <ScrollView contentContainerStyle={{ gap: 12, paddingBottom: 24 }}>
          <View style={styles.row}>
            <Text style={styles.rowTitle}>New thread</Text>
            <TextInput
              autoCapitalize="sentences"
              multiline
              onChangeText={setNewThreadText}
              placeholder="Start Codex from this phone"
              style={newThreadInputStyle}
              value={newThreadText}
            />
            <Text style={styles.rowTitle}>Project folder</Text>
            <View style={styles.actionColumn}>
              <Pressable
                onPress={() => {
                  setUseCustomCwd(false);
                  setSelectedCwd(null);
                }}
                style={({ pressed }) => [
                  projectChoiceStyle.base,
                  !useCustomCwd && selectedCwd === null && projectChoiceStyle.selected,
                  pressed && projectChoiceStyle.pressed
                ]}
              >
                <Text style={projectChoiceStyle.title}>Default host folder</Text>
                <Text style={styles.pathText} numberOfLines={1}>
                  Uses CODEX_DEFAULT_CWD from the backend
                </Text>
              </Pressable>
              {projectOptions.map((project) => (
                <Pressable
                  key={project.cwd}
                  onPress={() => {
                    setUseCustomCwd(false);
                    setSelectedCwd(project.cwd);
                  }}
                  style={({ pressed }) => [
                    projectChoiceStyle.base,
                    !useCustomCwd && selectedCwd === project.cwd && projectChoiceStyle.selected,
                    pressed && projectChoiceStyle.pressed
                  ]}
                >
                  <Text style={projectChoiceStyle.title} numberOfLines={1}>
                    {project.name}
                  </Text>
                  <Text style={styles.pathText} numberOfLines={1}>
                    {project.cwd}
                  </Text>
                </Pressable>
              ))}
              <Pressable
                onPress={() => setUseCustomCwd(true)}
                style={({ pressed }) => [projectChoiceStyle.base, useCustomCwd && projectChoiceStyle.selected, pressed && projectChoiceStyle.pressed]}
              >
                <Text style={projectChoiceStyle.title}>Custom path</Text>
                <Text style={styles.pathText} numberOfLines={1}>
                  Enter an absolute folder path on the Codex host
                </Text>
              </Pressable>
            </View>
            {useCustomCwd ? (
              <TextInput
                autoCapitalize="none"
                autoCorrect={false}
                onChangeText={setCustomCwd}
                placeholder="/Users/name/Desktop/project"
                style={customCwdInputStyle}
                value={customCwd}
              />
            ) : null}
            {newThreadTooLong ? <Text style={[styles.muted, { color: colors.danger }]}>Prompts are limited to 4,000 characters.</Text> : null}
            {customCwdInvalid ? <Text style={[styles.muted, { color: colors.danger }]}>Custom folder path is required.</Text> : null}
            {projects.isError ? <Text style={[styles.muted, { color: colors.caution }]}>{projects.error.message}</Text> : null}
            {createThreadMutation.isError ? (
              <Text style={[styles.muted, { color: colors.danger }]}>{createThreadMutation.error.message}</Text>
            ) : null}
            <View style={styles.headerRow}>
              <Text style={styles.muted}>{trimmedNewThreadText.length}/4000</Text>
              <PrimaryButton disabled={!canCreateThread} onPress={() => createThreadMutation.mutate()} style={{ minWidth: 112 }}>
                {createThreadMutation.isPending ? "Starting" : "Start"}
              </PrimaryButton>
            </View>
          </View>

          {pendingApprovals.length ? (
            <>
              <SectionHeader title="Needs approval" count={pendingApprovals.length} />
              {pendingApprovals.map((approval) => (
                <ApprovalCard
                  key={approval.id}
                  approval={approval}
                  pending={decision.isPending}
                  onDecision={(item, nextDecision, followUpText) =>
                    decision.mutate({ approval: item, decision: nextDecision, followUpText })
                  }
                />
              ))}
            </>
          ) : null}

          {knownPinnedThreads.length ? (
            <>
              <SectionHeader title="Pinned threads" count={knownPinnedThreads.length} />
              {knownPinnedThreads.map((thread) => (
                <ThreadRow
                  key={thread.id}
                  thread={thread}
                  compact
                  pinned
                  onPress={() => openThread(thread.id)}
                  onTogglePin={() => togglePinnedThread(thread.id)}
                />
              ))}
            </>
          ) : null}

          {activeThreads.length ? (
            <>
              <SectionHeader title="Active threads" count={activeThreads.length} />
              {activeThreads.map((thread) => (
                <ThreadRow
                  key={thread.id}
                  thread={thread}
                  compact
                  pinned={pinnedThreads.isPinned(thread.id)}
                  onPress={() => openThread(thread.id)}
                  onTogglePin={() => togglePinnedThread(thread.id)}
                />
              ))}
            </>
          ) : null}

          <SectionHeader title="Recent threads" count={recentThreads.length} />
          {recentThreadGroups.length ? (
            recentThreadGroups.map((group) => (
              <View key={group.key} style={projectGroupStyle.section}>
                <View style={projectGroupStyle.header}>
                  <View style={{ flex: 1 }}>
                    <Text style={projectGroupStyle.title} numberOfLines={1}>
                      {group.name}
                    </Text>
                    {group.cwd ? (
                      <Text style={styles.pathText} numberOfLines={1}>
                        {group.cwd}
                      </Text>
                    ) : null}
                  </View>
                  <Text style={projectGroupStyle.count}>{group.threads.length}</Text>
                </View>
                <View style={projectGroupStyle.threadList}>
                  {group.threads.map((thread) => (
                    <ThreadRow
                      key={thread.id}
                      thread={thread}
                      compact
                      pinned={pinnedThreads.isPinned(thread.id)}
                      onPress={() => openThread(thread.id)}
                      onTogglePin={() => togglePinnedThread(thread.id)}
                    />
                  ))}
                </View>
              </View>
            ))
          ) : (
            <EmptyState title="No threads yet" body="Start or resume Codex on the host to see activity here." />
          )}

          {recentDecisions.length ? (
            <>
              <SectionHeader title="Recently resolved" count={recentDecisions.length} />
              {recentDecisions.map((item) => (
                <RecentDecisionRow key={item.id} item={item} />
              ))}
            </>
          ) : null}
        </ScrollView>
      )}
    </Screen>
  );
}

const newThreadInputStyle = {
  minHeight: 84,
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

const customCwdInputStyle = {
  borderWidth: 1,
  borderColor: colors.border,
  borderRadius: 8,
  paddingHorizontal: 12,
  paddingVertical: 10,
  color: colors.ink,
  backgroundColor: "#ffffff",
  fontSize: 14,
  lineHeight: 20
};

const projectChoiceStyle = StyleSheet.create({
  base: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    backgroundColor: "#fffdf8",
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 2
  },
  selected: {
    borderColor: colors.accent,
    backgroundColor: "#edf7f3"
  },
  pressed: {
    opacity: 0.72
  },
  title: {
    color: colors.ink,
    fontSize: 14,
    fontWeight: "800"
  }
});

const projectGroupStyle = StyleSheet.create({
  section: {
    gap: 8
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: 12,
    paddingHorizontal: 2
  },
  title: {
    color: colors.ink,
    fontSize: 15,
    fontWeight: "800",
    lineHeight: 20
  },
  count: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: "800"
  },
  threadList: {
    gap: 8
  }
});
