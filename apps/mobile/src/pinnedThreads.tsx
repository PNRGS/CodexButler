import AsyncStorage from "@react-native-async-storage/async-storage";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type PropsWithChildren } from "react";

const PINNED_THREADS_KEY = "codexbutler.pinnedThreadIds";
const LEGACY_PINNED_THREADS_KEY = "concierge.pinnedThreadIds";

interface PinnedThreadsContextValue {
  pinnedThreadIds: string[];
  ready: boolean;
  isPinned: (threadId: string) => boolean;
  togglePinnedThread: (threadId: string) => Promise<void>;
}

async function loadStoredPinnedThreads(): Promise<string[]> {
  const stored = await AsyncStorage.getItem(PINNED_THREADS_KEY);
  if (stored) {
    return parseStoredPinnedThreads(stored);
  }

  const legacyStored = await AsyncStorage.getItem(LEGACY_PINNED_THREADS_KEY);
  const legacyPinnedThreadIds = parseStoredPinnedThreads(legacyStored);
  if (legacyPinnedThreadIds.length) {
    await AsyncStorage.setItem(PINNED_THREADS_KEY, JSON.stringify(legacyPinnedThreadIds));
  }
  await AsyncStorage.removeItem(LEGACY_PINNED_THREADS_KEY);
  return legacyPinnedThreadIds;
}

const PinnedThreadsContext = createContext<PinnedThreadsContextValue | null>(null);

function parseStoredPinnedThreads(value: string | null): string[] {
  if (!value) {
    return [];
  }

  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return [...new Set(parsed.filter((item): item is string => typeof item === "string" && item.length > 0))];
  } catch {
    return [];
  }
}

export function PinnedThreadsProvider({ children }: PropsWithChildren) {
  const [pinnedThreadIds, setPinnedThreadIds] = useState<string[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let mounted = true;
    void loadStoredPinnedThreads()
      .then((storedPinnedThreadIds) => {
        if (mounted) {
          setPinnedThreadIds(storedPinnedThreadIds);
        }
      })
      .finally(() => {
        if (mounted) {
          setReady(true);
        }
      });

    return () => {
      mounted = false;
    };
  }, []);

  const togglePinnedThread = useCallback(async (threadId: string) => {
    let nextPinnedThreadIds: string[] = [];
    setPinnedThreadIds((current) => {
      nextPinnedThreadIds = current.includes(threadId)
        ? current.filter((id) => id !== threadId)
        : [threadId, ...current.filter((id) => id !== threadId)];
      return nextPinnedThreadIds;
    });
    await AsyncStorage.setItem(PINNED_THREADS_KEY, JSON.stringify(nextPinnedThreadIds)).catch(() => undefined);
  }, []);

  const isPinned = useCallback((threadId: string) => pinnedThreadIds.includes(threadId), [pinnedThreadIds]);

  const value = useMemo<PinnedThreadsContextValue>(
    () => ({
      pinnedThreadIds,
      ready,
      isPinned,
      togglePinnedThread
    }),
    [isPinned, pinnedThreadIds, ready, togglePinnedThread]
  );

  return <PinnedThreadsContext.Provider value={value}>{children}</PinnedThreadsContext.Provider>;
}

export function usePinnedThreads(): PinnedThreadsContextValue {
  const value = useContext(PinnedThreadsContext);
  if (!value) {
    throw new Error("usePinnedThreads must be used inside PinnedThreadsProvider");
  }
  return value;
}
