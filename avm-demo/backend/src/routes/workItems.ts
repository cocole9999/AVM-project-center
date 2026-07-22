import { Router } from 'express';
import { prisma } from '../db';
import { STATUS_BY_TYPE, TYPE_OPTIONS } from '../constants';
import { initWorkItemNode } from '../services/flowEngine';
import { requireAuth, autoRole } from '../middleware/auth';
import { recordAudit, actorFromReq } from '../utils/audit';

export const workItemRouter = Router();

// V1.11: 鉴权 + 写保护 (dev 模式无 token 默认 tenant_admin)
workItemRouter.use(requireAuth);
workItemRouter.use(autoRole());

// 生成下一�?业务编号
async function nextKey(type: string): Promise<string> {
  const prefix =
    type === 'requirement' ? 'REQ'
    : type === 'task' ? 'TASK'
    : type === 'bug' ? 'BUG'
    : 'REL';
  const count = await prisma.workItem.count({ where: { type } });
  return `${prefix}-${count + 1}`;
}

// GET /api/work-items - 列表查�??（支持筛选）
workItemRouter.get('/', async (req, res) => {
  const {
    type, status, priority, assignee, iterationId, q, parentId, module,
  } = req.query as Record<string, string | undefined>;

  const where: any = {};
  if (type && type !== 'all') where.type = type;
  if (status) where.status = status;
  if (priority) where.priority = priority;
  if (assignee) where.assignee = assignee;
  if (iterationId) where.iterationId = iterationId;
  if (module) where.module = module;
  if (parentId === 'null' || parentId === 'root') {
    where.parentId = null;
  } else if (parentId) {
    where.parentId = parentId;
  }
  if (q) {
    where.OR = [
      { title: { contains: q } },
      { key: { contains: q } },
      { description: { contains: q } },
    ];
  }

  const items = await prisma.workItem.findMany({
    where,
    orderBy: [{ updatedAt: 'desc' }],
    include: {
      iteration: { select: { id: true, name: true, status: true } },
      project: { select: { id: true, code: true, name: true } },
      customer: { select: { id: true, shortName: true, name: true } },
      carModel: { select: { id: true, name: true, brand: true } },
      _count: { select: { children: true, comments: true } },
    },
  });
  res.json(items);
});

// V1.9 甘特图数据
// GET /api/work-items/gantt?projectCode=&from=&to=&includeUnscheduled=true
// 返回 { projects: [{code, name, startDate, endDate}], items: [{id,key,title,type,status,priority,assignee,planStart,planEnd,actualStart,actualEnd,hasSchedule,projectCode,parentId}], dateRange: {from, to} }

