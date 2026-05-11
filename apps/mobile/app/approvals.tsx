import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ScrollView, Text, View } from "react-native";
import type { ApprovalDecisionKind, ApprovalRequest } from "@codexbutler/shared";
import { decideApproval, listApprovals, listRecentApprovals } from "../src/api";
import { useSettings } from "../src/settings";
import { ApprovalCard, EmptyState, LoadingState, RecentDecisionRow, Screen, SectionHeader, styles } from "../src/ui";

export default function ApprovalsScreen() {
  const settings = useSettings();
  const queryClient = useQueryClient();
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
  const mutation = useMutation({
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

  if (!settings.ready || approvals.isLoading) {
    return <LoadingState />;
  }

  return (
    <Screen>
      <View>
        <Text style={styles.title}>Approvals</Text>
        <Text style={styles.subtitle}>Decisions required before Codex continues</Text>
      </View>

      {approvals.isError ? (
        <EmptyState title="Could not load approvals" body={approvals.error.message} />
      ) : (
        <ScrollView contentContainerStyle={{ gap: 12, paddingBottom: 24 }}>
          {(approvals.data?.data ?? []).length ? (
            <>
              <SectionHeader title="Needs approval" count={approvals.data?.data.length ?? 0} />
              {(approvals.data?.data ?? []).map((item) => (
                <ApprovalCard
                  key={item.id}
                  approval={item}
                  pending={mutation.isPending}
                  onDecision={(approval, decision, followUpText) => mutation.mutate({ approval, decision, followUpText })}
                />
              ))}
            </>
          ) : (
            <EmptyState title="No pending approvals" body="When Codex needs permission, the request will appear here." />
          )}
          {(recentApprovals.data?.data ?? []).length ? (
            <>
              <SectionHeader title="Recently resolved" count={recentApprovals.data?.data.length ?? 0} />
              {(recentApprovals.data?.data ?? []).map((item) => (
                <RecentDecisionRow key={item.id} item={item} />
              ))}
            </>
          ) : null}
        </ScrollView>
      )}
    </Screen>
  );
}
