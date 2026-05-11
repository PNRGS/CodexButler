import type { ServerEvent, ThreadStatus } from "@codexbutler/shared";
import type { FastifyBaseLogger } from "fastify";
import type { AuditStore } from "../storage/AuditStore.js";
import { attentionNotificationText } from "./messages.js";
import type { PushMessage, PushSender } from "./ExpoPushSender.js";

const CHANNEL_ID = "codexbutler-events";

export class NotificationService {
  private readonly notifiedApprovalIds = new Set<string>();
  private readonly notifiedIdleKeys = new Set<string>();
  private readonly threadStatuses = new Map<string, ThreadStatus>();

  constructor(
    private readonly store: AuditStore,
    private readonly pushSender: PushSender,
    private readonly log: FastifyBaseLogger
  ) {}

  handleCodexEvent(event: ServerEvent): void {
    if (event.type === "approval.created") {
      void this.notifyApprovals(event.approval.id);
      return;
    }

    if (event.type === "approval.resolved") {
      this.notifiedApprovalIds.delete(event.approvalId);
      return;
    }

    if (event.type === "thread.updated") {
      const previousStatus = this.threadStatuses.get(event.thread.id);
      this.threadStatuses.set(event.thread.id, event.thread.status);
      const idleKey = `${event.thread.id}:${event.thread.updatedAt}`;
      if (event.thread.status === "idle" && previousStatus && previousStatus !== "idle" && !this.notifiedIdleKeys.has(idleKey)) {
        this.notifiedIdleKeys.add(idleKey);
        void this.notifyIdleThread(event.thread.id);
      }
    }
  }

  private async notifyApprovals(approvalId: string): Promise<void> {
    if (this.notifiedApprovalIds.has(approvalId)) {
      return;
    }
    this.notifiedApprovalIds.add(approvalId);
    await this.sendToDevices("approval", this.store.listNotificationDevicesForApprovals());
  }

  private async notifyIdleThread(threadId: string): Promise<void> {
    await this.sendToDevices("idle", this.store.listNotificationDevicesForIdleThread(threadId));
  }

  private async sendToDevices(reason: "approval" | "idle", devices: ReturnType<AuditStore["listNotificationDevicesForApprovals"]>): Promise<void> {
    if (!devices.length) {
      return;
    }

    const messages: PushMessage[] = devices.map((device) => ({
      to: device.pushToken,
      title: attentionNotificationText(device.addressMode),
      sound: "default",
      channelId: CHANNEL_ID
    }));

    try {
      const results = await this.pushSender.send(messages);
      for (const result of results) {
        if (result.error === "DeviceNotRegistered") {
          this.store.disableNotificationDeviceByPushToken(result.token, new Date().toISOString());
        }
      }
      const delivered = results.filter((result) => result.ok).length;
      this.log.info({ reason, attempted: devices.length, delivered }, "opaque push notifications sent");
    } catch (error) {
      this.log.warn({ error, reason, attempted: devices.length }, "opaque push notification delivery failed");
    }
  }
}
