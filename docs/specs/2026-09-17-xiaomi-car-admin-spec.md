# 小米汽车后台管理系统需求规格说明书

> **版本:** v1.4
> **日期:** 2026-09-18
> **状态:** 待评审
> **关联文档:** [门户网站 Spec](./2026-09-17-xiaomi-car-portal-spec.md) | [火山引擎部署技术方案](../architecture/2026-09-17-volcengine-deployment-technical-design.md) | [测试总计划](../testing/2026-09-17-test-plan.md)

---

## 1. 项目范围

### 1.1 目标
- 建设独立的运营管理后台,支撑门户网站内容运维。
- 管理首页、全局内容、车型资料和媒体资源。
- 人工维护经销商档案及各车型库存。
- 管理门户用户状态和试驾预约处理。
- 管理 0 元下定订单及库存占用。
- Dashboard 实时展示注册用户数和下定数。
- 提供短信发送状态与失败原因的只读运维视图,支撑真实注册短信链路排障。
- 提供管理员、角色、权限、MFA 和会话管理。
- 所有敏感操作可审计,内容支持草稿、预览、发布和版本回滚。

### 1.2 用户角色
| 角色 | 主要职责 |
|------|----------|
| `super_admin` | 管理全部功能、管理员和角色 |
| `content_editor` | 编辑内容、车型和媒体,不可发布 |
| `content_publisher` | 审核、发布和回滚内容 |
| `customer_service` | 查询用户并处理试驾预约 |
| `inventory_manager` | 维护经销商和车型库存 |
| `order_operator` | 查询、确认、取消和完成 0 元订单 |
| `auditor` | 只读查看审计日志和历史版本 |

### 1.3 非目标
- 支付、退款、发票和正式购车合同管理。
- 完整 CRM、客服工单或营销自动化。
- 与经销商 ERP/DMS 自动同步库存。
- 多租户和组织隔离。
- 首期内容双人审批与复杂工作流。
- 无审批的完整用户数据批量导出。

---

## 2. 架构与技术栈

| 层级 | 技术选型 |
|------|----------|
| 管理端 | React 18 + Vite |
| UI | Ant Design + CSS Modules |
| 路由 | React Router v6 |
| 数据状态 | TanStack Query |
| API | Node.js + Express REST API |
| 数据库 | MySQL 8.x |
| 数据访问 | mysql2 Promise + 参数化查询 |
| 认证 | 独立管理员 JWT + Refresh Token + TOTP MFA |
| 文件存储 | 火山引擎对象存储 TOS,开发环境本地目录 |
| 实时指标 | Server-Sent Events(SSE),30 秒轮询降级 |
| 校验与安全 | zod/express-validator、Helmet、CORS、Rate Limit、CSRF |

### 2.1 系统边界
```text
管理后台 React SPA (:5174)
          │ Admin Session + CSRF + RBAC
          ▼
Express /api/admin/* (:3001)
          │
          ├── MySQL 8.x (xiaomi_ev)
          └── 火山引擎对象存储 TOS

门户 React SPA (:5173)
          │ 仅读取 published 内容
          └── Express /api/*
```

- 管理后台与门户是两个独立构建产物,可部署到不同域名。
- 两端共享 API 服务和 MySQL,但账户表、Token 密钥、Cookie 和路由命名空间完全隔离。
- 管理端变更通过发布事务进入门户读取面,不得直接修改门户运行时状态。
- Dashboard 通过 SSE 接收指标快照,断线后自动重连;不支持 SSE 时退化为 30 秒轮询。

### 2.2 目录边界
```text
apps/admin/src/
├── api/
├── components/
├── layouts/
├── pages/
├── permissions/
└── routes/

server/
├── routes/admin/
├── middleware/adminAuth.js
├── middleware/csrf.js
├── middleware/audit.js
└── services/
```

---

## 3. 权限模型

