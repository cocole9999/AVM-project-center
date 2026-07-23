/**
 * Winston 结构化日志
 *
 * 输出目标：
 * - 控制台：开发环境带颜色，生产环境 JSON
 * - 文件：avm-backend.log（所有级别）+ avm-error.log（仅 error）
 *
 * 用法：
 *   import { logger } from '../logger';
 *   logger.info('操作成功', { userId: 'xxx', action: 'create' });
 *   logger.error('操作失败', { error: err.message, stack: err.stack });
 */
import winston from 'winston';
import path from 'path';
import fs from 'fs';

const LOG_DIR = path.join(process.cwd(), 'logs');
if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });

const IS_PROD = process.env.NODE_ENV === 'production';

const consoleFormat = IS_PROD
  ? winston.format.combine(
      winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
      winston.format.json(),
    )
  : winston.format.combine(
      winston.format.colorize(),
      winston.format.timestamp({ format: 'HH:mm:ss' }),
      winston.format.printf(({ timestamp, level, message, requestId, ...meta }) => {
        const rid = requestId ? ` [${requestId}]` : '';
        const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
        return `${timestamp} ${level}${rid}: ${message}${metaStr}`;
      }),
    );

export const logger = winston.createLogger({
  level: IS_PROD ? 'info' : 'debug',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
  ),
  transports: [
    new winston.transports.Console({ format: consoleFormat }),
    new winston.transports.File({
      filename: path.join(LOG_DIR, 'avm-error.log'),
      level: 'error',
      maxsize: 5 * 1024 * 1024,
      maxFiles: 5,
    }),
    new winston.transports.File({
      filename: path.join(LOG_DIR, 'avm-backend.log'),
      maxsize: 10 * 1024 * 1024,
      maxFiles: 10,
    }),
  ],
});

/** 从 Express req 中提取 requestId 的快捷方法 */
export function logMeta(req: any, extra?: Record<string, any>) {
  return { requestId: req?.requestId || '-', ...extra };
}
