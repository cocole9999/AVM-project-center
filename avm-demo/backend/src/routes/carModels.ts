/**
 * V1.7 车型库管理
 * 吉利全系车型档案：银河 / 极氪 / 领克 / 博越 / 熊猫 / 星瑞 等
 * 字段：品牌 / 系列 / 上市年份 / 细分市场 / 平台
 */
import { Router } from 'express';
import { prisma } from '../db';
import { caches } from '../cache';
import { requireAuth, autoRole } from '../middleware/auth';
import { recordAudit, actorFromReq, diffFields } from '../utils/audit';

export const carModelRouter = Router();

// V1.11: 鉴权 + 写保护
carModelRouter.use(requireAuth);
carModelRouter.use(autoRole());

// 列表 + 过滤（V1.10 无过滤时命中 LRU 缓存）
carModelRouter.get('/', async (req, res) => {
  const { q, brand, status, series } = req.query as any;
  const hasFilter = !!(q || brand || status || series);
  if (!hasFilter) {
    const cached = caches.carModels.get('list:all');
    if (cached) return res.json(cached);
  }
  const where: any = {};
  if (status) where.status = status;
  if (brand) where.brand = brand;
  if (series) where.series = series;
  if (q) {
    where.OR = [
      { name: { contains: q } },
      { code: { contains: q } },
      { platform: { contains: q } },
    ];
  }
  const list = await prisma.carModel.findMany({
    where,
    include: {
      _count: { select: { projects: true, workItems: true } },
    },
    orderBy: [{ brand: 'asc' }, { launchYear: 'desc' }, { name: 'asc' }],
  });
  if (!hasFilter) caches.carModels.set('list:all', list);
  res.json(list);
});

// 详情
carModelRouter.get('/:id', async (req, res) => {
  const m = await prisma.carModel.findUnique({
    where: { id: req.params.id },
    include: {
      projects: { orderBy: { startDate: 'desc' }, include: { customer: true } },
      _count: { select: { projects: true, workItems: true } },
    },
  });
  if (!m) return res.status(404).json({ error: '车型不存在' });
  res.json(m);
});

// 创建
carModelRouter.post('/', autoRole(), async (req, res) => {
  try {
    const m = await prisma.carModel.create({ data: req.body });
    caches.carModels.invalidate('list:all');
    recordAudit('carModel', m.id, 'create', null, { method: 'POST', summary: `创建车型 ${m.name}` }, actorFromReq(req));
    res.status(201).json(m);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

// 更新
carModelRouter.patch('/:id', autoRole(), async (req, res) => {
  try {
    const before = await prisma.carModel.findUnique({ where: { id: req.params.id } });
    const m = await prisma.carModel.update({ where: { id: req.params.id }, data: req.body });
    caches.carModels.invalidate('list:all');
    if (before) {
      const changes = diffFields(before as any, m as any, ['name', 'brand', 'series', 'segment', 'platform', 'launchYear', 'status']);
      recordAudit('carModel', m.id, 'update', changes, { method: 'PATCH', summary: `更新车型 ${m.name} (${changes.length} 项)` }, actorFromReq(req));
    }
    res.json(m);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

// 删除
carModelRouter.delete('/:id', autoRole(), async (req, res) => {
  try {
    const before = await prisma.carModel.findUnique({ where: { id: req.params.id } });
    await prisma.carModel.delete({ where: { id: req.params.id } });
    caches.carModels.invalidate('list:all');
    recordAudit('carModel', req.params.id, 'delete', null, { method: 'DELETE', summary: `删除车型 ${before?.name}` }, actorFromReq(req));
    res.json({ ok: true });
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

// 按品牌统计
carModelRouter.get('/_stats/by-brand', async (req, res) => {
  const all = await prisma.carModel.findMany();
  const byBrand: Record<string, number> = {};
  all.forEach(m => { byBrand[m.brand] = (byBrand[m.brand] || 0) + 1; });
  res.json({ total: all.length, byBrand });
});
