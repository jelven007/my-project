import { createServer } from "node:http";

import { createApp } from "./app.js";
import { config } from "./config.js";
import { rateLimit } from "./middleware/rate-limit.js";
import { pool, probeDatabase } from "./db/pool.js";
import { ensureRedisConnected, probeRedis, redisClient } from "./db/redis.js";
import { createAuthRouter } from "./routes/auth.routes.js";
import { createAdminAuthRouter } from "./routes/admin/auth.routes.js";
import { createDashboardEvents } from "./routes/admin/dashboard.routes.js";
import { createAdminOperationsRouter } from "./routes/admin/operations.routes.js";
import { createCarsRouter } from "./routes/cars.routes.js";
import { createContentRouter } from "./routes/content.routes.js";
import { createDealersRouter } from "./routes/dealers.routes.js";
import { MysqlCarsRepository } from "./repositories/cars.repository.js";
import { MysqlContentRepository } from "./repositories/content.repository.js";
import { MysqlDealersRepository } from "./repositories/dealers.repository.js";
import { MysqlOrderStore } from "./repositories/mysql-order.store.js";
import { MysqlTestDriveStore } from "./repositories/mysql-test-drive.store.js";
import { createOrdersRouter } from "./routes/orders.routes.js";
import { createProfileRouter } from "./routes/profile.routes.js";
import { createTestDriveRouter } from "./routes/test-drive.routes.js";
import { MysqlRefreshTokenRepository } from "./services/auth/mysql-refresh-token.repository.js";
import { MysqlAdminAuthRepository } from "./services/auth/mysql-admin-auth.repository.js";
import {
  AdminAuthService,
  RedisMfaChallengeStore,
} from "./services/auth/admin-auth.service.js";
import {
  RedisTotpReplayStore,
  TotpService,
} from "./services/auth/totp.service.js";
import { MysqlUserRepository } from "./services/auth/mysql-user.repository.js";
import { TokenService } from "./services/auth/token.service.js";
import { UserAuthService } from "./services/auth/user-auth.service.js";
import { OrderService } from "./services/order.service.js";
import { TestDriveService } from "./services/test-drive.service.js";
import { RedisRateLimiter } from "./services/sms/rate-limiter.js";
import { MockSmsProvider } from "./services/sms/mock-sms-provider.js";
import { MysqlSmsCodeStore } from "./services/sms/mysql-sms-code.store.js";
import { SmsCodeService } from "./services/sms/sms-code.service.js";
import type { SmsProvider } from "./services/sms/sms-provider.js";
import { VolcengineSmsProvider } from "./services/sms/volcengine-sms-provider.js";
import { MockWechatProvider } from "./services/wechat/mock-wechat-provider.js";
import { MysqlWechatIdentityRepository } from "./services/wechat/mysql-wechat-identity.repository.js";
import { RedisOauthStateStore } from "./services/wechat/redis-oauth-state.store.js";
import { WechatAuthService } from "./services/wechat/wechat-auth.service.js";
import { WechatOauthProvider } from "./services/wechat/wechat-oauth-provider.js";
import type { WechatProvider } from "./services/wechat/wechat-provider.js";
import { AuditService } from "./services/audit.service.js";

const smsProvider: SmsProvider =
  config.SMS_PROVIDER === "volcengine"
    ? new VolcengineSmsProvider({
        accessKeyId: config.VOLCENGINE_ACCESS_KEY_ID,
        secretAccessKey: config.VOLCENGINE_SECRET_ACCESS_KEY,
        smsAccount: config.VOLCENGINE_SMS_ACCOUNT,
        sign: config.VOLCENGINE_SMS_SIGN,
        templateIds: {
          register: config.VOLCENGINE_SMS_TEMPLATE_REGISTER,
          login: config.VOLCENGINE_SMS_TEMPLATE_LOGIN,
          bind_phone: config.VOLCENGINE_SMS_TEMPLATE_BIND_PHONE,
        },
      })
    : new MockSmsProvider();

