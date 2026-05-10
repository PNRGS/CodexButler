import { EventEmitter } from "node:events";
import type {
  ApprovalRequest,
  Page,
  Project,
  PromptSubmissionRequest,
  ServerEvent,
  Thread,
  ThreadCreationRequest,
  Turn
} from "@codexbutler/shared";
import type { ApprovalDecisionInput, CodexConnectionDiagnostics, CodexRepository } from "./types.js";

export class MockCodexRepository extends EventEmitter implements CodexRepository {
  private connected = false;
  private readonly threads = new Map<string, Thread>();
  private readonly turns = new Map<string, Turn[]>();
  private readonly approvals = new Map<string, ApprovalRequest>();

  constructor() {
    super();
    const now = new Date().toISOString();
    const thread: Thread = {
      id: "mock-thread-1",
      projectId: "project-codexbutler",
      title: "CodexButler MVP scaffold",
      summary: "Build a local-first mobile companion for Codex threads.",
      status: "waitingOnApproval",
      hasPendingApproval: true,
      cwd: "C:\\Users\\aurel\\Desktop\\codexbutler",
      createdAt: now,
      updatedAt: now
    };
    this.threads.set(thread.id, thread);
    this.threads.set("mock-thread-2", {
      id: "mock-thread-2",
      projectId: "project-codexbutler",
      title: "Idle thread for mobile prompts",
      summary: "Use this mock thread to test sending prompts from Android.",
      status: "idle",
      hasPendingApproval: false,
      cwd: "C:\\Users\\aurel\\Desktop\\codexbutler",
      createdAt: now,
      updatedAt: now
    });
    this.turns.set(thread.id, [
      {
        id: "mock-turn-1",
        threadId: thread.id,
        status: "inProgress",
        createdAt: now,
        completedAt: null,
        items: [
          {
            id: "mock-user-1",
            type: "userMessage",
            title: "User message",
            body: "Implement the CodexButler MVP plan.",
            status: "completed",
            createdAt: now,
            completedAt: now
          },
          {
            id: "mock-command-1",
            type: "commandExecution",
            title: "Command execution",
            body: "pnpm install",
            status: "waitingForApproval",
            createdAt: now,
            completedAt: null
          }
        ]
      }
    ]);
    this.turns.set("mock-thread-2", [
      {
        id: "mock-turn-2",
        threadId: "mock-thread-2",
        status: "completed",
        createdAt: now,
        completedAt: now,
        items: [
          {
            id: "mock-agent-2",
            type: "agentMessage",
            title: "Agent message",
            body: "Ready to receive a mobile prompt.",
            status: "completed",
            createdAt: now,
            completedAt: now
          }
        ]
      }
    ]);
    this.approvals.set("mock-approval-1", {
      id: "mock-approval-1",
      kind: "commandExecution",
      threadId: thread.id,
      turnId: "mock-turn-1",
      itemId: "mock-command-1",
      command: "pnpm install",
      cwd: thread.cwd,
      reason: "Install workspace dependencies for the local MVP.",
      proposedRule: ["pnpm", "install"],
      availableDecisions: ["approveOnce", "approveForSession", "alwaysAllowRule", "deny", "cancel"],
      requestedAt: now
    });
  }

  async connect(): Promise<void> {
    this.connected = true;
  }

  isConnected(): boolean {
    return this.connected;
  }

  getConnectionDiagnostics(): CodexConnectionDiagnostics {
    return {
      connectionMode: "mock",
      bridgeStatus: "mock",
      detail: "Mock Codex repository is active."
    };
  }

  async listThreads(limit: number, cursor: string | null): Promise<Page<Thread>> {
    const data = [...this.threads.values()].slice(cursor ? Number(cursor) : 0, limit);
    return { data, nextCursor: null };
  }

  async getThread(threadId: string): Promise<Thread> {
    const thread = this.threads.get(threadId);
    if (!thread) {
      throw new Error("Thread not found");
    }
    return thread;
  }

  async listTurns(threadId: string): Promise<Page<Turn>> {
    return { data: this.turns.get(threadId) ?? [], nextCursor: null };
  }

  async listProjects(): Promise<Project[]> {
    return [
      {
        id: "project-codexbutler",
        name: "codexbutler",
        cwd: "C:\\Users\\aurel\\Desktop\\codexbutler",
        lastSeenAt: new Date().toISOString()
      }
    ];
  }

  async listApprovals(): Promise<ApprovalRequest[]> {
    return [...this.approvals.values()];
  }

