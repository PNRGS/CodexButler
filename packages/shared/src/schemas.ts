import { z } from "zod";

export const isoDateStringSchema = z.string().datetime();

export const threadStatusSchema = z.enum([
  "notLoaded",
  "idle",
  "running",
  "waitingOnApproval",
  "failed",
  "systemError"
]);

export const projectSchema = z.object({
  id: z.string(),
  name: z.string(),
  cwd: z.string(),
  lastSeenAt: isoDateStringSchema
});

export const threadSchema = z.object({
  id: z.string(),
  projectId: z.string().nullable(),
  title: z.string(),
  summary: z.string(),
  status: threadStatusSchema,
  hasPendingApproval: z.boolean(),
  cwd: z.string().nullable(),
  createdAt: isoDateStringSchema,
  updatedAt: isoDateStringSchema
});

export const turnItemSchema = z.object({
  id: z.string(),
  type: z.string(),
  title: z.string(),
  body: z.string(),
  status: z.string().nullable(),
  createdAt: isoDateStringSchema,
  completedAt: isoDateStringSchema.nullable(),
  raw: z.unknown().optional()
});

export const turnSchema = z.object({
  id: z.string(),
  threadId: z.string(),
  status: z.enum(["inProgress", "completed", "failed", "interrupted"]),
  createdAt: isoDateStringSchema,
  completedAt: isoDateStringSchema.nullable(),
  items: z.array(turnItemSchema)
});

export const approvalDecisionKindSchema = z.enum([
  "approveOnce",
  "approveForSession",
  "alwaysAllowRule",
  "deny",
  "cancel"
]);

export const approvalRequestSchema = z.object({
  id: z.string(),
  kind: z.enum(["commandExecution", "fileChange"]),
  threadId: z.string(),
  turnId: z.string(),
  itemId: z.string(),
  command: z.string().nullable(),
  cwd: z.string().nullable(),
  reason: z.string().nullable(),
  proposedRule: z.array(z.string()).nullable(),
  availableDecisions: z.array(approvalDecisionKindSchema),
  requestedAt: isoDateStringSchema
});

export const approvalDecisionRequestSchema = z.object({
  decision: approvalDecisionKindSchema,
  rulePrefix: z.array(z.string()).optional(),
  followUpText: z.string().trim().min(1).max(4000).optional()
});

export const approvalDecisionResponseSchema = z.object({
  ok: z.literal(true),
  followUpStatus: z.enum(["none", "sent", "queued"])
});

export const approvalHistoryItemSchema = z.object({
  id: z.string(),
  approvalId: z.string(),
  threadId: z.string().nullable(),
  command: z.string().nullable(),
  cwd: z.string().nullable(),
  decision: approvalDecisionKindSchema,
  followUpPreview: z.string().nullable(),
  decidedAt: isoDateStringSchema
});

export const codexConnectionModeSchema = z.enum(["mock", "child", "proxy"]);
export const codexBridgeStatusSchema = z.enum(["mock", "connected", "unavailable", "error"]);

export const promptSubmissionRequestSchema = z.object({
  text: z.string().trim().min(1).max(4000)
});

export const threadCreationRequestSchema = z.object({
  text: z.string().trim().min(1).max(4000),
  cwd: z.string().trim().min(1).max(1000).nullable().optional()
});

export const promptSubmissionResponseSchema = z.object({
  ok: z.literal(true),
  turnId: z.string()
});

export const threadCreationResponseSchema = z.object({
  ok: z.literal(true),
  thread: threadSchema,
  turnId: z.string()
});

export const backendSessionSchema = z.object({
  id: z.string(),
  startedAt: isoDateStringSchema,
  codexConnected: z.boolean(),
  mockMode: z.boolean(),
  codexConnectionMode: codexConnectionModeSchema,
  codexBridgeStatus: codexBridgeStatusSchema,
  codexConnectionDetail: z.string().nullable()
});

export const healthResponseSchema = z.object({
  ok: z.boolean()
});

export const sessionResponseSchema = z.object({
  ok: z.boolean(),
  session: backendSessionSchema
});
