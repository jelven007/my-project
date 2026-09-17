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

import { type AdminApiClient, adminApiClient } from "../api/client.js";
import type { AdminIdentity } from "../permissions/permissions.js";

interface AdminSessionResponse {
  accessToken: string;
  expiresIn: number;
  admin: AdminIdentity;
  csrfToken: string;
}

interface AdminAuthContextValue {
  admin: AdminIdentity | undefined;
  ready: boolean;
  isAuthenticated: boolean;
  client: AdminApiClient;
  applySession: (session: AdminSessionResponse) => void;
  logout: () => Promise<void>;
}

const AdminAuthContext = createContext<AdminAuthContextValue | undefined>(undefined);

export function AdminAuthProvider({
  children,
  client = adminApiClient,
}: {
  children: ReactNode;
  client?: AdminApiClient;
}) {
  const [admin, setAdmin] = useState<AdminIdentity | undefined>(undefined);
  const [ready, setReady] = useState(false);
  const bootstrapped = useRef(false);

  const applySession = useCallback((session: AdminSessionResponse) => {
    client.setAccessToken(session.accessToken);
    setAdmin(session.admin);
  }, [client]);

  const logout = useCallback(async () => {
    await client.request("/auth/logout", { method: "POST" }).catch(() => undefined);
    client.setAccessToken(undefined);
    setAdmin(undefined);
  }, [client]);

  useEffect(() => {
    if (bootstrapped.current) return;
    bootstrapped.current = true;
    void (async () => {
      if (await client.tryRefresh()) {
        try {
          const me = await client.request<{ admin: AdminIdentity }>("/auth/me");
          setAdmin(me.admin);
        } catch {
          client.setAccessToken(undefined);
        }
      }
      setReady(true);
    })();
  }, [client]);

  const value = useMemo<AdminAuthContextValue>(
    () => ({
      admin,
      ready,
      isAuthenticated: admin !== undefined,
      client,
      applySession,
      logout,
    }),
    [admin, ready, client, applySession, logout],
  );

  return <AdminAuthContext.Provider value={value}>{children}</AdminAuthContext.Provider>;
}

export function useAdminAuth(): AdminAuthContextValue {
  const context = useContext(AdminAuthContext);
  if (!context) throw new Error("useAdminAuth must be used within AdminAuthProvider");
  return context;
}
