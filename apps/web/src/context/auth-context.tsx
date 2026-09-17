import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import type { AuthUser } from "@xiaomi-car/contracts";

import { type ApiClient, apiClient } from "../api/client.js";

interface AuthSessionResponse {
  accessToken: string;
  expiresIn: number;
  user: AuthUser;
}

interface AuthContextValue {
  user: AuthUser | undefined;
  ready: boolean;
  isAuthenticated: boolean;
  client: ApiClient;
  applySession: (session: AuthSessionResponse) => void;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({
  children,
  client = apiClient,
}: {
  children: ReactNode;
  client?: ApiClient;
}) {
  const [user, setUser] = useState<AuthUser | undefined>(undefined);
  const [ready, setReady] = useState(false);
  const bootstrapped = useRef(false);

  const applySession = useCallback(
    (session: AuthSessionResponse) => {
      client.setAccessToken(session.accessToken);
      setUser(session.user);
    },
    [client],
  );

  const logout = useCallback(async () => {
    await client.request("/api/auth/logout", { method: "POST" }).catch(() => undefined);
    client.setAccessToken(undefined);
    setUser(undefined);
  }, [client]);

  useEffect(() => {
    if (bootstrapped.current) return;
    bootstrapped.current = true;
    // Recover an existing session from the refresh cookie on first load.
    void (async () => {
      if (await client.tryRefresh()) {
        try {
          const profile = await client.request<{
            id: string;
            nickname: string;
            phoneMasked: string;
          }>("/api/profile", { auth: true });
          setUser({ id: profile.id, nickname: profile.nickname, phone: profile.phoneMasked });
        } catch {
          client.setAccessToken(undefined);
        }
      }
      setReady(true);
    })();
  }, [client]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      ready,
      isAuthenticated: user !== undefined,
      client,
      applySession,
      logout,
    }),
    [user, ready, client, applySession, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
}
