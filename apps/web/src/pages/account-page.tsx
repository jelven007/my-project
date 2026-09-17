import { useState } from "react";

import { ApiError } from "../api/client.js";
import { useCancelOrder, useMyOrders } from "../api/hooks.js";
import { QueryState } from "../components/query-state.js";
import { useAuth } from "../context/auth-context.js";
import { formatDateTime, orderStatusLabel } from "../lib/format.js";

const cancellableStatuses = new Set(["pending_confirmation", "confirmed"]);

export function AccountPage() {
  const { user, logout } = useAuth();
  const orders = useMyOrders();
  const cancelOrder = useCancelOrder();
  const [error, setError] = useState<string | undefined>();

  async function cancel(orderId: string) {
    setError(undefined);
    try {
      await cancelOrder.mutateAsync(orderId);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "取消失败，请稍后重试");
    }
  }

  return (
    <main className="account">
      <header className="account-header">
        <div>
          <h1>个人中心</h1>
          <p>
            {user?.nickname}（{user?.phone}）
          </p>
        </div>
        <button type="button" onClick={() => void logout()}>
          退出登录
        </button>
      </header>

      <section>
        <h2>我的订单</h2>
        {error ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : null}
        <QueryState
          isLoading={orders.isLoading}
          isError={orders.isError}
          isEmpty={orders.data?.length === 0}
          onRetry={() => void orders.refetch()}
          emptyLabel="暂无订单，去看看现车吧"
        >
          <ul className="order-list">
            {orders.data?.map((order) => (
              <li key={order.id} className="order-card">
                <div>
                  <strong>订单号 {order.orderNo}</strong>
                  <span className={`status status-${order.status}`}>
                    {orderStatusLabel(order.status)}
                  </span>
                </div>
                <p>下定时间：{formatDateTime(order.createdAt)}</p>
                <p>保留至：{formatDateTime(order.reservationExpiresAt)}</p>
                {cancellableStatuses.has(order.status) ? (
                  <button
                    type="button"
                    onClick={() => void cancel(order.id)}
                    disabled={cancelOrder.isPending}
                  >
                    取消订单
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        </QueryState>
      </section>
    </main>
  );
}
