export type ISODateString = string;

export type ThreadStatus =
  | "notLoaded"
  | "idle"
  | "running"
  | "waitingOnApproval"
  | "failed"
  | "systemError";

export interface Project {
  id: string;
  name: string;
  cwd: string;
  lastSeenAt: ISODateString;
}

export interface Thread {
  id: string;
  projectId: string | null;
  title: string;
  summary: string;
  status: ThreadStatus;
  hasPendingApproval: boolean;
  cwd: string | null;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}

export type TurnStatus = "inProgress" | "completed" | "failed" | "interrupted";

export interface TurnItem {
  id: string;
  type: string;
  title: string;
  body: string;
  status: string | null;
  createdAt: ISODateString;
  completedAt: ISODateString | null;
  raw?: unknown;
}

export interface Turn {
  id: string;
  threadId: string;
  status: TurnStatus;
  createdAt: ISODateString;
  completedAt: ISODateString | null;
  items: TurnItem[];
}

export type ApprovalKind = "commandExecution" | "fileChange";

export type ApprovalDecisionKind =
  | "approveOnce"
  | "approveForSession"
  | "alwaysAllowRule"
  | "deny"
  | "cancel";

export interface ApprovalRequest {
  id: string;
  kind: ApprovalKind;
  threadId: string;
  turnId: string;
  itemId: string;
  command: string | null;
  cwd: string | null;
  reason: string | null;
  proposedRule: string[] | null;
  availableDecisions: ApprovalDecisionKind[];
  requestedAt: ISODateString;
}

export interface ApprovalDecision {
  id: string;
  approvalId: string;
  threadId: string | null;
  decision: ApprovalDecisionKind;
  rulePrefix: string[] | null;
  command: string | null;
  cwd: string | null;
  followUpPreview: string | null;
  source: "mobile";
  decidedAt: ISODateString;
}

export interface Rule {
  id: string;
  prefix: string[];
  createdAt: ISODateString;
  sourceApprovalId: string | null;
}

export interface PromptSubmissionRequest {
  text: string;
}

export interface PromptSubmissionResponse {
  ok: true;
  turnId: string;
}

export type FollowUpStatus = "none" | "sent" | "queued";

export interface ApprovalDecisionResponse {
  ok: true;
  followUpStatus: FollowUpStatus;
}

export interface ApprovalHistoryItem {
  id: string;
  approvalId: string;
  threadId: string | null;
  command: string | null;
  cwd: string | null;
  decision: ApprovalDecisionKind;
  followUpPreview: string | null;
  decidedAt: ISODateString;
}

export type CodexConnectionMode = "mock" | "child" | "proxy";
export type CodexBridgeStatus = "mock" | "connected" | "unavailable" | "error";

export interface BackendSession {
  id: string;
  startedAt: ISODateString;
  codexConnected: boolean;
  mockMode: boolean;
  codexConnectionMode: CodexConnectionMode;
  codexBridgeStatus: CodexBridgeStatus;
  codexConnectionDetail: string | null;
}

export interface Page<T> {
  data: T[];
  nextCursor: string | null;
}

export type ServerEvent =
  | { type: "thread.updated"; thread: Thread }
  | { type: "turn.updated"; threadId: string; turn: Turn }
  | { type: "approval.created"; approval: ApprovalRequest }
  | { type: "approval.resolved"; approvalId: string }
  | { type: "backend.status"; session: BackendSession };
