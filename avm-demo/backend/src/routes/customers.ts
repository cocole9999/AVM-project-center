/**
 * V1.7 客户（内部项目组）管理
 * AVM 集成项目的客户档案：吉利各车型项目组
 * 客户类型：internal（内部）/ external（外部，预留）
 * 联系人：UPL/PPM/测试/开发/AVM接口人
 */
import { Router } from 'express';
import { prisma } from '../db';
import { caches } from '../cache';
import { requireAuth, autoRole } from '../middleware/auth';
import { recordAudit, actorFromReq, diffFields } from '../utils/audit';

export const customerRouter = Router();

// V1.11: 鉴权 + 写保护
customerRouter.use(requireAuth);
customerRouter.use(autoRole());

// 列表 + 过滤（V1.10 无过滤时命中 LRU 缓存）
customerRouter.get('/', async (req, res) => {
  const { q, status, type, brand } = req.query as any;
  const hasFilter = !!(q || status || type || brand);
  if (!hasFilter) {
    const cached = caches.customers.get('list:all');
    if (cached) return res.json(cached);
  }
  const where: any = {};
  if (status) where.status = status;
  if (type) where.type = type;
  if (q) {
    where.OR = [
      { name: { contains: q } },
      { code: { contains: q } },
      { shortName: { contains: q } },
      { contact: { contains: q } },
    ];
  }
  const list = await prisma.customer.findMany({
    where,
    include: {
      contacts: { orderBy: [{ primary: 'desc' }, { role: 'asc' }] },
      projects: {
        orderBy: { startDate: 'desc' },
        select: { id: true, code: true, name: true, status: true, contractAmount: true, progress: true, carModel: { select: { id: true, name: true } } },
      },
      _count: { select: { projects: true, contacts: true, workItems: true } },
    },
    orderBy: { code: 'asc' },
  });
  // 如果指定了 brand（车型品牌），过滤关联了该品牌车型的项目
  let filtered = list;
  if (brand) {
    filtered = list.map((c: any) => ({
      ...c,
      projects: c.projects.filter((p: any) => p.carModel?.name?.includes(brand) || p.carModel?.name === brand),
    })).filter((c: any) => c.projects.length > 0);
  }
  res.json(filtered);
});

// 详情
customerRouter.get('/:id', async (req, res) => {
  const c = await prisma.customer.findUnique({
    where: { id: req.params.id },
    include: {
      contacts: { orderBy: [{ primary: 'desc' }, { role: 'asc' }] },
      projects: {
        orderBy: { startDate: 'desc' },
        include: { carModel: true },
      },
      _count: { select: { projects: true, contacts: true, workItems: true } },
    },
  });
  if (!c) return res.status(404).json({ error: '客户不存在' });
  res.json(c);
});

// 创建
customerRouter.post('/', autoRole(), async (req, res) => {
  try {
    const c = await prisma.customer.create({ data: req.body });
    caches.customers.invalidate('list:all');
    recordAudit('customer', c.id, 'create', null, { method: 'POST', summary: `创建客户 ${c.name}` }, actorFromReq(req));
    res.status(201).json(c);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

// 更新
customerRouter.patch('/:id', autoRole(), async (req, res) => {
  try {
    const before = await prisma.customer.findUnique({ where: { id: req.params.id } });
    const c = await prisma.customer.update({ where: { id: req.params.id }, data: req.body });
    caches.customers.invalidate('list:all');
    if (before) {
      const changes = diffFields(before as any, c as any, ['name', 'shortName', 'type', 'status', 'contact', 'phone', 'email', 'industry', 'description']);
      recordAudit('customer', c.id, 'update', changes, { method: 'PATCH', summary: `更新客户 ${c.name} (${changes.length} 项)` }, actorFromReq(req));
    }
    res.json(c);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

// 删除
customerRouter.delete('/:id', autoRole(), async (req, res) => {
  try {
    const before = await prisma.customer.findUnique({ where: { id: req.params.id } });
    await prisma.customer.delete({ where: { id: req.params.id } });
    caches.customers.invalidate('list:all');
    recordAudit('customer', req.params.id, 'delete', null, { method: 'DELETE', summary: `删除客户 ${before?.name}` }, actorFromReq(req));
    res.json({ ok: true });
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

// 统计
customerRouter.get('/_stats/summary', async (req, res) => {
  const all = await prisma.customer.findMany({
    include: { _count: { select: { projects: true, contacts: true } } },
  });
  const total = all.length;
  const active = all.filter(c => c.status === 'active').length;
  const byType: Record<string, number> = {};
  all.forEach(c => { byType[c.type] = (byType[c.type] || 0) + 1; });
  res.json({ total, active, byType, customers: all });
});
