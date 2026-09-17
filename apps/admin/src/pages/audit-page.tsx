import { Table, Tag, Typography } from "antd";

import { useAdminList } from "../api/use-admin-list.js";
import { formatDateTime } from "../lib/format.js";

interface AuditLog {
  id: number;
  actorType: string;
  actorId: string | null;
  action: string;
  resourceType: string;
  resourceId: string | null;
  result: "success" | "failure" | "denied";
  ip: string | null;
  createdAt: string;
}

const resultColors: Record<string, string> = {
  success: "green",
  failure: "red",
  denied: "orange",
};

export function AuditPage() {
  const logs = useAdminList<AuditLog>("/audit-logs");

  return (
    <div>
      <div className="page-title">
        <div>
          <Typography.Title level={2}>审计中心</Typography.Title>
          <p>审计记录只追加、不可修改，涵盖登录、发布、权限与状态变更。</p>
        </div>
      </div>
      <Table<AuditLog>
        rowKey="id"
        loading={logs.loading}
        dataSource={logs.items}
        pagination={{ pageSize: 20 }}
        columns={[
          { title: "时间", dataIndex: "createdAt", render: (value: string) => formatDateTime(value) },
          { title: "操作者", dataIndex: "actorId", render: (value, row) => `${row.actorType}:${value ?? "-"}` },
          { title: "动作", dataIndex: "action" },
          {
            title: "资源",
            dataIndex: "resourceType",
            render: (value, row) => `${value}${row.resourceId ? `#${row.resourceId}` : ""}`,
          },
          {
            title: "结果",
            dataIndex: "result",
            render: (value: string) => <Tag color={resultColors[value]}>{value}</Tag>,
          },
          { title: "IP", dataIndex: "ip", render: (value: string | null) => value ?? "—" },
        ]}
      />
    </div>
  );
}
