import { useState } from "react";
import { App, Button, Space, Table, Tag, Typography } from "antd";

import { ApiError, adminApiClient } from "../api/client.js";
import { useAdminList } from "../api/use-admin-list.js";
import { hasPermission } from "../permissions/permissions.js";
import { useAdminAuth } from "../context/admin-auth-context.js";

interface TestDrive {
  id: number;
  status: string;
  contactName: string;
  contactPhone: string;
  preferredDate: string;
  carName: string;
  dealerName: string;
}

const statusLabels: Record<string, string> = {
  submitted: "已提交",
  contacted: "已联系",
  scheduled: "已排期",
  completed: "已完成",
  cancelled: "已取消",
};

const nextActions: Record<string, { label: string; status: string }[]> = {
  submitted: [
    { label: "认领联系", status: "contacted" },
    { label: "取消", status: "cancelled" },
  ],
  contacted: [
    { label: "排期", status: "scheduled" },
    { label: "取消", status: "cancelled" },
  ],
  scheduled: [
    { label: "完成", status: "completed" },
    { label: "取消", status: "cancelled" },
  ],
};

export function TestDrivesPage() {
  const { admin } = useAdminAuth();
  const { message } = App.useApp();
  const testDrives = useAdminList<TestDrive>("/test-drives");
  const canUpdate = hasPermission(admin, "test_drive:update");
  const [pending, setPending] = useState<number | undefined>();

  async function updateStatus(id: number, status: string) {
    setPending(id);
    try {
      await adminApiClient.request(`/test-drives/${id}`, { method: "PATCH", body: { status } });
      message.success("预约状态已更新");
      testDrives.reload();
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
          <Typography.Title level={2}>试驾预约</Typography.Title>
          <p>认领、排期与完成预约，内部备注不会展示在门户。</p>
        </div>
      </div>
      <Table<TestDrive>
        rowKey="id"
        loading={testDrives.loading}
        dataSource={testDrives.items}
        pagination={{ pageSize: 20 }}
        columns={[
          { title: "车型", dataIndex: "carName" },
          { title: "门店", dataIndex: "dealerName" },
          { title: "联系人", dataIndex: "contactName" },
          { title: "联系电话", dataIndex: "contactPhone" },
          { title: "期望日期", dataIndex: "preferredDate" },
          {
            title: "状态",
            dataIndex: "status",
            render: (status: string) => <Tag>{statusLabels[status] ?? status}</Tag>,
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
                      loading={pending === record.id}
                      onClick={() => void updateStatus(record.id, action.status)}
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
