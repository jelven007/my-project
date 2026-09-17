export interface ApiErrorBody {
  code: string;
  message: string;
  requestId?: string;
  details?: unknown;
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly requestId?: string,
    public readonly retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

type TokenListener = (accessToken: string | undefined) => void;

/**
 * Portal API client. The access token lives only in memory; the refresh token
 * is an HttpOnly cookie the browser attaches to `/api/auth` automatically. A
 * single-flight refresh recovers expired access tokens transparently.
 */
export class ApiClient {
  private accessToken: string | undefined;
  private refreshing: Promise<boolean> | undefined;
  private readonly listeners = new Set<TokenListener>();

  constructor(private readonly baseUrl = "") {}

  setAccessToken(token: string | undefined): void {
    this.accessToken = token;
    for (const listener of this.listeners) listener(token);
  }

  onTokenChange(listener: TokenListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  get authenticated(): boolean {
    return this.accessToken !== undefined;
  }

  async request<T>(
    path: string,
    options: {
      method?: string;
      body?: unknown;
      auth?: boolean;
      retry?: boolean;
      headers?: Record<string, string>;
    } = {},
  ): Promise<T> {
    const { method = "GET", body, auth = false, retry = true } = options;
    const headers: Record<string, string> = { ...options.headers };
    if (body !== undefined) headers["Content-Type"] = "application/json";
    if (auth && this.accessToken) headers.Authorization = `Bearer ${this.accessToken}`;

    const response = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers,
      credentials: "include",
      body: body === undefined ? undefined : JSON.stringify(body),
    });

    if (response.status === 401 && auth && retry && (await this.tryRefresh())) {
      return this.request<T>(path, { ...options, retry: false });
    }

    if (!response.ok) {
      const payload = (await response.json().catch(() => undefined)) as
        | ApiErrorBody
        | undefined;
      const retryHeader = response.headers.get("retry-after");
      throw new ApiError(
        response.status,
        payload?.code ?? "REQUEST_FAILED",
        payload?.message ?? "请求失败，请稍后重试",
        payload?.requestId,
        retryHeader ? Number(retryHeader) : undefined,
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
    try {
      const response = await fetch(`${this.baseUrl}/api/auth/refresh`, {
        method: "POST",
        credentials: "include",
      });
      if (!response.ok) {
        this.setAccessToken(undefined);
        return false;
      }
      const session = (await response.json()) as { accessToken: string };
      this.setAccessToken(session.accessToken);
      return true;
    } catch {
      this.setAccessToken(undefined);
      return false;
    }
  }
}

export const apiClient = new ApiClient();
