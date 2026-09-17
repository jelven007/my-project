import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, type RenderOptions } from "@testing-library/react";
import { App as AntdApp, ConfigProvider } from "antd";
import type { ReactElement, ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";

import { AdminAuthProvider } from "../context/admin-auth-context.js";

export function renderAdmin(
  ui: ReactElement,
  { route = "/", ...options }: { route?: string } & RenderOptions = {},
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <ConfigProvider>
          <AntdApp>
            <MemoryRouter initialEntries={[route]}>
              <AdminAuthProvider>{children}</AdminAuthProvider>
            </MemoryRouter>
          </AntdApp>
        </ConfigProvider>
      </QueryClientProvider>
    );
  }

  return render(ui, { wrapper: Wrapper, ...options });
}
