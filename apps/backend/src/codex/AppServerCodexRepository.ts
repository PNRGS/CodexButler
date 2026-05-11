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
import {
  projectFromThread,
  normalizeApplyPatchApproval,
  normalizeCommandApproval,
  normalizeExecCommandApproval,
  normalizeFileApproval,
  normalizeThread,
  normalizeTurn,
  normalizeTurnItem
} from "./normalizers.js";
import type { ApprovalDecisionInput, CodexConnectionDiagnostics, CodexRepository } from "./types.js";
import { AppServerClient, type AppServerConnectionMode, type JsonRpcNotification, type JsonRpcRequest } from "./AppServerClient.js";
import { toCodexApprovalResponse, type CodexApprovalResponseKind } from "./approvalMapping.js";

interface PendingApproval {
  requestId: number | string;
  approval: ApprovalRequest;
  responseKind: CodexApprovalResponseKind;
}

function isMissingControlSocket(detail: string | null): boolean {
  if (!detail) {
    return false;
  }
  return /app-server-control|socket|os error 10050|failed to connect/i.test(detail);
}

export class AppServerCodexRepository extends EventEmitter implements CodexRepository {
  private readonly client: AppServerClient;
  private readonly threads = new Map<string, Thread>();
  private readonly turns = new Map<string, Turn[]>();
  private readonly approvals = new Map<string, PendingApproval>();
  private lastConnectionError: string | null = null;

  constructor(codexBin: string, private readonly connectionMode: AppServerConnectionMode = "child") {
    super();
    this.client = new AppServerClient(codexBin, connectionMode);
    this.client.on("notification", (event) => this.handleNotification(event as JsonRpcNotification));
    this.client.on("request", (event) => this.handleServerRequest(event as JsonRpcRequest));
    this.client.on("stderr", (message) => this.emit("log", message));
    this.client.on("closed", () => this.emit("status"));
  }

  async connect(): Promise<void> {
    try {
      await this.client.connect();
      this.lastConnectionError = null;
      this.emit("status");
    } catch (error) {
      this.lastConnectionError = error instanceof Error ? error.message : String(error);
      this.emit("status");
      throw error;
    }
  }

  isConnected(): boolean {
    return this.client.isConnected();
  }

  getConnectionDiagnostics(): CodexConnectionDiagnostics {
    if (this.client.isConnected()) {
      return {
        connectionMode: this.connectionMode,
        bridgeStatus: "connected",
        detail:
          this.connectionMode === "proxy"
            ? "Connected through codex app-server proxy."
            : "Connected to a CodexButler-owned codex app-server child process."
      };
    }

    const detail = this.lastConnectionError ?? this.client.getLastDiagnostic();
    return {
      connectionMode: this.connectionMode,
      bridgeStatus: this.connectionMode === "proxy" && isMissingControlSocket(detail) ? "unavailable" : "error",
      detail
    };
  }

  async listThreads(limit: number, cursor: string | null): Promise<Page<Thread>> {
    const result = (await this.client.request("thread/list", {
      cursor,
      limit,
      sortKey: "updated_at",
      sourceKinds: ["cli", "vscode", "appServer"]
    })) as { data?: unknown[]; nextCursor?: string | null };
    const data = (result.data ?? []).map((raw) => {
      const thread = normalizeThread(raw, this.hasApprovalForThread(String((raw as { id?: unknown }).id)));
      this.threads.set(thread.id, thread);
      return thread;
    });
    return { data, nextCursor: result.nextCursor ?? null };
  }

  async getThread(threadId: string): Promise<Thread> {
    const result = (await this.client.request("thread/read", {
      threadId,
      includeTurns: false
    })) as { thread?: unknown };
    const thread = normalizeThread(result.thread, this.hasApprovalForThread(threadId));
    this.threads.set(thread.id, thread);
    return thread;
  }

  async listTurns(threadId: string, limit: number, cursor: string | null): Promise<Page<Turn>> {
    const result = (await this.client.request("thread/turns/list", {
      threadId,
      cursor,
      limit,
      itemsView: "summary",
      sortDirection: "desc"
    })) as { data?: unknown[]; nextCursor?: string | null };
    const previousTurnsById = new Map((this.turns.get(threadId) ?? []).map((turn) => [turn.id, turn]));
    const data = (result.data ?? []).map((raw) => {
      const turnId = String((raw as { id?: unknown }).id ?? "");
      return normalizeTurn(raw, threadId, previousTurnsById.get(turnId));
    });
    this.turns.set(threadId, data);
    return { data, nextCursor: result.nextCursor ?? null };
  }

