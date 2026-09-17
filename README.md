# Xiaomi Car Platform

面向用户的小米汽车门户、运营管理后台和共享 API 的 monorepo。

## Requirements

- Node.js 22 LTS
- npm 10+
- Docker with Compose

## Local setup

```bash
cp .env.example .env
npm install
docker compose up -d mysql redis
npm run db:migrate
npm run db:seed
npm run dev
```

开发地址：

- 门户：<http://localhost:5173>
- 管理后台：<http://localhost:5174>
- API：<http://localhost:3001>

正式短信、微信和火山引擎资源需要在 UAT/生产环境注入凭据。本地与 CI 默认使用契约 Mock。

## Verification

```bash
npm run lint            # ESLint（全 workspace）
npm run typecheck       # 各 workspace tsc --noEmit
npm test                # 单元 / 组件 / 集成测试
npm run build           # 生产构建（web / admin / api）
bash scripts/release-check.sh   # 本地发布门禁（等同 CI 顺序）
```

需要真实 MySQL 的集成用例通过 `RUN_DB_INTEGRATION=1 npm test -w @xiaomi-car/server` 触发；CI 中默认开启。

## Containers & Deployment

```bash
docker build -f server/Dockerfile   -t xiaomi-car-api .
docker build -f apps/web/Dockerfile -t xiaomi-car-web .
docker build -f apps/admin/Dockerfile -t xiaomi-car-admin .
```

CI 定义见 [.github/workflows/ci.yml](.github/workflows/ci.yml)。负载脚本位于 `load/`（k6，UAT 执行）。

## Documentation

- [门户 Spec](docs/specs/2026-09-17-xiaomi-car-portal-spec.md)
- [后台 Spec](docs/specs/2026-09-17-xiaomi-car-admin-spec.md)
- [部署技术方案](docs/architecture/2026-09-17-volcengine-deployment-technical-design.md)
- [测试总计划](docs/testing/2026-09-17-test-plan.md)
- [实施计划](docs/plans/2026-09-17-xiaomi-car-platform-implementation.md)
- [本地开发运行手册](docs/runbooks/local-development.md)
- [生产就绪检查清单](docs/runbooks/production-readiness.md)
- [火山引擎部署运行手册](docs/runbooks/volcengine-deployment.md)
