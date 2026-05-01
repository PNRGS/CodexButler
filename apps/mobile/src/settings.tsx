import AsyncStorage from "@react-native-async-storage/async-storage";
import { createContext, useContext, useEffect, useMemo, useState, type PropsWithChildren } from "react";

const BACKEND_URL_KEY = "concierge.backendUrl";
const TOKEN_KEY = "concierge.token";

interface SettingsContextValue {
  backendUrl: string;
  token: string;
  ready: boolean;
  saveSettings: (backendUrl: string, token: string) => Promise<void>;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

export function SettingsProvider({ children }: PropsWithChildren) {
  const [backendUrl, setBackendUrl] = useState("http://127.0.0.1:4545");
  const [token, setToken] = useState("");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    void Promise.all([AsyncStorage.getItem(BACKEND_URL_KEY), AsyncStorage.getItem(TOKEN_KEY)]).then(
      ([storedUrl, storedToken]) => {
        if (storedUrl) {
          setBackendUrl(storedUrl);
        }
        if (storedToken) {
          setToken(storedToken);
        }
        setReady(true);
      }
    );
  }, []);

  const value = useMemo<SettingsContextValue>(
    () => ({
      backendUrl,
      token,
      ready,
      saveSettings: async (nextUrl, nextToken) => {
        const trimmedUrl = nextUrl.replace(/\/$/, "");
        await AsyncStorage.multiSet([
          [BACKEND_URL_KEY, trimmedUrl],
          [TOKEN_KEY, nextToken]
        ]);
        setBackendUrl(trimmedUrl);
        setToken(nextToken);
      }
    }),
    [backendUrl, ready, token]
  );

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings(): SettingsContextValue {
  const value = useContext(SettingsContext);
  if (!value) {
    throw new Error("useSettings must be used inside SettingsProvider");
  }
  return value;
}
