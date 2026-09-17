# 小米汽车门户网站需求规格说明书

> **版本:** v1.3
> **日期:** 2026-09-17
> **状态:** 待评审
> **关联文档:** [后台管理系统 Spec](./2026-09-17-xiaomi-car-admin-spec.md) | [火山引擎部署技术方案](../architecture/2026-09-17-volcengine-deployment-technical-design.md) | [测试总计划](../testing/2026-09-17-test-plan.md)

---

## 1. 项目范围

### 1.1 目标
- 建设面向潜在购车用户的小米汽车品牌门户网站。
- 展示真实车型、价格、参数、图片与品牌内容。
- 展示后台人工维护的经销商与车型库存。
- 支持手机号注册、密码/验证码登录、微信授权登录和个人中心。
- 支持登录用户提交试驾预约并查看预约进度。
- 支持 0 元下定,在无需支付的情况下创建限时库存预留订单。
- 默认语言为简体中文 `zh-CN`。
- 达到正式上线项目的认证、数据保护和响应式体验要求。

### 1.2 非目标
- 在线支付、付费定金、退款和正式购车合同。
- 完整车辆选配器。
- 与经销商 ERP/DMS 的库存自动同步;本期库存由后台人工录入。
- 微信以外的第三方登录。
- 中文以外的语言包和语言切换。
- 网站内容编辑与运维功能,该部分由后台管理系统负责。

---

## 2. 技术方案

| 层级 | 技术选型 |
|------|----------|
| 前端 | React 18 + Vite |
| 路由 | React Router v6 |
| 样式 | Tailwind CSS |
| 状态 | React Context + TanStack Query |
| 字体 | MiSans CDN + system-ui 回退 |
| API | Node.js + Express REST API |
| 数据库 | MySQL 8.x |
| 数据访问 | mysql2 Promise + 参数化查询 |
| 认证 | JWT Access Token + Refresh Token |
| 微信登录 | 微信开放平台网站应用 OAuth |
| 短信服务 | 火山引擎短信服务生产通道 + 可替换 SMS Provider 接口 |
| 密码 | bcrypt, cost=12 |
| 校验 | zod 或 express-validator |

### 2.1 目录边界
```text
apps/web/
└── src/
    ├── api/
    ├── components/
    ├── context/
    ├── pages/
    ├── routes/
    └── styles/

server/
├── routes/
│   ├── auth.routes.js
│   ├── cars.routes.js
│   ├── content.routes.js
│   ├── dealers.routes.js
│   ├── orders.routes.js
│   └── testdrive.routes.js
├── middleware/userAuth.js
└── services/
```

门户站为独立构建产物,开发端口 `5173`。它与后台管理系统共享 Express API 和 MySQL,但不共享登录入口、Token 密钥或前端运行时。

---

## 3. 数据模型

### 3.1 users
| 字段 | 类型 | 说明 |
|------|------|------|
| id | BIGINT UNSIGNED PK | 用户 ID |
| phone | VARCHAR(20) UNIQUE | 登录手机号 |
| nickname | VARCHAR(50) | 昵称 |
| password_hash | VARCHAR(100) NULL | bcrypt 哈希;微信首次登录且未设密码时为空 |
| email | VARCHAR(120) UNIQUE NULL | 可选邮箱 |
| status | TINYINT | 1 正常,0 禁用 |
| failed_login_count | INT | 连续登录失败数 |
| locked_until | DATETIME NULL | 锁定截止时间 |
| last_login_at | DATETIME NULL | 上次登录时间 |
| created_at / updated_at | DATETIME | 审计时间 |

### 3.2 sms_codes
`id`, `phone`, `code_hash`, `scene`, `send_status`, `expires_at`, `consumed`, `verify_attempts`, `created_at`。验证码有效期 5 分钟,使用服务端 Pepper 的 HMAC-SHA256 保存;同一验证码最多校验 5 次,且仅 `send_status=accepted` 可验证。

### 3.3 sms_deliveries
`id`, `request_id`, `phone_masked`, `phone_hash`, `scene`, `provider`, `provider_message_id`, `status`, `error_code`, `sent_at`, `delivered_at`, `created_at`。该表只记录发送和回执状态,不得保存验证码或完整手机号。

### 3.4 refresh_tokens
`id`, `user_id`, `token_hash`, `expires_at`, `revoked`, `created_at`。Refresh Token 有效期 7 天并支持旋转和吊销。

