import initSqlJs, { type Database } from "sql.js";
import { createRequire } from "node:module";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { ApprovalDecision, ApprovalDecisionKind, ApprovalHistoryItem, Rule } from "@concierge/shared";

export interface PromptAuditEntry {
  id: string;
  threadId: string;
  source: "mobile";
  submittedAt: string;
  textLength: number;
  textHash: string;
  preview: string;
}

export interface ApprovalFollowUp {
  id: string;
  approvalId: string;
  threadId: string;
  text: string;
  textHash: string;
  preview: string;
  status: "queued" | "sent" | "failed";
  createdAt: string;
  sentAt: string | null;
}

export class AuditStore {
  private readonly db: Database;
  private readonly filePath: string;

  private constructor(filePath: string, db: Database) {
    const resolvedPath = resolve(filePath);
    mkdirSync(dirname(resolvedPath), { recursive: true });
    this.filePath = resolvedPath;
    this.db = db;
    this.db.exec(`
      create table if not exists approval_decisions (
        id text primary key,
        approval_id text not null,
        thread_id text,
        decision text not null,
        rule_prefix text,
        command text,
        cwd text,
        follow_up_preview text,
        source text not null,
        decided_at text not null
      );

      create table if not exists rules (
        id text primary key,
        prefix text not null,
        created_at text not null,
        source_approval_id text
      );

      create table if not exists prompt_submissions (
        id text primary key,
        thread_id text not null,
        source text not null,
        submitted_at text not null,
        text_length integer not null,
        text_hash text not null,
        preview text not null
      );

      create table if not exists approval_followups (
        id text primary key,
        approval_id text not null,
        thread_id text not null,
        text text not null,
        text_hash text not null,
        preview text not null,
        status text not null,
        created_at text not null,
        sent_at text
      );
    `);
    this.ensureApprovalDecisionColumns();
    this.scrubDeliveredFollowUpText();
    this.persist();
  }

  static async open(filePath: string): Promise<AuditStore> {
    const require = createRequire(import.meta.url);
    const wasmPath = require.resolve("sql.js/dist/sql-wasm.wasm");
    const SQL = await initSqlJs({ locateFile: () => wasmPath });
    const resolvedPath = resolve(filePath);
    const db = existsSync(resolvedPath) ? new SQL.Database(readFileSync(resolvedPath)) : new SQL.Database();
    return new AuditStore(filePath, db);
  }

  recordDecision(decision: ApprovalDecision): void {
    this.db.run(
      `insert into approval_decisions
          (id, approval_id, thread_id, decision, rule_prefix, command, cwd, follow_up_preview, source, decided_at)
         values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        decision.id,
        decision.approvalId,
        decision.threadId,
        decision.decision,
        decision.rulePrefix ? JSON.stringify(decision.rulePrefix) : null,
        decision.command,
        decision.cwd,
        decision.followUpPreview,
        decision.source,
        decision.decidedAt
      ]
    );
    this.persist();
  }

  recordRule(rule: Rule): void {
    this.db.run(
      `insert into rules (id, prefix, created_at, source_approval_id)
         values (?, ?, ?, ?)`,
      [rule.id, JSON.stringify(rule.prefix), rule.createdAt, rule.sourceApprovalId]
    );
    this.persist();
  }

  recordPromptSubmission(entry: PromptAuditEntry): void {
    this.db.run(
      `insert into prompt_submissions
          (id, thread_id, source, submitted_at, text_length, text_hash, preview)
         values (?, ?, ?, ?, ?, ?, ?)`,
      [entry.id, entry.threadId, entry.source, entry.submittedAt, entry.textLength, entry.textHash, entry.preview]
    );
    this.persist();
  }

  recordFollowUp(entry: ApprovalFollowUp): void {
    this.db.run(
      `insert into approval_followups
          (id, approval_id, thread_id, text, text_hash, preview, status, created_at, sent_at)
         values (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        entry.id,
        entry.approvalId,
        entry.threadId,
        entry.text,
        entry.textHash,
        entry.preview,
        entry.status,
        entry.createdAt,
        entry.sentAt
      ]
    );
    this.persist();
  }

