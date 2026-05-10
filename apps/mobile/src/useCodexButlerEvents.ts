import EventSource from "react-native-sse";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useSettings } from "./settings";

const RECONNECT_DELAY_MS = 2000;

export function useCodexButlerEvents() {
  const { backendUrl, token, ready } = useSettings();
  const queryClient = useQueryClient();
  const [reconnectTick, setReconnectTick] = useState(0);

  useEffect(() => {
    if (!ready || !backendUrl || !token) {
      return;
    }

    const source = new EventSource(`${backendUrl}/events`, {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });
    const typedSource = source as unknown as {
      addEventListener: (type: string, listener: () => void) => void;
      removeAllEventListeners: () => void;
      close: () => void;
    };
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    const refresh = () => {
      void queryClient.invalidateQueries({ queryKey: ["threads"] });
      void queryClient.invalidateQueries({ queryKey: ["thread"] });
      void queryClient.invalidateQueries({ queryKey: ["turns"] });
      void queryClient.invalidateQueries({ queryKey: ["approvals"] });
      void queryClient.invalidateQueries({ queryKey: ["approvals", "recent"] });
      void queryClient.invalidateQueries({ queryKey: ["projects"] });
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

    typedSource.addEventListener("thread.updated", refresh);
    typedSource.addEventListener("turn.updated", refresh);
    typedSource.addEventListener("approval.created", refresh);
    typedSource.addEventListener("approval.resolved", refresh);
    typedSource.addEventListener("backend.status", refresh);
    typedSource.addEventListener("error", scheduleReconnect);
    typedSource.addEventListener("exception", scheduleReconnect);
    typedSource.addEventListener("close", scheduleReconnect);

    return () => {
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
      }
      typedSource.removeAllEventListeners();
      typedSource.close();
    };
  }, [backendUrl, queryClient, ready, reconnectTick, token]);
}