  seedApprovalCase(caseId = "follow-up"): ApprovalRequest {
    const now = new Date().toISOString();
    const approvalId = `mock-approval-${caseId}-${Date.now()}`;
    const turnId = `mock-turn-${caseId}-${Date.now()}`;
    const itemId = `mock-command-${caseId}-${Date.now()}`;
    const threadId = "mock-thread-1";
    const thread = this.threads.get(threadId);
    if (!thread) {
      throw new Error("Mock approval thread not found");
    }

    const command = caseId === "deny" ? "git push origin main" : caseId === "cancel" ? "pnpm publish" : "pnpm test";
    const reason =
      caseId === "deny"
        ? "Test a denial for a command that should not run during validation."
        : caseId === "cancel"
          ? "Test cancelling an approval request without sending a follow-up instruction."
          : "Test approving a command and sending a follow-up instruction from the phone.";
    const proposedRule =
      caseId === "deny" ? ["git", "push"] : caseId === "cancel" ? ["pnpm", "publish"] : ["pnpm", "test"];

    this.clearPendingApprovalsForThread(threadId);

    const updatedThread: Thread = {
      ...thread,
      title: "Approval test case",
      summary: reason,
      status: "waitingOnApproval",
      hasPendingApproval: true,
      updatedAt: now
    };
    this.threads.set(threadId, updatedThread);

    const turns = this.turns.get(threadId) ?? [];
    this.turns.set(threadId, [
      {
        id: turnId,
        threadId,
        status: "inProgress",
        createdAt: now,
        completedAt: null,
        items: [
          {
            id: `mock-user-${caseId}-${Date.now()}`,
            type: "userMessage",
            title: "User message",
            body: "Mock approval test case.",
            status: "completed",
            createdAt: now,
            completedAt: now
          },
          {
            id: itemId,
            type: "commandExecution",
            title: "Command execution",
            body: command,
            status: "waitingForApproval",
            createdAt: now,
            completedAt: null
          }
        ]
      },
      ...turns
    ]);

    const approval: ApprovalRequest = {
      id: approvalId,
      kind: "commandExecution",
      threadId,
      turnId,
      itemId,
      command,
      cwd: thread.cwd,
      reason,
      proposedRule,
      availableDecisions: ["approveOnce", "approveForSession", "alwaysAllowRule", "deny", "cancel"],
      requestedAt: now
    };
    this.approvals.set(approval.id, approval);
    this.emitEvent({ type: "thread.updated", thread: updatedThread });
    this.emitEvent({ type: "turn.updated", threadId, turn: this.turns.get(threadId)?.[0] as Turn });
    this.emitEvent({ type: "approval.created", approval });
    return approval;
  }

  private clearPendingApprovalsForThread(threadId: string): void {
    for (const [approvalId, approval] of this.approvals.entries()) {
      if (approval.threadId === threadId) {
        this.approvals.delete(approvalId);
        this.emitEvent({ type: "approval.resolved", approvalId });
      }
    }

    const turns = this.turns.get(threadId) ?? [];
    this.turns.set(
      threadId,
      turns.map((turn) => ({
        ...turn,
        status: turn.status === "inProgress" ? "interrupted" : turn.status,
        completedAt: turn.completedAt ?? new Date().toISOString(),
        items: turn.items.map((item) =>
          item.status === "waitingForApproval"
            ? {
                ...item,
                status: "cancelled",
                completedAt: item.completedAt ?? new Date().toISOString()
              }
            : item
        )
      }))
    );
  }

  async decideApproval(approvalId: string, _input: ApprovalDecisionInput): Promise<void> {
    const approval = this.approvals.get(approvalId);
    if (!approval) {
      throw new Error("Approval request is no longer pending");
    }
    this.approvals.delete(approvalId);
    const thread = this.threads.get(approval.threadId);
    if (thread) {
      const updated: Thread = {
        ...thread,
        status: "idle",
        hasPendingApproval: false,
        updatedAt: new Date().toISOString()
      };
      this.threads.set(updated.id, updated);
      this.emitEvent({ type: "thread.updated", thread: updated });
    }
    this.emitEvent({ type: "approval.resolved", approvalId });
  }

  async startThread(input: ThreadCreationRequest): Promise<{ thread: Thread; turn: Turn }> {
    const now = new Date().toISOString();
    const threadId = `mock-thread-created-${Date.now()}`;
    const thread: Thread = {
      id: threadId,
      projectId: "project-codexbutler",
      title: input.text.slice(0, 80),
      summary: input.text.slice(0, 160),
      status: "idle",
      hasPendingApproval: false,
      cwd: input.cwd ?? "C:\\Users\\aurel\\Desktop\\codexbutler",
      createdAt: now,
      updatedAt: now
    };
    this.threads.set(thread.id, thread);
    const turn = await this.sendPrompt(thread.id, { text: input.text });
    this.emitEvent({ type: "thread.updated", thread });
    return { thread, turn };
  }

  async sendPrompt(threadId: string, input: PromptSubmissionRequest): Promise<Turn> {
    const thread = this.threads.get(threadId);
    if (!thread) {
      throw new Error("Thread not found");
    }

    const now = new Date().toISOString();
    const turn: Turn = {
      id: `mock-turn-${Date.now()}`,
      threadId,
      status: "completed",
      createdAt: now,
      completedAt: now,
      items: [
        {
          id: `mock-user-${Date.now()}`,
          type: "userMessage",
          title: "User message",
          body: input.text,
          status: "completed",
          createdAt: now,
          completedAt: now
        },
        {
          id: `mock-agent-${Date.now()}`,
          type: "agentMessage",
          title: "Agent message",
          body: "Mock mode received the mobile prompt.",
          status: "completed",
          createdAt: now,
          completedAt: now
        }
      ]
    };
    const turns = this.turns.get(threadId) ?? [];
    turns.unshift(turn);
    this.turns.set(threadId, turns);
    const updated: Thread = {
      ...thread,
      summary: input.text.slice(0, 160),
      status: "idle",
      updatedAt: now
    };
    this.threads.set(threadId, updated);
    this.emitEvent({ type: "thread.updated", thread: updated });
    this.emitEvent({ type: "turn.updated", threadId, turn });
    return turn;
  }

  private emitEvent(event: ServerEvent): void {
    this.emit("event", event);
  }
}