// V1.28 工作量趋势: 估分/实际工时 随时间变化
// GET /api/work-items/:id/estimate-history
// 返回 [{date: '2026-07-01', estimate: 8, actualHours: 5}, ...]  按时间正序
workItemRouter.get('/:id/estimate-history', async (req, res) => {
  try {
    const { id } = req.params;
    const workItem = await prisma.workItem.findFirst({ where: { OR: [{ id }, { key: id }] } });
    if (!workItem) return res.status(404).json({ error: 'WorkItem not found' });

    // 找 activity 里跟 estimate/actualHours 相关的变更 (Activity 有 field 字段, AuditLog 没有)
    const activities = await prisma.activity.findMany({
      where: {
        workItemId: workItem.id,
        field: { in: ['estimate', 'actualHours'] },
      },
      orderBy: { createdAt: 'asc' },
    });

    // 重建时间线
    const points: Array<{ date: string; estimate: number | null; actualHours: number | null; action: string }> = [];
    let currentEst = workItem.estimate;
    let currentAct = workItem.actualHours;
    points.push({ date: workItem.createdAt.toISOString().slice(0, 10), estimate: currentEst, actualHours: currentAct, action: 'created' });
    for (const a of activities) {
      const val = a.newValue != null && a.newValue !== '' ? Number(a.newValue) : null;
      if (a.field === 'estimate' && val != null && !isNaN(val)) currentEst = val;
      if (a.field === 'actualHours' && val != null && !isNaN(val)) currentAct = val;
      points.push({ date: a.createdAt.toISOString().slice(0, 10), estimate: currentEst, actualHours: currentAct, action: `${a.field}_changed` });
    }
    res.json({ workItemId: workItem.id, points });
  } catch (e: any) {
    console.error('[work-items/estimate-history]', e);
    res.status(500).json({ error: e.message });
  }
});
workItemRouter.get('/gantt', async (req, res) => {
  try {
    const { projectCode, from, to, includeUnscheduled = 'true' } = req.query as Record<string, string | undefined>;

    const projectWhere: any = {};
    if (projectCode) projectWhere.code = projectCode;
    const projects = await prisma.project.findMany({
      where: projectWhere,
      select: { id: true, code: true, name: true, startDate: true, endDate: true, status: true, progress: true },
      orderBy: { code: 'asc' },
    });
    if (projects.length === 0) {
      return res.json({ projects: [], items: [], dateRange: { from, to } });
    }

    // 工作项 where 条件
    const projectIds = projects.map(p => p.id);
    const itemWhere: any = { projectId: { in: projectIds } };
    // 时间窗过滤
    if (from || to) {
      const fromDate = from ? new Date(from) : new Date('2000-01-01');
      const toDate = to ? new Date(to) : new Date('2100-01-01');
      itemWhere.OR = [
        { planStart: { gte: fromDate, lte: toDate } },
        { planEnd: { gte: fromDate, lte: toDate } },
        // 跨整个时间窗的工作项（开始早 + 结束晚）
        { AND: [{ planStart: { lte: fromDate } }, { planEnd: { gte: toDate } }] },
      ];
    }
    if (includeUnscheduled === 'false') {
      itemWhere.planStart = { not: null };
      itemWhere.planEnd = { not: null };
    }

    const items = await prisma.workItem.findMany({
      where: itemWhere,
      select: {
        id: true, key: true, title: true, type: true, status: true, priority: true,
        assignee: true, estimate: true, actualHours: true,
        planStart: true, planEnd: true, actualStart: true, actualEnd: true,
        parentId: true,
        project: { select: { id: true, code: true, name: true } },
        iteration: { select: { id: true, name: true } },
        // V1.12.1: include 关联 (用于甘特图画依赖连线)
        relatedFrom: { select: { id: true, toId: true, relationType: true } },
        relatedTo: { select: { id: true, fromId: true, relationType: true } },
      },
      orderBy: [{ planStart: 'asc' }, { createdAt: 'asc' }],
    });

    // 标记 hasSchedule + 推算 dateRange
    const marked = items.map(i => ({
      ...i,
      hasSchedule: !!(i.planStart && i.planEnd),
    }));

    // V1.12.1: 提取所有 relations（去重 + 标准化方向：from 是被依赖方，to 是前置依赖方）
    // 用于前端 SVG 画箭头: from -> to 表示"from 依赖 to"（to 必须先完成）
    const relMap = new Map<string, { id: string; fromId: string; toId: string; type: string }>();
    for (const it of marked) {
      for (const r of (it as any).relatedFrom || []) {
        relMap.set(r.id, { id: r.id, fromId: r.toId, toId: it.id, type: r.relationType });
      }
      for (const r of (it as any).relatedTo || []) {
        relMap.set(r.id, { id: r.id, fromId: r.fromId, toId: it.id, type: r.relationType });
      }
    }
    const relations = Array.from(relMap.values());

    // 推算实际展示的 dateRange
    let rangeFrom = from ? String(from).slice(0, 10) : '';
    let rangeTo = to ? String(to).slice(0, 10) : '';
    if (!rangeFrom || !rangeTo) {
      // 从项目和所有工作项推算
      const allDates: string[] = [];
      for (const p of projects) {
        allDates.push(new Date(p.startDate).toISOString().slice(0, 10));
        allDates.push(new Date(p.endDate).toISOString().slice(0, 10));
      }
      for (const i of items) {
        if (i.planStart) allDates.push(new Date(i.planStart).toISOString().slice(0, 10));
        if (i.planEnd) allDates.push(new Date(i.planEnd).toISOString().slice(0, 10));
      }
      if (allDates.length) {
        allDates.sort();
        if (!rangeFrom) rangeFrom = allDates[0];
        if (!rangeTo) rangeTo = allDates[allDates.length - 1];
      }
    }

    res.json({
      projects: projects.map(p => ({
        id: p.id, code: p.code, name: p.name, status: p.status, progress: p.progress,
        startDate: p.startDate, endDate: p.endDate,
      })),
      items: marked,
      relations,  // V1.12.1
      dateRange: { from: rangeFrom, to: rangeTo },
      summary: {
        projectCount: projects.length,
        itemCount: items.length,
        scheduledCount: items.filter(i => i.planStart && i.planEnd).length,
        unscheduledCount: items.filter(i => !i.planStart || !i.planEnd).length,
        relationCount: relations.length,
      },
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// V1.29 工作量按人分布: 全公司/项目/迭代 工时聚合
// GET /api/work-items/workload-by-user?projectCode=&iterationId=
// 返回 [{ user, totalEstimate, totalActual, itemCount, doneCount, overdueCount }]
// 注意: 必须放在 `/:id` 路由之前, 否则会被当成 workItem id 找
workItemRouter.get('/workload-by-user', async (req, res) => {
  try {
    const where: any = {};
    if (req.query.projectCode) where.project = { code: String(req.query.projectCode) };
    if (req.query.iterationId) where.iterationId = String(req.query.iterationId);
    const items = await prisma.workItem.findMany({
      where,
      select: { assignee: true, estimate: true, actualHours: true, status: true, planEnd: true },
    });
    const byUser: Record<string, { totalEstimate: number; totalActual: number; itemCount: number; doneCount: number; overdueCount: number }> = {};
    const now = new Date();
    for (const it of items) {
      const u = it.assignee || '未指派';
      if (!byUser[u]) byUser[u] = { totalEstimate: 0, totalActual: 0, itemCount: 0, doneCount: 0, overdueCount: 0 };
      byUser[u].totalEstimate += it.estimate || 0;
      byUser[u].totalActual += it.actualHours || 0;
      byUser[u].itemCount++;
      if (['已完成', '已关闭', '已驳回', '已发布', '已验收'].includes(it.status)) byUser[u].doneCount++;
      if (it.planEnd && new Date(it.planEnd) < now && !['已完成', '已关闭', '已驳回', '已发布', '已验收'].includes(it.status)) byUser[u].overdueCount++;
    }
    const out = Object.entries(byUser).map(([user, v]) => ({ user, ...v })).sort((a, b) => b.totalEstimate - a.totalEstimate);
    res.json({ byUser: out, totalItems: items.length });
  } catch (e: any) {
    console.error('[work-items/workload-by-user]', e);
    res.status(500).json({ error: e.message });
  }
});

// GET /api/work-items/:id - 详情（支持 id 或 key 如 REQ-1）
workItemRouter.get('/:id', async (req, res) => {
  // 先用 id 查，没有再用 key 查
  let item = await prisma.workItem.findUnique({ where: { id: req.params.id } });
  if (!item) {
    item = await prisma.workItem.findUnique({ where: { key: req.params.id } });
    if (!item) return res.status(404).json({ error: 'WorkItem not found' });
  }
  // 用查到的 id 重新 include（统一代码）
  const fullItem = await prisma.workItem.findUnique({
    where: { id: item.id },
    include: {
      iteration: true,
      parent: { select: { id: true, key: true, title: true, type: true } },
      children: { select: { id: true, key: true, title: true, type: true, status: true, assignee: true, priority: true } },
      relatedFrom: { include: { to: { select: { id: true, key: true, title: true, type: true, status: true } } } },
      relatedTo: { include: { from: { select: { id: true, key: true, title: true, type: true, status: true } } } },
      comments: { orderBy: { createdAt: 'asc' } },
      // V1.7 �ͻ�/����/��Ŀ
      project: { select: { id: true, code: true, name: true, status: true, billingType: true } },
      customer: { select: { id: true, name: true, shortName: true, code: true } },
      carModel: { select: { id: true, name: true, code: true, brand: true } },
    },
  });
  if (!fullItem) return res.status(404).json({ error: 'WorkItem not found' });
  res.json(fullItem);
});

// POST /api/work-items - 创建
workItemRouter.post('/', async (req, res) => {
  const {
    type, title, description = '', priority, severity,
    assignee, reporter, module: mod, labels, iterationId,
    estimate, planStart, planEnd, parentId,
    projectId, carModelId, customerId,  // V1.7
  } = req.body;

  if (!TYPE_OPTIONS.includes(type)) {
    return res.status(400).json({ error: `Invalid type: ${type}` });
  }
  if (!title?.trim()) {
    return res.status(400).json({ error: 'Title is required' });
  }

  const statusConfig = STATUS_BY_TYPE[type as keyof typeof STATUS_BY_TYPE];
  const key = await nextKey(type);

  const created = await prisma.workItem.create({
    data: {
      type,
      key,
      title: title.trim(),
      description,
      status: statusConfig.initial,
      priority: priority || 'P2',
      severity: severity || null,
      assignee: assignee || null,
      reporter: reporter || '系统',
      module: mod || null,
      labels: labels || '',
      iterationId: iterationId || null,
      estimate: estimate != null ? Number(estimate) : null,
      planStart: planStart ? new Date(planStart) : null,
      planEnd: planEnd ? new Date(planEnd) : null,
      parentId: parentId || null,
      // V1.7
      projectId: projectId || null,
      carModelId: carModelId || null,
      customerId: customerId || null,
    },
  });

  // 尝试关联到流程的起�?�节点（V1.1�?
  try {
    await initWorkItemNode(created.id, type);
  } catch {
    // 流程不存在时不影响创�?
  }

  await prisma.activity.create({
    data: {
      workItemId: created.id,
      actor: reporter || '系统',
      action: 'created',
      newValue: `${created.key} ${created.title}`,
    },
  });

  res.status(201).json(created);
});

// PATCH /api/work-items/:id - 更新（支持 id 或 key）
workItemRouter.patch('/:id', async (req, res) => {
  try {
  let before = await prisma.workItem.findUnique({ where: { id: req.params.id } });
  if (!before) before = await prisma.workItem.findUnique({ where: { key: req.params.id } });
  if (!before) return res.status(404).json({ error: 'WorkItem not found' });

  const allowed: any = {};
  const {
    title, description, status, priority, severity,
    assignee, reporter, module: mod, labels, iterationId,
    estimate, actualHours, planStart, planEnd, actualStart, actualEnd,
    parentId,
    projectId, carModelId, customerId,  // V1.7
  } = req.body;

  // V1.27 文本字段长度上限 (防止 DoS / 存储爆炸)
  if (title !== undefined) {
    if (typeof title !== 'string') return res.status(400).json({ error: 'title 必须是字符串' });
    if (title.length > 200) return res.status(400).json({ error: 'title 长度不能超过 200' });
    allowed.title = title;
  }
  if (description !== undefined) {
    if (typeof description !== 'string') return res.status(400).json({ error: 'description 必须是字符串' });
    if (description.length > 10000) return res.status(400).json({ error: 'description 长度不能超过 10000' });
    allowed.description = description;
  }
  if (status !== undefined) {
    // 校验状�?机
    const cfg = STATUS_BY_TYPE[before.type as keyof typeof STATUS_BY_TYPE];
    if (!cfg.values.includes(status)) {
      return res.status(400).json({ error: `Invalid status '${status}' for type '${before.type}'` });
    }
    allowed.status = status;

    // 首次进?"进行中"自动记录 actualStart
    const inProgress = ['开发中', '修复中', '进行中', '集成中'];
    const completed = ['已关闭', '已驳回', '已完成', '已发布', '已验收'];
    if (inProgress.includes(status) && !before.actualStart) {
      allowed.actualStart = new Date();
    }
    if (completed.includes(status) && !before.actualEnd) {
      allowed.actualEnd = new Date();
    }
  }
  if (priority !== undefined) allowed.priority = priority;
  if (severity !== undefined) allowed.severity = severity;
  if (assignee !== undefined) allowed.assignee = assignee;
  if (reporter !== undefined) allowed.reporter = reporter;
  if (mod !== undefined) allowed.module = mod;
  if (labels !== undefined) allowed.labels = labels;
  if (iterationId !== undefined) allowed.iterationId = iterationId || null;

  // V1.27 数值字段范围校验 + 日期有效性校验
  if (estimate !== undefined) {
    const n = estimate != null ? Number(estimate) : null;
    if (n != null && (isNaN(n) || n < 0 || n > 10000)) {
      return res.status(400).json({ error: 'estimate 必须在 0-10000 小时之间' });
    }
    allowed.estimate = n;
  }
  if (actualHours !== undefined) {
    const n = actualHours != null ? Number(actualHours) : null;
    if (n != null && (isNaN(n) || n < 0 || n > 10000)) {
      return res.status(400).json({ error: 'actualHours 必须在 0-10000 小时之间' });
    }
    allowed.actualHours = n;
  }
  const parseDate = (v: any, field: string) => {
    if (v === null || v === undefined || v === '') return null;
    const d = new Date(v);
    if (isNaN(d.getTime())) {
      throw { __dateError: true, field, value: v };
    }
    return d;
  };
  try {
    if (planStart !== undefined) allowed.planStart = parseDate(planStart, 'planStart');
    if (planEnd !== undefined) allowed.planEnd = parseDate(planEnd, 'planEnd');
    if (actualStart !== undefined) allowed.actualStart = parseDate(actualStart, 'actualStart');
    if (actualEnd !== undefined) allowed.actualEnd = parseDate(actualEnd, 'actualEnd');
  } catch (de: any) {
    if (de && de.__dateError) {
      return res.status(400).json({ error: `${de.field} 日期格式无效: '${de.value}'` });
    }
    throw de;
  }

  if (parentId !== undefined) allowed.parentId = parentId || null;
  // V1.7
  if (projectId !== undefined) allowed.projectId = projectId || null;
  if (carModelId !== undefined) allowed.carModelId = carModelId || null;
  if (customerId !== undefined) allowed.customerId = customerId || null;

  const updated = await prisma.workItem.update({
    where: { id: before.id },  // 用 before.id（不是 req.params.id，支持 key）
    data: allowed,
  });

  // 记录动??
  if (req.body.actor || reporter) {
    const actor = req.body.actor || '系统';
    if (before.status !== updated.status) {
      await prisma.activity.create({
        data: {
          workItemId: updated.id, actor,
          action: 'status_changed',
          field: 'status',
          oldValue: before.status,
          newValue: updated.status,
        },
      });
    }
    // 字段变更记录
    for (const k of Object.keys(allowed)) {
      if (k === 'status') continue;
      const oldV = (before as any)[k];
      const newV = (updated as any)[k];
      if (oldV !== newV) {
        await prisma.activity.create({
          data: {
            workItemId: updated.id, actor,
            action: 'field_changed',
            field: k,
            oldValue: oldV == null ? null : String(oldV),
            newValue: newV == null ? null : String(newV),
          },
        });
      }
    }
  }

  res.json(updated);
  } catch (e: any) {
    console.error('[workItems PATCH]', e);
    if (!res.headersSent) res.status(500).json({ error: e.message || 'Internal error' });
  }
});

// DELETE /api/work-items/:id - 删除
workItemRouter.delete('/:id', async (req, res) => {
  await prisma.workItem.delete({ where: { id: req.params.id } });
  res.status(204).end();
});

// POST /api/work-items/:id/relations - 添加关联
workItemRouter.post('/:id/relations', async (req, res) => {
  const { toId, relationType } = req.body;
  if (!toId || !relationType) {
    return res.status(400).json({ error: 'toId and relationType required' });
  }
  if (toId === req.params.id) {
    return res.status(400).json({ error: 'Cannot relate to self' });
  }
  const rel = await prisma.workItemRelation.create({
    data: { fromId: req.params.id, toId, relationType },
  });
  res.status(201).json(rel);
});

// DELETE /api/work-items/:id/relations/:relId - 删除关联
workItemRouter.delete('/:id/relations/:relId', async (req, res) => {
  await prisma.workItemRelation.delete({ where: { id: req.params.relId } });
  res.status(204).end();
});

// V1.29 工作量按人分布: 全公司/项目/迭代 工时聚合
// GET /api/work-items/workload-by-user?projectCode=&iterationId=
// 返回 [{ user, totalEstimate, totalActual, itemCount, doneCount, overdueCount }]
// (旧位置: 在 :id 之后导致被 catch-all 拦截. 已前移到 :id 之前)

// GET /api/work-items/:id/dependency-graph?depth=3
// V1.29: 同时收集 ExternalDependency (台架/实车/车模/SDB/...) — 节点 kind: 'ext'
workItemRouter.get('/:id/dependency-graph', async (req, res) => {
  try {
    const rootId = req.params.id;
    const depth = Math.min(parseInt((req.query.depth as string) || '3', 10) || 3, 6);
    // 找 workItem (支持 id 或 key)
    let root = await prisma.workItem.findUnique({ where: { id: rootId } });
    if (!root) root = await prisma.workItem.findUnique({ where: { key: rootId } });
    if (!root) return res.status(404).json({ error: 'WorkItem not found' });

    const visited = new Set<string>();
    const nodes: any[] = [];
    const edges: any[] = [];
    const queue: Array<{ id: string; d: number }> = [{ id: root.id, d: 0 }];
    while (queue.length > 0) {
      const { id, d } = queue.shift()!;
      if (visited.has(id)) continue;
      visited.add(id);
      if (d > depth) continue;
      // 拿这个 workItem + 它的 relations
      const wi = await prisma.workItem.findUnique({
        where: { id },
        include: {
          relatedTo: { include: { to: { select: { id: true, key: true, title: true, status: true, type: true } } } },
          relatedFrom: { include: { from: { select: { id: true, key: true, title: true, status: true, type: true } } } },
        },
      });
      if (!wi) continue;
      nodes.push({ id: wi.id, key: wi.key, title: wi.title, status: wi.status, type: wi.type, priority: wi.priority, kind: 'workItem' });
      for (const r of wi.relatedTo) {
        edges.push({ from: wi.id, to: r.to.id, relationType: r.relationType });
        if (!visited.has(r.to.id)) queue.push({ id: r.to.id, d: d + 1 });
      }
      for (const r of wi.relatedFrom) {
        edges.push({ from: r.from.id, to: wi.id, relationType: r.relationType });
        if (!visited.has(r.from.id)) queue.push({ id: r.from.id, d: d + 1 });
      }
      // V1.29: 同时拉这个 workItem 关联的外部依赖 (台架/实车/SDB/...)
      const extDeps = await prisma.externalDependency.findMany({
        where: { workItemId: wi.id },
        select: { id: true, type: true, name: true, status: true, owner: true, expectedDate: true, blocker: true },
      });
      for (const ext of extDeps) {
        const nodeId = `ext:${ext.id}`;
        if (!visited.has(nodeId)) {
          nodes.push({
            id: nodeId, key: ext.name, title: ext.name, status: ext.status, type: ext.type, owner: ext.owner, expectedDate: ext.expectedDate, blocker: ext.blocker, kind: 'ext',
          });
          visited.add(nodeId);
        }
        edges.push({ from: wi.id, to: nodeId, relationType: 'requires' });
      }
    }
    res.json({ rootId: root.id, depth, nodes, edges });
  } catch (e: any) {
    console.error('[work-items/dependency-graph]', e);
    res.status(500).json({ error: e.message });
  }
});

// POST /api/work-items/bulk-status - 批量流转（看板拖拽）
workItemRouter.post('/bulk-status', async (req, res) => {
  const { ids, status, actor } = req.body;
  if (!Array.isArray(ids) || !status) {
    return res.status(400).json({ error: 'ids and status required' });
  }
  await prisma.$transaction(
    ids.map((id: string) =>
      prisma.workItem.update({
        where: { id },
        data: { status },
      })
    )
  );
  for (const id of ids) {
    await prisma.activity.create({
      data: {
        workItemId: id, actor: actor || '系统',
        action: 'status_changed',
        field: 'status', newValue: status,
      },
    });
  }
  res.json({ updated: ids.length });
});

// V1.18 批量更新: 支持 status/priority/assignee/iterationId/module 任意组合
// body: { ids: string[], changes: { status?, priority?, assignee?, iterationId?, module? } }
workItemRouter.post('/batch-update', async (req, res) => {
  const { ids, changes } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: 'ids (non-empty array) required' });
  }
  if (!changes || typeof changes !== 'object' || Object.keys(changes).length === 0) {
    return res.status(400).json({ error: 'changes (object) required' });
  }
  // 字段白名单 — 只允许这几个字段被批量改
  const ALLOWED = ['status', 'priority', 'assignee', 'iterationId', 'module', 'reporter', 'type'];
  const data: any = {};
  for (const k of ALLOWED) {
    if (changes[k] !== undefined) data[k] = changes[k];
  }
  if (Object.keys(data).length === 0) {
    return res.status(400).json({ error: `no allowed fields to update (allowed: ${ALLOWED.join(',')})` });
  }
  // 限流: 单次最多 200
  if (ids.length > 200) {
    return res.status(400).json({ error: 'too many ids (max 200 per batch)' });
  }

  // 拉旧值用于审计 + 活动日志
  const before = await prisma.workItem.findMany({
    where: { id: { in: ids } },
    select: { id: true, key: true, status: true, priority: true, assignee: true, iterationId: true, module: true, reporter: true, type: true },
  });
  if (before.length === 0) {
    return res.status(404).json({ error: 'no work items found for given ids' });
  }

  // 事务批量更新
  const result = await prisma.workItem.updateMany({
    where: { id: { in: ids } },
    data,
  });

  // 写活动日志 + 审计
  const changedFields = Object.keys(data);
  const actor = actorFromReq(req);
  for (const item of before) {
    const activityEntries = changedFields.map(f => ({
      workItemId: item.id,
      actor: actor?.username || '系统',
      action: 'field_changed',
      field: f,
      oldValue: String((item as any)[f] || ''),
      newValue: String(data[f] || ''),
    }));
    await prisma.activity.createMany({ data: activityEntries });
    // 审计 (per item, 1 entry with summary)
    const summary = changedFields.map(f => `${f}: ${(item as any)[f] || ''}→${data[f] || ''}`).join('; ');
    recordAudit('workItem', item.id, 'update', null, { method: 'POST /batch-update', summary: `${item.key} 批量更新 (${summary})` }, actor);
  }

  res.json({ updated: result.count, requested: ids.length, found: before.length, changes: data });
});