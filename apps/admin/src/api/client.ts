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
  private refreshing: Promise<boolean> | undefined;

  constructor(private readonly baseUrl = "") {}

  setAccessToken(token: string | undefined): void {
    this.accessToken = token;
  }

  get authenticated(): boolean {
    return this.accessToken !== undefined;
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
      const csrf = readCsrfCookie();
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
    const csrf = readCsrfCookie();
    try {
      const response = await fetch(`${this.baseUrl}/api/admin/auth/refresh`, {
        method: "POST",
        credentials: "include",
        headers: {
          Origin: window.location.origin,
          ...(csrf ? { "x-csrf-token": csrf } : {}),
        },
      });
      if (!response.ok) {
        this.accessToken = undefined;
        return false;
      }
      const session = (await response.json()) as { accessToken: string };
      this.accessToken = session.accessToken;
      return true;
    } catch {
      this.accessToken = undefined;
      return false;
    }
  }
}

export const adminApiClient = new AdminApiClient();
