import { useState } from "react";
import { App, Button, Space, Table, Tag, Typography } from "antd";

import { ApiError, adminApiClient } from "../api/client.js";
import { useAdminList } from "../api/use-admin-list.js";
import { hasPermission } from "../permissions/permissions.js";
import { useAdminAuth } from "../context/admin-auth-context.js";

interface AdminOrder {
  orderNo: string;
  status: string;
  contactName: string;
  contactPhone: string;
  createdAt: string;
  carName: string;
  dealerName: string;
}

const statusColors: Record<string, string> = {
  pending_confirmation: "gold",
  confirmed: "green",
  cancelled: "default",
  expired: "default",
  completed: "blue",
};

const statusLabels: Record<string, string> = {
  pending_confirmation: "待确认",
  confirmed: "已确认",
  cancelled: "已取消",
  expired: "已过期",
  completed: "已完成",
};

const nextActions: Record<string, { label: string; status: string }[]> = {
  pending_confirmation: [
    { label: "确认", status: "confirmed" },
    { label: "取消", status: "cancelled" },
  ],
  confirmed: [
    { label: "完成", status: "completed" },
    { label: "取消", status: "cancelled" },
  ],
};

export function OrdersPage() {
  const { admin } = useAdminAuth();
  const { message } = App.useApp();
  const orders = useAdminList<AdminOrder>("/orders");
  const canUpdate = hasPermission(admin, "orders:update");
  const [pending, setPending] = useState<string | undefined>();

  async function updateStatus(orderNo: string, status: string) {
    setPending(orderNo);
    try {
      await adminApiClient.request(`/orders/${orderNo}`, { method: "PATCH", body: { status } });
      message.success("订单状态已更新");
      orders.reload();
    } catch (cause) {
      message.error(cause instanceof ApiError ? cause.message : "操作失败");
    } finally {
      setPending(undefined);
    }
  }

  return (
    <div>
      <div className="page-title">
        <div>
          <Typography.Title level={2}>订单管理</Typography.Title>
          <p>0 元下定订单的确认、完成与取消。手机号默认脱敏。</p>
        </div>
      </div>
      <Table<AdminOrder>
        rowKey="orderNo"
        loading={orders.loading}
        dataSource={orders.items}
        pagination={{ pageSize: 20 }}
        columns={[
          { title: "订单号", dataIndex: "orderNo" },
          { title: "车型", dataIndex: "carName" },
          { title: "经销商", dataIndex: "dealerName" },
          { title: "联系人", dataIndex: "contactName" },
          { title: "联系电话", dataIndex: "contactPhone" },
          {
            title: "状态",
            dataIndex: "status",
            render: (status: string) => (
              <Tag color={statusColors[status]}>{statusLabels[status] ?? status}</Tag>
            ),
          },
          {
            title: "操作",
            render: (_, record) =>
              canUpdate && nextActions[record.status] ? (
                <Space>
                  {nextActions[record.status]!.map((action) => (
                    <Button
                      key={action.status}
                      size="small"
                      danger={action.status === "cancelled"}
                      loading={pending === record.orderNo}
                      onClick={() => void updateStatus(record.orderNo, action.status)}
                    >
                      {action.label}
                    </Button>
                  ))}
                </Space>
              ) : (
                <Typography.Text type="secondary">—</Typography.Text>
              ),
          },
        ]}
      />
    </div>
  );
}
