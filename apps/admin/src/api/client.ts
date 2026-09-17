export interface ApiErrorBody {
  code: string;
  message: string;
  requestId?: string;
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly requestId?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

function readCsrfCookie(): string | undefined {
  const match = document.cookie
    .split("; ")
    .find((entry) => entry.startsWith("xiaomi_admin_csrf="));
  return match?.split("=")[1];
}

/**
 * Admin API client. Access tokens stay in memory; refresh and CSRF tokens live
 * in cookies scoped to `/api/admin`. Mutations attach the double-submit CSRF
 * header, and a single-flight refresh recovers expired sessions.
 */
export class AdminApiClient {
  private accessToken: string | undefined;
  private csrfToken: string | undefined;
  private refreshing: Promise<boolean> | undefined;

  constructor(private readonly baseUrl = "") {}

  setAccessToken(token: string | undefined): void {
    this.accessToken = token;
    if (token === undefined) this.csrfToken = undefined;
  }

  setSession(accessToken: string, csrfToken: string): void {
    this.accessToken = accessToken;
    this.csrfToken = csrfToken;
  }

  clearSession(): void {
    this.accessToken = undefined;
    this.csrfToken = undefined;
  }

  get authenticated(): boolean {
    return this.accessToken !== undefined;
  }

  hasRefreshSession(): boolean {
    return this.csrfToken !== undefined || readCsrfCookie() !== undefined;
  }

  async request<T>(
    path: string,
    options: { method?: string; body?: unknown; retry?: boolean } = {},
  ): Promise<T> {
    const { method = "GET", body, retry = true } = options;
    const mutation = !["GET", "HEAD", "OPTIONS"].includes(method);
    const headers: Record<string, string> = {};
    if (body !== undefined) headers["Content-Type"] = "application/json";
    if (this.accessToken) headers.Authorization = `Bearer ${this.accessToken}`;
    if (mutation) {
      const csrf = this.csrfToken ?? readCsrfCookie();
      if (csrf) headers["x-csrf-token"] = csrf;
    }

    const response = await fetch(`${this.baseUrl}/api/admin${path}`, {
      method,
      headers,
      credentials: "include",
      body: body === undefined ? undefined : JSON.stringify(body),
    });

    if (response.status === 401 && retry && (await this.tryRefresh())) {
      return this.request<T>(path, { ...options, retry: false });
    }

    if (!response.ok) {
      const payload = (await response.json().catch(() => undefined)) as
        | ApiErrorBody
        | undefined;
      throw new ApiError(
        response.status,
        payload?.code ?? "REQUEST_FAILED",
        payload?.message ?? "请求失败，请稍后重试",
        payload?.requestId,
      );
    }

    if (response.status === 204) return undefined as T;
    return (await response.json()) as T;
  }

  async tryRefresh(): Promise<boolean> {
    this.refreshing ??= this.performRefresh().finally(() => {
      this.refreshing = undefined;
    });
    return this.refreshing;
  }

  private async performRefresh(): Promise<boolean> {
    const csrf = this.csrfToken ?? readCsrfCookie();
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 5000);
    try {
      const response = await fetch(`${this.baseUrl}/api/admin/auth/refresh`, {
        method: "POST",
        credentials: "include",
        signal: controller.signal,
        headers: {
          Origin: window.location.origin,
          ...(csrf ? { "x-csrf-token": csrf } : {}),
        },
      });
      if (!response.ok) {
        this.clearSession();
        return false;
      }
      const session = (await response.json()) as {
        accessToken: string;
        csrfToken: string;
      };
      this.setSession(session.accessToken, session.csrfToken);
      return true;
    } catch {
      this.clearSession();
      return false;
    } finally {
      window.clearTimeout(timeout);
    }
  }
}

export const adminApiClient = new AdminApiClient();
