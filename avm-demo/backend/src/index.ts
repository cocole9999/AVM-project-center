import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import http from 'http';
import crypto from 'crypto';
import path from 'path';
import fs from 'fs';
import { workItemRouter } from './routes/workItems';
import { iterationRouter } from './routes/iterations';
import { commentRouter } from './routes/comments';
import { activityRouter } from './routes/activities';
import { metaRouter } from './routes/meta';
import { flowRouter } from './routes/flows';
import { reviewRouter } from './routes/reviews';
import { chartRouter } from './routes/charts';
import { dashboardRouter } from './routes/dashboards';
import { aiRouter } from './routes/ai';
import { userRouter } from './routes/users';
import { spaceRouter } from './routes/spaces';
import { notificationRouter } from './routes/notifications';
import { favoriteRouter } from './routes/favorites';
import { resourceRouter } from './routes/resources';
import { searchRouter } from './routes/search';
import { workbenchRouter } from './routes/workbench';
import { fieldRouter } from './routes/fields';
import { templateRouter } from './routes/templates';
import { automationRouter } from './routes/automation';
import { webhookRouter } from './routes/webhooks';
import { importRouter } from './routes/imports';
import { handoverRouter } from './routes/handover';
import { treeRouter } from './routes/tree';
import { resourceAnalysisRouter, baselineRouter } from './routes/analysis';
import { mcpRouter } from './routes/mcp';
import { testRouter } from './routes/tests';
import { ssoRouter } from './routes/sso';
import { llmSettingsRouter } from './routes/llmSettings';
import { customerRouter } from './routes/customers';
import { carModelRouter } from './routes/carModels';
import { contactRouter } from './routes/contacts';
import { projectRouter } from './routes/projects';
import { aiCommandRouter } from './routes/aiCommand';
import { exportRouter } from './routes/export';
import { dependencyRouter } from './routes/dependencies';
import { startRiskScanner } from './services/riskScanner';
import { requireAuth } from './middleware/auth';
import { prisma } from './db';
import { auditLogRouter } from './routes/auditLogs';
import { mentionRouter } from './routes/mentions';
import { uploadRouter } from './routes/uploads';
import { attachWsServer, getStats, pushToUser, broadcastAll, pushToRole } from './services/wsServer';
import { apiLimiter, loginLimiter } from './middleware/rateLimiter';
import { env } from './env';
import { logger, logMeta } from './logger';
import { swaggerSpec } from './swagger';
import swaggerUi from 'swagger-ui-express';
import { metricsMiddleware, getMetricsText } from './metrics';
import promClient from 'prom-client';

const app = express();
const PORT = env.PORT;
const IS_PROD = env.NODE_ENV === 'production';

// 安全 HTTP 头
app.use(helmet({ contentSecurityPolicy: IS_PROD ? undefined : false }));

// CORS：生产模式限制来源
app.use(cors(IS_PROD ? { origin: process.env.CORS_ORIGIN || 'http://localhost:8080' } : {}));

// 请求 ID 追踪
app.use((req: any, _res, next) => {
  req.requestId = crypto.randomUUID().slice(0, 8);
  next();
});

// 全局 API 限流
app.use('/api', apiLimiter);

// Prometheus 指标中间件
app.use(metricsMiddleware);

app.use(express.json({ limit: '10mb' }));

// 静态文件服务 - 评论图片
const UPLOAD_DIR = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
app.use('/uploads', express.static(UPLOAD_DIR));

// 健康检查（不走 requireAuth）
app.get('/api/health', async (_req, res) => {
  const startTime = Date.now();
  let dbStatus = 'ok';
  try {
    await prisma.$queryRawUnsafe('SELECT 1');
  } catch {
    dbStatus = 'error';
  }
  res.json({
    status: dbStatus === 'ok' ? 'ok' : 'degraded',
    version: '1.2.0',
    uptime: Math.floor(process.uptime()),
    db: dbStatus,
    ts: new Date().toISOString(),
  });
});

// Swagger API 文档
app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
app.get('/api/docs.json', (_req, res) => res.json(swaggerSpec));

// Prometheus 指标（不走 requireAuth）
app.get('/api/metrics', async (_req, res) => {
  res.set('Content-Type', promClient.register.contentType);
  res.end(await getMetricsText());
});

// V1.11: 全局鉴权（在所有 /api/* router 之前）
//   - 白名单内的路径（sso/users.login/health/llm-settings.health）直接放行
//   - dev 模式无 token 视为 dev-user tenant_admin
//   - 生产模式无 token 401
app.use('/api', requireAuth);

