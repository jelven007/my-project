import { useMemo } from "react";
import {
  AppstoreOutlined,
  AuditOutlined,
  CarOutlined,
  DatabaseOutlined,
  FileTextOutlined,
  MessageOutlined,
  ProfileOutlined,
  ShoppingOutlined,
  TeamOutlined,
} from "@ant-design/icons";
import { Button, Layout, Menu, Space, Typography } from "antd";
import { Link, useLocation } from "react-router-dom";
import type { ReactNode } from "react";

import { useAdminAuth } from "../context/admin-auth-context.js";
import { visibleNavItems } from "../permissions/permissions.js";

const { Sider, Header, Content } = Layout;

const icons: Record<string, ReactNode> = {
  dashboard: <AppstoreOutlined />,
  content: <FileTextOutlined />,
  cars: <CarOutlined />,
  inventory: <DatabaseOutlined />,
  orders: <ShoppingOutlined />,
  users: <TeamOutlined />,
  "test-drives": <ProfileOutlined />,
  sms: <MessageOutlined />,
  audit: <AuditOutlined />,
};

export function AdminLayout({ children }: { children: ReactNode }) {
  const { admin, logout } = useAdminAuth();
  const location = useLocation();
  const selectedKey = location.pathname.split("/")[1] || "dashboard";

  const menuItems = useMemo(
    () =>
      visibleNavItems(admin).map((item) => ({
        key: item.key,
        icon: icons[item.key],
        label: <Link to={`/${item.key}`}>{item.label}</Link>,
      })),
    [admin],
  );

  return (
    <Layout className="admin-shell">
      <Sider width={224} theme="light">
        <div className="admin-brand">
          <span>MI</span>
          <strong>汽车运营中心</strong>
        </div>
        <Menu mode="inline" selectedKeys={[selectedKey]} items={menuItems} />
      </Sider>
      <Layout>
        <Header className="admin-header">
          <Typography.Text type="secondary">
            {admin?.roles.join("、")}
          </Typography.Text>
          <Space>
            <span>{admin?.displayName}</span>
            <Button size="small" onClick={() => void logout()}>
              退出
            </Button>
          </Space>
        </Header>
        <Content className="admin-content">{children}</Content>
      </Layout>
    </Layout>
  );
}
