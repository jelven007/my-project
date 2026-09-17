import { Badge, Card, Col, Row, Statistic, Typography } from "antd";

import { useDashboardStream } from "../api/dashboard-stream.js";

const connectionLabels = {
  connecting: { status: "processing" as const, text: "连接中" },
  live: { status: "success" as const, text: "实时" },
  polling: { status: "warning" as const, text: "轮询回退" },
};

export function DashboardPage() {
  const { snapshot, mode } = useDashboardStream();
  const connection = connectionLabels[mode];

  return (
    <div>
      <div className="page-title">
        <div>
          <Typography.Title level={2}>工作台</Typography.Title>
          <p>
            <Badge status={connection.status} /> 指标{connection.text}
            {snapshot ? ` · 更新于 ${new Date(snapshot.updatedAt).toLocaleTimeString("zh-CN")}` : ""}
          </p>
        </div>
      </div>
      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic title="注册用户总数" value={snapshot?.totalUsers ?? 0} />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic title="今日新增用户" value={snapshot?.todayUsers ?? 0} />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic title="0 元下定总数" value={snapshot?.totalOrders ?? 0} />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic title="今日下定" value={snapshot?.todayOrders ?? 0} />
          </Card>
        </Col>
      </Row>
      <Card style={{ marginTop: 16 }}>
        <Statistic title="待处理预约" value={snapshot?.pendingTestDrives ?? 0} />
      </Card>
    </div>
  );
}
