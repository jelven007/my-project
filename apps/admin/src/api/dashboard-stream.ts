import { useEffect, useRef, useState } from "react";

export interface DashboardSnapshot {
  totalUsers: number;
  todayUsers: number;
  totalOrders: number;
  todayOrders: number;
  pendingTestDrives: number;
  updatedAt: string;
}

export type ConnectionMode = "connecting" | "live" | "polling";

interface DashboardStreamState {
  snapshot: DashboardSnapshot | undefined;
  mode: ConnectionMode;
}

const pollFallbackMs = 30_000;

/**
 * Subscribes to the dashboard SSE stream and transparently falls back to 30s
 * polling when the stream errors, matching the admin spec's resilience rules.
 * Injectable fetch/EventSource factories keep the hook testable in jsdom.
 */
export function useDashboardStream(options?: {
  eventSourceFactory?: (url: string) => EventSourceLike;
  fetchSummary?: () => Promise<DashboardSnapshot>;
}): DashboardStreamState {
  const [snapshot, setSnapshot] = useState<DashboardSnapshot | undefined>();
  const [mode, setMode] = useState<ConnectionMode>("connecting");
  const pollTimer = useRef<ReturnType<typeof setInterval> | undefined>(undefined);

  useEffect(() => {
    const factory =
      options?.eventSourceFactory ??
      ((url: string) => new EventSource(url, { withCredentials: true }) as EventSourceLike);
    const fetchSummary =
      options?.fetchSummary ??
      (async () => {
        const response = await fetch("/api/admin/dashboard/summary", { credentials: "include" });
        if (!response.ok) throw new Error("summary request failed");
        return (await response.json()) as DashboardSnapshot;
      });

    let disposed = false;
    let source: EventSourceLike | undefined;

    const startPolling = () => {
      if (pollTimer.current) return;
      setMode("polling");
      const tick = () => {
        void fetchSummary()
          .then((data) => {
            if (!disposed) setSnapshot(data);
          })
          .catch(() => undefined);
      };
      tick();
      pollTimer.current = setInterval(tick, pollFallbackMs);
    };

    const stopPolling = () => {
      if (pollTimer.current) clearInterval(pollTimer.current);
      pollTimer.current = undefined;
    };

    try {
      source = factory("/api/admin/dashboard/events");
      source.onopen = () => {
        if (disposed) return;
        stopPolling();
        setMode("live");
      };
      source.addEventListener("metrics", (event) => {
        if (disposed) return;
        try {
          setSnapshot(JSON.parse(event.data) as DashboardSnapshot);
          setMode("live");
        } catch {
          // Ignore malformed frames; the next heartbeat/frame recovers state.
        }
      });
      source.onerror = () => {
        if (disposed) return;
        source?.close();
        startPolling();
      };
    } catch {
      startPolling();
    }

    return () => {
      disposed = true;
      source?.close();
      stopPolling();
    };
  }, [options?.eventSourceFactory, options?.fetchSummary]);

  return { snapshot, mode };
}

export interface EventSourceLike {
  onopen: ((event: unknown) => void) | null;
  onerror: ((event: unknown) => void) | null;
  addEventListener: (type: string, listener: (event: { data: string }) => void) => void;
  close: () => void;
}