### 3.5 cars
| 字段 | 说明 |
|------|------|
| id / slug / name | 标识与名称 |
| tagline / description | 展示文案 |
| price_from | 起售价,单位元 |
| range_km | CLTC 续航 |
| acceleration | 零百加速 |
| max_power_ps / top_speed | 最大马力与最高时速 |
| body_type | 车身类型 |
| image_url / gallery | 主图与画廊 |
| highlights | 卖点 JSON |
| status / sort_order / published_at | 发布状态与排序 |

门户 API 只返回 `status=published` 的车型。

### 3.6 content_entries
门户只读取 `published_payload`,用于首页 Hero、核心技术、导航、页脚、客服电话、法律链接及 SEO 信息。草稿和历史版本由后台系统管理。

### 3.7 user_identities
`id`, `user_id`, `provider=wechat`, `provider_user_id`(OpenID), `union_id`, `profile_json`, `created_at`, `updated_at`。`provider + provider_user_id` 唯一。完成身份识别后不持久化微信 Access Token 或 Refresh Token。

微信首次登录必须通过短信绑定手机号后才能完成用户创建,因此 `users.phone` 仍为必填唯一字段。

### 3.8 dealers
`id`, `name`, `code`, `province`, `city`, `address`, `phone`, `longitude`, `latitude`, `business_hours`, `status`, `created_at`, `updated_at`。门户仅展示 `status=active` 的经销商。

### 3.9 dealer_inventory
`id`, `dealer_id`, `car_id`, `total_qty`, `reserved_qty`, `version`, `status`, `updated_at`。`dealer_id + car_id` 唯一;可用库存计算为 `total_qty - reserved_qty`,不得小于 0。

### 3.10 orders
| 字段 | 说明 |
|------|------|
| id / order_no | 主键与不可预测的唯一订单号 |
| user_id / dealer_id / car_id / inventory_id | 用户、经销商、车型与库存 |
| amount | 固定为 0,单位分 |
| status | pending_confirmation / confirmed / cancelled / expired / completed |
| contact_name / contact_phone | 联系信息 |
| reservation_expires_at | 库存预留失效时间 |
| idempotency_key | 防止重复下单 |
| created_at / updated_at | 审计时间 |

### 3.11 test_drives
`id`, `user_id`, `car_id`, `city`, `preferred_date`, `contact_phone`, `status`, `created_at`, `updated_at`。

---

## 4. 初始车型数据

> 来源:小米汽车官网 `xiaomiev.com`,抓取时间 2026-02。每个型号保留一款主力车型,后续数据由后台管理系统维护。

| 车型 | 起售价 | 核心参数 | 官网主图 |
|------|--------|----------|----------|
| 小米 SU7 | ¥219,900 | 720km CLTC,320PS | `https://s1.xiaomiev.com/activity-outer-assets/0328/images/su7_20260107/home.jpg` |
| 小米 YU7 | ¥235,500 | 835km CLTC,5.88s | `https://s1.xiaomiev.com/activity-outer-assets/0328/images/yu7_20250522/pc/home.jpg` |
| 小米 SU7 Ultra | ¥529,900 | 630km CLTC,1548PS,2.1s,350km/h | `https://s1.xiaomiev.com/activity-outer-assets/0328/images/Ultra_U/pc/ultra_2_2.jpg` |

价格、参数和图片地址集中维护,线上展示以数据库中的已发布版本为准。

---

## 5. 视觉与页面

### 5.1 设计语言
- 参考小米汽车官网,采用黑白极简主色和小米橙 `#FF6900` 强调色。
- 使用大面积高清车辆图片、留白和克制排版。
- 顶栏初始透明并使用白色文字;滚动后转为白色毛玻璃背景和黑色文字。
- 主按钮使用橙底白字,次按钮使用白底或透明描边。
- 桌面和移动端均需避免文字截断、内容遮挡和布局跳动。
- HTML `lang`、日期、数字、价格和表单提示默认使用简体中文 `zh-CN`。

### 5.2 全局导航
- Logo、首页、SU7、YU7、SU7 Ultra、经销商库存、预约试驾。
- 未登录显示登录/注册;已登录显示昵称、个人中心和退出。
- 页脚展示品牌信息、客服电话、法律链接、备案和版权。

### 5.3 首页 `/`
- 全屏 Hero 轮播,每屏展示一款车型、标语、价格及“了解详情”“预约试驾”按钮。
- 车型概览展示图片、名称、起售价、续航和加速。
- 核心技术区域展示续航、性能、智能座舱与安全。
- 页面内容从已发布 CMS 内容和车型数据加载。

### 5.4 车型详情 `/cars/:slug`
- 全屏主图、车型名、起售价和试驾 CTA。
- 展示续航、加速、马力、最高时速、卖点、详情和画廊。
- 展示各城市经销商可用库存,支持按城市筛选。
- 有库存时显示“0 元下定”,无库存时引导选择其他经销商或预约试驾。
- 未发布或不存在车型返回友好 404。

