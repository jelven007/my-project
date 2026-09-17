import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { useDashboardStream, type EventSourceLike } from "./dashboard-stream.js";

function makeSource() {
  const listeners: Record<string, (event: { data: string }) => void> = {};
  const source: EventSourceLike & { emit: (type: string, data: string) => void; fail: () => void; open: () => void } = {
    onopen: null,
    onerror: null,
    addEventListener: (type, listener) => {
      listeners[type] = listener;
    },
    close: vi.fn(),
    emit: (type, data) => listeners[type]?.({ data }),
    open: () => source.onopen?.(undefined),
    fail: () => source.onerror?.(undefined),
  };
  return source;
}

const snapshot = {
  totalUsers: 5,
  todayUsers: 1,
  totalOrders: 2,
  todayOrders: 1,
  pendingTestDrives: 0,
  updatedAt: "2026-09-17T00:00:00.000Z",
};

describe("useDashboardStream", () => {
  it("shows live metrics from SSE frames", async () => {
    const source = makeSource();
    const { result } = renderHook(() =>
      useDashboardStream({ eventSourceFactory: () => source, fetchSummary: async () => snapshot }),
    );

    act(() => source.open());
    act(() => source.emit("metrics", JSON.stringify(snapshot)));

    await waitFor(() => expect(result.current.mode).toBe("live"));
    expect(result.current.snapshot?.totalUsers).toBe(5);
  });

  it("falls back to polling when the stream errors", async () => {
    const source = makeSource();
    const fetchSummary = vi.fn(async () => snapshot);
    const { result } = renderHook(() =>
      useDashboardStream({ eventSourceFactory: () => source, fetchSummary }),
    );

    act(() => source.fail());

    await waitFor(() => expect(result.current.mode).toBe("polling"));
    await waitFor(() => expect(fetchSummary).toHaveBeenCalled());
    expect(source.close).toHaveBeenCalled();
  });
});
