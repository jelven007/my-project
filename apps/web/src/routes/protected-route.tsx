import { Navigate, useLocation } from "react-router-dom";
import type { ReactNode } from "react";

import { useAuth } from "../context/auth-context.js";

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { isAuthenticated, ready } = useAuth();
  const location = useLocation();

  if (!ready) return <div className="route-loading">正在校验登录状态…</div>;
  if (!isAuthenticated) {
    const returnTo = encodeURIComponent(location.pathname + location.search);
    return <Navigate replace to={`/login?returnTo=${returnTo}`} />;
  }
  return <>{children}</>;
}
