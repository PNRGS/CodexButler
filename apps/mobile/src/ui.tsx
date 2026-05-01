import { useState, type PropsWithChildren } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type PressableProps,
  type StyleProp,
  type ViewStyle
} from "react-native";
import type { ApprovalDecisionKind, ApprovalHistoryItem, ApprovalRequest, Thread, TurnItem } from "@concierge/shared";

export const colors = {
  ink: "#172026",
  muted: "#62707a",
  paper: "#f4f0e8",
  surface: "#fffaf0",
  border: "#d8d0c1",
  accent: "#1f7a68",
  caution: "#a15c1b",
  danger: "#a83a32",
  navy: "#101820"
};

export function Screen({ children }: PropsWithChildren) {
  return <View style={styles.screen}>{children}</View>;
}

export function LoadingState() {
  return (
    <View style={styles.center}>
      <ActivityIndicator color={colors.accent} />
      <Text style={styles.muted}>Connecting to Concierge</Text>
    </View>
  );
}

export function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <View style={styles.empty}>
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.muted}>{body}</Text>
    </View>
  );
}

export function statusLabel(status: string): string {
  switch (status) {
    case "waitingOnApproval":
      return "Needs approval";
    case "running":
      return "Working";
    case "idle":
      return "Idle";
    case "notLoaded":
      return "Recent";
    case "systemError":
      return "System error";
    case "inProgress":
      return "In progress";
    case "approveOnce":
      return "Approved";
    case "approveForSession":
      return "Approved for session";
    case "alwaysAllowRule":
      return "Rule allowed";
    case "deny":
      return "Denied";
    case "cancel":
      return "Canceled";
    case "completed":
      return "Done";
    default:
      return status.replace(/([A-Z])/g, " $1").trim();
  }
}

export function itemTitle(type: string, title: string): string {
  if (type === "userMessage") {
    return "You";
  }
  if (type === "agentMessage") {
    return "Codex";
  }
  if (type === "commandExecution") {
    return "Command";
  }
  if (type.toLowerCase().includes("approval")) {
    return "Approval";
  }
  return title || statusLabel(type);
}

export function StatusPill({ status, urgent = false }: { status: string; urgent?: boolean }) {
  return (
    <View style={[styles.pill, urgent && styles.dangerPill]}>
      <Text style={[styles.pillText, urgent && styles.dangerText]}>{statusLabel(status)}</Text>
    </View>
  );
}

export function SectionHeader({ title, count }: { title: string; count?: number }) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {typeof count === "number" ? <Text style={styles.sectionCount}>{count}</Text> : null}
    </View>
  );
}

type ButtonProps = PropsWithChildren<Omit<PressableProps, "style"> & { style?: StyleProp<ViewStyle> }>;

export function PrimaryButton({ children, style, ...props }: ButtonProps) {
  return (
    <Pressable
      {...props}
      style={({ pressed }) => [styles.button, pressed && styles.buttonPressed, props.disabled && styles.buttonDisabled, style]}
    >
      <Text style={styles.buttonText}>{children}</Text>
    </Pressable>
  );
}

export function SecondaryButton({ children, style, ...props }: ButtonProps) {
  return (
    <Pressable
      {...props}
      style={({ pressed }) => [styles.secondaryButton, pressed && styles.buttonPressed, props.disabled && styles.buttonDisabled, style]}
    >
      <Text style={styles.secondaryButtonText}>{children}</Text>
    </Pressable>
  );
}

export function ThreadRow({ thread, compact = false }: { thread: Thread; compact?: boolean }) {
  const urgent = thread.status === "waitingOnApproval" || thread.hasPendingApproval;
  return (
    <View style={[styles.row, compact && styles.compactRow]}>
      <View style={styles.headerRow}>
        <Text style={[styles.rowTitle, { flex: 1 }]} numberOfLines={2}>
          {thread.title}
        </Text>
        <StatusPill status={thread.status} urgent={urgent} />
      </View>
      {thread.summary ? (
        <Text style={styles.muted} numberOfLines={compact ? 1 : 2}>
          {thread.summary}
        </Text>
      ) : null}
      {thread.cwd ? (
        <Text style={styles.pathText} numberOfLines={1}>
          {thread.cwd}
        </Text>
      ) : null}
    </View>
  );
}

export function TimelineItem({ item }: { item: TurnItem }) {
  return (
    <View style={styles.compactRow}>
      <View style={styles.headerRow}>
        <Text style={styles.rowTitle}>{itemTitle(item.type, item.title)}</Text>
        {item.status ? <StatusPill status={item.status} /> : null}
      </View>
      <Text style={styles.muted}>{item.body || item.type}</Text>
    </View>
  );
}

