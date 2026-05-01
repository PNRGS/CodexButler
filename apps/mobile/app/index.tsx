import { Link } from "expo-router";
import { Settings } from "lucide-react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pressable, ScrollView, Text, View } from "react-native";
import type { ApprovalDecisionKind, ApprovalRequest } from "@concierge/shared";
import { decideApproval, listApprovals, listRecentApprovals, listThreads } from "../src/api";
import { useSettings } from "../src/settings";
import {
  ApprovalCard,
  EmptyState,
  LoadingState,
  RecentDecisionRow,
  Screen,
  SectionHeader,
  ThreadRow,
  colors,
  styles
} from "../src/ui";
import { useConciergeEvents } from "../src/useConciergeEvents";

export default function ThreadsScreen() {
  const settings = useSettings();
  const queryClient = useQueryClient();
  useConciergeEvents();
  const threads = useQuery({
    queryKey: ["threads", settings.backendUrl],
    enabled: settings.ready,
    queryFn: () => listThreads(settings)
  });
  const approvals = useQuery({
    queryKey: ["approvals", settings.backendUrl],
    enabled: settings.ready,
    queryFn: () => listApprovals(settings)
  });
  const recentApprovals = useQuery({
    queryKey: ["approvals", "recent", settings.backendUrl],
    enabled: settings.ready,
    queryFn: () => listRecentApprovals(settings)
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
  const activeThreads = allThreads.filter((thread) => thread.status === "running" || thread.status === "waitingOnApproval");
  const recentThreads = allThreads.filter((thread) => thread.status !== "running" && thread.status !== "waitingOnApproval");
  const recentDecisions = recentApprovals.data?.data ?? [];

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

          {activeThreads.length ? (
            <>
              <SectionHeader title="Active threads" count={activeThreads.length} />
              {activeThreads.map((thread) => (
                <Link key={thread.id} href={{ pathname: "/thread/[id]", params: { id: thread.id } }} asChild>
                  <Pressable>
                    <ThreadRow thread={thread} compact />
                  </Pressable>
                </Link>
              ))}
            </>
          ) : null}

          <SectionHeader title="Recent threads" count={recentThreads.length} />
          {recentThreads.length ? (
            recentThreads.map((thread) => (
              <Link key={thread.id} href={{ pathname: "/thread/[id]", params: { id: thread.id } }} asChild>
                <Pressable>
                  <ThreadRow thread={thread} compact />
                </Pressable>
              </Link>
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
