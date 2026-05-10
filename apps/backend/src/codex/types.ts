import type {
  ApprovalDecisionKind,
  ApprovalRequest,
  CodexBridgeStatus,
  CodexConnectionMode,
  Page,
  PromptSubmissionRequest,
  Project,
  ThreadCreationRequest,
  Thread,
  Turn
} from "@codexbutler/shared";
import type { EventEmitter } from "node:events";

export interface ApprovalDecisionInput {
  decision: ApprovalDecisionKind;
  rulePrefix?: string[];
}

export interface CodexConnectionDiagnostics {
  connectionMode: CodexConnectionMode;
  bridgeStatus: CodexBridgeStatus;
  detail: string | null;
}

export interface CodexRepository extends Pick<EventEmitter, "on"> {
  connect(): Promise<void>;
  isConnected(): boolean;
  getConnectionDiagnostics(): CodexConnectionDiagnostics;
  listThreads(limit: number, cursor: string | null): Promise<Page<Thread>>;
  getThread(threadId: string): Promise<Thread>;
  listTurns(threadId: string, limit: number, cursor: string | null): Promise<Page<Turn>>;
  listProjects(): Promise<Project[]>;
  listApprovals(): Promise<ApprovalRequest[]>;
  decideApproval(approvalId: string, input: ApprovalDecisionInput): Promise<void>;
  startThread(input: ThreadCreationRequest): Promise<{ thread: Thread; turn: Turn }>;
  sendPrompt(threadId: string, input: PromptSubmissionRequest): Promise<Turn>;
}
