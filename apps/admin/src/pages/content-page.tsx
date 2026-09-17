import { useEffect, useState } from "react";
import { App, Button, Card, Input, Space, Typography } from "antd";

import { ApiError, adminApiClient } from "../api/client.js";
import { hasPermission } from "../permissions/permissions.js";
import { useAdminAuth } from "../context/admin-auth-context.js";

interface ContentEntry {
  key: string;
  type: string;
  draftPayload: unknown;
  publishedPayload: unknown;
  version: number;
  status: string;
}

const contentKey = "home.hero";

export function ContentPage() {
  const { admin } = useAdminAuth();
  const { message } = App.useApp();
  const canUpdate = hasPermission(admin, "content:update");
  const canPublish = hasPermission(admin, "content:publish");
  const [entry, setEntry] = useState<ContentEntry | undefined>();
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const data = await adminApiClient.request<ContentEntry>(`/content/${contentKey}`);
      setEntry(data);
      setDraft(JSON.stringify(data.draftPayload, null, 2));
    } catch (cause) {
      message.error(cause instanceof ApiError ? cause.message : "内容加载失败");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function save() {
    if (!entry) return;
    let payload: unknown;
    try {
      payload = JSON.parse(draft);
    } catch {
      message.error("草稿不是合法的 JSON");
      return;
    }
    setSaving(true);
    try {
      const result = await adminApiClient.request<{ version: number }>(`/content/${contentKey}`, {
        method: "PUT",
        body: { payload, version: entry.version },
      });
      message.success("草稿已保存");
      setEntry({ ...entry, version: result.version, draftPayload: payload });
    } catch (cause) {
      if (cause instanceof ApiError && cause.code === "CONTENT_VERSION_CONFLICT") {
        message.warning("内容已被其他管理员更新，请重新加载后再保存");
        await load();
      } else {
        message.error(cause instanceof ApiError ? cause.message : "保存失败");
      }
    } finally {
      setSaving(false);
    }
  }

  async function publish() {
    setSaving(true);
    try {
      await adminApiClient.request(`/content/${contentKey}/publish`, {
        method: "POST",
        body: {},
      });
      message.success("已发布到门户");
      await load();
    } catch (cause) {
      message.error(cause instanceof ApiError ? cause.message : "发布失败");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <div className="page-title">
        <div>
          <Typography.Title level={2}>内容管理</Typography.Title>
          <p>编辑首页 Hero 草稿并发布。保存使用乐观锁，冲突时提示重新加载。</p>
        </div>
      </div>
      <Card loading={loading}>
        <Typography.Paragraph type="secondary">
          内容键：{contentKey}｜当前版本：{entry?.version ?? "-"}｜状态：{entry?.status ?? "-"}
        </Typography.Paragraph>
        <Input.TextArea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          rows={14}
          disabled={!canUpdate}
        />
        <Space style={{ marginTop: 16 }}>
          <Button type="primary" loading={saving} disabled={!canUpdate} onClick={() => void save()}>
            保存草稿
          </Button>
          <Button loading={saving} disabled={!canPublish} onClick={() => void publish()}>
            发布
          </Button>
        </Space>
      </Card>
    </div>
  );
}