### 5.5 经销商库存 `/inventory`
- 按城市、经销商和车型筛选当前可用库存。
- 展示经销商地址、营业时间、联系电话和库存状态。
- 库存数量展示精确值;数量为 0 时显示“暂无库存”且禁用下定。
- 库存更新时间展示到分钟,并注明数据由经销商后台人工维护。

### 5.6 0 元下定 `/orders/confirm`
- 受登录保护,用户选择车型、经销商并确认联系人、手机号和协议。
- 订单金额明确展示为 `¥0`,不得出现支付按钮或支付状态。
- 提交时携带幂等键;后端在事务中锁定库存记录、检查可用量并增加 `reserved_qty`。
- 创建后状态为 `pending_confirmation`,默认库存预留 48 小时;期限可由系统配置。
- 同一用户对同一车型最多存在一个有效订单,重复提交返回现有订单。
- 库存不足返回明确提示并刷新库存;不得生成无库存订单。

### 5.7 我的订单 `/orders`
- 展示订单号、车型、经销商、下定时间、预留截止时间和状态。
- 用户可查看详情并取消 `pending_confirmation` 或 `confirmed` 订单。
- 取消或超时失效后,系统在事务中释放库存。
- 经销商完成线下交付后订单进入 `completed`,系统同时将库存总量和占用量各减 1。

### 5.8 预约试驾 `/test-drive`
- 受登录保护。
- 字段:车型、城市、期望日期、联系电话。
- 联系电话默认使用注册手机号;日期必须为未来日期。
- 提交成功显示预约编号和当前状态。

### 5.9 个人中心 `/profile`
- 展示昵称、脱敏手机号、邮箱、注册时间和最近登录时间。
- 展示当前用户试驾预约及状态。
- 展示 0 元下定订单入口和最近订单。
- 支持退出当前会话。

### 5.10 注册 `/register`
- 手机号、短信验证码、密码、确认密码和用户协议勾选。
- 实时显示密码强度与不满足的规则。
- 注册成功自动建立会话并返回原访问页面或首页。

### 5.11 登录 `/login`
- Tab 切换密码登录与短信验证码登录。
- 提供“微信登录”按钮,桌面端展示微信扫码授权,移动端跳转微信授权页。
- 微信首次授权后必须绑定并验证手机号;若手机号已有账号则绑定到已有账号。
- 验证码登录默认只允许已注册手机号。
- 登录失败采用统一提示,避免暴露手机号是否存在。

---

## 6. 用户认证与安全

### 6.1 注册
1. 校验中国大陆手机号格式 `1[3-9]\d{9}`。
2. 使用密码学安全随机数生成 6 位验证码,以服务端 `SMS_CODE_PEPPER` 执行 HMAC-SHA256 后写入 `sms_codes`。
3. 服务端调用火山引擎短信 `SendSms` API,使用已审核的消息组、短信签名和注册验证码模板真实发送。
4. 保存火山引擎 RequestId/MessageID 和发送状态;仅受理成功时标记 `send_status=accepted`,发送失败时验证码不可用于注册。
5. 后端校验验证码未过期、未消费、场景为 `register` 且尝试次数未超限。
6. 校验密码后使用 bcrypt cost=12 哈希。
7. 在事务中创建用户、消费验证码并签发会话。

### 6.2 真实短信发送
- 生产和用户验收环境固定使用 `SMS_PROVIDER=volcengine`,不得回退到 mock 或把验证码返回到接口响应。
- mock Provider 仅允许单元测试和 CI 使用;应用在非测试环境检测到 mock 配置时拒绝启动。
- 上线前必须开通火山引擎短信服务,准备消息组、最小权限访问凭据、已审核签名、注册/登录/绑定手机号模板及状态报告回调。
- AccessKey 通过环境密钥服务注入,不得写入代码、数据库、前端包或日志。
- 同手机号 60 秒最多发送 1 次、1 小时最多 5 次、24 小时最多 10 次;同 IP 1 小时最多 30 次。
- 发送接口无论手机号是否已注册都返回通用受理结果,避免账号枚举。
- 调用超时最多重试 1 次,重试复用同一业务请求 ID;供应商明确拒绝时不重试。
- 消费异步送达回执更新 `sms_deliveries`;连续失败率超过阈值触发监控告警。
- 状态报告按 MessageID 幂等处理,并校验高熵回调令牌、账号、消息组、业务关联和重放时间窗;回调体 `signature` 仅是短信签名名称,不得当作请求验签字段。
- 验证码只可使用一次,有效期 5 分钟,连续验证失败 5 次立即失效。

