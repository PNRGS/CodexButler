import Fastify, { type FastifyReply } from "fastify";
import cors from "@fastify/cors";
import { nanoid } from "nanoid";
import { createHash } from "node:crypto";
import { ZodError } from "zod";
import type { ApprovalDecision, ApprovalRequest, FollowUpStatus, Rule, ServerEvent, Thread } from "@concierge/shared";
import { approvalDecisionRequestSchema, promptSubmissionRequestSchema } from "@concierge/shared";
import { registerAuth } from "./auth.js";
import type { AppConfig } from "./config.js";
import { SseBroker } from "./events/SseBroker.js";
import { AuditStore, type ApprovalFollowUp } from "./storage/AuditStore.js";
import type { CodexRepository } from "./codex/types.js";

export interface ServerDependencies {
  config: AppConfig;
  codex: CodexRepository;
  auditStore: AuditStore;
}

function httpError(statusCode: number, message: string): Error & { statusCode: number } {
  return Object.assign(new Error(message), { statusCode });
}

function promptPreview(text: string): string {
  return text.length > 200 ? `${text.slice(0, 200)}...` : text;
}

function textHash(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

function arrayEquals(left: readonly string[] | null | undefined, right: readonly string[] | null | undefined): boolean {
  if (!left || !right || left.length !== right.length) {
    return false;
  }
  return left.every((value, index) => value === right[index]);
}

function threadCanReceiveFollowUp(thread: Thread): boolean {
  return thread.status !== "running" && thread.status !== "waitingOnApproval" && !thread.hasPendingApproval;
}

function validateApprovalDecision(approval: ApprovalRequest, input: { decision: ApprovalDecision["decision"]; rulePrefix?: string[] }): void {
  if (!approval.availableDecisions.includes(input.decision)) {
    throw httpError(400, "Decision is not available for this approval request");
  }

  if (input.decision === "alwaysAllowRule") {
    if (!arrayEquals(input.rulePrefix, approval.proposedRule)) {
      throw httpError(400, "Rule prefix must match the proposed approval rule");
    }
    return;
  }

  if (input.rulePrefix !== undefined) {
    throw httpError(400, "Rule prefix is only allowed for always-allow decisions");
  }
}

function corsOriginForConfig(config: AppConfig) {
  if (!config.BACKEND_PUBLIC_BIND) {
    return true;
  }

  const allowedOrigins = new Set(config.BACKEND_ALLOWED_ORIGINS);
  return (origin: string | undefined, callback: (error: Error | null, allow: boolean) => void): void => {
    callback(null, !!origin && allowedOrigins.has(origin));
  };
}

interface MockCaseSeeder {
  seedApprovalCase(caseId?: string): unknown;
}

function canSeedMockCases(codex: CodexRepository): codex is CodexRepository & MockCaseSeeder {
  return "seedApprovalCase" in codex && typeof codex.seedApprovalCase === "function";
}

export function buildServer({ config, codex, auditStore }: ServerDependencies) {
  const app = Fastify({
    logger: {
      level: "info",
      redact: ["req.headers.authorization", "BACKEND_AUTH_TOKEN"]
    }
  });
  const broker = new SseBroker();
  const diagnostics = codex.getConnectionDiagnostics();
  const session = {
    id: nanoid(),
    startedAt: new Date().toISOString(),
    codexConnected: codex.isConnected(),
    mockMode: config.CODEX_MOCK_MODE,
    codexConnectionMode: diagnostics.connectionMode,
    codexBridgeStatus: diagnostics.bridgeStatus,
    codexConnectionDetail: diagnostics.detail
  };
  const processingFollowUps = new Set<string>();

  function refreshSession(): typeof session {
    const diagnostics = codex.getConnectionDiagnostics();
    session.codexConnected = codex.isConnected();
    session.codexConnectionMode = diagnostics.connectionMode;
    session.codexBridgeStatus = diagnostics.bridgeStatus;
    session.codexConnectionDetail = diagnostics.detail;
    return session;
  }

  async function deliverFollowUp(entry: ApprovalFollowUp): Promise<FollowUpStatus> {
    if (processingFollowUps.has(entry.id)) {
      return "queued";
    }
    processingFollowUps.add(entry.id);
    try {
      const thread = await codex.getThread(entry.threadId);
      if (!threadCanReceiveFollowUp(thread)) {
        return "queued";
      }
      await codex.sendPrompt(entry.threadId, { text: entry.text });
      auditStore.updateFollowUpStatus(entry.id, "sent", new Date().toISOString());
      return "sent";
    } catch (error) {
      app.log.warn({ error, followUpId: entry.id }, "approval follow-up delivery failed");
      auditStore.updateFollowUpStatus(entry.id, "failed", null);
      return "queued";
    } finally {
      processingFollowUps.delete(entry.id);
    }
  }

  async function processQueuedFollowUps(threadId?: string): Promise<void> {
    for (const entry of auditStore.listQueuedFollowUps(threadId)) {
      await deliverFollowUp(entry);
    }
  }

  app.register(cors, {
    origin: corsOriginForConfig(config),
    credentials: false
  });
  registerAuth(app, config.BACKEND_AUTH_TOKEN);

  codex.on?.("event", (event: ServerEvent) => {
    app.log.info({ type: event.type }, "codex event");
    broker.publish(event);
    if (event.type === "thread.updated") {
      void processQueuedFollowUps(event.thread.id);
    }
  });
  codex.on?.("status", () => {
    broker.publish({ type: "backend.status", session: refreshSession() });
  });
  codex.on?.("log", (message: string) => {
    app.log.info({ source: "codex" }, message.trim());
  });

  app.get("/health", async () => {
    return { ok: true };
  });

  app.get("/session", async () => {
    return { ok: true, session: refreshSession() };
  });

  app.get("/events", async (_request, reply) => {
    broker.addClient(reply);
  });

  app.get("/threads", async (request) => {
    const query = request.query as { limit?: string; cursor?: string };
    const limit = Math.min(Number(query.limit ?? 25), 100);
    return codex.listThreads(limit, query.cursor ?? null);
  });

  app.get("/threads/:id", async (request) => {
    const params = request.params as { id: string };
    return codex.getThread(params.id);
  });

  app.get("/threads/:id/turns", async (request) => {
    const params = request.params as { id: string };
    const query = request.query as { limit?: string; cursor?: string };
    const limit = Math.min(Number(query.limit ?? 25), 100);
    return codex.listTurns(params.id, limit, query.cursor ?? null);
  });

  app.get("/approvals", async () => {
    return { data: await codex.listApprovals(), nextCursor: null };
  });

  app.get("/approvals/recent", async (request) => {
    const query = request.query as { limit?: string };
    const limit = Math.min(Math.max(Number(query.limit ?? 5), 1), 20);
    return { data: auditStore.listRecentDecisions(limit), nextCursor: null };
  });

  async function handleApprovalDecision(approvalId: string, body: unknown, reply: FastifyReply) {
    const input = approvalDecisionRequestSchema.parse(body);
    if (input.decision === "cancel" && input.followUpText) {
      throw httpError(400, "Cancel decisions cannot include a follow-up instruction");
    }
    const approval = (await codex.listApprovals()).find((candidate) => candidate.id === approvalId);
    if (!approval) {
      throw httpError(404, "Approval request is no longer pending");
    }
    validateApprovalDecision(approval, input);
    await codex.decideApproval(approvalId, input);

    let followUpStatus: FollowUpStatus = "none";
    const followUpPreview = input.followUpText ? promptPreview(input.followUpText) : null;
    if (input.followUpText) {
      const followUp: ApprovalFollowUp = {
        id: nanoid(),
        approvalId,
        threadId: approval.threadId,
        text: input.followUpText,
        textHash: textHash(input.followUpText),
        preview: followUpPreview ?? "",
        status: "queued",
        createdAt: new Date().toISOString(),
        sentAt: null
      };
      auditStore.recordFollowUp(followUp);
      followUpStatus = await deliverFollowUp(followUp);
      app.log.info({ approvalId, followUpStatus }, "approval follow-up handled");
    }

    const decision: ApprovalDecision = {
      id: nanoid(),
      approvalId,
      threadId: approval.threadId,
      decision: input.decision,
      rulePrefix: input.rulePrefix ?? null,
      command: approval.command,
      cwd: approval.cwd,
      followUpPreview,
      source: "mobile",
      decidedAt: new Date().toISOString()
    };
    auditStore.recordDecision(decision);
    app.log.info({ approvalId, decision: input.decision }, "approval decision sent");

    if (input.decision === "alwaysAllowRule" && input.rulePrefix) {
      const rule: Rule = {
        id: nanoid(),
        prefix: input.rulePrefix,
        createdAt: new Date().toISOString(),
        sourceApprovalId: approvalId
      };
      auditStore.recordRule(rule);
      app.log.info({ ruleId: rule.id }, "rule creation event");
    }

    return reply.code(202).send({ ok: true, followUpStatus });
  }

  app.post("/debug/mock/approval-cases", async (request, reply) => {
    if (!config.CODEX_MOCK_MODE || !canSeedMockCases(codex)) {
      throw httpError(404, "Mock approval cases are only available in mock mode");
    }
    const body = request.body as { caseId?: string } | null;
    const approval = codex.seedApprovalCase(body?.caseId);
    app.log.info({ caseId: body?.caseId ?? "follow-up" }, "mock approval case seeded");
    return reply.code(201).send({ ok: true, approval });
  });

  app.post("/approvals/decision", async (request, reply) => {
    const body = request.body as Record<string, unknown> | null;
    const approvalId = typeof body?.approvalId === "string" ? body.approvalId : null;
    if (!approvalId) {
      throw httpError(400, "Missing approvalId");
    }
    return handleApprovalDecision(approvalId, body, reply);
  });

  app.post("/approvals/:id/decision", async (request, reply) => {
    const params = request.params as { id: string };
    return handleApprovalDecision(params.id, request.body, reply);
  });

  app.post("/threads/:id/prompts", async (request, reply) => {
    const params = request.params as { id: string };
    const input = promptSubmissionRequestSchema.parse(request.body);
    let thread;
    try {
      thread = await codex.getThread(params.id);
    } catch (error) {
      if (error instanceof Error && error.message === "Thread not found") {
        throw httpError(404, "Thread not found");
      }
      throw error;
    }

    if (thread.status === "running" || thread.status === "waitingOnApproval" || thread.hasPendingApproval) {
      throw httpError(409, "Thread is busy or waiting on approval");
    }

    const turn = await codex.sendPrompt(params.id, input);
    const submittedAt = new Date().toISOString();
    auditStore.recordPromptSubmission({
      id: nanoid(),
      threadId: params.id,
      source: "mobile",
      submittedAt,
      textLength: input.text.length,
      textHash: textHash(input.text),
      preview: promptPreview(input.text)
    });
    app.log.info({ threadId: params.id, turnId: turn.id, textLength: input.text.length }, "mobile prompt submitted");

    return reply.code(202).send({ ok: true, turnId: turn.id });
  });

  app.get("/projects", async () => {
    return { data: await codex.listProjects(), nextCursor: null };
  });

  app.setErrorHandler(async (error, request, reply) => {
    request.log.error({ error }, "request failed");
    const statusCode =
      error instanceof ZodError
        ? 400
        : typeof error === "object" &&
            error !== null &&
            "statusCode" in error &&
            typeof error.statusCode === "number" &&
            error.statusCode >= 400
          ? error.statusCode
          : 500;
    const message = error instanceof ZodError ? "Invalid request body" : error instanceof Error ? error.message : "Unknown error";
    await reply.code(statusCode).send({
      error: statusCode >= 500 ? "Internal server error" : message,
      detail: statusCode >= 500 ? undefined : message
    });
  });

  return app;
}
