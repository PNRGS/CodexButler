import EventSource from "react-native-sse";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import type { Page, ServerEvent, Thread, ThreadStatus } from "@codexbutler/shared";
import { notifyAttention, primeLocalNotifications } from "./localNotifications";
import { useSettings } from "./settings";
import { useThreadNotifications } from "./threadNotifications";

const RECONNECT_DELAY_MS = 2000;
type CodexSseEventType = ServerEvent["type"] | "exception";

function parseServerEvent(data: string | null): ServerEvent | null {
  if (!data) {
    return null;
  }

  try {
    const parsed = JSON.parse(data) as Partial<ServerEvent>;
    return typeof parsed.type === "string" ? (parsed as ServerEvent) : null;
  } catch {
    return null;
  }
}

export function useCodexButlerEvents() {
  const { backendUrl, token, ready } = useSettings();
  const threadNotifications = useThreadNotifications();
  const notificationsReady = threadNotifications.ready;
  const notificationAddressMode = threadNotifications.addressMode;
  const isThreadNotificationsEnabled = threadNotifications.isThreadNotificationsEnabled;
  const queryClient = useQueryClient();
  const [reconnectTick, setReconnectTick] = useState(0);
  const notifiedApprovalIds = useRef(new Set<string>());
  const notifiedIdleKeys = useRef(new Set<string>());
  const threadStatuses = useRef(new Map<string, ThreadStatus>());

  useEffect(() => {
    primeLocalNotifications();
  }, []);

  useEffect(() => {
    if (!ready || !backendUrl || !token) {
      return;
    }

    const source = new EventSource<CodexSseEventType>(`${backendUrl}/events`, {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    const refresh = () => {
      void queryClient.invalidateQueries({ queryKey: ["threads"] });
      void queryClient.invalidateQueries({ queryKey: ["thread"] });
      void queryClient.invalidateQueries({ queryKey: ["turns"] });
      void queryClient.invalidateQueries({ queryKey: ["approvals"] });
      void queryClient.invalidateQueries({ queryKey: ["approvals", "recent"] });
      void queryClient.invalidateQueries({ queryKey: ["projects"] });
    };
    const cachedThreadStatus = (threadId: string): ThreadStatus | undefined => {
      for (const [, cachedThread] of queryClient.getQueriesData<Thread>({ queryKey: ["thread"] })) {
        if (cachedThread?.id === threadId) {
          return cachedThread.status;
        }
      }

      for (const [, cachedPage] of queryClient.getQueriesData<Page<Thread>>({ queryKey: ["threads"] })) {
        const cachedThread = cachedPage?.data.find((thread) => thread.id === threadId);
        if (cachedThread) {
          return cachedThread.status;
        }
      }

      return undefined;
    };
    const handleServerEvent = (message: { data: string | null }) => {
      const event = parseServerEvent(message.data);
      if (!event) {
        refresh();
        return;
      }

      if (event.type === "approval.created" && !notifiedApprovalIds.current.has(event.approval.id)) {
        notifiedApprovalIds.current.add(event.approval.id);
        void notifyAttention(notificationAddressMode);
      }

      if (event.type === "approval.resolved") {
        notifiedApprovalIds.current.delete(event.approvalId);
      }

      if (event.type === "thread.updated") {
        const previousStatus = threadStatuses.current.get(event.thread.id) ?? cachedThreadStatus(event.thread.id);
        threadStatuses.current.set(event.thread.id, event.thread.status);
        const idleKey = `${event.thread.id}:${event.thread.updatedAt}`;
        if (
          event.thread.status === "idle" &&
          previousStatus !== undefined &&
          previousStatus !== "idle" &&
          notificationsReady &&
          isThreadNotificationsEnabled(event.thread.id) &&
          !notifiedIdleKeys.current.has(idleKey)
        ) {
          notifiedIdleKeys.current.add(idleKey);
          void notifyAttention(notificationAddressMode);
        }
      }

      refresh();
    };
    const scheduleReconnect = () => {
      refresh();
      if (reconnectTimer) {
        return;
      }
      reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        setReconnectTick((value) => value + 1);
      }, RECONNECT_DELAY_MS);
    };

    source.addEventListener("thread.updated", handleServerEvent);
    source.addEventListener("turn.updated", handleServerEvent);
    source.addEventListener("approval.created", handleServerEvent);
    source.addEventListener("approval.resolved", handleServerEvent);
    source.addEventListener("backend.status", handleServerEvent);
    source.addEventListener("error", scheduleReconnect);
    source.addEventListener("exception", scheduleReconnect);
    source.addEventListener("close", scheduleReconnect);

    return () => {
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
      }
      source.removeAllEventListeners();
      source.close();
    };
  }, [
    backendUrl,
    isThreadNotificationsEnabled,
    notificationAddressMode,
    notificationsReady,
    queryClient,
    ready,
    reconnectTick,
    token
  ]);
}
