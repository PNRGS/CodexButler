import { createHash, randomUUID } from "node:crypto";
import type { ApprovalDecisionKind, ApprovalRequest, Project, Thread, ThreadStatus, Turn, TurnItem } from "@concierge/shared";
import { allowedDecisionsForCommand } from "@concierge/shared";

function secondsToIso(value: unknown): string {
  if (typeof value === "number" && Number.isFinite(value)) {
    return new Date(value * 1000).toISOString();
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return new Date(parsed * 1000).toISOString();
    }
  }
  return new Date().toISOString();
}

function projectIdForCwd(cwd: string): string {
  return createHash("sha256").update(cwd).digest("hex").slice(0, 16);
}

function projectNameForCwd(cwd: string): string {
  return cwd.split(/[\\/]/).filter(Boolean).at(-1) ?? cwd;
}

function normalizeStatus(status: unknown): ThreadStatus {
  const typed = status as { type?: string; activeFlags?: string[] } | undefined;
  if (!typed?.type) {
    return "notLoaded";
  }
  if (typed.type === "active") {
    return typed.activeFlags?.includes("waitingOnApproval") ? "waitingOnApproval" : "running";
  }
  if (typed.type === "idle") {
    return "idle";
  }
  if (typed.type === "systemError") {
    return "systemError";
  }
  return "notLoaded";
}

export function normalizeThread(raw: unknown, hasPendingApproval = false): Thread {
  const source = raw as Record<string, unknown>;
  const cwd = typeof source.cwd === "string" ? source.cwd : null;
  const title =
    (typeof source.name === "string" && source.name) ||
    (typeof source.preview === "string" && source.preview) ||
    String(source.id ?? "Untitled thread");
  const updatedAt = secondsToIso(source.updatedAt ?? source.updated_at);
  return {
    id: String(source.id),
    projectId: cwd ? projectIdForCwd(cwd) : null,
    title,
    summary: typeof source.preview === "string" ? source.preview : title,
    status: normalizeStatus(source.status),
    hasPendingApproval,
    cwd,
    createdAt: secondsToIso(source.createdAt ?? source.created_at),
    updatedAt
  };
}

function contentToText(content: unknown): string {
  if (typeof content === "string") {
    return content;
  }
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        const typed = part as { text?: unknown; type?: unknown };
        if (typeof typed.text === "string") {
          return typed.text;
        }
        return typeof typed.type === "string" ? `[${typed.type}]` : "";
      })
      .filter(Boolean)
      .join("\n");
  }
  return "";
}

export function normalizeTurnItem(raw: unknown): TurnItem {
  const item = raw as Record<string, unknown>;
  const type = typeof item.type === "string" ? item.type : "item";
  const id = String(item.id ?? randomUUID());
  const status = typeof item.status === "string" ? item.status : null;
  let body = "";
  if (typeof item.text === "string") {
    body = item.text;
  } else if (typeof item.command === "string") {
    body = item.command;
  } else if (typeof item.output === "string") {
    body = item.output;
  } else if ("content" in item) {
    body = contentToText(item.content);
  }

  return {
    id,
    type,
    title: type.replace(/([A-Z])/g, " $1").trim(),
    body,
    status,
    createdAt: secondsToIso(item.createdAt ?? item.created_at),
    completedAt: item.completedAt || item.completed_at ? secondsToIso(item.completedAt ?? item.completed_at) : null,
    raw: item
  };
}

export function normalizeTurn(raw: unknown, threadId: string): Turn {
  const source = raw as Record<string, unknown>;
  const items = Array.isArray(source.items) ? source.items.map(normalizeTurnItem) : [];
  return {
    id: String(source.id),
    threadId: String(source.threadId ?? threadId),
    status:
      source.status === "completed" ||
      source.status === "failed" ||
      source.status === "interrupted" ||
      source.status === "inProgress"
        ? source.status
        : "completed",
    createdAt: secondsToIso(source.createdAt ?? source.created_at),
    completedAt: source.completedAt || source.completed_at ? secondsToIso(source.completedAt ?? source.completed_at) : null,
    items
  };
}

export function projectFromThread(thread: Thread): Project | null {
  if (!thread.cwd || !thread.projectId) {
    return null;
  }
  return {
    id: thread.projectId,
    name: projectNameForCwd(thread.cwd),
    cwd: thread.cwd,
    lastSeenAt: thread.updatedAt
  };
}

