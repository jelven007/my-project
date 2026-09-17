import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type {
  Car,
  CreateOrderRequest,
  CreateTestDriveRequest,
  Dealer,
  Order,
  TestDrive,
} from "@xiaomi-car/contracts";

import { apiClient } from "./client.js";

export function useCars() {
  return useQuery({
    queryKey: ["cars"],
    queryFn: () => apiClient.request<{ items: Car[] }>("/api/cars"),
    select: (data) => data.items,
  });
}

export function useCar(slug: string | undefined) {
  return useQuery({
    queryKey: ["car", slug],
    enabled: Boolean(slug),
    queryFn: () => apiClient.request<Car>(`/api/cars/${slug}`),
  });
}

export function useDealers(params: {
  city?: string;
  carId?: string;
  orderableOnly?: boolean;
  enabled?: boolean;
}) {
  const search = new URLSearchParams();
  if (params.city) search.set("city", params.city);
  if (params.carId) search.set("carId", params.carId);
  if (params.orderableOnly) search.set("orderableOnly", "true");
  const query = search.toString();
  return useQuery({
    queryKey: ["dealers", params],
    enabled: params.enabled ?? true,
    queryFn: () => apiClient.request<{ items: Dealer[] }>(`/api/dealers${query ? `?${query}` : ""}`),
    select: (data) => data.items,
  });
}

export function useMyOrders() {
  return useQuery({
    queryKey: ["orders"],
    queryFn: () => apiClient.request<{ items: Order[] }>("/api/orders", { auth: true }),
    select: (data) => data.items,
  });
}

export function useCreateOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateOrderRequest) => {
      const idempotencyKey =
        globalThis.crypto?.randomUUID?.() ?? `order-${Date.now()}-${Math.random()}`;
      return apiClient.request<Order>("/api/orders", {
        method: "POST",
        auth: true,
        body: input,
        headers: { "Idempotency-Key": idempotencyKey },
      });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["orders"] }),
  });
}

export function useCancelOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (orderId: string) =>
      apiClient.request<Order>(`/api/orders/${orderId}/cancel`, {
        method: "POST",
        auth: true,
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["orders"] }),
  });
}

export function useCreateTestDrive() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateTestDriveRequest) =>
      apiClient.request<TestDrive>("/api/test-drives", {
        method: "POST",
        auth: true,
        body: input,
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["test-drives"] }),
  });
}