### 3.1 RBAC
- 管理员可拥有多个角色,角色可拥有多个权限。
- 权限码格式:`资源:动作`,例如 `content:update`, `cars:publish`, `users:disable`。
- 前端根据权限隐藏导航与操作;后端对每个 API 再次校验。
- 操作者不得授予自身不具备的权限。
- 系统角色不可删除;最后一个有效超级管理员不可停用。

### 3.2 首期权限
| 模块 | 权限 |
|------|------|
| 工作台 | `dashboard:read` |
| 内容 | `content:read/update/preview/publish` |
| 车型 | `cars:read/create/update/publish` |
| 经销商 | `dealers:read/create/update` |
| 库存 | `inventory:read/update` |
| 订单 | `orders:read/update/export/pii` |
| 短信运维 | `sms:read` |
| 媒体 | `media:read/upload/delete` |
| 用户 | `users:read/update/pii` |
| 预约 | `test_drive:read/update/export/pii` |
| 管理员 | `admin:manage` |
| 角色 | `role:manage` |
| 审计 | `audit:read` |

---

## 4. 数据模型

### 4.1 admin_users
| 字段 | 说明 |
|------|------|
| id | BIGINT UNSIGNED 主键 |
| username / email | 唯一登录标识 |
| password_hash | bcrypt 哈希 |
| display_name | 展示名称 |
| status | active / disabled |
| mfa_secret_encrypted | 加密后的 TOTP 密钥 |
| failed_login_count / locked_until | 登录保护 |
| last_login_at | 最近登录 |
| created_at / updated_at | 审计时间 |

### 4.2 RBAC 表
- `roles`: `id`, `code`, `name`, `description`, `is_system`。
- `permissions`: `id`, `code`, `name`, `module`。
- `admin_user_roles`: `admin_user_id`, `role_id`,联合主键。
- `role_permissions`: `role_id`, `permission_id`,联合主键。

### 4.3 admin_refresh_tokens
`id`, `admin_user_id`, `token_hash`, `expires_at`, `revoked`, `ip`, `user_agent`, `created_at`。管理员停用、改密或登出时吊销相关会话。

### 4.4 content_entries
| 字段 | 说明 |
|------|------|
| id / content_key | 内容标识,如 `home.hero` |
| content_type | hero / section / navigation / footer / settings |
| draft_payload | 当前草稿 JSON |
| published_payload | 当前线上 JSON |
| version | 乐观锁版本 |
| status | draft / published |
| published_at | 最近发布时间 |
| updated_by / updated_at | 编辑审计 |

### 4.5 content_versions
`id`, `content_entry_id`, `version`, `payload`, `change_summary`, `published_by`, `created_at`。发布历史只追加、不覆盖。

### 4.6 cars
在门户车型字段基础上包含:
- `status`:draft / published / offline。
- `sort_order`, `published_at`。
- `created_by`, `updated_by`, `created_at`, `updated_at`。

详细车型展示字段与初始种子数据见[门户网站 Spec](./2026-09-17-xiaomi-car-portal-spec.md)。

### 4.7 media_assets
`id`, `storage_key`, `original_name`, `mime_type`, `size_bytes`, `width`, `height`, `alt_text`, `checksum`, `uploaded_by`, `created_at`, `deleted_at`。

### 4.8 test_drives 运维字段
在门户预约字段上增加 `assigned_admin_id`, `follow_up_note`, `updated_at`。状态为 `pending`, `contacted`, `scheduled`, `completed`, `cancelled`。

### 4.9 dealers
| 字段 | 说明 |
|------|------|
| id / code / name | 主键、唯一编码和名称 |
| province / city / address | 地址信息 |
| phone / business_hours | 联系电话与营业时间 |
| longitude / latitude | 地图坐标 |
| status | active / inactive |
| created_by / updated_by | 操作管理员 |
| created_at / updated_at | 审计时间 |

停用经销商后门户不再将其列为可选交付门店,且不能创建新订单;已有订单不自动取消。