app.use('/api/work-items', workItemRouter);
app.use('/api/iterations', iterationRouter);
app.use('/api/comments', commentRouter);
app.use('/api/activities', activityRouter);
app.use('/api/meta', metaRouter);
app.use('/api/flows', flowRouter);
app.use('/api/reviews', reviewRouter);
app.use('/api/charts', chartRouter);
app.use('/api/dashboards', dashboardRouter);
app.use('/api/ai', aiRouter);
app.use('/api/ai-command', aiCommandRouter);
app.use('/api/export', exportRouter);
app.use('/api/dependencies', dependencyRouter);
app.use('/api/users', loginLimiter, userRouter);
app.use('/api/spaces', spaceRouter);
app.use('/api/notifications', notificationRouter);
app.use('/api/favorites', favoriteRouter);
app.use('/api/resources', resourceRouter);
app.use('/api/search', searchRouter);
app.use('/api/workbench', workbenchRouter);
app.use('/api/fields', fieldRouter);
app.use('/api/templates', templateRouter);
app.use('/api/automation', automationRouter);
app.use('/api/webhooks', webhookRouter);
app.use('/api/imports', importRouter);
app.use('/api/handover', handoverRouter);
app.use('/api/tree', treeRouter);
app.use('/api/analysis', resourceAnalysisRouter);
app.use('/api/baselines', baselineRouter);
app.use('/api/mcp', mcpRouter);
app.use('/api/tests', testRouter);
app.use('/api/sso', ssoRouter);
app.use('/api/llm-settings', llmSettingsRouter);
app.use('/api/customers', customerRouter);
app.use('/api/car-models', carModelRouter);
app.use('/api/contacts', contactRouter);
app.use('/api/projects', projectRouter);
app.use('/api/audit-logs', auditLogRouter);
app.use('/api/mentions', mentionRouter);
app.use('/api/uploads', uploadRouter);

// ========== 增强型全局错误处理中间件 ==========
// Prisma 错误码映射
function handlePrismaError(err: any): { status: number; message: string } {
  if (err.code === 'P2002') {
    const target = err.meta?.target || '字段';
    return { status: 409, message: `数据已存在: ${target} 唯一约束冲突` };
  }
  if (err.code === 'P2025') {
    return { status: 404, message: '记录不存在' };
  }
  if (err.code === 'P2003') {
    return { status: 400, message: '外键约束失败，关联的记录不存在' };
  }
  if (err.code === 'P2014') {
    return { status: 400, message: `关系约束冲突: ${err.meta?.message || ''}` };
  }
  if (err.code?.startsWith('P')) {
    return { status: 400, message: `数据库错误: ${err.message}` };
  }
  return { status: 500, message: err.message || 'Internal Server Error' };
}

app.use((err: any, req: any, res: any, _next: any) => {
  const requestId = req.requestId || '-';

  // Zod 验证错误
  if (err.name === 'ZodError') {
    const details = (err.issues || []).map((e: any) => ({
      field: e.path.join('.'),
      message: e.message,
    }));
    logger.warn('请求参数校验失败', logMeta(req, { details }));
    return res.status(400).json({
      error: '请求参数校验失败',
      details,
      requestId,
    });
  }

  // Prisma 错误
  if (err.code?.startsWith('P')) {
    const { status, message } = handlePrismaError(err);
    logger.error(`数据库错误 [${err.code}]`, logMeta(req, { message: err.message }));
    return res.status(status).json({ error: message, code: err.code, requestId });
  }

  // 已知 HTTP 错误 (有 status 属性)
  if (err.status && err.message) {
    logger.error(`HTTP ${err.status}`, logMeta(req, { message: err.message }));
    return res.status(err.status).json({ error: err.message, requestId });
  }

  // JSON 解析错误
  if (err.type === 'entity.parse.failed') {
    logger.warn('JSON 解析失败', logMeta(req));
    return res.status(400).json({ error: '请求体 JSON 格式无效', requestId });
  }

  // 未知错误
  logger.error('未处理的服务器错误', logMeta(req, { stack: err.stack }));
  res.status(500).json({
    error: '服务器内部错误',
    requestId,
  });
});

app.listen(PORT, () => {
  logger.info(`AVM Backend 启动`, { port: PORT, env: env.NODE_ENV, wsPort: PORT + 1 });
  startRiskScanner();
});

// V1.15: WebSocket 实时通知
const httpServer = http.createServer(app);
httpServer.listen(PORT + 1, () => {
  logger.info(`WebSocket 启动`, { port: PORT + 1 });
});
attachWsServer(httpServer, '/api/ws');

// 暴露给 routes 用的 push helper (用 module-level singleton)
export const wsPush = {
  toUser: (userId: string, payload: any) => pushToUser(userId, payload),
  toAll: (payload: any) => broadcastAll(payload),
  toRole: async (role: string, payload: any) => pushToRole(role, payload),
  stats: () => getStats(),
};

// 暴露 stats 端点 (admin only)
app.get('/api/ws/stats', requireAuth, (req: any, res) => {
  if (req.user?.role !== 'tenant_admin') return res.status(403).json({ error: 'admin only' });
  res.json(getStats());
});