  listQueuedFollowUps(threadId?: string): ApprovalFollowUp[] {
    const sql = threadId
      ? `select id, approval_id, thread_id, text, text_hash, preview, status, created_at, sent_at
           from approval_followups
          where status = 'queued' and thread_id = ?
          order by created_at asc`
      : `select id, approval_id, thread_id, text, text_hash, preview, status, created_at, sent_at
           from approval_followups
          where status = 'queued'
          order by created_at asc`;
    const results = this.db.exec(sql, threadId ? [threadId] : []);
    return this.followUpsFromRows(results[0]?.values ?? []);
  }

  updateFollowUpStatus(id: string, status: ApprovalFollowUp["status"], sentAt: string | null): void {
    this.db.run(
      `update approval_followups
          set status = ?,
              sent_at = ?,
              text = case when ? = 'queued' then text else '' end
        where id = ?`,
      [status, sentAt, status, id]
    );
    this.persist();
  }

  listRecentDecisions(limit: number): ApprovalHistoryItem[] {
    const results = this.db.exec(
      `select id, approval_id, thread_id, command, cwd, decision, follow_up_preview, decided_at
         from approval_decisions
        order by decided_at desc
        limit ?`,
      [limit]
    );
    return (results[0]?.values ?? []).map((row) => ({
      id: String(row[0]),
      approvalId: String(row[1]),
      threadId: row[2] === null ? null : String(row[2]),
      command: row[3] === null ? null : String(row[3]),
      cwd: row[4] === null ? null : String(row[4]),
      decision: String(row[5]) as ApprovalDecisionKind,
      followUpPreview: row[6] === null ? null : String(row[6]),
      decidedAt: String(row[7])
    }));
  }

  listPromptSubmissions(): PromptAuditEntry[] {
    const results = this.db.exec(
      `select id, thread_id, source, submitted_at, text_length, text_hash, preview
         from prompt_submissions
         order by submitted_at asc`
    );
    const rows = results[0]?.values ?? [];
    return rows.map((row) => ({
      id: String(row[0]),
      threadId: String(row[1]),
      source: "mobile",
      submittedAt: String(row[3]),
      textLength: Number(row[4]),
      textHash: String(row[5]),
      preview: String(row[6])
    }));
  }

  close(): void {
    this.db.close();
  }

  private ensureApprovalDecisionColumns(): void {
    const columns = new Set(
      (this.db.exec(`pragma table_info(approval_decisions)`)[0]?.values ?? []).map((row) => String(row[1]))
    );
    const expectedColumns: Array<[string, string]> = [
      ["thread_id", "text"],
      ["command", "text"],
      ["cwd", "text"],
      ["follow_up_preview", "text"]
    ];
    const missingColumns = expectedColumns.filter(([name]) => !columns.has(name));
    for (const [name, type] of missingColumns) {
      this.db.exec(`alter table approval_decisions add column ${name} ${type}`);
    }
  }

  private scrubDeliveredFollowUpText(): void {
    this.db.run(`update approval_followups set text = '' where status != 'queued' and text != ''`);
  }

  private followUpsFromRows(rows: unknown[][]): ApprovalFollowUp[] {
    return rows.map((row) => ({
      id: String(row[0]),
      approvalId: String(row[1]),
      threadId: String(row[2]),
      text: String(row[3]),
      textHash: String(row[4]),
      preview: String(row[5]),
      status: String(row[6]) as ApprovalFollowUp["status"],
      createdAt: String(row[7]),
      sentAt: row[8] === null ? null : String(row[8])
    }));
  }

  private persist(): void {
    writeFileSync(this.filePath, this.db.export());
  }
}