### 4.10 dealer_inventory
| 字段 | 说明 |
|------|------|
| id / dealer_id / car_id | 库存及关联对象 |
| total_qty | 后台人工录入的库存总量 |
| reserved_qty | 有效 0 元订单占用数量 |
| version | 乐观锁版本号 |
| status | active / inactive |
| updated_by / updated_at | 最后操作信息 |

可用库存为 `total_qty - reserved_qty`。管理员只能修改 `total_qty`,不得直接修改 `reserved_qty`,且新总量不得低于已占用数量。

### 4.11 orders
| 字段 | 说明 |
|------|------|
| id / order_no | 主键与唯一订单号 |
| user_id / dealer_id / car_id / inventory_id | 关联用户、经销商、车型和库存 |
| amount | 固定为 0,单位分 |
| status | pending_confirmation / confirmed / cancelled / expired / completed |
| contact_name / contact_phone | 联系信息 |
| reservation_expires_at | 预留失效时间 |
| idempotency_key | 防重复下单 |
| handled_by / internal_note | 处理人和内部备注 |
| created_at / updated_at | 审计时间 |

### 4.12 audit_logs
`id`, `admin_user_id`, `action`, `resource_type`, `resource_id`, `request_id`, `ip`, `user_agent`, `before_data`, `after_data`, `created_at`。审计日志只追加,后台不可修改或删除。

### 4.13 sms_deliveries
`id`, `request_id`, `phone_masked`, `phone_hash`, `scene`, `provider`, `provider_message_id`, `status`, `error_code`, `sent_at`, `delivered_at`, `created_at`。只记录短信发送与送达状态,禁止保存验证码和完整手机号。

---

## 5. 页面与功能

### 5.1 设计规范
- 左侧导航、顶部上下文栏和主工作区。
- 默认语言为简体中文 `zh-CN`,日期、数字和统计口径使用 `Asia/Shanghai`。
- 适合数据扫描和重复操作,不使用门户营销式全屏设计。
- 表格支持分页、筛选、排序、关键字搜索和列状态。
- 高风险操作使用确认对话框;成功和失败提供明确反馈。
- 完整编辑体验最低支持 1280px;移动端仅要求基础查看。

### 5.2 登录 `/admin/login`
- 用户名或邮箱 + 密码。
- 超级管理员强制 TOTP;其他角色可配置强制。
- 首次超级管理员通过 CLI 创建,不提供公开注册。
- 锁定、密码错误和 MFA 错误使用安全提示。

### 5.3 工作台 `/admin`
- 实时指标卡:注册用户总数、今日新增用户、0 元下定总数、今日下定数。
- 指标由 SSE 在数据变化后或最多 5 秒内刷新;断线状态可见并自动切换 30 秒轮询。
- 用户与下定趋势支持最近 7 天/30 天查看,时区固定为 `Asia/Shanghai`。
- 注册用户数统计 `users` 全部已创建账户;下定数统计 `orders` 全部已创建订单,取消和过期订单仍计入累计数但在趋势中按状态拆分。
- 每个指标显示最后更新时间;SSE 心跳间隔不超过 20 秒。
- 待处理预约与状态分布。
- 已发布/草稿/下线车型数量。
- 最近内容发布和异常登录提醒。
- 指标按当前管理员权限裁剪。

### 5.4 内容管理
- 首页 Hero:图片、标题、副标题、CTA、排序和上下线时间。
- 全局内容:导航、页脚、客服电话、法律链接、SEO 标题/描述和站点设置。
- 编辑过程自动保存草稿,离开页面提示未保存变更。
- 预览使用短时效签名地址,仅管理员可访问。
- 发布前校验必填字段、链接、图片替代文本和关联资源状态。
- 支持历史版本、变更摘要和回滚;回滚生成新草稿。
- 使用 `version` 乐观锁防止多人编辑静默覆盖。

