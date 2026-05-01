import EventSource from "react-native-sse";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { useSettings } from "./settings";

export function useConciergeEvents() {
  const { backendUrl, token, ready } = useSettings();
  const queryClient = useQueryClient();

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

    const refresh = () => {
      void queryClient.invalidateQueries({ queryKey: ["threads"] });
      void queryClient.invalidateQueries({ queryKey: ["approvals"] });
      void queryClient.invalidateQueries({ queryKey: ["approvals", "recent"] });
      void queryClient.invalidateQueries({ queryKey: ["projects"] });
    };

    typedSource.addEventListener("thread.updated", refresh);
    typedSource.addEventListener("turn.updated", refresh);
    typedSource.addEventListener("approval.created", refresh);
    typedSource.addEventListener("approval.resolved", refresh);
    typedSource.addEventListener("backend.status", refresh);

    return () => {
      typedSource.removeAllEventListeners();
      typedSource.close();
    };
  }, [backendUrl, queryClient, ready, token]);
}
