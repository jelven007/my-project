# 生产就绪检查清单（Production Readiness）

> 上线前逐项确认。标注「UAT」的项目依赖真实云资源与凭据，本地/CI 无法完全验证。

## 1. 配置与密钥

- [ ] 生产环境变量齐全，且 `NODE_ENV=production`。
- [ ] `SMS_PROVIDER=volcengine`、`WECHAT_PROVIDER=wechat`；配置校验拒绝任何 mock。
- [ ] 用户与管理员 JWT、SMS pepper、微信 state、管理员 MFA 加密密钥均为独立高熵值，且非 `local-`/`replace_` 默认值。
- [ ] 所有生产密钥仅存于火山引擎 Secret Manager，ECS 以最小权限只读注入。（UAT）
- [ ] `scripts/check-secrets.sh` 通过，仓库与构建产物中无凭据。

## 2. 数据与迁移

- [ ] `npm run db:migrate` 在生产库幂等执行成功；含 admin/RBAC/审计/媒体等全部迁移。
- [ ] RBAC 角色与权限已灌入；首个超级管理员经 CLI 创建并完成 TOTP。
- [ ] MySQL 8.0 双节点跨可用区，自动备份与 PITR 已开启。（UAT）
- [ ] 备份可恢复演练通过，恢复后主外键、状态与库存公式一致。（UAT）

## 3. 安全

- [ ] 全站强制 HTTPS；HSTS、严格 CSP、`X-Content-Type-Options` 等安全头生效。
- [ ] 门户与后台使用独立 CORS 白名单、独立 Cookie 名与签名密钥。
- [ ] 后台写操作校验 Origin 与双提交 CSRF；登录/MFA/刷新按账号与 IP 双维度限流。
- [ ] 敏感字段默认脱敏，完整查看需权限并写审计。
- [ ] WAF 接入 `api` 与 `admin`，短信/登录接口单独限频。（UAT）

## 4. 可观测性

- [ ] `/metrics` 暴露请求量、错误率与 P95；接入监控与告警。
- [ ] 日志经 `redact` 脱敏，request ID 贯穿 ALB、应用与审计日志。
- [ ] 管理员审计日志保留 ≥180 天，应用日志 30–90 天。（UAT）

## 5. 性能与容量

- [ ] `k6 run load/k6-smoke.js` 本地阈值通过。
- [ ] 稳定态（~50 RPS / 100 活跃用户）与峰值/突发（100 RPS / 200 并发）在类生产环境达标：P95 < 500ms，错误率 < 1%。（UAT）
- [ ] 常用后台筛选分页在 10 万审计 + 1 万订单下 P95 < 500ms，无无界全表扫描。（UAT）

## 6. 外部依赖（均为 UAT 阻塞项）

- [ ] 火山短信：消息组、已审核签名、注册/登录/绑定模板、状态回调令牌就绪。
- [ ] 微信 OAuth：AppID/Secret、固定回调路径与 WAF 访问控制。
- [ ] 对象存储 TOS：web/admin/media 分桶，生产桶开启版本控制。
- [ ] 多可用区故障切换演练通过。

## 7. 发布

- [ ] `./scripts/release-check.sh` 本地门禁通过。
- [ ] CI 完成 lint、typecheck、测试、构建、依赖审计、密钥扫描、迁移 dry-run 与容器构建。
- [ ] 发布可追踪提交、镜像、操作者、时间与回滚结果。
