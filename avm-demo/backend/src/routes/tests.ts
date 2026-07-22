/**
 * 测试管理 API
 * 用例库 + 测试计划 + 测试执行 + 缺陷关联
 */
import { Router } from 'express';
import { prisma } from '../db';

export const testRouter = Router();

// =================== 用例库 ===================

testRouter.get('/cases', async (req, res) => {
  try {
    const { spaceId, module, caseType, priority, workItemId, status, q } = req.query as any;
    const where: any = {};
    if (spaceId) where.spaceId = spaceId;
    if (module) where.module = module;
    if (caseType) where.caseType = caseType;
    if (priority) where.priority = priority;
    if (workItemId) where.workItemId = workItemId;
    if (status) where.status = status;
    if (q) where.OR = [
      { title: { contains: q } },
      { code: { contains: q } },
      { tags: { contains: q } },
      { description: { contains: q } },
    ];
    const list = await prisma.testCase.findMany({ where, orderBy: [{ priority: 'asc' }, { code: 'asc' }] });
    res.json(list);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

testRouter.get('/cases/:id', async (req, res) => {
  const c = await prisma.testCase.findUnique({
    where: { id: req.params.id },
    include: { bugs: true, planCases: { include: { plan: true } } },
  });
  if (!c) return res.status(404).json({ error: 'Test case not found' });
  res.json(c);
});

testRouter.post('/cases', async (req, res) => {
  try {
    const { spaceId, code, title, description, caseType, priority, module, tags, preconditions, steps, expectedResult, workItemId, workItemKey, automated, createdBy } = req.body;
    if (!title) return res.status(400).json({ error: 'title required' });
    const finalCode = code || await generateCaseCode(module || 'GEN');
    const c = await prisma.testCase.create({
      data: {
        spaceId: spaceId || null, code: finalCode, title,
        description: description || '', caseType: caseType || 'functional',
        priority: priority || 'P1', module: module || '', tags: tags || '',
        preconditions: preconditions || '',
        steps: typeof steps === 'string' ? steps : JSON.stringify(steps || []),
        expectedResult: expectedResult || '',
        workItemId: workItemId || null, workItemKey: workItemKey || null,
        automated: automated || false, createdBy: createdBy || null,
      },
    });
    res.status(201).json(c);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

testRouter.patch('/cases/:id', async (req, res) => {
  try {
    const body = { ...req.body };
    if (body.steps && typeof body.steps !== 'string') body.steps = JSON.stringify(body.steps);
    const c = await prisma.testCase.update({ where: { id: req.params.id }, data: body });
    res.json(c);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

testRouter.delete('/cases/:id', async (req, res) => {
  try {
    await prisma.testCase.delete({ where: { id: req.params.id } });
    res.status(204).end();
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

async function generateCaseCode(module: string): Promise<string> {
  const safe = (module || 'GEN').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6) || 'GEN';
  const prefix = `TC-${safe}`;
  const count = await prisma.testCase.count({ where: { code: { startsWith: prefix } } });
  return `${prefix}-${(count + 1).toString().padStart(3, '0')}`;
}

// 用例-缺陷关联
testRouter.post('/cases/:id/bugs', async (req, res) => {
  try {
    const { bugId, bugKey, bugTitle, relationType, notes, createdBy } = req.body;
    const b = await prisma.testCaseBug.create({
      data: {
        caseId: req.params.id, bugId, bugKey, bugTitle,
        relationType: relationType || 'found_by', notes: notes || '',
        createdBy: createdBy || null,
      },
    });
    res.status(201).json(b);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

testRouter.delete('/cases/:id/bugs/:bugId', async (req, res) => {
  try {
    await prisma.testCaseBug.delete({
      where: { caseId_bugId: { caseId: req.params.id, bugId: req.params.bugId } },
    });
    res.status(204).end();
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

// =================== 测试计划 ===================

testRouter.get('/plans', async (req, res) => {
  try {
    const { spaceId, status, iterationId, ownerId } = req.query as any;
    const where: any = {};
    if (spaceId) where.spaceId = spaceId;
    if (status) where.status = status;
    if (iterationId) where.iterationId = iterationId;
    if (ownerId) where.ownerId = ownerId;
    const list = await prisma.testPlan.findMany({
      where, orderBy: { createdAt: 'desc' },
      include: { _count: { select: { planCases: true, runs: true } } },
    });
    res.json(list);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

testRouter.get('/plans/:id', async (req, res) => {
  const p = await prisma.testPlan.findUnique({
    where: { id: req.params.id },
    include: {
      planCases: { include: { case: true }, orderBy: { orderNum: 'asc' } },
      runs: { orderBy: { startedAt: 'desc' }, take: 10 },
    },
  });
  if (!p) return res.status(404).json({ error: 'Plan not found' });
  res.json(p);
});

testRouter.post('/plans', async (req, res) => {
  try {
    const { spaceId, name, description, iterationId, iterationName, workItemIds, startDate, endDate, ownerId, ownerName, participants, createdBy } = req.body;
    if (!name || !startDate || !endDate) return res.status(400).json({ error: 'name, startDate, endDate required' });
    const p = await prisma.testPlan.create({
      data: {
        spaceId: spaceId || null, name, description: description || '',
        iterationId: iterationId || null, iterationName: iterationName || null,
        workItemIds: typeof workItemIds === 'string' ? workItemIds : JSON.stringify(workItemIds || []),
        startDate: new Date(startDate), endDate: new Date(endDate),
        status: 'draft',
        ownerId: ownerId || null, ownerName: ownerName || null,
        participants: typeof participants === 'string' ? participants : JSON.stringify(participants || []),
        createdBy: createdBy || null,
      },
    });
    res.status(201).json(p);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

testRouter.patch('/plans/:id', async (req, res) => {
  try {
    const body = { ...req.body };
    if (body.workItemIds && typeof body.workItemIds !== 'string') body.workItemIds = JSON.stringify(body.workItemIds);
    if (body.participants && typeof body.participants !== 'string') body.participants = JSON.stringify(body.participants);
    if (body.startDate) body.startDate = new Date(body.startDate);
    if (body.endDate) body.endDate = new Date(body.endDate);
    const p = await prisma.testPlan.update({ where: { id: req.params.id }, data: body });
    res.json(p);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

testRouter.delete('/plans/:id', async (req, res) => {
  try {
    await prisma.testPlan.delete({ where: { id: req.params.id } });
    res.status(204).end();
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

// 计划-用例 关联
testRouter.post('/plans/:id/cases', async (req, res) => {
  try {
    const { caseIds, assignee, assigneeName } = req.body;
    if (!Array.isArray(caseIds) || caseIds.length === 0) {
      return res.status(400).json({ error: 'caseIds array required' });
    }
    const plan = await prisma.testPlan.findUnique({ where: { id: req.params.id } });
    if (!plan) return res.status(404).json({ error: 'Plan not found' });

    const existing = await prisma.testPlanCase.findMany({ where: { planId: plan.id } });
    const existingCaseIds = new Set(existing.map(e => e.caseId));
    const maxOrder = existing.reduce((m, e) => Math.max(m, e.orderNum), 0);

    const toCreate = caseIds
      .filter(cid => !existingCaseIds.has(cid))
      .map((cid, i) => ({
        planId: plan.id, caseId: cid,
        orderNum: maxOrder + i + 1,
        assignee: assignee || null, assigneeName: assigneeName || null,
      }));

    if (toCreate.length > 0) {
      await prisma.testPlanCase.createMany({ data: toCreate });
      await prisma.testPlan.update({
        where: { id: plan.id },
        data: { totalCases: { increment: toCreate.length } },
      });
    }
    res.status(201).json({ added: toCreate.length, skipped: caseIds.length - toCreate.length });
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

testRouter.delete('/plans/:id/cases/:caseId', async (req, res) => {
  try {
    await prisma.testPlanCase.delete({
      where: { planId_caseId: { planId: req.params.id, caseId: req.params.caseId } },
    });
    await prisma.testPlan.update({
      where: { id: req.params.id },
      data: { totalCases: { decrement: 1 } },
    });
    res.status(204).end();
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

// 执行用例（更新结果）
testRouter.patch('/plans/:id/cases/:caseId', async (req, res) => {
  try {
    const { status, actualResult, notes, executedAt } = req.body;
    const updated = await prisma.testPlanCase.update({
      where: { planId_caseId: { planId: req.params.id, caseId: req.params.caseId } },
      data: { status, actualResult, notes, executedAt: executedAt ? new Date(executedAt) : new Date() },
    });
    // 更新计划统计
    await updatePlanStats(req.params.id);
    res.json(updated);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

async function updatePlanStats(planId: string) {
  const all = await prisma.testPlanCase.findMany({ where: { planId } });
  const stats = { passed: 0, failed: 0, blocked: 0, skipped: 0 };
  for (const c of all) {
    if (c.status === 'passed') stats.passed++;
    else if (c.status === 'failed') stats.failed++;
    else if (c.status === 'blocked') stats.blocked++;
    else if (c.status === 'skipped') stats.skipped++;
  }
  const status = stats.failed > 0 ? 'in_progress' : (stats.passed + stats.blocked + stats.skipped === all.length && all.length > 0 ? 'completed' : 'in_progress');
  await prisma.testPlan.update({
    where: { id: planId },
    data: { ...stats, status, totalCases: all.length },
  });
}

// =================== 测试执行 ===================

testRouter.post('/plans/:id/runs', async (req, res) => {
  try {
    const { runnerId, runnerName, caseIds, notes } = req.body;
    const plan = await prisma.testPlan.findUnique({ where: { id: req.params.id } });
    if (!plan) return res.status(404).json({ error: 'Plan not found' });
    const r = await prisma.testRun.create({
      data: {
        planId: plan.id, planName: plan.name,
        runnerId: runnerId || 'system', runnerName: runnerName || '系统',
        caseIds: typeof caseIds === 'string' ? caseIds : JSON.stringify(caseIds || []),
        status: 'running',
        notes: notes || '',
      },
    });
    res.status(201).json(r);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

testRouter.patch('/runs/:id', async (req, res) => {
  try {
    const { status, passed, failed, blocked, skipped, notes, finishedAt } = req.body;
    const r = await prisma.testRun.update({
      where: { id: req.params.id },
      data: { status, passed, failed, blocked, skipped, notes, finishedAt: finishedAt ? new Date(finishedAt) : new Date() },
    });
    res.json(r);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

testRouter.get('/runs', async (req, res) => {
  try {
    const { planId, runnerId, status } = req.query as any;
    const where: any = {};
    if (planId) where.planId = planId;
    if (runnerId) where.runnerId = runnerId;
    if (status) where.status = status;
    const list = await prisma.testRun.findMany({ where, orderBy: { startedAt: 'desc' }, take: 50 });
    res.json(list);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// =================== 统计 ===================

testRouter.get('/stats', async (req, res) => {
  try {
    const { spaceId } = req.query as any;
    const where: any = {};
    if (spaceId) where.spaceId = spaceId;
    const [totalCases, totalPlans, activePlans, passedRuns, failedRuns] = await Promise.all([
      prisma.testCase.count({ where }),
      prisma.testPlan.count({ where }),
      prisma.testPlan.count({ where: { ...where, status: 'in_progress' } }),
      prisma.testRun.count({ where: { status: 'passed' } }),
      prisma.testRun.count({ where: { status: 'failed' } }),
    ]);
    // 按类型分布
    const byType = await prisma.testCase.groupBy({ by: ['caseType'], where, _count: { _all: true } });
    const byPriority = await prisma.testCase.groupBy({ by: ['priority'], where, _count: { _all: true } });
    res.json({
      totalCases, totalPlans, activePlans, passedRuns, failedRuns,
      byType: byType.map((b: any) => ({ type: b.caseType, count: b._count._all })),
      byPriority: byPriority.map((b: any) => ({ priority: b.priority, count: b._count._all })),
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});