export function ApprovalCard({
  approval,
  pending,
  onDecision
}: {
  approval: ApprovalRequest;
  pending: boolean;
  onDecision: (approval: ApprovalRequest, decision: ApprovalDecisionKind, followUpText?: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [followUpText, setFollowUpText] = useState("");
  const trimmedFollowUp = followUpText.trim();
  const canUseRule = Boolean(approval.proposedRule);

  return (
    <View style={[styles.row, styles.urgentRow]}>
      <View style={styles.headerRow}>
        <Text style={styles.rowTitle}>{approval.kind === "commandExecution" ? "Command approval" : "File change approval"}</Text>
        <StatusPill status="Needs approval" urgent />
      </View>
      <Text style={styles.commandText} numberOfLines={3}>
        {approval.command ?? approval.cwd ?? "Permission request"}
      </Text>
      {approval.reason ? <Text style={styles.muted}>{approval.reason}</Text> : null}
      {approval.cwd ? <Text style={styles.pathText}>{approval.cwd}</Text> : null}
      <View style={styles.actionRow}>
        <PrimaryButton disabled={pending} style={{ flex: 1 }} onPress={() => onDecision(approval, "approveOnce")}>
          Approve
        </PrimaryButton>
        <SecondaryButton
          disabled={pending}
          style={{ flex: 1, borderColor: colors.danger }}
          onPress={() => onDecision(approval, "deny")}
        >
          Deny
        </SecondaryButton>
        <SecondaryButton disabled={pending} onPress={() => setExpanded((value) => !value)}>
          More
        </SecondaryButton>
      </View>
      {expanded ? (
        <View style={styles.morePanel}>
          <TextInput
            autoCapitalize="sentences"
            multiline
            onChangeText={setFollowUpText}
            placeholder="Add instruction after this decision"
            style={styles.inlineInput}
            value={followUpText}
          />
          <View style={styles.actionColumn}>
            <PrimaryButton
              disabled={pending || trimmedFollowUp.length === 0}
              onPress={() => onDecision(approval, "approveOnce", trimmedFollowUp)}
            >
              Approve + send instruction
            </PrimaryButton>
            <SecondaryButton disabled={pending} onPress={() => onDecision(approval, "approveForSession", trimmedFollowUp || undefined)}>
              Approve for session
            </SecondaryButton>
            {canUseRule ? (
              <SecondaryButton disabled={pending} onPress={() => onDecision(approval, "alwaysAllowRule", trimmedFollowUp || undefined)}>
                Always allow rule
              </SecondaryButton>
            ) : null}
            <SecondaryButton disabled={pending} onPress={() => onDecision(approval, "cancel")}>
              Cancel request
            </SecondaryButton>
          </View>
        </View>
      ) : null}
    </View>
  );
}

export function RecentDecisionRow({ item }: { item: ApprovalHistoryItem }) {
  return (
    <View style={styles.recentRow}>
      <View style={styles.headerRow}>
        <Text style={styles.recentTitle} numberOfLines={1}>
          {item.command ?? item.cwd ?? "Approval"}
        </Text>
        <Text style={styles.recentDecision}>{statusLabel(item.decision)}</Text>
      </View>
      {item.followUpPreview ? <Text style={styles.pathText} numberOfLines={1}>Instruction: {item.followUpPreview}</Text> : null}
    </View>
  );
}

export const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.paper,
    padding: 16,
    gap: 12
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 10
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12
  },
  title: {
    color: colors.ink,
    fontSize: 28,
    fontWeight: "800",
    lineHeight: 34
  },
  subtitle: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 20
  },
  muted: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 20
  },
  row: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 8,
    padding: 14,
    gap: 8
  },
  compactRow: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 8,
    padding: 12,
    gap: 6
  },
  urgentRow: {
    borderColor: colors.danger,
    borderWidth: 1
  },
  rowTitle: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: "700"
  },
  commandText: {
    color: colors.ink,
    fontSize: 15,
    fontWeight: "700",
    lineHeight: 21
  },
  pathText: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 17
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 4
  },
  sectionTitle: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: "800"
  },
  sectionCount: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: "700"
  },
  actionRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 4
  },
  actionColumn: {
    gap: 8
  },
  morePanel: {
    gap: 8,
    marginTop: 4
  },
  inlineInput: {
    minHeight: 74,
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
  },
  recentRow: {
    backgroundColor: "#fffdf8",
    borderColor: colors.border,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 8,
    padding: 10,
    gap: 4
  },
  recentTitle: {
    color: colors.ink,
    fontSize: 13,
    fontWeight: "700",
    flex: 1
  },
  recentDecision: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "700"
  },
  pill: {
    alignSelf: "flex-start",
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 4,
    backgroundColor: "#dcefe9"
  },
  pillText: {
    color: colors.accent,
    fontSize: 12,
    fontWeight: "700"
  },
  dangerPill: {
    backgroundColor: "#f4ddd9"
  },
  dangerText: {
    color: colors.danger
  },
  empty: {
    backgroundColor: colors.surface,
    borderRadius: 8,
    padding: 18,
    gap: 6,
    borderColor: colors.border,
    borderWidth: StyleSheet.hairlineWidth
  },
  emptyTitle: {
    color: colors.ink,
    fontSize: 18,
    fontWeight: "800"
  },
  button: {
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
    backgroundColor: colors.accent,
    paddingHorizontal: 14,
    paddingVertical: 10
  },
  buttonPressed: {
    opacity: 0.72
  },
  buttonDisabled: {
    opacity: 0.45
  },
  buttonText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "800"
  },
  secondaryButton: {
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
    borderColor: colors.border,
    borderWidth: 1,
    backgroundColor: colors.surface,
    paddingHorizontal: 14,
    paddingVertical: 10
  },
  secondaryButtonText: {
    color: colors.ink,
    fontSize: 14,
    fontWeight: "800"
  }
});
