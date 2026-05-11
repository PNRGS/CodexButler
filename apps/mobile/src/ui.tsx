import { useState, type PropsWithChildren } from "react";
import { Bell, Pin } from "lucide-react-native";
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
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { ApprovalDecisionKind, ApprovalHistoryItem, ApprovalRequest, Thread, TurnItem } from "@codexbutler/shared";

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
  const insets = useSafeAreaInsets();

  return <View style={[styles.screen, { paddingBottom: 16 + insets.bottom }]}>{children}</View>;
}

export function LoadingState() {
  return (
    <View style={styles.center}>
      <ActivityIndicator color={colors.accent} />
      <Text style={styles.muted}>Connecting to CodexButler</Text>
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

function formatItemTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" }).format(date);
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

export function ThreadRow({
  thread,
  compact = false,
  pinned = false,
  notificationsEnabled = false,
  onPress,
  onTogglePin,
  onToggleNotifications
}: {
  thread: Thread;
  compact?: boolean;
  pinned?: boolean;
  notificationsEnabled?: boolean;
  onPress?: () => void;
  onTogglePin?: () => void;
  onToggleNotifications?: () => void;
}) {
  const urgent = thread.status === "waitingOnApproval" || thread.hasPendingApproval;
  const hasActions = Boolean(onTogglePin || onToggleNotifications);
  const content = (
    <View style={[styles.threadContent, compact && styles.compactThreadContent, hasActions && styles.threadContentWithActions]}>
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

  return (
    <View style={[styles.threadRow, pinned && styles.pinnedThreadRow]}>
      {onPress ? (
        <Pressable onPress={onPress} style={({ pressed }) => [pressed && styles.buttonPressed]}>
          {content}
        </Pressable>
      ) : (
        content
      )}
      {hasActions ? (
        <View style={styles.threadActions}>
          {onTogglePin ? (
            <Pressable
              accessibilityLabel={pinned ? "Unpin thread" : "Pin thread"}
              accessibilityRole="button"
              onPress={onTogglePin}
              style={({ pressed }) => [styles.threadActionButton, pinned && styles.selectedThreadActionButton, pressed && styles.buttonPressed]}
            >
              <Pin color={pinned ? colors.accent : colors.muted} fill={pinned ? colors.accent : "transparent"} size={18} />
            </Pressable>
          ) : null}
          {onToggleNotifications ? (
            <Pressable
              accessibilityLabel={notificationsEnabled ? "Disable thread notifications" : "Enable thread notifications"}
              accessibilityRole="button"
              onPress={onToggleNotifications}
              style={({ pressed }) => [
                styles.threadActionButton,
                notificationsEnabled && styles.selectedThreadActionButton,
                pressed && styles.buttonPressed
              ]}
            >
              <Bell color={notificationsEnabled ? colors.accent : colors.muted} size={18} />
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

export function TimelineItem({ item }: { item: TurnItem }) {
  const isUser = item.type === "userMessage";
  const isCommand = item.type === "commandExecution" || item.type.toLowerCase().includes("command");
  const time = formatItemTime(item.createdAt);
  return (
    <View style={[styles.messageRow, isUser && styles.userMessageRow, isCommand && styles.systemMessageRow]}>
      <View style={[styles.messageBubble, isUser && styles.userMessageBubble, isCommand && styles.systemMessageBubble]}>
        <View style={styles.messageMetaRow}>
          <Text style={[styles.messageAuthor, isUser && styles.userMessageAuthor]}>{itemTitle(item.type, item.title)}</Text>
          {time ? <Text style={[styles.messageTime, isUser && styles.userMessageTime]}>{time}</Text> : null}
        </View>
        <Text selectable style={[styles.messageText, isUser && styles.userMessageText, isCommand && styles.commandMessageText]}>
          {item.body || item.type}
        </Text>
        {item.status ? <StatusPill status={item.status} /> : null}
      </View>
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
  threadRow: {
    position: "relative",
    overflow: "hidden",
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 8
  },
  pinnedThreadRow: {
    borderColor: colors.accent,
    backgroundColor: "#f3faf6"
  },
  threadContent: {
    padding: 14,
    gap: 8
  },
  compactThreadContent: {
    padding: 12,
    gap: 6
  },
  threadContentWithActions: {
    paddingRight: 92
  },
  threadActions: {
    position: "absolute",
    right: 8,
    top: 8,
    flexDirection: "row",
    gap: 8
  },
  threadActionButton: {
    width: 34,
    height: 34,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fffdf8",
    borderColor: colors.border,
    borderWidth: StyleSheet.hairlineWidth
  },
  selectedThreadActionButton: {
    backgroundColor: "#dcefe9",
    borderColor: "#b7d8cc"
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
  messageRow: {
    width: "100%",
    alignItems: "flex-start"
  },
  userMessageRow: {
    alignItems: "flex-end"
  },
  systemMessageRow: {
    alignItems: "stretch"
  },
  messageBubble: {
    maxWidth: "88%",
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 6
  },
  userMessageBubble: {
    backgroundColor: colors.accent,
    borderColor: colors.accent
  },
  systemMessageBubble: {
    maxWidth: "100%",
    backgroundColor: "#fffdf8"
  },
  messageMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8
  },
  messageAuthor: {
    color: colors.ink,
    fontSize: 12,
    fontWeight: "800"
  },
  userMessageAuthor: {
    color: "#ffffff"
  },
  messageTime: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: "700"
  },
  userMessageTime: {
    color: "#d9f0e8"
  },
  messageText: {
    color: colors.ink,
    fontSize: 15,
    lineHeight: 21
  },
  userMessageText: {
    color: "#ffffff"
  },
  commandMessageText: {
    fontFamily: "Courier",
    fontSize: 13,
    lineHeight: 19
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
