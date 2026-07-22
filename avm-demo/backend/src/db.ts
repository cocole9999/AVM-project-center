import { PrismaClient } from '@prisma/client';
import { env } from './env';

/**
 * Prisma 客户端单例
 *
 * 连接池配置说明：
 * - connection_limit: 默认 10，生产环境根据并发调整
 * - pool_timeout: 连接池等待超时（秒），0 表示无限等待
 * - 仅 PostgreSQL 连接池生效；SQLite 忽略这些配置
 */
export const prisma = new PrismaClient({
  log: env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
});