### 6.3 密码策略
- 长度 8-64 位。
- 大写字母、小写字母、数字、特殊字符至少满足 3 类。
- 禁止纯数字、常见弱口令、与手机号相同或包含连续手机号片段。
- 前端仅用于即时反馈,后端为最终裁决。

### 6.4 登录保护
- 密码或验证码登录均执行账号/IP 限流。
- 连续 5 次密码失败锁定 15 分钟,成功后清零失败次数。
- Access Token 有效期 15 分钟,仅存内存。
- Refresh Token 有效期 7 天,仅存 `HttpOnly + Secure + SameSite=Lax` Cookie,禁止写入 localStorage。
- Refresh Token 旋转使用;登出、改密或账号禁用后吊销。

### 6.5 微信授权登录
1. 前端请求授权地址,后端生成一次性 `state` 并绑定浏览器会话。
2. 用户在微信完成扫码或移动端授权,微信回调只携带临时 `code` 和 `state`。
3. 后端校验 `state`,在服务端使用 AppSecret 换取微信身份,禁止向浏览器暴露 AppSecret 或微信 Token。
4. 已绑定身份直接登录;首次授权进入手机号短信验证流程。
5. 已存在手机号账号时绑定微信身份;新手机号则创建用户并绑定。
6. OpenID 与 UnionID 按最小必要原则保存;微信 Token 仅在服务端授权交换期间使用并及时丢弃,不持久化;授权失败或取消时返回可重试提示。

### 6.6 0 元下定与库存一致性
- 创建、取消、超时释放订单均在 MySQL 事务中执行。
- 创建订单使用 `SELECT ... FOR UPDATE` 锁定库存行,校验 `total_qty - reserved_qty > 0` 后再占用。
- 每次请求使用用户级幂等键,防止网络重试产生重复订单。
- 后台调低库存时不得低于当前 `reserved_qty`。
- 定时任务扫描过期 `pending_confirmation` 订单并释放库存;任务重复执行必须幂等。
- `confirmed` 订单保持库存占用;`completed` 时原子执行 `total_qty - 1` 和 `reserved_qty - 1`。
- 0 元下定不接入支付、不产生支付流水,页面须明确其为预留意向而非正式购车合同。

### 6.7 通用安全
- 强制 HTTPS、Helmet、安全 CSP 和明确 CORS 白名单。
- SQL 全部使用参数化查询。
- 输入执行后端 Schema 校验,输出执行转义/过滤。
- 密码、验证码和 Token 不记录到日志或返回给客户端。
- 手机号默认脱敏,异常信息避免用户枚举。

---

## 7. API

统一响应错误格式:`{ code, message, requestId }`。

### 7.1 认证
| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/auth/sms-code` | 发送验证码 `{ phone, scene }` |
| POST | `/api/auth/sms-delivery-callback` | 火山引擎短信状态报告;校验回调令牌、账号、消息组和业务关联 |
| POST | `/api/auth/register` | 手机号注册 |
| POST | `/api/auth/login` | 密码或验证码登录 |
| POST | `/api/auth/refresh` | 刷新 Access Token |
| POST | `/api/auth/logout` | 吊销当前 Refresh Token |
| GET | `/api/auth/me` | 当前用户 |
| GET | `/api/auth/wechat/authorize` | 获取微信授权地址与一次性 state |
| GET | `/api/auth/wechat/callback` | 处理微信授权回调 |
| POST | `/api/auth/wechat/bind-phone` | 首次微信登录绑定手机号 |

### 7.2 内容与车型
| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/content/:contentKey` | 读取已发布内容 |
| GET | `/api/cars` | 已发布车型列表 |
| GET | `/api/cars/:slug` | 已发布车型详情 |

### 7.3 经销商与库存
| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/dealers` | 按城市查询启用经销商 |
| GET | `/api/inventory` | 按车型/城市/经销商查询可用库存 |

### 7.4 0 元订单
| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/orders` | 幂等创建 0 元库存预留订单 |
| GET | `/api/orders` | 当前用户订单列表 |
| GET | `/api/orders/:orderNo` | 当前用户订单详情 |
| POST | `/api/orders/:orderNo/cancel` | 取消订单并释放库存 |

