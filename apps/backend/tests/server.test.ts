import { describe, expect, it } from "vitest";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { EventEmitter } from "node:events";
import { buildServer } from "../src/server.js";
import { AuditStore } from "../src/storage/AuditStore.js";
import { MockCodexRepository } from "../src/codex/MockCodexRepository.js";
import type { AppConfig } from "../src/config.js";
import type { ApprovalDecisionInput, CodexRepository } from "../src/codex/types.js";
import type { ApprovalRequest, Page, Project, Thread, Turn } from "@codexbutler/shared";

function testConfig(sqlitePath: string): AppConfig {
  return {
    BACKEND_HOST: "127.0.0.1",
    BACKEND_PORT: 4545,
    BACKEND_PUBLIC_BIND: false,
    BACKEND_ALLOWED_ORIGINS: [],
    BACKEND_AUTH_TOKEN: "test-token-for-codexbutler",
    CODEX_BIN: "codex",
    CODEX_DEFAULT_CWD: "/tmp/codexbutler-test-project",
    CODEX_MOCK_MODE: true,
    CODEX_CONNECTION_MODE: "child",
    SQLITE_PATH: sqlitePath
  };
}

class BusyCodexRepository extends EventEmitter implements CodexRepository {
  private readonly approval: ApprovalRequest = {
    id: "busy-approval-1",
    kind: "commandExecution",
    threadId: "busy-thread-1",
    turnId: "busy-turn-1",
    itemId: "busy-item-1",
    command: "git push",
    cwd: "C:\\repo",
    reason: "Push changes.",
    proposedRule: null,
    availableDecisions: ["approveOnce", "deny", "cancel"],
    requestedAt: new Date().toISOString()
  };
  private approvals: ApprovalRequest[] = [this.approval];

  async connect(): Promise<void> {}
  isConnected(): boolean {
    return true;
  }
  getConnectionDiagnostics() {
    return { connectionMode: "child" as const, bridgeStatus: "connected" as const, detail: "test repository" };
  }
  async listThreads(): Promise<Page<Thread>> {
    return { data: [await this.getThread("busy-thread-1")], nextCursor: null };
  }
  async getThread(threadId: string): Promise<Thread> {
    return {
      id: threadId,
      projectId: "busy-project",
      title: "Busy thread",
      summary: "Still working.",
      status: "running",
      hasPendingApproval: false,
      cwd: "C:\\repo",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
  }
  async listTurns(): Promise<Page<Turn>> {
    return { data: [], nextCursor: null };
  }
  async listProjects(): Promise<Project[]> {
    return [];
  }
  async listApprovals(): Promise<ApprovalRequest[]> {
    return this.approvals;
  }
  async decideApproval(_approvalId: string, _input: ApprovalDecisionInput): Promise<void> {
    this.approvals = [];
  }
  async startThread(): Promise<{ thread: Thread; turn: Turn }> {
    throw new Error("Should not start thread for this test");
  }
  async sendPrompt(): Promise<Turn> {
    throw new Error("Should not send while thread is busy");
  }
}

class SpecialCharacterApprovalRepository extends EventEmitter implements CodexRepository {
  private approvals: ApprovalRequest[] = [
    {
      id: "thread:turn:item",
      kind: "commandExecution",
      threadId: "thread",
      turnId: "turn",
      itemId: "item",
      command: "powershell -Command New-Item test.txt",
      cwd: "C:\\repo",
      reason: "Create a test file.",
      proposedRule: null,
      availableDecisions: ["approveOnce", "cancel"],
      requestedAt: new Date().toISOString()
    }
  ];