### 5.5 车型管理
- 新建、编辑、复制、排序、预览、发布和下线。
- 管理名称、slug、价格、参数、主图、画廊、卖点和详情。
- slug 全局唯一;已发布车型修改 slug 时提示链接风险。
- 被预约引用的车型不可物理删除,只能下线。
- 价格和核心参数变更必须记录审计。

### 5.6 经销商管理
- 新建、编辑、启用和停用经销商。
- 维护编码、名称、省市、地址、电话、营业时间和地图坐标。
- 经销商编码全局唯一;有关联订单的经销商不可删除。
- 停用前提示其在售库存和未完成订单数量。

### 5.7 库存管理
- 库存管理仅存在于后台管理系统;门户不提供库存管理页面,也不展示精确数量。
- 按城市、经销商、车型和状态筛选库存。
- 通过表单人工录入或调整 `total_qty`;不提供 ERP/DMS 自动同步。
- 显示总量、已占用、可用量和更新时间。
- 使用 `version` 乐观锁防止多人覆盖;调整后写入前后值审计。
- 总量不得小于已占用量;车型或经销商停用时禁止新增库存和下定。
- 同一经销商与车型仅允许一条有效库存记录。
- 首期不支持 Excel 批量导入,避免绕过逐条校验。

### 5.8 0 元订单管理
- 按订单号、状态、车型、经销商、手机号和下定时间筛选。
- 查看订单、用户、库存占用、预留截止时间和操作历史。
- 支持确认、取消、完成和添加内部备注;不提供收款操作。
- 取消或超时失效必须在事务中执行 `reserved_qty - 1`;完成订单同时执行 `total_qty - 1` 和 `reserved_qty - 1`,表示车辆完成线下交付。
- 联系电话默认脱敏,仅 `orders:pii` 可查看;CSV 导出需要 `orders:export`。
- 状态变更必须校验合法流转,不得将已取消/过期订单重新确认。

### 5.9 媒体库
- 上传 JPG、PNG、WebP,单文件默认不超过 15MB。
- 展示缩略图、尺寸、大小、上传人、时间和引用状态。
- 支持搜索、替代文本维护和复制 URL。
- 唯一存储键避免同名覆盖,校验和用于重复检测。
- 已被发布内容引用的文件不可删除;删除采用软删除。

### 5.10 用户管理
- 按用户 ID、脱敏手机号、昵称、注册时间和状态筛选。
- 查看注册时间、最近登录和预约摘要。
- 默认不展示完整手机号;仅 `users:pii` 可临时查看。
- 支持启用/禁用、解除异常锁定和吊销全部会话。
- 不允许查看密码或将密码重置为管理员已知值。

### 5.11 试驾预约
- 按状态、车型、城市、日期和跟进人筛选。
- 状态流转:`pending` → `contacted` → `scheduled` → `completed`;处理中可转 `cancelled`。
- 支持认领、转派、状态更新和内部备注。
- 联系电话默认脱敏,仅 `test_drive:pii` 可查看。
- CSV 导出需要 `test_drive:export`,导出动作写入审计。

### 5.12 管理员与角色
- 创建/停用管理员、分配角色、重置 MFA、吊销会话。
- 创建自定义角色并配置权限。
- 管理员不能停用自己或最后一个有效超级管理员。

### 5.13 审计中心
- 按管理员、操作、资源、时间和 IP 检索。
- 展示变更前后差异、请求 ID、IP 和 User-Agent。
- 审计记录只读,不提供编辑和删除接口。

### 5.14 短信发送监控
- 按脱敏手机号、业务场景、状态、错误码和时间筛选发送记录。
- 展示火山引擎 RequestId/MessageID、提交时间、送达时间和失败原因。
- 不展示或检索验证码明文,不提供后台人工发送任意短信能力。
- 仅 `sms:read` 可访问;查看记录不暴露完整手机号。
- 支持查看最近 24 小时成功率和失败趋势,连续异常触发运维告警。

---

