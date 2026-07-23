/**
 * 速率限制中间件
 *
 * loginLimiter: 登录接口防暴力破解 (15 次/15 分钟)
 * apiLimiter:   全局 API 限流 (100 次/分钟)
 */
import rateLimit from 'express-rate-limit';

/** 登录限流：每个 IP 每 15 分钟最多 15 次尝试 */
export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: '登录尝试过于频繁，请 15 分钟后再试', retryAfter: '900s' },
  skipSuccessfulRequests: true,
});

/** 全局 API 限流：每个 IP 每分钟最多 100 次请求 */
export const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: '请求过于频繁，请稍后再试', retryAfter: '60s' },
});
