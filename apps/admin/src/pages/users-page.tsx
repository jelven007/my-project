import { useState } from "react";
import { App, Button, Popconfirm, Space, Table, Tag, Typography } from "antd";

import { ApiError, adminApiClient } from "../api/client.js";
import { useAdminList } from "../api/use-admin-list.js";
import { hasPermission } from "../permissions/permissions.js";
import { useAdminAuth } from "../context/admin-auth-context.js";

interface AdminUser {
  id: number;
  phone: string;
  nickname: string;
  status: number;
  lastLoginAt: string | null;
  createdAt: string;
}

export function UsersPage() {
  const { admin } = useAdminAuth();
  const { message } = App.useApp();
  const users = useAdminList<AdminUser>("/users");
  const canUpdate = hasPermission(admin, "users:update");
  const [pending, setPending] = useState<number | undefined>();

  async function run(id: number, action: () => Promise<unknown>, ok: string) {
    setPending(id);
    try {
      await action();
      message.success(ok);
      users.reload();
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
          <Typography.Title level={2}>用户管理</Typography.Title>
          <p>手机号默认脱敏，禁用用户会立即吊销其登录会话。</p>
        </div>
      </div>
      <Table<AdminUser>
        rowKey="id"
        loading={users.loading}
        dataSource={users.items}
        pagination={{ pageSize: 20 }}
        columns={[
          { title: "ID", dataIndex: "id" },
          { title: "昵称", dataIndex: "nickname" },
          { title: "手机号", dataIndex: "phone" },
          {
            title: "状态",
            dataIndex: "status",
            render: (status: number) => (
              <Tag color={status === 1 ? "green" : "red"}>{status === 1 ? "正常" : "已禁用"}</Tag>
            ),
          },
          {
            title: "操作",
            render: (_, record) =>
              canUpdate ? (
                <Space>
                  <Popconfirm
                    title={record.status === 1 ? "确认禁用该用户？" : "确认启用该用户？"}
                    okText="确认"
                    cancelText="取消"
                    onConfirm={() =>
                      void run(
                        record.id,
                        () =>
                          adminApiClient.request(`/users/${record.id}/status`, {
                            method: "PATCH",
                            body: { active: record.status !== 1 },
                          }),
                        "用户状态已更新",
                      )
                    }
                  >
                    <Button size="small" danger={record.status === 1} loading={pending === record.id}>
                      {record.status === 1 ? "禁用" : "启用"}
                    </Button>
                  </Popconfirm>
                  <Button
                    size="small"
                    onClick={() =>
                      void run(
                        record.id,
                        () =>
                          adminApiClient.request(`/users/${record.id}/revoke-sessions`, {
                            method: "POST",
                          }),
                        "已吊销全部会话",
                      )
                    }
                  >
                    吊销会话
                  </Button>
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
