import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import { createContext, useContext, useEffect, useMemo, useState, type PropsWithChildren } from "react";

const BACKEND_URL_KEY = "codexbutler.backendUrl";
const TOKEN_KEY = "codexbutler.token";
const LEGACY_BACKEND_URL_KEY = "concierge.backendUrl";
const LEGACY_TOKEN_KEY = "concierge.token";

interface SettingsContextValue {
  backendUrl: string;
  token: string;
  ready: boolean;
  saveSettings: (backendUrl: string, token: string) => Promise<void>;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

async function secureStoreAvailable(): Promise<boolean> {
  return SecureStore.isAvailableAsync().catch(() => false);
}

async function loadStoredToken(): Promise<string | null> {
  const available = await secureStoreAvailable();
  if (!available) {
    await AsyncStorage.removeItem(TOKEN_KEY);
    await AsyncStorage.removeItem(LEGACY_TOKEN_KEY);
    return null;
  }

  const storedToken = await SecureStore.getItemAsync(TOKEN_KEY);
  if (storedToken) {
    await AsyncStorage.removeItem(TOKEN_KEY);
    return storedToken;
  }

  const legacySecureToken = await SecureStore.getItemAsync(LEGACY_TOKEN_KEY);
  if (legacySecureToken) {
    await SecureStore.setItemAsync(TOKEN_KEY, legacySecureToken);
    await SecureStore.deleteItemAsync(LEGACY_TOKEN_KEY);
    await AsyncStorage.removeItem(LEGACY_TOKEN_KEY);
    return legacySecureToken;
  }

  const legacyToken = (await AsyncStorage.getItem(TOKEN_KEY)) ?? (await AsyncStorage.getItem(LEGACY_TOKEN_KEY));
  if (!legacyToken) {
    return null;
  }

  await SecureStore.setItemAsync(TOKEN_KEY, legacyToken);
  await AsyncStorage.removeItem(TOKEN_KEY);
  await AsyncStorage.removeItem(LEGACY_TOKEN_KEY);
  return legacyToken;
}

async function saveStoredToken(token: string): Promise<void> {
  await AsyncStorage.removeItem(TOKEN_KEY);
  await AsyncStorage.removeItem(LEGACY_TOKEN_KEY);
  if (!(await secureStoreAvailable())) {
    return;
  }
  if (token) {
    await SecureStore.setItemAsync(TOKEN_KEY, token);
  } else {
    await SecureStore.deleteItemAsync(TOKEN_KEY);
  }
  await SecureStore.deleteItemAsync(LEGACY_TOKEN_KEY);
}

async function loadStoredBackendUrl(): Promise<string | null> {
  const storedUrl = await AsyncStorage.getItem(BACKEND_URL_KEY);
  if (storedUrl) {
    return storedUrl;
  }

  const legacyUrl = await AsyncStorage.getItem(LEGACY_BACKEND_URL_KEY);
  if (!legacyUrl) {
    return null;
  }

  await AsyncStorage.setItem(BACKEND_URL_KEY, legacyUrl);
  await AsyncStorage.removeItem(LEGACY_BACKEND_URL_KEY);
  return legacyUrl;
}

export function SettingsProvider({ children }: PropsWithChildren) {
  const [backendUrl, setBackendUrl] = useState("http://127.0.0.1:4545");
  const [token, setToken] = useState("");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    void Promise.all([loadStoredBackendUrl(), loadStoredToken()]).then(
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
        await AsyncStorage.setItem(BACKEND_URL_KEY, trimmedUrl);
        await AsyncStorage.removeItem(LEGACY_BACKEND_URL_KEY);
        await saveStoredToken(nextToken);
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
