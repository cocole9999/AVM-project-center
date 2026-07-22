/**
 * V1.13 全系统审计日志端点
 *
 * GET    /api/audit-logs              列表 (按 entity/actor/action/date 筛选)
 * GET    /api/audit-logs/stats        统计 (按 entity / actor)
 * GET    /api/audit-logs/:id          详情
 * GET    /api/audit-logs/by-entity/:entity/:entityId   单个实体的所有变更
 */
import { Router } from 'express';
import { prisma } from '../db';
import { requireAuth, requireRole } from '../middleware/auth';

export const auditLogRouter = Router();

// 所有审计日志端点都要鉴权
auditLogRouter.use(requireAuth);

// 列表
auditLogRouter.get('/', async (req, res) => {
  try {
    const { entity, actor, action, from, to, entityId, limit = '100', offset = '0' } = req.query as Record<string, string | undefined>;
    const where: any = {};
    if (entity) where.entity = entity;
    if (actor) where.actor = actor;
    if (action) where.action = action;
    if (entityId) where.entityId = entityId;
    if (from || to) {
      where.createdAt = {};
      if (from) where.createdAt.gte = new Date(from);
      if (to) where.createdAt.lte = new Date(to);
    }

    const take = Math.min(Number(limit) || 100, 500);
    const skip = Math.max(Number(offset) || 0, 0);

    const [items, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take,
        skip,
      }),
      prisma.auditLog.count({ where }),
    ]);

    res.json({ items, total, limit: take, offset: skip });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// 统计 — 按 entity / actor
auditLogRouter.get('/stats', async (req, res) => {
  try {
    const { days = '7' } = req.query as Record<string, string | undefined>;
    const since = new Date(Date.now() - Number(days) * 86400000);
    const logs = await prisma.auditLog.findMany({
      where: { createdAt: { gte: since } },
      select: { entity: true, action: true, actor: true, createdAt: true },
    });
    const byEntity: Record<string, number> = {};
    const byAction: Record<string, number> = {};
    const byActor: Record<string, number> = {};
    logs.forEach(l => {
      byEntity[l.entity] = (byEntity[l.entity] || 0) + 1;
      byAction[l.action] = (byAction[l.action] || 0) + 1;
      byActor[l.actor] = (byActor[l.actor] || 0) + 1;
    });
    res.json({
      total: logs.length,
      since: since.toISOString(),
      byEntity,
      byAction,
      byActor,
      topActors: Object.entries(byActor).sort((a, b) => b[1] - a[1]).slice(0, 10),
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// 详情
auditLogRouter.get('/:id', async (req, res) => {
  const log = await prisma.auditLog.findUnique({ where: { id: req.params.id } });
  if (!log) return res.status(404).json({ error: 'Audit log not found' });
  res.json(log);
});

// 单个实体的所有变更
auditLogRouter.get('/by-entity/:entity/:entityId', async (req, res) => {
  const { entity, entityId } = req.params;
  const items = await prisma.auditLog.findMany({
    where: { entity, entityId },
    orderBy: { createdAt: 'desc' },
    take: 200,
  });
  res.json(items);
});

// 清理旧日志 (admin only)
auditLogRouter.delete('/cleanup', requireRole('tenant_admin'), async (req, res) => {
  const { before } = req.query as Record<string, string | undefined>;
  if (!before) return res.status(400).json({ error: 'before (ISO date) required' });
  const result = await prisma.auditLog.deleteMany({
    where: { createdAt: { lt: new Date(before) } },
  });
  res.json({ ok: true, deleted: result.count });
});
