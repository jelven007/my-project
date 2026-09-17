import { Navigate, Route, Routes } from "react-router-dom";

import { useAdminAuth } from "./context/admin-auth-context.js";
import { AdminLayout } from "./layouts/admin-layout.js";
import { hasPermission } from "./permissions/permissions.js";
import { AuditPage } from "./pages/audit-page.js";
import { CarsPage } from "./pages/cars-page.js";
import { ContentPage } from "./pages/content-page.js";
import { DashboardPage } from "./pages/dashboard-page.js";
import { InventoryPage } from "./pages/inventory-page.js";
import { LoginPage } from "./pages/login-page.js";
import { OrdersPage } from "./pages/orders-page.js";
import { SmsPage } from "./pages/sms-page.js";
import { TestDrivesPage } from "./pages/test-drives-page.js";
import { UsersPage } from "./pages/users-page.js";

const routes = [
  { path: "/dashboard", permission: "dashboard:read", element: <DashboardPage /> },
  { path: "/content", permission: "content:read", element: <ContentPage /> },
  { path: "/cars", permission: "cars:read", element: <CarsPage /> },
  { path: "/inventory", permission: "inventory:read", element: <InventoryPage /> },
  { path: "/orders", permission: "orders:read", element: <OrdersPage /> },
  { path: "/users", permission: "users:read", element: <UsersPage /> },
  { path: "/test-drives", permission: "test_drive:read", element: <TestDrivesPage /> },
  { path: "/sms", permission: "sms:read", element: <SmsPage /> },
  { path: "/audit", permission: "audit:read", element: <AuditPage /> },
] as const;

export function App() {
  const { admin, ready, isAuthenticated } = useAdminAuth();

  if (!ready) return <div className="admin-loading">正在校验登录状态…</div>;
  if (!isAuthenticated) return <LoginPage />;

  const landing = routes.find((route) => hasPermission(admin, route.permission));

  return (
    <AdminLayout>
      <Routes>
        {routes.map((route) =>
          hasPermission(admin, route.permission) ? (
            <Route key={route.path} path={route.path} element={route.element} />
          ) : null,
        )}
        <Route path="*" element={<Navigate replace to={landing?.path ?? "/dashboard"} />} />
      </Routes>
    </AdminLayout>
  );
}