## 6. 内容发布流程

```text
编辑草稿 → Schema 校验 → 签名预览 → 发布
                                      │
                                      ├── MySQL 事务切换线上版本
                                      ├── 写入 content_versions
                                      ├── 写入 audit_logs
                                      └── 失效门户缓存

历史版本 → 差异查看 → 回滚为新草稿 → 再发布
```

- 发布失败时保持原线上版本不变。
- 门户只能读取 `published_payload` 和 `published` 车型。
- 发布后门户缓存需在 60 秒内失效。
- 并发版本不一致返回 `409 CONTENT_VERSION_CONFLICT`。

### 6.1 库存与订单流程
```text
管理员录入库存总量
        │
用户 0 元下定 → 锁定库存行 → 校验可用量 → reserved_qty + 1 → 创建订单
        │
        ├── 后台确认 → confirmed → 完成交付 → total_qty - 1 且 reserved_qty - 1
        ├── 用户/后台取消 → cancelled → reserved_qty - 1
        └── 预留超时 → expired → reserved_qty - 1
```

- 订单创建、取消和超时释放必须使用 MySQL 事务与行锁。
- 定时任务扫描过期订单,重复执行不应重复释放库存。
- 库存人工调整使用乐观锁;版本冲突返回 `409 INVENTORY_VERSION_CONFLICT`。
- 订单或用户创建事务提交后,Dashboard 最迟 5 秒内推送新指标。

---

## 7. 管理端认证与安全

### 7.1 会话
- 管理员账户与门户用户完全分表。
- Access Token 有效期 10 分钟;Refresh Token 最长 8 小时。
- Refresh Token 只存 `HttpOnly + Secure + SameSite=Strict` Cookie并旋转使用。
- 状态变更请求校验 CSRF Token 和 Origin。
- 管理员停用、改密、登出时吊销相关会话。

### 7.2 登录保护
- 连续 5 次密码失败锁定 30 分钟。
- 登录、MFA 和刷新按账号及 IP 双维度限流。
- 超级管理员强制 TOTP MFA,恢复码只展示一次并哈希存储。
- 登录成功/失败、MFA 失败、权限拒绝和会话吊销均写入审计。
- 生产环境支持后台域名 IP 白名单或零信任网关。

### 7.3 数据与文件安全
- 所有 SQL 使用参数化查询。
- API 执行 Schema 校验和 RBAC 强制校验。
- 富文本按白名单净化,门户渲染时再次过滤。
- 上传校验文件头、真实 MIME、扩展名、大小和像素,禁止 SVG/HTML。
- 敏感字段默认脱敏,完整查看行为需权限并记录审计。
- 强制 HTTPS、独立 CORS 白名单和严格 CSP。
- 火山引擎短信访问凭据仅由 Secret Manager 向服务端注入,后台页面和 API 不得返回。
- 短信状态报告必须校验高熵回调令牌、账号、消息组和业务关联,按 MessageID 防重放并幂等更新状态。回调体中的 `signature` 仅表示短信签名名称,不得当作请求验签字段。

---

## 8. API

统一前缀:`/api/admin`;统一错误:`{ code, message, requestId }`。列表统一接受 `page`, `pageSize`, `sort`, `keyword` 并返回 `{ items, pagination }`。

