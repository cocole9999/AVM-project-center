/**
 * 外部依赖管理路由 - V1.7.1
 * 台架 / 实车 / 车模 / SDB / UE / UI / 标定
 *
 * GET    /api/dependencies          - 列表 (按 type/status/projectCode/workItemKey 过滤)
 * GET    /api/dependencies/:id      - 详情
 * POST   /api/dependencies          - 创建
 * PATCH  /api/dependencies/:id      - 更新
 * DELETE /api/dependencies/:id      - 删除
 * GET    /api/dependencies/stats    - 统计（按 type / status）
 * POST   /api/dependencies/:id/ready - 标记已就绪
 */
import { Router } from 'express';
import { prisma } from '../db';
import { requireAuth, autoRole } from '../middleware/auth';
import { recordAudit, actorFromReq } from '../utils/audit';
import { asyncHandler } from '../middleware/validate';

export const dependencyRouter = Router();

// V1.11: 鉴权 + 写保护
dependencyRouter.use(requireAuth);
dependencyRouter.use(autoRole());

const VALID_TYPES = ['台架', '实车', '车模', 'SDB', 'UE', 'UI', '标定', '其他'];
const VALID_STATUS = ['pending', 'preparing', 'ready', 'blocked', 'cancelled'];

// 列表
dependencyRouter.get('/', asyncHandler(async (req, res) => {
  const where: any = {};
  if (req.query.type) where.type = req.query.type;
  if (req.query.status) where.status = req.query.status;
  if (req.query.owner) where.owner = req.query.owner;
  if (req.query.projectCode) {
    const p = await prisma.project.findUnique({ where: { code: req.query.projectCode as string } });
    if (p) where.projectId = p.id;
    else where.projectId = '__none__';
  }
  if (req.query.workItemKey) {
    const w = await prisma.workItem.findUnique({ where: { key: req.query.workItemKey as string } });
    if (w) where.workItemId = w.id;
    else where.workItemId = '__none__';
  }

  const list = await prisma.externalDependency.findMany({
    where,
    include: {
      project: { select: { id: true, code: true, name: true } },
      workItem: { select: { id: true, key: true, title: true, status: true } },
    },
    orderBy: [{ status: 'asc' }, { expectedDate: 'asc' }],
  });
  res.json(list);
}));

// 统计
dependencyRouter.get('/stats/summary', asyncHandler(async (_req, res) => {
  const all = await prisma.externalDependency.findMany();
  const byType: Record<string, number> = {};
  const byStatus: Record<string, number> = {};
  let overdue = 0;
  const today = new Date();
  for (const d of all) {
    byType[d.type] = (byType[d.type] || 0) + 1;
    byStatus[d.status] = (byStatus[d.status] || 0) + 1;
    if (d.expectedDate && new Date(d.expectedDate) < today && d.status !== 'ready' && d.status !== 'cancelled') {
      overdue++;
    }
  }
  res.json({ total: all.length, byType, byStatus, overdue });
}));

// 详情
dependencyRouter.get('/:id', asyncHandler(async (req, res) => {
  const dep = await prisma.externalDependency.findUnique({
    where: { id: req.params.id },
    include: {
      project: { select: { id: true, code: true, name: true } },
      workItem: { select: { id: true, key: true, title: true, status: true } },
    },
  });
  if (!dep) return res.status(404).json({ error: '依赖不存在' });
  res.json(dep);
}));

// 创建
dependencyRouter.post('/', autoRole(), asyncHandler(async (req, res) => {
  const { type, name, description, status, owner, expectedDate, actualDate, blocker, workItemId, projectId, spaceId, createdBy } = req.body;
  if (!type) return res.status(400).json({ error: 'type 必填' });
  if (!VALID_TYPES.includes(type)) return res.status(400).json({ error: `type 必须是: ${VALID_TYPES.join('/')}` });
  if (!name) return res.status(400).json({ error: 'name 必填' });

  // 解析 workItemKey -> workItemId
  let resolvedWorkItemId = workItemId || null;
  if (!resolvedWorkItemId && req.body.workItemKey) {
    const w = await prisma.workItem.findUnique({ where: { key: req.body.workItemKey } });
    if (w) resolvedWorkItemId = w.id;
  }
  // 解析 projectCode -> projectId
  let resolvedProjectId = projectId || null;
  if (!resolvedProjectId && req.body.projectCode) {
    const p = await prisma.project.findUnique({ where: { code: req.body.projectCode } });
    if (p) resolvedProjectId = p.id;
  }

  const dep = await prisma.externalDependency.create({
    data: {
      type, name,
      description: description || '',
      status: status || 'pending',
      owner: owner || '',
      expectedDate: expectedDate ? new Date(expectedDate) : null,
      actualDate: actualDate ? new Date(actualDate) : null,
      blocker: blocker || '',
      workItemId: resolvedWorkItemId,
      projectId: resolvedProjectId,
      spaceId: spaceId || null,
      createdBy: createdBy || null,
    },
  });
  recordAudit('dependency', dep.id, 'create', null, { method: 'POST', summary: `创建依赖 ${type} ${name}` }, actorFromReq(req));
  res.status(201).json(dep);
}));

// 更新
dependencyRouter.patch('/:id', autoRole(), asyncHandler(async (req, res) => {
  const data: any = {};
  const allowed = ['type', 'name', 'description', 'status', 'owner', 'expectedDate', 'actualDate', 'blocker', 'workItemId', 'projectId'];
  for (const f of allowed) {
    if (req.body[f] !== undefined) data[f] = req.body[f];
  }
  // 日期字段转 Date
  if (data.expectedDate) data.expectedDate = new Date(data.expectedDate);
  if (data.actualDate) data.actualDate = new Date(data.actualDate);

  if (data.status && !VALID_STATUS.includes(data.status)) {
    return res.status(400).json({ error: `status 必须是: ${VALID_STATUS.join('/')}` });
  }
  if (data.type && !VALID_TYPES.includes(data.type)) {
    return res.status(400).json({ error: `type 必须是: ${VALID_TYPES.join('/')}` });
  }
  if (data.status === 'blocked' && !data.blocker) {
    const existing = await prisma.externalDependency.findUnique({ where: { id: req.params.id } });
    if (existing && !existing.blocker && !data.blocker) {
      return res.status(400).json({ error: '状态为 blocked 时 blocker 必填' });
    }
  }

  const dep = await prisma.externalDependency.update({
    where: { id: req.params.id },
    data,
  });
  const action = data.status ? 'status_change' : 'update';
  recordAudit('dependency', dep.id, action, null, { method: 'PATCH', summary: `${data.status ? '改状态' : '更新'}依赖 ${dep.name}` }, actorFromReq(req));
  res.json(dep);
}));

// 标记已就绪
dependencyRouter.post('/:id/ready', autoRole(), asyncHandler(async (req, res) => {
  const dep = await prisma.externalDependency.update({
    where: { id: req.params.id },
    data: { status: 'ready', actualDate: new Date() },
  });
  recordAudit('dependency', dep.id, 'status_change', null, { method: 'POST', summary: `依赖 ${dep.name} 标记就绪` }, actorFromReq(req));
  res.json({ ok: true, dep });
}));

// 删除
dependencyRouter.delete('/:id', autoRole(), asyncHandler(async (req, res) => {
  const before = await prisma.externalDependency.findUnique({ where: { id: req.params.id } });
  await prisma.externalDependency.delete({ where: { id: req.params.id } });
  recordAudit('dependency', req.params.id, 'delete', null, { method: 'DELETE', summary: `删除依赖 ${before?.name}` }, actorFromReq(req));
  res.status(204).end();
}));