### 7.5 预约
| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/test-drives` | 创建当前用户的试驾预约 |
| GET | `/api/test-drives` | 当前用户预约列表 |

---

## 8. 错误处理
- `400`:参数错误;`401`:未认证或凭证错误;`404`:资源不存在。
- `409`:手机号重复等资源冲突;`423`:账号锁定;`429`:触发限流。
- 库存不足返回 `409 INVENTORY_UNAVAILABLE`;重复下单返回当前有效订单。
- 微信 `state` 无效或过期返回 `400 WECHAT_STATE_INVALID`,不建立会话。
- 短信供应商不可用返回 `503 SMS_PROVIDER_UNAVAILABLE`;发送频控返回 `429 SMS_RATE_LIMITED`。
- 短信发送失败时不创建可用验证码;客户端可在冷却时间后重试。
- 401 时前端静默刷新一次;失败后清理会话并跳转登录。
- 表单错误就近显示,页面级加载失败提供重试。
- CMS 内容缺失时使用受控默认内容并记录监控告警。

---

## 9. 验收标准

1. MySQL 初始化成功并写入三款车型种子数据。
2. 首页和详情页仅展示已发布内容及车型。
3. 页面视觉接近小米汽车官网,桌面和移动端无明显溢出或遮挡。
4. 用户可通过手机号、验证码和合规密码注册。
5. 支持密码登录和已注册手机号验证码登录。
6. 弱密码、错误验证码、重复手机号和暴力登录被正确拦截。
7. 页面刷新后可通过安全 Refresh Cookie 恢复会话。
8. 未登录访问预约或个人中心时跳转登录并保留回跳地址。
9. 用户可提交预约并只能查看自己的预约记录。
10. 后台发布或下线内容后,门户在 60 秒内正确反映变更。
11. 草稿内容不会通过任何门户 API 泄露。
12. 密码、验证码和 Token 均不以明文存储或输出。
13. 门户默认使用简体中文,HTML 语言、日期、价格和提示格式正确。
14. 用户可使用微信扫码/授权登录,首次授权必须完成手机号验证与绑定。
15. 微信身份可绑定已有手机号账号,不得创建重复手机号用户。
16. 用户可按城市、经销商和车型查看后台人工维护的库存。
17. 有库存时可创建金额为 0 的下定订单,且不进入任何支付流程。
18. 并发下定不会造成超卖,重复提交不会生成重复订单。
19. 用户只能查看和取消自己的订单;取消或超时会正确释放库存。
20. 无库存、经销商停用或车型下线时不能下定。
21. 用户注册验证码通过火山引擎短信服务真实到达目标手机号。
22. 非测试环境配置 mock Provider 时服务拒绝启动。
23. API、日志和数据库均不出现明文验证码或完整手机号。
24. 发送频率、验证码有效期、单次使用和 5 次验证失败失效规则生效。
25. 火山引擎短信服务拒绝、超时和回执失败均有可追踪状态及监控告警。

### 9.1 测试
- 单元测试:密码策略、验证码哈希/过期/次数、短信限流、Token、微信 state、库存计算和订单过期释放。
- API 集成测试:火山引擎 SMS Provider 契约、状态报告回调、注册、微信绑定、登录、库存行锁、订单幂等和预约隔离。
- E2E:浏览车型和库存、微信/手机号登录、0 元下定、取消订单、提交预约和会话恢复。
- 安全测试:SQL 注入、XSS、OAuth CSRF、IDOR、暴力破解和敏感信息泄露。
- 上线验收:使用受控真实手机号完成短信发送、接收、注册和一次性消费全链路验证。

---

## 10. 本地运行
```bash
cp .env.example .env
npm install
npm run db:init
npm run server       # :3001
npm run dev:web      # :5173
```

关键环境变量:`DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME=xiaomi_ev`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `SMS_PROVIDER=volcengine`, `SMS_CODE_PEPPER`, `VOLCENGINE_SMS_REGION=cn-north-1`, `VOLCENGINE_SMS_ACCOUNT`, `VOLCENGINE_SMS_ACCESS_KEY_ID`, `VOLCENGINE_SMS_SECRET_KEY`, `VOLCENGINE_SMS_SIGN`, `VOLCENGINE_SMS_REGISTER_TEMPLATE_ID`, `VOLCENGINE_SMS_LOGIN_TEMPLATE_ID`, `VOLCENGINE_SMS_BIND_TEMPLATE_ID`, `VOLCENGINE_SMS_CALLBACK_TOKEN`, `WEB_ORIGIN`, `WECHAT_APP_ID`, `WECHAT_APP_SECRET`, `WECHAT_REDIRECT_URI`, `ORDER_RESERVATION_HOURS=48`, `DEFAULT_LOCALE=zh-CN`。生产密钥由火山引擎 Secret Manager 注入,不得固化在普通环境文件中。
