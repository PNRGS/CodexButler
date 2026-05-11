import initSqlJs, { type Database } from "sql.js";
import { createRequire } from "node:module";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type {
  ApprovalDecision,
  ApprovalDecisionKind,
  ApprovalHistoryItem,
  NotificationAddressMode,
  NotificationDevice,
  NotificationDevicePlatform,
  Rule
} from "@codexbutler/shared";

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

export interface NotificationDeviceInput {
  id: string;
  pushToken: string;
  platform: NotificationDevicePlatform;
  addressMode: NotificationAddressMode;
  now: string;
}

export interface StoredNotificationDevice extends NotificationDevice {
  pushToken: string;
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

      create table if not exists notification_devices (
        id text primary key,
        push_token text not null unique,
        platform text not null,
        address_mode text not null,
        approvals_enabled integer not null,
        created_at text not null,
        updated_at text not null,
        last_seen_at text not null,
        disabled_at text
      );

      create table if not exists notification_thread_preferences (
        device_id text not null,
        thread_id text not null,
        idle_enabled integer not null,
        updated_at text not null,
        primary key (device_id, thread_id)
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

  upsertNotificationDevice(input: NotificationDeviceInput): NotificationDevice {
    const existing = this.storedDeviceByPushToken(input.pushToken);
    if (existing) {
      this.db.run(
        `update notification_devices
            set platform = ?,
                address_mode = ?,
                approvals_enabled = 1,
                updated_at = ?,
                last_seen_at = ?,
                disabled_at = null
          where id = ?`,
        [input.platform, input.addressMode, input.now, input.now, existing.id]
      );
      this.persist();
      return this.getNotificationDevice(existing.id) as NotificationDevice;
    }

    this.db.run(
      `insert into notification_devices
          (id, push_token, platform, address_mode, approvals_enabled, created_at, updated_at, last_seen_at, disabled_at)
       values (?, ?, ?, ?, 1, ?, ?, ?, null)`,
      [input.id, input.pushToken, input.platform, input.addressMode, input.now, input.now, input.now]
    );
    this.persist();
    return this.getNotificationDevice(input.id) as NotificationDevice;
  }

  getNotificationDevice(deviceId: string): NotificationDevice | null {
    const device = this.storedDeviceById(deviceId);
    return device ? this.publicDevice(device) : null;
  }

  private storedDeviceById(deviceId: string): StoredNotificationDevice | null {
    const rows = this.db.exec(
      `select id, push_token, platform, address_mode, approvals_enabled, created_at, updated_at, last_seen_at
         from notification_devices
        where id = ? and disabled_at is null
        limit 1`,
      [deviceId]
    )[0]?.values;
    return this.storedDeviceFromRow(rows?.[0] ?? null);
  }

  updateNotificationDevicePreferences(
    deviceId: string,
    input: { addressMode: NotificationAddressMode; approvalsEnabled?: boolean },
    now: string
  ): NotificationDevice | null {
    const device = this.getNotificationDevice(deviceId);
    if (!device) {
      return null;
    }
    this.db.run(
      `update notification_devices
          set address_mode = ?,
              approvals_enabled = ?,
              updated_at = ?,
              last_seen_at = ?
        where id = ?`,
      [input.addressMode, (input.approvalsEnabled ?? device.approvalsEnabled) ? 1 : 0, now, now, deviceId]
    );
    this.persist();
    return this.getNotificationDevice(deviceId);
  }

  disableNotificationDevice(deviceId: string, now: string): boolean {
    const device = this.getNotificationDevice(deviceId);
    if (!device) {
      return false;
    }
    this.db.run(`update notification_devices set disabled_at = ?, updated_at = ? where id = ?`, [now, now, deviceId]);
    this.persist();
    return true;
  }

  disableNotificationDeviceByPushToken(pushToken: string, now: string): void {
    this.db.run(`update notification_devices set disabled_at = ?, updated_at = ? where push_token = ?`, [now, now, pushToken]);
    this.persist();
  }

  setNotificationThreadPreference(deviceId: string, threadId: string, idleEnabled: boolean, now: string): boolean {
    if (!this.getNotificationDevice(deviceId)) {
      return false;
    }
    this.db.run(
      `insert into notification_thread_preferences (device_id, thread_id, idle_enabled, updated_at)
       values (?, ?, ?, ?)
       on conflict(device_id, thread_id) do update
          set idle_enabled = excluded.idle_enabled,
              updated_at = excluded.updated_at`,
      [deviceId, threadId, idleEnabled ? 1 : 0, now]
    );
    this.persist();
    return true;
  }

  listNotificationIdleThreadIds(deviceId: string): string[] {
    const results = this.db.exec(
      `select thread_id
         from notification_thread_preferences
        where device_id = ? and idle_enabled = 1
        order by updated_at desc`,
      [deviceId]
    );
    return (results[0]?.values ?? []).map((row) => String(row[0]));
  }

  listNotificationDevicesForApprovals(): StoredNotificationDevice[] {
    const results = this.db.exec(
      `select id, push_token, platform, address_mode, approvals_enabled, created_at, updated_at, last_seen_at
         from notification_devices
        where disabled_at is null and approvals_enabled = 1
        order by updated_at desc`
    );
    return this.storedDevicesFromRows(results[0]?.values ?? []);
  }

  listNotificationDevicesForIdleThread(threadId: string): StoredNotificationDevice[] {
    const results = this.db.exec(
      `select d.id, d.push_token, d.platform, d.address_mode, d.approvals_enabled, d.created_at, d.updated_at, d.last_seen_at
         from notification_devices d
         join notification_thread_preferences p on p.device_id = d.id
        where d.disabled_at is null and p.thread_id = ? and p.idle_enabled = 1
        order by d.updated_at desc`,
      [threadId]
    );
    return this.storedDevicesFromRows(results[0]?.values ?? []);
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

  private storedDeviceByPushToken(pushToken: string): StoredNotificationDevice | null {
    const rows = this.db.exec(
      `select id, push_token, platform, address_mode, approvals_enabled, created_at, updated_at, last_seen_at
         from notification_devices
        where push_token = ?
        limit 1`,
      [pushToken]
    )[0]?.values;
    return this.storedDeviceFromRow(rows?.[0] ?? null);
  }

  private storedDevicesFromRows(rows: unknown[][]): StoredNotificationDevice[] {
    return rows.map((row) => this.storedDeviceFromRow(row)).filter((device): device is StoredNotificationDevice => device !== null);
  }

  private storedDeviceFromRow(row: unknown[] | null): StoredNotificationDevice | null {
    if (!row) {
      return null;
    }
    return {
      id: String(row[0]),
      pushToken: String(row[1]),
      platform: String(row[2]) as NotificationDevicePlatform,
      addressMode: String(row[3]) as NotificationAddressMode,
      approvalsEnabled: Number(row[4]) === 1,
      createdAt: String(row[5]),
      updatedAt: String(row[6]),
      lastSeenAt: String(row[7])
    };
  }

  private publicDevice(device: StoredNotificationDevice): NotificationDevice {
    return {
      id: device.id,
      platform: device.platform,
      addressMode: device.addressMode,
      approvalsEnabled: device.approvalsEnabled,
      createdAt: device.createdAt,
      updatedAt: device.updatedAt,
      lastSeenAt: device.lastSeenAt
    };
  }

  private persist(): void {
    writeFileSync(this.filePath, this.db.export());
  }
}
