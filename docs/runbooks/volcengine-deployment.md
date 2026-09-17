# 火山引擎部署运行手册（Volcengine Deployment）

> 与 [部署技术方案](../architecture/2026-09-17-volcengine-deployment-technical-design.md) 配套，描述从构建到发布与回滚的操作步骤。云资源准备与真实凭据属于 UAT/生产阶段事项。

## 1. 拓扑回顾

- `www.example.com` → CDN → TOS（门户静态资源）
- `admin.example.com` → CDN → TOS（后台静态资源）
- `api.example.com/api/*` → WAF → ALB → ECS（无状态 Express API）
- MySQL 8.0 双节点跨可用区；Redis 用于限流与短时协调；TOS 存媒体与前端产物。

## 2. 构建不可变产物

```bash
# API 运行镜像（多阶段、非 root、含健康检查、无 devDependencies）
docker build -f server/Dockerfile -t <registry>/xiaomi-car-api:<git-sha> .

# 前端静态镜像（nginx 提供 SPA history 回退与资源缓存策略）
docker build -f apps/web/Dockerfile   -t <registry>/xiaomi-car-web:<git-sha> .
docker build -f apps/admin/Dockerfile -t <registry>/xiaomi-car-admin:<git-sha> .
```

镜像 tag 使用 git SHA，保证可追溯与可回滚。

## 3. 配置与密钥（UAT/生产）

- 所有密钥仅存火山引擎 Secret Manager；ECS 通过最小权限角色只读注入，页面与 API 不得回显。
- 必填：用户/管理员 JWT（access+refresh，各自独立）、SMS pepper、微信 state、管理员 MFA 加密密钥、火山短信 AK/SK 与模板、微信 AppID/Secret。
- `NODE_ENV=production` 时配置校验强制拒绝 mock provider 与默认占位密钥。

## 4. 数据库迁移

```bash
# 在具备生产库访问权限的跳板/任务中执行
npm run db:migrate
```

迁移在事务中逐个应用并记录到 `schema_migrations`，可重复执行且幂等。

## 5. 发布流程

1. CI 通过（lint、typecheck、测试含 DB 集成、构建、依赖审计、密钥扫描、容器构建）。
2. 推送镜像到镜像仓库。
3. 上传前端产物到对应 TOS 前缀（保留上一版本前缀以便回切）。
4. 滚动更新 ECS 上的 API 镜像；ALB 依据 `/health/ready` 摘除未就绪实例。
5. 刷新 CDN 上的 HTML 与入口缓存（指纹资源长缓存无需刷新）。
6. 冒烟：登录 + 0 元下定 + 后台处理，用同一 request ID 贯穿 ALB、应用与审计日志。

## 6. 回滚

- 前端：将 CDN 指向上一 TOS 前缀并刷新 HTML 缓存，用户获得完整旧版本。
- API：回滚到上一镜像 tag；数据库迁移遵循向后兼容，必要时执行补偿迁移。
- 配置：通过 Secret Manager 版本回退，全过程可审计且不暴露明文。

## 7. 发布后检查

- Dashboard 指标、TLS 日志、审计记录与告警状态正常。
- 错误率与 P95 在阈值内（P95 < 500ms，错误率 < 1%）。
- 短信成功率与微信回调无异常告警。

## 8. UAT 阻塞项（本地/CI 无法验证）

- 火山短信真实下发与状态回调、微信 OAuth 真实回调。
- TOS 分桶与版本控制、WAF 规则、多可用区故障切换、备份恢复演练、完整 100 用户负载测试。
