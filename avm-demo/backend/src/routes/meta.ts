import { Router } from 'express';
import { prisma } from '../db';
import { STATUS_BY_TYPE, TYPE_OPTIONS, PRIORITY_OPTIONS, SEVERITY_OPTIONS, RELATION_TYPES } from '../constants';
import { asyncHandler } from '../middleware/validate';

export const metaRouter = Router();

metaRouter.get('/options', asyncHandler(async (_req, res) => {
  res.json({
    types: TYPE_OPTIONS,
    priority: PRIORITY_OPTIONS,
    severity: SEVERITY_OPTIONS,
    relationTypes: RELATION_TYPES,
    statusByType: STATUS_BY_TYPE,
  });
}));

metaRouter.get('/assignees', asyncHandler(async (_req, res) => {
  const rows = await prisma.workItem.findMany({
    where: { assignee: { not: null } },
    distinct: ['assignee'],
    select: { assignee: true },
  });
  res.json(rows.map(r => r.assignee).filter(Boolean));
}));

metaRouter.get('/modules', asyncHandler(async (_req, res) => {
  const rows = await prisma.workItem.findMany({
    where: { module: { not: null } },
    distinct: ['module'],
    select: { module: true },
  });
  res.json(rows.map(r => r.module).filter(Boolean));
}));

metaRouter.get('/stats', asyncHandler(async (_req, res) => {
  const [byType, byStatus, byPriority, total] = await Promise.all([
    prisma.workItem.groupBy({ by: ['type'], _count: { _all: true } }),
    prisma.workItem.groupBy({ by: ['status'], _count: { _all: true } }),
    prisma.workItem.groupBy({ by: ['priority'], _count: { _all: true } }),
    prisma.workItem.count(),
  ]);
  res.json({
    total,
    byType: Object.fromEntries(byType.map(r => [r.type, r._count._all])),
    byStatus: Object.fromEntries(byStatus.map(r => [r.status, r._count._all])),
    byPriority: Object.fromEntries(byPriority.map(r => [r.priority, r._count._all])),
  });
}));

// V1.28 客户/车型维度仪表盘: 按 customer / carModel 聚合项目健康度
// GET /api/meta/health?by=customer|carModel
metaRouter.get('/health', async (req, res) => {
  try {
    const by = (req.query.by as string) || 'customer';
    if (by === 'customer') {
      const customers = await prisma.customer.findMany({
        include: {
          projects: {
            include: { _count: { select: { workItems: true } } },
          },
        },
      });
      const out = customers.map(c => {
        const projectCount = c.projects.length;
        const workItemCount = c.projects.reduce((s, p) => s + p._count.workItems, 0);
        const highRiskCount = c.projects.filter(p => p.risk === 'high').length;
        return { id: c.id, name: c.name, code: c.code, projectCount, workItemCount, highRiskCount };
      });
      out.sort((a, b) => b.workItemCount - a.workItemCount);
      return res.json({ by: 'customer', items: out });
    } else if (by === 'carModel') {
      const carModels = await prisma.carModel.findMany({
        include: {
          projects: {
            include: { _count: { select: { workItems: true } } },
          },
        },
      });
      const out = carModels.map(m => {
        const projectCount = m.projects.length;
        const workItemCount = m.projects.reduce((s, p) => s + p._count.workItems, 0);
        const highRiskCount = m.projects.filter(p => p.risk === 'high').length;
        return { id: m.id, name: m.name, brand: m.brand, projectCount, workItemCount, highRiskCount };
      });
      out.sort((a, b) => b.workItemCount - a.workItemCount);
      return res.json({ by: 'carModel', items: out });
    }
    res.status(400).json({ error: 'by must be "customer" or "carModel"' });
  } catch (e: any) {
    console.error('[meta/health]', e);
    res.status(500).json({ error: e.message });
  }
});