function approvalId(parts: Array<string | null | undefined>): string {
  return createHash("sha256")
    .update(parts.filter(Boolean).map(String).join("\u001f"))
    .digest("base64url")
    .slice(0, 32);
}

function commandArrayToText(command: unknown): string | null {
  if (!Array.isArray(command)) {
    return null;
  }
  return command
    .map((part) => String(part))
    .map((part) => (/[\s"']/.test(part) ? JSON.stringify(part) : part))
    .join(" ");
}

function normalizeCommandDecisions(raw: unknown): ApprovalDecisionKind[] | null {
  if (!Array.isArray(raw)) {
    return null;
  }
  const decisions = raw
    .map((decision) => {
      if (decision === "accept" || decision === "approved") {
        return "approveOnce";
      }
      if (decision === "acceptForSession" || decision === "approved_for_session") {
        return "approveForSession";
      }
      if (decision === "decline" || decision === "denied") {
        return "deny";
      }
      if (decision === "cancel" || decision === "abort") {
        return "cancel";
      }
      if (typeof decision === "object" && decision !== null) {
        if ("acceptWithExecpolicyAmendment" in decision || "approved_execpolicy_amendment" in decision) {
          return "alwaysAllowRule";
        }
      }
      return null;
    })
    .filter((decision): decision is ApprovalDecisionKind => decision !== null);
  return decisions.length > 0 ? [...new Set(decisions)] : null;
}

export function normalizeCommandApproval(params: unknown): ApprovalRequest {
  const source = params as Record<string, unknown>;
  const command = typeof source.command === "string" ? source.command : null;
  const proposed = Array.isArray(source.proposedExecpolicyAmendment)
    ? source.proposedExecpolicyAmendment.map(String)
    : null;
  const threadId = String(source.threadId);
  const turnId = String(source.turnId);
  const itemId = String(source.itemId);
  return {
    id: approvalId([threadId, turnId, itemId, typeof source.approvalId === "string" ? source.approvalId : null]),
    kind: "commandExecution",
    threadId,
    turnId,
    itemId,
    command,
    cwd: typeof source.cwd === "string" ? source.cwd : null,
    reason: typeof source.reason === "string" ? source.reason : null,
    proposedRule: proposed,
    availableDecisions: normalizeCommandDecisions(source.availableDecisions) ?? allowedDecisionsForCommand(command),
    requestedAt: new Date().toISOString()
  };
}

export function normalizeFileApproval(params: unknown): ApprovalRequest {
  const source = params as Record<string, unknown>;
  const threadId = String(source.threadId);
  const turnId = String(source.turnId);
  const itemId = String(source.itemId);
  return {
    id: `${threadId}:${turnId}:${itemId}`,
    kind: "fileChange",
    threadId,
    turnId,
    itemId,
    command: null,
    cwd: typeof source.grantRoot === "string" ? source.grantRoot : null,
    reason: typeof source.reason === "string" ? source.reason : null,
    proposedRule: null,
    availableDecisions: ["approveOnce", "approveForSession", "deny", "cancel"],
    requestedAt: new Date().toISOString()
  };
}

export function normalizeExecCommandApproval(params: unknown): ApprovalRequest {
  const source = params as Record<string, unknown>;
  const threadId = String(source.conversationId);
  const turnId = String(source.callId);
  const itemId = String(source.callId);
  const command = commandArrayToText(source.command);
  return {
    id: approvalId([threadId, turnId, typeof source.approvalId === "string" ? source.approvalId : null]),
    kind: "commandExecution",
    threadId,
    turnId,
    itemId,
    command,
    cwd: typeof source.cwd === "string" ? source.cwd : null,
    reason: typeof source.reason === "string" ? source.reason : null,
    proposedRule: null,
    availableDecisions: allowedDecisionsForCommand(command),
    requestedAt: new Date().toISOString()
  };
}

export function normalizeApplyPatchApproval(params: unknown): ApprovalRequest {
  const source = params as Record<string, unknown>;
  const threadId = String(source.conversationId);
  const turnId = String(source.callId);
  const itemId = String(source.callId);
  return {
    id: approvalId([threadId, turnId, "applyPatch"]),
    kind: "fileChange",
    threadId,
    turnId,
    itemId,
    command: "apply_patch",
    cwd: typeof source.grantRoot === "string" ? source.grantRoot : null,
    reason: typeof source.reason === "string" ? source.reason : null,
    proposedRule: null,
    availableDecisions: ["approveOnce", "approveForSession", "deny", "cancel"],
    requestedAt: new Date().toISOString()
  };
}
