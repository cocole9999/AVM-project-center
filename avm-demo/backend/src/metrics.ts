/**
 * Prometheus Metrics 指标
 *
 * 端点：GET /api/metrics（Prometheus 文本格式）
 *
 * 指标：
 * - http_requests_total: HTTP 请求总数（按 method + path + status 分组）
 * - http_request_duration_ms: HTTP 请求延迟（ms）
 * - db_query_duration_ms: 数据库查询延迟
 */
import { Request, Response, NextFunction } from 'express';
import promClient from 'prom-client';

// 注册表
const register = new promClient.Registry();
promClient.collectDefaultMetrics({ register, prefix: 'avm_' });

// HTTP 请求计数
export const httpRequestsTotal = new promClient.Counter({
  name: 'avm_http_requests_total',
  help: 'HTTP 请求总数',
  labelNames: ['method', 'path', 'status'],
  registers: [register],
});

// HTTP 请求延迟直方图
export const httpRequestDurationMs = new promClient.Histogram({
  name: 'avm_http_request_duration_ms',
  help: 'HTTP 请求延迟 (ms)',
  labelNames: ['method', 'path'],
  buckets: [10, 50, 100, 250, 500, 1000, 2500, 5000],
  registers: [register],
});

/** Express 中间件：记录 HTTP 请求指标 */
export function metricsMiddleware(req: Request, res: Response, next: NextFunction) {
  // 跳过 metrics 端点自身
  if (req.path === '/api/metrics') return next();

  const start = Date.now();
  let route = req.route?.path || req.path || '/unknown';

  res.on('finish', () => {
    const duration = Date.now() - start;
    const status = res.statusCode.toString();
    // 将 :id 参数化的路径统一
    if (req.route?.path) route = req.route.path;
    else route = route.replace(/\/[a-z0-9_-]{15,}/g, '/:id');

    httpRequestsTotal.labels(req.method, route, status).inc();
    httpRequestDurationMs.labels(req.method, route).observe(duration);
  });

  next();
}

/** 获取 Prometheus 文本格式的指标 */
export async function getMetricsText(): Promise<string> {
  return register.metrics();
}