const smsCodes = new SmsCodeService({
  pepper: config.SMS_CODE_PEPPER,
  provider: smsProvider,
  rateLimiter: new RedisRateLimiter(redisClient, ensureRedisConnected),
  store: new MysqlSmsCodeStore(pool, config.SMS_CODE_PEPPER),
});
const users = new MysqlUserRepository(pool);
const tokenService = new TokenService({
  accessSecret: config.USER_ACCESS_TOKEN_SECRET,
  refreshSecret: config.USER_REFRESH_TOKEN_SECRET,
  repository: new MysqlRefreshTokenRepository(pool),
});
const authService = new UserAuthService({ users, smsCodes, tokens: tokenService });
const wechatProvider: WechatProvider =
  config.WECHAT_PROVIDER === "wechat"
    ? new WechatOauthProvider({
        appId: config.WECHAT_APP_ID,
        appSecret: config.WECHAT_APP_SECRET,
        callbackUrl: config.WECHAT_CALLBACK_URL,
      })
    : new MockWechatProvider();
const wechatAuth = new WechatAuthService({
  stateSecret: config.WECHAT_STATE_SECRET,
  provider: wechatProvider,
  stateStore: new RedisOauthStateStore(redisClient, ensureRedisConnected),
  identities: new MysqlWechatIdentityRepository(pool),
  smsCodes,
  tokens: tokenService,
});
const authRouter = createAuthRouter({
  authService,
  smsCodes,
  secureCookies: config.NODE_ENV === "production",
  wechatAuth,
});
const adminRepository = new MysqlAdminAuthRepository(pool);
const audit = new AuditService(pool);
const adminAuthService = new AdminAuthService({
  repository: adminRepository,
  challenges: new RedisMfaChallengeStore(redisClient, ensureRedisConnected),
  totp: new TotpService({
    encryptionKey: config.ADMIN_MFA_ENCRYPTION_KEY,
    replayStore: new RedisTotpReplayStore(redisClient, ensureRedisConnected),
  }),
  audit,
  accessSecret: config.ADMIN_ACCESS_TOKEN_SECRET,
  refreshSecret: config.ADMIN_REFRESH_TOKEN_SECRET,
});
const adminAuthRouter = createAdminAuthRouter({
  authService: adminAuthService,
  allowedOrigin: config.ADMIN_ORIGIN,
  secureCookies: config.NODE_ENV === "production",
});
const dashboardEvents = createDashboardEvents(pool);
const adminOperationsRouter = createAdminOperationsRouter({
  pool,
  audit,
  authService: adminAuthService,
  allowedOrigin: config.ADMIN_ORIGIN,
  dashboardEvents,
});
const carsRouter = createCarsRouter(new MysqlCarsRepository(pool));
const contentRouter = createContentRouter(new MysqlContentRepository(pool));
const dealersRouter = createDealersRouter(new MysqlDealersRepository(pool));
const ordersRouter = createOrdersRouter(
  new OrderService({
    store: new MysqlOrderStore(pool),
    reservationHours: config.ORDER_RESERVATION_HOURS,
  }),
  tokenService,
  users,
);
const profileRouter = createProfileRouter(users, tokenService);
const testDriveRouter = createTestDriveRouter(
  new TestDriveService(new MysqlTestDriveStore(pool)),
  tokenService,
  users,
);

const app = createApp({
  readinessProbe: async () => {
    await Promise.all([probeDatabase(), probeRedis()]);
  },
  allowedOrigins: [config.WEB_ORIGIN, config.ADMIN_ORIGIN],
  authRateLimit: rateLimit({
    limiter: new RedisRateLimiter(redisClient, ensureRedisConnected),
    limit: 60,
    windowSeconds: 60,
    bucket: "auth-edge",
  }),
  adminAuthRouter,
  adminOperationsRouter,
  authRouter,
  carsRouter,
  contentRouter,
  dealersRouter,
  ordersRouter,
  profileRouter,
  testDriveRouter,
  trustProxyHops: config.TRUST_PROXY_HOPS,
});
const server = createServer(app);

server.listen(config.PORT, () => {
  process.stdout.write(`API listening on http://localhost:${config.PORT}\n`);
});

function shutdown(): void {
  server.close(async (error) => {
    await Promise.allSettled([
      pool.end(),
      redisClient.isOpen ? redisClient.quit() : Promise.resolve(),
    ]);
    process.exitCode = error ? 1 : 0;
  });
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