### 8.1 认证
| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/auth/login` | 密码登录,可能返回 MFA challenge |
| POST | `/auth/mfa/verify` | 验证 TOTP |
| POST | `/auth/refresh` | 旋转 Refresh Token |
| POST | `/auth/logout` | 吊销当前会话 |
| GET | `/auth/me` | 当前管理员、角色和权限 |

### 8.2 内容与车型
| 方法 | 路径 | 权限 |
|------|------|------|
| GET/PUT | `/content/:key` | `content:read/update` |
| POST | `/content/:key/preview` | `content:preview` |
| POST | `/content/:key/publish` | `content:publish` |
| GET | `/content/:key/versions` | `content:read` |
| POST | `/content/:key/rollback` | `content:publish` |
| GET/POST | `/cars` | `cars:read/create` |
| GET/PUT | `/cars/:id` | `cars:read/update` |
| POST | `/cars/:id/publish` | `cars:publish` |
| POST | `/cars/:id/offline` | `cars:publish` |

### 8.3 经销商、库存和订单
| 方法 | 路径 | 权限 |
|------|------|------|
| GET/POST | `/dealers` | `dealers:read/create` |
| GET/PUT | `/dealers/:id` | `dealers:read/update` |
| PATCH | `/dealers/:id/status` | `dealers:update` |
| GET | `/inventory` | `inventory:read` |
| PUT | `/inventory/:id` | `inventory:update`,携带 `version` |
| POST | `/inventory` | `inventory:update`,新建人工库存 |
| GET | `/orders`、`/orders/:orderNo` | `orders:read` |
| PATCH | `/orders/:orderNo` | `orders:update` |
| GET | `/orders/export` | `orders:export` |

### 8.4 媒体、用户和预约
| 方法 | 路径 | 权限 |
|------|------|------|
| GET/POST | `/media` | `media:read/upload` |
| DELETE | `/media/:id` | `media:delete` |
| GET | `/users`、`/users/:id` | `users:read` |
| PATCH | `/users/:id/status` | `users:update` |
| POST | `/users/:id/revoke-sessions` | `users:update` |
| GET | `/test-drives` | `test_drive:read` |
| PATCH | `/test-drives/:id` | `test_drive:update` |
| GET | `/test-drives/export` | `test_drive:export` |

### 8.5 Dashboard 与系统管理
| 方法 | 路径 | 权限 |
|------|------|------|
| GET | `/dashboard/summary` | `dashboard:read`,指标快照 |
| GET | `/dashboard/trends` | `dashboard:read`,7/30 天趋势 |
| GET | `/dashboard/events` | `dashboard:read`,SSE 实时指标 |
| GET | `/sms-deliveries` | `sms:read`,短信发送记录与成功率 |
| GET/POST/PATCH | `/admin-users` | `admin:manage` |
| GET/POST/PATCH | `/roles` | `role:manage` |
| GET | `/audit-logs` | `audit:read` |

---

## 9. 错误、并发与审计
- `401`:会话无效;`403`:权限不足;`409`:版本冲突;`422`:内容校验失败;`429`:限流。
- 所有写请求携带请求 ID,写入响应、应用日志和审计日志。
- 发布操作使用 MySQL 事务,失败后不得影响线上版本。
- 批量操作逐项返回成功或失败结果。
- 审计记录包含操作人、资源、动作、IP、前后值和时间。
- 业务错误返回可操作提示;系统错误不暴露堆栈和数据库信息。
- SSE 使用管理员 Cookie 会话,响应禁用缓存;发送心跳并支持自动重连。
- SSE 不可用时管理端每 30 秒调用 `/dashboard/summary`,不得同时重复轮询。

---

## 10. 验收标准

1. 管理后台可独立构建、部署和登录。
2. 门户用户凭证不能登录后台。
3. 超级管理员强制 MFA,暴力登录触发限流和锁定。
4. RBAC 同时控制前端入口和后端 API,越权请求返回 403。
5. 运营可编辑、预览、发布和回滚首页及全局内容。
6. 草稿不会被门户读取;发布失败时线上内容保持不变。
7. 多人编辑发生版本冲突时不会静默覆盖。
8. 车型可创建、编辑、排序、发布和下线。
9. 已被预约引用的车型只能下线,不能物理删除。
10. 媒体上传通过类型与内容校验,被引用资源不能删除。
11. 客服可筛选、认领和更新预约,状态流转符合规则。
12. 用户、订单和预约敏感信息默认脱敏,完整查看受权限控制。
13. 管理员、角色、权限、MFA 和会话可管理。
14. 最后一个超级管理员不能被停用。
15. 登录、发布、权限、用户状态和预约变更均生成不可修改审计日志。
16. 后台发布后,门户在 60 秒内展示新版本。
17. 管理员可人工创建和维护经销商,停用经销商后门户不再将其列为可选交付门店。
18. 管理员可逐条录入和调整车型库存,总量不能低于已占用量。
19. 多人同时调整库存时版本冲突不会静默覆盖。
20. 后台可查询和处理 0 元订单,取消或过期订单会释放库存。
21. 订单状态不能非法回退,后台不出现支付和退款操作。
22. Dashboard 展示注册用户总数、今日新增用户、下定总数和今日下定数。
23. 用户注册或成功下定后,Dashboard 指标在 5 秒内更新。
24. SSE 断开时可见并自动重连,不可用时以 30 秒轮询继续更新。
25. 后台可查看真实短信发送与送达状态,但不能查看验证码或完整手机号。
26. 短信状态报告经过回调令牌、账号、消息组和业务关联校验且可幂等处理,伪造回调不能修改状态。
27. 火山引擎短信服务失败率异常时产生监控告警。

### 10.1 测试
- 单元测试:RBAC、内容 Schema、库存计算、订单状态机、预约状态机、媒体校验和脱敏。
- API 集成测试:管理员认证、MFA、库存乐观锁、订单释放、短信状态报告来源校验与幂等、Dashboard 指标、SSE 鉴权和会话吊销。
- E2E:登录、短信记录查询、内容发布、经销商/库存录入、订单处理、Dashboard 实时刷新和角色配置。
- 安全测试:CSRF、存储型 XSS、恶意上传、IDOR、权限提升和暴力破解。

---

## 11. 本地运行
```bash
cp .env.example .env
npm install
npm run db:init
npm run server          # :3001
npm run dev:admin       # :5174
npm run admin:create    # 交互式创建首个超级管理员
```

关键环境变量:

```text
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=
DB_NAME=xiaomi_ev
ADMIN_JWT_ACCESS_SECRET=change_me_admin_access
ADMIN_JWT_REFRESH_SECRET=change_me_admin_refresh
ADMIN_ACCESS_TOKEN_TTL=10m
ADMIN_REFRESH_TOKEN_TTL=8h
ADMIN_ORIGIN=http://localhost:5174
MEDIA_STORAGE=local
MEDIA_MAX_SIZE_MB=15
DASHBOARD_SSE_INTERVAL_MS=5000
DASHBOARD_POLL_FALLBACK_MS=30000
ORDER_RESERVATION_HOURS=48
DEFAULT_LOCALE=zh-CN
APP_TIMEZONE=Asia/Shanghai
SMS_PROVIDER=volcengine
SMS_CODE_PEPPER=
VOLCENGINE_SMS_REGION=cn-north-1
VOLCENGINE_SMS_ACCOUNT=
VOLCENGINE_SMS_ACCESS_KEY_ID=
VOLCENGINE_SMS_SECRET_KEY=
VOLCENGINE_SMS_SIGN=
VOLCENGINE_SMS_REGISTER_TEMPLATE_ID=
VOLCENGINE_SMS_LOGIN_TEMPLATE_ID=
VOLCENGINE_SMS_BIND_TEMPLATE_ID=
VOLCENGINE_SMS_CALLBACK_TOKEN=
```

生产环境中的数据库口令、JWT 密钥、短信凭据、`SMS_CODE_PEPPER` 和微信 AppSecret 均由火山引擎 Secret Manager 注入,不得写入普通环境文件、镜像或流水线日志。生产部署拓扑、资源规格和开通服务清单见关联的火山引擎部署技术方案。

---

## 12. 后续扩展
- 内容发布双人审批和定时发布。
- 用户数据导出审批、水印与下载审计。
- 管理后台 SSO 和企业身份提供商集成。
- 更细粒度的数据范围权限和客服工单系统。
