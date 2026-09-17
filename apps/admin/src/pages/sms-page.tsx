import { Table, Typography } from "antd";

import { useAdminList } from "../api/use-admin-list.js";

interface SmsDelivery {
  requestId: string;
  phone: string;
  scene: string;
  provider: string;
  status: string;
  errorCode: string | null;
  createdAt: string;
}

export function SmsPage() {
  const deliveries = useAdminList<SmsDelivery>("/sms-deliveries");

  return (
    <div>
      <div className="page-title">
        <div>
          <Typography.Title level={2}>短信监控</Typography.Title>
          <p>只读查看发送与送达状态，系统不提供发送任意短信的能力，且不展示验证码与完整手机号。</p>
        </div>
      </div>
      <Table<SmsDelivery>
        rowKey="requestId"
        loading={deliveries.loading}
        dataSource={deliveries.items}
        pagination={{ pageSize: 20 }}
        columns={[
          { title: "RequestId", dataIndex: "requestId" },
          { title: "手机号", dataIndex: "phone" },
          { title: "场景", dataIndex: "scene" },
          { title: "服务商", dataIndex: "provider" },
          { title: "状态", dataIndex: "status" },
          { title: "错误码", dataIndex: "errorCode", render: (value: string | null) => value ?? "—" },
        ]}
      />
    </div>
  );
}