  async listProjects(): Promise<Project[]> {
    if (this.threads.size === 0) {
      await this.listThreads(50, null);
    }
    const projects = new Map<string, Project>();
    for (const thread of this.threads.values()) {
      const project = projectFromThread(thread);
      if (project) {
        projects.set(project.id, project);
      }
    }
    return [...projects.values()].sort((a, b) => b.lastSeenAt.localeCompare(a.lastSeenAt));
  }

  async listApprovals(): Promise<ApprovalRequest[]> {
    return [...this.approvals.values()].map((entry) => entry.approval);
  }

  async decideApproval(approvalId: string, input: ApprovalDecisionInput): Promise<void> {
    const pending = this.approvals.get(approvalId);
    if (!pending) {
      throw new Error("Approval request is no longer pending");
    }
    this.client.respond(pending.requestId, toCodexApprovalResponse(input, pending.responseKind));
    this.approvals.delete(approvalId);
    this.emitEvent({ type: "approval.resolved", approvalId });
  }

  async startThread(input: ThreadCreationRequest): Promise<{ thread: Thread; turn: Turn }> {
    const result = (await this.client.request("thread/start", {
      cwd: input.cwd ?? null,
      approvalsReviewer: "user",
      ephemeral: false,
      sessionStartSource: "startup"
    })) as { thread?: unknown };
    const thread = normalizeThread(result.thread, false);
    this.threads.set(thread.id, thread);
    this.emitEvent({ type: "thread.updated", thread });

    const turnResult = (await this.client.request("turn/start", {
      threadId: thread.id,
      input: [{ type: "text", text: input.text }],
      approvalsReviewer: "user"
    })) as { turn?: unknown };
    const turn = normalizeTurn(turnResult.turn, thread.id);
    this.upsertTurn(thread.id, turn);
    this.emitEvent({ type: "turn.updated", threadId: thread.id, turn });
    return { thread, turn };
  }

  async sendPrompt(threadId: string, input: PromptSubmissionRequest): Promise<Turn> {
    await this.client.request("thread/resume", {
      threadId,
      approvalsReviewer: "user",
      excludeTurns: true,
      persistExtendedHistory: true
    });
    const result = (await this.client.request("turn/start", {
      threadId,
      input: [{ type: "text", text: input.text }],
      approvalsReviewer: "user"
    })) as { turn?: unknown };
    const turn = normalizeTurn(result.turn, threadId);
    this.upsertTurn(threadId, turn);
    this.emitEvent({ type: "turn.updated", threadId, turn });
    return turn;
  }

  private handleServerRequest(request: JsonRpcRequest): void {
    this.emit("log", JSON.stringify({ direction: "serverRequest", method: request.method }));

    if (request.method === "item/commandExecution/requestApproval") {
      const approval = normalizeCommandApproval(request.params);
      this.approvals.set(approval.id, { requestId: request.id, approval, responseKind: "commandExecution" });
      this.markThreadApproval(approval.threadId, true);
      this.emit("log", JSON.stringify({ approvalId: approval.id, threadId: approval.threadId, kind: approval.kind }));
      this.emitEvent({ type: "approval.created", approval });
      return;
    }

    if (request.method === "item/fileChange/requestApproval") {
      const approval = normalizeFileApproval(request.params);
      this.approvals.set(approval.id, { requestId: request.id, approval, responseKind: "fileChange" });
      this.markThreadApproval(approval.threadId, true);
      this.emit("log", JSON.stringify({ approvalId: approval.id, threadId: approval.threadId, kind: approval.kind }));
      this.emitEvent({ type: "approval.created", approval });
      return;
    }

    if (request.method === "execCommandApproval") {
      const approval = normalizeExecCommandApproval(request.params);
      this.approvals.set(approval.id, { requestId: request.id, approval, responseKind: "execCommand" });
      this.markThreadApproval(approval.threadId, true);
      this.emit("log", JSON.stringify({ approvalId: approval.id, threadId: approval.threadId, kind: approval.kind }));
      this.emitEvent({ type: "approval.created", approval });
      return;
    }

    if (request.method === "applyPatchApproval") {
      const approval = normalizeApplyPatchApproval(request.params);
      this.approvals.set(approval.id, { requestId: request.id, approval, responseKind: "applyPatch" });
      this.markThreadApproval(approval.threadId, true);
      this.emit("log", JSON.stringify({ approvalId: approval.id, threadId: approval.threadId, kind: approval.kind }));
      this.emitEvent({ type: "approval.created", approval });
      return;
    }

    this.emit("log", JSON.stringify({ direction: "unhandledServerRequest", method: request.method }));
  }

