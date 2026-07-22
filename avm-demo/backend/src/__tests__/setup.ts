/**
 * Vitest 全局测试设置
 *
 * 说明：
 * - 单元测试使用内存 Mock，不需要真实数据库
 * - 集成测试使用 SQLite（本地）或 PostgreSQL（CI），通过 DATABASE_URL 控制
 * - 测试前自动设置 NODE_ENV=test
 */

process.env.NODE_ENV = 'test';

// 全局 beforeAll - 可在这里初始化测试数据库连接
beforeAll(async () => {
  // 预留：集成测试需要时在此初始化 Prisma
});

// 全局 afterAll - 清理资源
afterAll(async () => {
  // 预留：断开数据库连接
});
