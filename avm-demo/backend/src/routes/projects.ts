/**
 * V1.7 AVM 集成项目管理
 * 一个项目 = 一个 AVM 集成项目（绑定 1 个客户 + 1 个车型）
 * 字段：合同类型（ODC/ODM/固定价）、合同金额、预算工时、已用工时、风险等级、进度
 */
import { Router } from 'express';
import { prisma } from '../db';
import { caches, withCache } from '../cache';
import { requireAuth, autoRole } from '../middleware/auth';
import { recordAudit, actorFromReq, diffFields } from '../utils/audit';
import { validate } from '../middleware/validate';
import { createProjectSchema, updateProjectSchema } from '../schemas/project';
import { withTenant } from '../middleware/tenant';
import { asyncHandler } from '../middleware/validate';

export const projectRouter = Router();

// V1.11: 所有路由都要鉴权 (开发模式默认放行, 生产模式严格)
projectRouter.use(requireAuth);
projectRouter.use(withTenant);

// 列表 + 过滤（V1.10 加 LRU 缓存，5min TTL，无过滤时命中）
projectRouter.get('/', async (req, res) => {
  const { q, status, customerId, carModelId, billingType, pmUserId, risk } = req.query as any;
  // 有过滤条件不走缓存（key 太多）
  const hasFilter = !!(q || status || customerId || carModelId || billingType || pmUserId || risk);
  if (!hasFilter) {
    const cached = caches.projects.get('list:all');
    if (cached) return res.json(cached);
  }
  const where: any = {};
  if (status) where.status = status;
  if (customerId) where.customerId = customerId;
  if (carModelId) where.carModelId = carModelId;
  if (billingType) where.billingType = billingType;
  if (pmUserId) where.pmUserId = pmUserId;
  if (risk) where.risk = risk;
  if (q) {
    where.OR = [
      { name: { contains: q } },
      { code: { contains: q } },
      { description: { contains: q } },
    ];
  }
  const list = await prisma.project.findMany({
    where,
    include: {
      customer: { select: { id: true, name: true, shortName: true, code: true } },
      carModel: { select: { id: true, name: true, code: true, brand: true } },
      _count: { select: { workItems: true } },
    },
    orderBy: [{ status: 'asc' }, { startDate: 'desc' }],
  });
  if (!hasFilter) caches.projects.set('list:all', list);
  res.json(list);
});

// 详情
projectRouter.get('/:id', async (req, res) => {
  const p = await prisma.project.findUnique({
    where: { id: req.params.id },
    include: {
      customer: { include: { contacts: { orderBy: [{ primary: 'desc' }, { role: 'asc' }] } } },
      carModel: true,
      workItems: {
        orderBy: [{ type: 'asc' }, { planStart: 'asc' }],
        select: { id: true, key: true, type: true, title: true, status: true, priority: true, assignee: true, estimate: true, actualHours: true, planStart: true, planEnd: true },
      },
      _count: { select: { workItems: true } },
    },
  });
  if (!p) return res.status(404).json({ error: '项目不存在' });
  res.json(p);
});

// 创建
projectRouter.post('/', autoRole(), validate(createProjectSchema), async (req, res) => {
  try {
    // 使用 Zod 校验后的白名单字段，防止 mass assignment
    const data = createProjectSchema.parse(req.body);
    // 日期字段转换为 Date 对象
    if (data.startDate) data.startDate = new Date(data.startDate) as any;
    if (data.endDate) data.endDate = new Date(data.endDate) as any;
    const p = await prisma.project.create({ data: data as any });
    caches.projects.invalidate('list:all');
    recordAudit('project', p.id, 'create', null, {
      ip: req.ip, method: 'POST', path: '/projects', summary: `创建项目 ${p.code} ${p.name}`
    }, actorFromReq(req));
    res.status(201).json(p);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

// 更新
projectRouter.patch('/:id', autoRole(), validate(updateProjectSchema), async (req, res) => {
  try {
    const before = await prisma.project.findUnique({ where: { id: req.params.id } });
    // 使用 Zod 校验后的白名单字段
    const data = updateProjectSchema.parse(req.body);
    // 日期字段转换
    if (data.startDate) data.startDate = new Date(data.startDate) as any;
    if (data.endDate) data.endDate = new Date(data.endDate) as any;
    const p = await prisma.project.update({ where: { id: req.params.id }, data: data as any });
    caches.projects.invalidate('list:all');
    if (before) {
      const changes = diffFields(before as any, p as any, [
        'name', 'status', 'risk', 'progress', 'billingType',
        'contractAmount', 'budgetHours', 'consumedHours',
        'startDate', 'endDate', 'pmUserId', 'description',
      ]);
      const action = changes.length === 1 && changes[0].field === 'status' ? 'status_change' : 'update';
      recordAudit('project', p.id, action, changes, {
        ip: req.ip, method: 'PATCH', path: '/projects/:id', summary: `更新项目 ${p.code} (${changes.length} 项变化)`
      }, actorFromReq(req));
    }
    res.json(p);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

// 删除
projectRouter.delete('/:id', autoRole(), async (req, res) => {
  try {
    const before = await prisma.project.findUnique({ where: { id: req.params.id } });
    await prisma.project.delete({ where: { id: req.params.id } });
    caches.projects.invalidate('list:all');
    recordAudit('project', req.params.id, 'delete', null, {
      ip: req.ip, method: 'DELETE', path: '/projects/:id',
      summary: `删除项目 ${before?.code} ${before?.name}`
    }, actorFromReq(req));
    res.json({ ok: true });
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

// 项目统计
projectRouter.get('/_stats/summary', async (req, res) => {
  const all = await prisma.project.findMany({
    include: { customer: true, carModel: true },
  });
  const byStatus: Record<string, number> = {};
  const byBillingType: Record<string, number> = {};
  const byRisk: Record<string, number> = {};
  let totalContract = 0;
  let totalBudget = 0;
  let totalConsumed = 0;
  all.forEach(p => {
    byStatus[p.status] = (byStatus[p.status] || 0) + 1;
    byBillingType[p.billingType] = (byBillingType[p.billingType] || 0) + 1;
    byRisk[p.risk] = (byRisk[p.risk] || 0) + 1;
    totalContract += p.contractAmount;
    totalBudget += p.budgetHours;
    totalConsumed += p.consumedHours;
  });
  res.json({
    total: all.length,
    byStatus,
    byBillingType,
    byRisk,
    totalContract,
    totalBudget,
    totalConsumed,
    utilizationRate: totalBudget ? Math.round((totalConsumed / totalBudget) * 100) : 0,
  });
});