  private handleNotification(notification: JsonRpcNotification): void {
    const params = notification.params as Record<string, unknown> | undefined;
    if (notification.method === "thread/status/changed" && params) {
      const existing = this.threads.get(String(params.threadId));
      const thread = normalizeThread(
        {
          ...(existing ?? {}),
          id: params.threadId,
          status: params.status,
          updatedAt: Date.now() / 1000
        },
        this.hasApprovalForThread(String(params.threadId))
      );
      this.threads.set(thread.id, thread);
      this.emitEvent({ type: "thread.updated", thread });
    }

    if ((notification.method === "turn/started" || notification.method === "turn/completed") && params?.turn) {
      const turn = normalizeTurn(params.turn, String((params.turn as { threadId?: unknown }).threadId ?? params.threadId));
      this.upsertTurn(turn.threadId, turn);
      this.emitEvent({ type: "turn.updated", threadId: turn.threadId, turn });
    }

    if ((notification.method === "item/started" || notification.method === "item/completed") && params?.item) {
      const threadId = String(params.threadId);
      const turnId = String(params.turnId);
      const rawItem = params.item as { id?: unknown };
      const existingTurn = this.turns.get(threadId)?.find((candidate) => candidate.id === turnId);
      const existingItem = existingTurn?.items.find((candidate) => candidate.id === String(rawItem.id ?? ""));
      const item = normalizeTurnItem(params.item, existingItem?.createdAt ?? existingTurn?.createdAt);
      const turn = this.upsertTurnItem(threadId, turnId, item);
      this.emitEvent({ type: "turn.updated", threadId, turn });
    }

    if (notification.method === "serverRequest/resolved" && params) {
      const requestId = String(params.requestId ?? "");
      for (const [approvalId, pending] of this.approvals) {
        if (String(pending.requestId) === requestId) {
          this.approvals.delete(approvalId);
          this.markThreadApproval(pending.approval.threadId, this.hasApprovalForThread(pending.approval.threadId));
          this.emitEvent({ type: "approval.resolved", approvalId });
        }
      }
    }
  }

  private upsertTurn(threadId: string, turn: Turn): void {
    const turns = this.turns.get(threadId) ?? [];
    const index = turns.findIndex((candidate) => candidate.id === turn.id);
    if (index >= 0) {
      turns[index] = turn;
    } else {
      turns.unshift(turn);
    }
    this.turns.set(threadId, turns);
  }

  private upsertTurnItem(threadId: string, turnId: string, item: Turn["items"][number]): Turn {
    const turns = this.turns.get(threadId) ?? [];
    let turn = turns.find((candidate) => candidate.id === turnId);
    if (!turn) {
      turn = {
        id: turnId,
        threadId,
        status: "inProgress",
        createdAt: new Date().toISOString(),
        completedAt: null,
        items: []
      };
      turns.unshift(turn);
    }
    const index = turn.items.findIndex((candidate) => candidate.id === item.id);
    if (index >= 0) {
      turn.items[index] = item;
    } else {
      turn.items.push(item);
    }
    this.turns.set(threadId, turns);
    return turn;
  }

  private hasApprovalForThread(threadId: string): boolean {
    return [...this.approvals.values()].some((entry) => entry.approval.threadId === threadId);
  }

  private markThreadApproval(threadId: string, hasPendingApproval: boolean): void {
    const thread = this.threads.get(threadId);
    if (thread) {
      const status: Thread["status"] = hasPendingApproval ? "waitingOnApproval" : thread.status === "waitingOnApproval" ? "running" : thread.status;
      const updated = { ...thread, hasPendingApproval, status };
      this.threads.set(threadId, updated);
      this.emitEvent({ type: "thread.updated", thread: updated });
    }
  }

  private emitEvent(event: ServerEvent): void {
    this.emit("event", event);
  }
}
