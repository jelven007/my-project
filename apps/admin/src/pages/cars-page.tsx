import { useState } from "react";
import { App, Button, Space, Table, Tag, Typography } from "antd";

import { ApiError, adminApiClient } from "../api/client.js";
import { useAdminList } from "../api/use-admin-list.js";
import { hasPermission } from "../permissions/permissions.js";
import { useAdminAuth } from "../context/admin-auth-context.js";
import { formatPriceCents } from "../lib/format.js";

interface CarRow {
  id: number;
  slug: string;
  name: string;
  tagline: string;
  priceFrom: number;
  status: "draft" | "published" | "offline";
  sortOrder: number;
}

const statusLabels: Record<string, { color: string; text: string }> = {
  draft: { color: "default", text: "草稿" },
  published: { color: "green", text: "已发布" },
  offline: { color: "red", text: "已下线" },
};

export function CarsPage() {
  const { admin } = useAdminAuth();
  const { message } = App.useApp();
  const cars = useAdminList<CarRow>("/cars");
  const canPublish = hasPermission(admin, "cars:publish");
  const [pending, setPending] = useState<number | undefined>();

  async function transition(id: number, action: "publish" | "offline") {
    setPending(id);
    try {
      await adminApiClient.request(`/cars/${id}/${action}`, { method: "POST" });
      message.success(action === "publish" ? "车型已发布" : "车型已下线");
      cars.reload();
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
          <Typography.Title level={2}>车型管理</Typography.Title>
          <p>维护车型状态，下线仅隐藏门户入口，历史订单保留。</p>
        </div>
      </div>
      <Table<CarRow>
        rowKey="id"
        loading={cars.loading}
        dataSource={cars.items}
        pagination={false}
        columns={[
          { title: "名称", dataIndex: "name" },
          { title: "Slug", dataIndex: "slug" },
          { title: "标语", dataIndex: "tagline" },
          {
            title: "起售价",
            dataIndex: "priceFrom",
            render: (value: number) => formatPriceCents(value),
          },
          {
            title: "状态",
            dataIndex: "status",
            render: (status: string) => (
              <Tag color={statusLabels[status]?.color}>{statusLabels[status]?.text ?? status}</Tag>
            ),
          },
          {
            title: "操作",
            render: (_, record) =>
              canPublish ? (
                <Space>
                  {record.status !== "published" ? (
                    <Button
                      size="small"
                      loading={pending === record.id}
                      onClick={() => void transition(record.id, "publish")}
                    >
                      发布
                    </Button>
                  ) : (
                    <Button
                      size="small"
                      danger
                      loading={pending === record.id}
                      onClick={() => void transition(record.id, "offline")}
                    >
                      下线
                    </Button>
                  )}
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