  async connect(): Promise<void> {}
  isConnected(): boolean {
    return true;
  }
  getConnectionDiagnostics() {
    return { connectionMode: "child" as const, bridgeStatus: "connected" as const, detail: "test repository" };
  }
  async listThreads(): Promise<Page<Thread>> {
    return { data: [await this.getThread("thread")], nextCursor: null };
  }
  async getThread(threadId: string): Promise<Thread> {
    return {
      id: threadId,
      projectId: "project",
      title: "Thread with special approval id",
      summary: "Waiting.",
      status: "waitingOnApproval",
      hasPendingApproval: true,
      cwd: "C:\\repo",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
  }
  async listTurns(): Promise<Page<Turn>> {
    return { data: [], nextCursor: null };
  }
  async listProjects(): Promise<Project[]> {
    return [];
  }
  async listApprovals(): Promise<ApprovalRequest[]> {
    return this.approvals;
  }
  async decideApproval(approvalId: string): Promise<void> {
    this.approvals = this.approvals.filter((approval) => approval.id !== approvalId);
  }
  async startThread(): Promise<{ thread: Thread; turn: Turn }> {
    throw new Error("Should not start thread for this test");
  }
  async sendPrompt(): Promise<Turn> {
    throw new Error("Should not send prompt for this test");
  }
}

describe("backend server", () => {
  it("allows health without auth and protects thread routes", async () => {
    const temp = mkdtempSync(join(tmpdir(), "codexbutler-"));
    const config = testConfig(join(temp, "test.sqlite"));
    const auditStore = await AuditStore.open(config.SQLITE_PATH);
    const codex = new MockCodexRepository();
    await codex.connect();
    const app = buildServer({ config, codex, auditStore });

    const health = await app.inject({ method: "GET", url: "/health" });
    expect(health.statusCode).toBe(200);
    expect(health.json()).toEqual({ ok: true });

    const deniedSession = await app.inject({ method: "GET", url: "/session" });
    expect(deniedSession.statusCode).toBe(401);

    const session = await app.inject({
      method: "GET",
      url: "/session",
      headers: { authorization: "Bearer test-token-for-codexbutler" }
    });
    expect(session.statusCode).toBe(200);
    expect(session.json().session).toMatchObject({
      codexConnected: true,
      mockMode: true,
      codexConnectionMode: "mock",
      codexBridgeStatus: "mock"
    });

    const denied = await app.inject({ method: "GET", url: "/threads" });
    expect(denied.statusCode).toBe(401);

    const allowed = await app.inject({
      method: "GET",
      url: "/threads",
      headers: { authorization: "Bearer test-token-for-codexbutler" }
    });
    expect(allowed.statusCode).toBe(200);

    await app.close();
    auditStore.close();
  });

  it("restricts CORS origins when public binding is enabled", async () => {
    const temp = mkdtempSync(join(tmpdir(), "codexbutler-"));
    const config = {
      ...testConfig(join(temp, "test.sqlite")),
      BACKEND_PUBLIC_BIND: true,
      BACKEND_ALLOWED_ORIGINS: ["https://allowed.example"]
    };
    const auditStore = await AuditStore.open(config.SQLITE_PATH);
    const codex = new MockCodexRepository();
    await codex.connect();
    const app = buildServer({ config, codex, auditStore });

    const allowed = await app.inject({
      method: "GET",
      url: "/health",
      headers: { origin: "https://allowed.example" }
    });
    expect(allowed.headers["access-control-allow-origin"]).toBe("https://allowed.example");

    const blocked = await app.inject({
      method: "GET",
      url: "/health",
      headers: { origin: "https://evil.example" }
    });
    expect(blocked.headers["access-control-allow-origin"]).toBeUndefined();

    await app.close();
    auditStore.close();
  });

  it("records and resolves an approval decision", async () => {
    const temp = mkdtempSync(join(tmpdir(), "codexbutler-"));
    const config = testConfig(join(temp, "test.sqlite"));
    const auditStore = await AuditStore.open(config.SQLITE_PATH);
    const codex = new MockCodexRepository();
    await codex.connect();
    const app = buildServer({ config, codex, auditStore });

    const result = await app.inject({
      method: "POST",
      url: "/approvals/mock-approval-1/decision",
      headers: { authorization: "Bearer test-token-for-codexbutler" },
      payload: { decision: "approveOnce" }
    });
    expect(result.statusCode).toBe(202);
    expect(result.json()).toMatchObject({ ok: true, followUpStatus: "none" });

    const approvals = await app.inject({
      method: "GET",
      url: "/approvals",
      headers: { authorization: "Bearer test-token-for-codexbutler" }
    });
    expect(approvals.json()).toMatchObject({ data: [] });

    await app.close();
    auditStore.close();
  });

  it("accepts approval decisions with special-character ids in the request body", async () => {
    const temp = mkdtempSync(join(tmpdir(), "codexbutler-"));
    const config = testConfig(join(temp, "test.sqlite"));
    const auditStore = await AuditStore.open(config.SQLITE_PATH);
    const codex = new SpecialCharacterApprovalRepository();
    await codex.connect();
    const app = buildServer({ config, codex, auditStore });

    const result = await app.inject({
      method: "POST",
      url: "/approvals/decision",
      headers: { authorization: "Bearer test-token-for-codexbutler" },
      payload: { approvalId: "thread:turn:item", decision: "approveOnce" }
    });
    expect(result.statusCode).toBe(202);
    expect(result.json()).toMatchObject({ ok: true, followUpStatus: "none" });

    const approvals = await app.inject({
      method: "GET",
      url: "/approvals",
      headers: { authorization: "Bearer test-token-for-codexbutler" }
    });
    expect(approvals.json()).toMatchObject({ data: [] });

    await app.close();
    auditStore.close();
  });

  it("rejects unavailable approval decisions before resolving", async () => {
    const temp = mkdtempSync(join(tmpdir(), "codexbutler-"));
    const config = testConfig(join(temp, "test.sqlite"));
    const auditStore = await AuditStore.open(config.SQLITE_PATH);
    const codex = new SpecialCharacterApprovalRepository();
    await codex.connect();
    const app = buildServer({ config, codex, auditStore });

    const result = await app.inject({
      method: "POST",
      url: "/approvals/decision",
      headers: { authorization: "Bearer test-token-for-codexbutler" },
      payload: { approvalId: "thread:turn:item", decision: "deny" }
    });
    expect(result.statusCode).toBe(400);
    expect((await codex.listApprovals()).map((approval) => approval.id)).toEqual(["thread:turn:item"]);

    await app.close();
    auditStore.close();
  });

  it("rejects approval rule prefixes that do not match the proposed rule", async () => {
    const temp = mkdtempSync(join(tmpdir(), "codexbutler-"));
    const config = testConfig(join(temp, "test.sqlite"));
    const auditStore = await AuditStore.open(config.SQLITE_PATH);
    const codex = new MockCodexRepository();
    await codex.connect();
    const app = buildServer({ config, codex, auditStore });

    const result = await app.inject({
      method: "POST",
      url: "/approvals/mock-approval-1/decision",
      headers: { authorization: "Bearer test-token-for-codexbutler" },
      payload: { decision: "alwaysAllowRule", rulePrefix: ["rm", "-rf", "/"] }
    });
    expect(result.statusCode).toBe(400);
    expect((await codex.listApprovals()).map((approval) => approval.id)).toEqual(["mock-approval-1"]);

    await app.close();
    auditStore.close();
  });

  it("rejects rule prefixes on non-rule approval decisions", async () => {
    const temp = mkdtempSync(join(tmpdir(), "codexbutler-"));
    const config = testConfig(join(temp, "test.sqlite"));
    const auditStore = await AuditStore.open(config.SQLITE_PATH);
    const codex = new MockCodexRepository();
    await codex.connect();
    const app = buildServer({ config, codex, auditStore });

    const result = await app.inject({
      method: "POST",
      url: "/approvals/mock-approval-1/decision",
      headers: { authorization: "Bearer test-token-for-codexbutler" },
      payload: { decision: "approveOnce", rulePrefix: [] }
    });
    expect(result.statusCode).toBe(400);
    expect((await codex.listApprovals()).map((approval) => approval.id)).toEqual(["mock-approval-1"]);

    await app.close();
    auditStore.close();
  });

  it("accepts always-allow only with the proposed rule prefix", async () => {
    const temp = mkdtempSync(join(tmpdir(), "codexbutler-"));
    const config = testConfig(join(temp, "test.sqlite"));
    const auditStore = await AuditStore.open(config.SQLITE_PATH);
    const codex = new MockCodexRepository();
    await codex.connect();
    const app = buildServer({ config, codex, auditStore });

    const result = await app.inject({
      method: "POST",
      url: "/approvals/mock-approval-1/decision",
      headers: { authorization: "Bearer test-token-for-codexbutler" },
      payload: { decision: "alwaysAllowRule", rulePrefix: ["pnpm", "install"] }
    });
    expect(result.statusCode).toBe(202);
    expect((await codex.listApprovals()).map((approval) => approval.id)).toEqual([]);

    await app.close();
    auditStore.close();
  });

  it("sends approval follow-up instructions in mock mode and exposes recent decisions", async () => {
    const temp = mkdtempSync(join(tmpdir(), "codexbutler-"));
    const config = testConfig(join(temp, "test.sqlite"));
    const auditStore = await AuditStore.open(config.SQLITE_PATH);
    const codex = new MockCodexRepository();
    await codex.connect();
    const app = buildServer({ config, codex, auditStore });
    const followUpText = "After approving, summarize what happened.";

    const result = await app.inject({
      method: "POST",
      url: "/approvals/mock-approval-1/decision",
      headers: { authorization: "Bearer test-token-for-codexbutler" },
      payload: { decision: "approveOnce", followUpText }
    });
    expect(result.statusCode).toBe(202);
    expect(result.json()).toMatchObject({ ok: true, followUpStatus: "sent" });

    const turns = await app.inject({
      method: "GET",
      url: "/threads/mock-thread-1/turns",
      headers: { authorization: "Bearer test-token-for-codexbutler" }
    });
    expect(JSON.stringify(turns.json())).toContain(followUpText);

    const recent = await app.inject({
      method: "GET",
      url: "/approvals/recent?limit=5",
      headers: { authorization: "Bearer test-token-for-codexbutler" }
    });
    expect(recent.statusCode).toBe(200);
    expect(recent.json().data[0]).toMatchObject({
      approvalId: "mock-approval-1",
      threadId: "mock-thread-1",
      decision: "approveOnce",
      command: "pnpm install",
      followUpPreview: followUpText
    });

    await app.close();
    auditStore.close();
  });

  it("queues approval follow-up instructions when the thread remains busy", async () => {
    const temp = mkdtempSync(join(tmpdir(), "codexbutler-"));
    const config = testConfig(join(temp, "test.sqlite"));
    const auditStore = await AuditStore.open(config.SQLITE_PATH);
    const codex = new BusyCodexRepository();
    await codex.connect();
    const app = buildServer({ config, codex, auditStore });

    const result = await app.inject({
      method: "POST",
      url: "/approvals/busy-approval-1/decision",
      headers: { authorization: "Bearer test-token-for-codexbutler" },
      payload: { decision: "approveOnce", followUpText: "Run the summary after this finishes." }
    });
    expect(result.statusCode).toBe(202);
    expect(result.json()).toMatchObject({ ok: true, followUpStatus: "queued" });
    expect(auditStore.listQueuedFollowUps("busy-thread-1")).toHaveLength(1);

    await app.close();
    auditStore.close();
  });

  it("seeds a single replaceable mock approval case", async () => {
    const temp = mkdtempSync(join(tmpdir(), "codexbutler-"));
    const config = testConfig(join(temp, "test.sqlite"));
    const auditStore = await AuditStore.open(config.SQLITE_PATH);
    const codex = new MockCodexRepository();
    await codex.connect();
    const app = buildServer({ config, codex, auditStore });

    const first = await app.inject({
      method: "POST",
      url: "/debug/mock/approval-cases",
      headers: { authorization: "Bearer test-token-for-codexbutler" },
      payload: { caseId: "follow-up" }
    });
    expect(first.statusCode).toBe(201);
    expect(first.json().approval).toMatchObject({
      threadId: "mock-thread-1",
      command: "pnpm test"
    });

    const second = await app.inject({
      method: "POST",
      url: "/debug/mock/approval-cases",
      headers: { authorization: "Bearer test-token-for-codexbutler" },
      payload: { caseId: "deny" }
    });
    expect(second.statusCode).toBe(201);
    expect(second.json().approval).toMatchObject({
      threadId: "mock-thread-1",
      command: "git push origin main"
    });

    const approvals = await app.inject({
      method: "GET",
      url: "/approvals",
      headers: { authorization: "Bearer test-token-for-codexbutler" }
    });
    expect(approvals.json().data).toHaveLength(1);
    expect(approvals.json().data[0].id).toBe(second.json().approval.id);

    await app.close();
    auditStore.close();
  });

  it("does not expose mock case seeding outside mock mode", async () => {
    const temp = mkdtempSync(join(tmpdir(), "codexbutler-"));
    const config = { ...testConfig(join(temp, "test.sqlite")), CODEX_MOCK_MODE: false };
    const auditStore = await AuditStore.open(config.SQLITE_PATH);
    const codex = new MockCodexRepository();
    await codex.connect();
    const app = buildServer({ config, codex, auditStore });

    const result = await app.inject({
      method: "POST",
      url: "/debug/mock/approval-cases",
      headers: { authorization: "Bearer test-token-for-codexbutler" },
      payload: { caseId: "follow-up" }
    });
    expect(result.statusCode).toBe(404);

    await app.close();
    auditStore.close();
  });

  it("rejects cancel decisions with follow-up text", async () => {
    const temp = mkdtempSync(join(tmpdir(), "codexbutler-"));
    const config = testConfig(join(temp, "test.sqlite"));
    const auditStore = await AuditStore.open(config.SQLITE_PATH);
    const codex = new MockCodexRepository();
    await codex.connect();
    const app = buildServer({ config, codex, auditStore });

    const result = await app.inject({
      method: "POST",
      url: "/approvals/mock-approval-1/decision",
      headers: { authorization: "Bearer test-token-for-codexbutler" },
      payload: { decision: "cancel", followUpText: "Do this anyway." }
    });
    expect(result.statusCode).toBe(400);

    await app.close();
    auditStore.close();
  });

  it("protects prompt submission routes", async () => {
    const temp = mkdtempSync(join(tmpdir(), "codexbutler-"));
    const config = testConfig(join(temp, "test.sqlite"));
    const auditStore = await AuditStore.open(config.SQLITE_PATH);
    const codex = new MockCodexRepository();
    await codex.connect();
    const app = buildServer({ config, codex, auditStore });

    const denied = await app.inject({
      method: "POST",
      url: "/threads/mock-thread-2/prompts",
      payload: { text: "Summarize status" }
    });
    expect(denied.statusCode).toBe(401);

    await app.close();
    auditStore.close();
  });

  it("protects thread creation routes", async () => {
    const temp = mkdtempSync(join(tmpdir(), "codexbutler-"));
    const config = testConfig(join(temp, "test.sqlite"));
    const auditStore = await AuditStore.open(config.SQLITE_PATH);
    const codex = new MockCodexRepository();
    await codex.connect();
    const app = buildServer({ config, codex, auditStore });

    const denied = await app.inject({
      method: "POST",
      url: "/threads",
      payload: { text: "Start a new mobile thread" }
    });
    expect(denied.statusCode).toBe(401);

    await app.close();
    auditStore.close();
  });

  it("creates a backend-owned thread and audits the first prompt", async () => {
    const temp = mkdtempSync(join(tmpdir(), "codexbutler-"));
    const config = testConfig(join(temp, "test.sqlite"));
    const auditStore = await AuditStore.open(config.SQLITE_PATH);
    const codex = new MockCodexRepository();
    await codex.connect();
    const app = buildServer({ config, codex, auditStore });
    const prompt = "Create a new thread from the phone.";

    const result = await app.inject({
      method: "POST",
      url: "/threads",
      headers: { authorization: "Bearer test-token-for-codexbutler" },
      payload: { text: prompt }
    });
    expect(result.statusCode).toBe(201);
    expect(result.json()).toMatchObject({
      ok: true,
      thread: {
        summary: prompt,
        cwd: config.CODEX_DEFAULT_CWD
      },
      turnId: expect.any(String)
    });

    const audits = auditStore.listPromptSubmissions();
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({
      threadId: result.json().thread.id,
      source: "mobile",
      textLength: prompt.length,
      preview: prompt
    });

    await app.close();
    auditStore.close();
  });

  it("creates a backend-owned thread in the selected project folder", async () => {
    const temp = mkdtempSync(join(tmpdir(), "codexbutler-"));
    const config = testConfig(join(temp, "test.sqlite"));
    const auditStore = await AuditStore.open(config.SQLITE_PATH);
    const codex = new MockCodexRepository();
    await codex.connect();
    const app = buildServer({ config, codex, auditStore });
    const prompt = "Create this thread in a selected folder.";
    const cwd = "/tmp/codexbutler-selected-project";

    const result = await app.inject({
      method: "POST",
      url: "/threads",
      headers: { authorization: "Bearer test-token-for-codexbutler" },
      payload: { text: prompt, cwd }
    });
    expect(result.statusCode).toBe(201);
    expect(result.json()).toMatchObject({
      ok: true,
      thread: {
        summary: prompt,
        cwd
      },
      turnId: expect.any(String)
    });

    await app.close();
    auditStore.close();
  });

  it("validates prompt submission input", async () => {
    const temp = mkdtempSync(join(tmpdir(), "codexbutler-"));
    const config = testConfig(join(temp, "test.sqlite"));
    const auditStore = await AuditStore.open(config.SQLITE_PATH);
    const codex = new MockCodexRepository();
    await codex.connect();
    const app = buildServer({ config, codex, auditStore });

    const blank = await app.inject({
      method: "POST",
      url: "/threads/mock-thread-2/prompts",
      headers: { authorization: "Bearer test-token-for-codexbutler" },
      payload: { text: "   " }
    });
    expect(blank.statusCode).toBe(400);

    const tooLong = await app.inject({
      method: "POST",
      url: "/threads/mock-thread-2/prompts",
      headers: { authorization: "Bearer test-token-for-codexbutler" },
      payload: { text: "x".repeat(4001) }
    });
    expect(tooLong.statusCode).toBe(400);

    await app.close();
    auditStore.close();
  });

  it("returns not found and busy errors for prompt submission", async () => {
    const temp = mkdtempSync(join(tmpdir(), "codexbutler-"));
    const config = testConfig(join(temp, "test.sqlite"));
    const auditStore = await AuditStore.open(config.SQLITE_PATH);
    const codex = new MockCodexRepository();
    await codex.connect();
    const app = buildServer({ config, codex, auditStore });

    const missing = await app.inject({
      method: "POST",
      url: "/threads/missing-thread/prompts",
      headers: { authorization: "Bearer test-token-for-codexbutler" },
      payload: { text: "Summarize status" }
    });
    expect(missing.statusCode).toBe(404);

    const busy = await app.inject({
      method: "POST",
      url: "/threads/mock-thread-1/prompts",
      headers: { authorization: "Bearer test-token-for-codexbutler" },
      payload: { text: "Summarize status" }
    });
    expect(busy.statusCode).toBe(409);

    await app.close();
    auditStore.close();
  });

  it("creates a mock turn and audits prompt submissions", async () => {
    const temp = mkdtempSync(join(tmpdir(), "codexbutler-"));
    const config = testConfig(join(temp, "test.sqlite"));
    const auditStore = await AuditStore.open(config.SQLITE_PATH);
    const codex = new MockCodexRepository();
    await codex.connect();
    const app = buildServer({ config, codex, auditStore });
    const prompt = `${"Review the current project status. ".repeat(8)}Do not run commands.`;

    const result = await app.inject({
      method: "POST",
      url: "/threads/mock-thread-2/prompts",
      headers: { authorization: "Bearer test-token-for-codexbutler" },
      payload: { text: prompt }
    });
    expect(result.statusCode).toBe(202);
    expect(result.json()).toMatchObject({ ok: true });
    expect(result.json().turnId).toEqual(expect.any(String));

    const turns = await app.inject({
      method: "GET",
      url: "/threads/mock-thread-2/turns",
      headers: { authorization: "Bearer test-token-for-codexbutler" }
    });
    expect(turns.json().data[0].items[0].body).toBe(prompt);

    const audits = auditStore.listPromptSubmissions();
    expect(audits).toHaveLength(1);
    const audit = audits[0];
    expect(audit).toBeDefined();
    expect(audit).toMatchObject({
      threadId: "mock-thread-2",
      source: "mobile",
      textLength: prompt.length
    });
    expect(audit?.textHash).toHaveLength(64);
    expect(audit?.preview).not.toBe(prompt);
    expect(audit?.preview).toHaveLength(203);

    await app.close();
    auditStore.close();
  });
});
