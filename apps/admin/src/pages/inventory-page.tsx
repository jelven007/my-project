import { useState } from "react";
import { App, Button, Form, InputNumber, Modal, Table, Tag, Typography } from "antd";

import { ApiError, adminApiClient } from "../api/client.js";
import { useAdminList } from "../api/use-admin-list.js";
import { hasPermission } from "../permissions/permissions.js";
import { useAdminAuth } from "../context/admin-auth-context.js";

interface InventoryRow {
  id: number;
  dealerName: string;
  carName: string;
  totalQuantity: number;
  reservedQuantity: number;
  availableQuantity: number;
  version: number;
  status: "active" | "inactive";
}

export function InventoryPage() {
  const { admin } = useAdminAuth();
  const { message } = App.useApp();
  const inventory = useAdminList<InventoryRow>("/inventory");
  const canUpdate = hasPermission(admin, "inventory:update");
  const [editing, setEditing] = useState<InventoryRow | undefined>();
  const [form] = Form.useForm<{ totalQuantity: number }>();
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!editing) return;
    const values = await form.validateFields();
    setSaving(true);
    try {
      await adminApiClient.request(`/inventory/${editing.id}`, {
        method: "PUT",
        body: {
          totalQuantity: values.totalQuantity,
          status: editing.status,
          version: editing.version,
        },
      });
      message.success("库存已更新");
      setEditing(undefined);
      inventory.reload();
    } catch (cause) {
      message.error(cause instanceof ApiError ? cause.message : "更新失败");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <div className="page-title">
        <div>
          <Typography.Title level={2}>经销商与库存</Typography.Title>
          <p>使用乐观锁维护人工库存，占用量由订单流转自动管理。</p>
        </div>
      </div>
      <Table<InventoryRow>
        rowKey="id"
        loading={inventory.loading}
        dataSource={inventory.items}
        pagination={{ pageSize: 20 }}
        columns={[
          { title: "经销商", dataIndex: "dealerName" },
          { title: "车型", dataIndex: "carName" },
          { title: "总量", dataIndex: "totalQuantity" },
          { title: "已占用", dataIndex: "reservedQuantity" },
          { title: "可用", dataIndex: "availableQuantity" },
          {
            title: "状态",
            dataIndex: "status",
            render: (status: string) => (
              <Tag color={status === "active" ? "green" : "default"}>
                {status === "active" ? "在售" : "停用"}
              </Tag>
            ),
          },
          {
            title: "操作",
            render: (_, record) =>
              canUpdate ? (
                <Button
                  size="small"
                  onClick={() => {
                    setEditing(record);
                    form.setFieldsValue({ totalQuantity: record.totalQuantity });
                  }}
                >
                  调整库存
                </Button>
              ) : (
                <Typography.Text type="secondary">—</Typography.Text>
              ),
          },
        ]}
      />
      <Modal
        title="调整库存总量"
        open={editing !== undefined}
        onCancel={() => setEditing(undefined)}
        onOk={() => void save()}
        confirmLoading={saving}
        okText="保存"
        cancelText="取消"
      >
        <Form form={form} layout="vertical">
          <Form.Item
            label="库存总量"
            name="totalQuantity"
            rules={[{ required: true, type: "number", min: editing?.reservedQuantity ?? 0 }]}
            extra={`不得低于已占用 ${editing?.reservedQuantity ?? 0} 台`}
          >
            <InputNumber min={0} style={{ width: "100%" }} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
