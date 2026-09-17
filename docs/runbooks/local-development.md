# 本地开发运行手册

> 面向新加入的工程师，帮助在本机拉起小米汽车门户、后台与共享 API。

## 1. 前置条件

- Node.js 22 LTS（仓库根 `.nvmrc` 已固定）。执行 `nvm use` 或确保 `node -v` 为 v22。
- npm 10+（随 Node 22 附带）。
- MySQL 8.x 与 Redis 6+。可用本机安装，或用 `compose.yaml` 启动容器。
- 可选：`k6`（负载测试）、`docker`（容器化验证）。

## 2. 首次初始化

```bash
npm install                     # 安装所有 workspace 依赖（单一根 lockfile）
cp .env.example server/.env     # 按需填写本地数据库/Redis 连接
npm run db:migrate              # 应用 server/migrations 下的迁移
npm run db:seed                 # 灌入车型、经销商、库存、RBAC 角色与权限
```

> 本地与 CI 默认使用 mock 短信与微信 Provider。生产/UAT 通过环境变量切换为火山短信和真实微信，且拒绝 mock 配置。
>
> 开发环境执行 seed 后会创建本地后台账号 `admin` / `admin`。该账号仅用于本地调试，
> 不启用 MFA；生产环境不会创建此账号。

## 3. 创建首个超级管理员

后台不提供公开注册，首个超级管理员通过 CLI 创建（密码经环境变量传入，避免进入 shell 历史）：

```bash
ADMIN_BOOTSTRAP_PASSWORD='StrongPass1!' \
  npm run admin:create -w @xiaomi-car/server -- \
  --username=root --email=root@example.com --display-name=超级管理员
```

命令会输出一次性的 TOTP 绑定密钥，请立即在身份验证器中登记；仅当尚无任何管理员时可执行。

## 4. 启动开发服务

```bash
npm run dev        # 并行启动 web(5173)、admin(5174)、api(3001)
```

- 门户：<http://localhost:5173>
- 后台：<http://localhost:5174>
- API 健康检查：<http://localhost:3001/health/ready>
- 指标：<http://localhost:3001/metrics>

前端 Vite 通过代理把 `/api` 转发到 3001，Cookie 以 `credentials: include` 传递。

## 5. 常用校验

```bash
npm run lint                    # ESLint（全 workspace）
npm run typecheck               # 各 workspace tsc --noEmit
npm test                        # 全量单元/组件/集成测试
RUN_DB_INTEGRATION=1 npm test -w @xiaomi-car/server   # 需本地 MySQL 才执行的集成用例
npm run build                   # 生产构建（web/admin/api）
```

## 6. 订单过期后台任务

预留名额到期释放由独立 worker 完成，可手动触发：

```bash
npm run orders:expire -w @xiaomi-car/server
```

生产环境将其配置为定时任务（如每分钟一次），使用 `FOR UPDATE SKIP LOCKED` 保证并发安全。

## 7. 排障提示

- `/health/ready` 返回 503：检查 MySQL/Redis 是否可连；`/health/live` 不依赖外部依赖。
- 登录 429：命中边缘限流（60 次/分钟/IP）或短信频控，稍后再试。
- 后台无法进入：确认已创建超级管理员并完成 TOTP；跨域需 `ADMIN_ORIGIN` 与实际访问域名一致。
