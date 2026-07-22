/**
 * AI 人力分析 + 基线管理路由
 */
import { Router } from 'express';
import { prisma } from '../db';
import { analyzeResources, saveAnalysis } from '../services/resourceAnalysisEngine';
import { createBaseline, compareBaseline } from '../services/baselineEngine';

export const resourceAnalysisRouter = Router();

// 实时分析
resourceAnalysisRouter.post('/analyze', async (req, res) => {
  try {
    const { spaceId, startDate, endDate } = req.body;
    if (!startDate || !endDate) return res.status(400).json({ error: 'startDate, endDate required' });
    const result = await analyzeResources(startDate, endDate, spaceId);
    res.json(result);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// 分析 + 保存到历史
resourceAnalysisRouter.post('/analyze-and-save', async (req, res) => {
  try {
    const { spaceId, startDate, endDate } = req.body;
    if (!startDate || !endDate) return res.status(400).json({ error: 'startDate, endDate required' });
    const result = await analyzeResources(startDate, endDate, spaceId);
    const saved = await saveAnalysis(spaceId, startDate, endDate, result);
    res.json({ analysis: result, saved });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// 历史分析列表
resourceAnalysisRouter.get('/history', async (req, res) => {
  try {
    const { spaceId, limit } = req.query as any;
    const where: any = {};
    if (spaceId) where.spaceId = spaceId;
    const list = await prisma.resourceAnalysis.findMany({
      where, orderBy: { createdAt: 'desc' }, take: Number(limit) || 20,
    });
    res.json(list);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// 团队总览
resourceAnalysisRouter.get('/team-overview', async (req, res) => {
  try {
    const { spaceId } = req.query as any;
    const where: any = {};
    if (spaceId) where.spaceId = spaceId;
    const users = await prisma.user.findMany({ where: { active: true } });

    const result = await Promise.all(users.map(async u => {
      const [assigned, completed, alloc] = await Promise.all([
        prisma.workItem.count({ where: { assignee: { in: [u.username, u.displayName] }, status: { notIn: ['已完成', '已关闭'] } } }),
        prisma.workItem.count({ where: { assignee: { in: [u.username, u.displayName] }, status: '已完成' } }),
        prisma.resourceAllocation.aggregate({
          where: { userId: { in: [u.username, u.displayName] } },
          _sum: { allocatedHours: true },
        }),
      ]);
      return {
        userId: u.username, displayName: u.displayName, department: u.department, role: u.role,
        activeCount: assigned, completedCount: completed, totalAllocatedHours: alloc._sum.allocatedHours || 0,
      };
    }));

    res.json(result);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ========== 基线管理 ==========
export const baselineRouter = Router();

// 列出基线
baselineRouter.get('/', async (req, res) => {
  try {
    const { spaceId, iterationId, baselineType } = req.query as any;
    const where: any = {};
    if (spaceId) where.spaceId = spaceId;
    if (iterationId) where.iterationId = iterationId;
    if (baselineType) where.baselineType = baselineType;
    const list = await prisma.baseline.findMany({ where, orderBy: { createdAt: 'desc' } });
    res.json(list);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

baselineRouter.get('/:id', async (req, res) => {
  const b = await prisma.baseline.findUnique({ where: { id: req.params.id } });
  if (!b) return res.status(404).json({ error: 'Not found' });
  res.json(b);
});

// 创建基线
baselineRouter.post('/', async (req, res) => {
  try {
    const { spaceId, iterationId, name, description, baselineType, createdBy } = req.body;
    if (!name) return res.status(400).json({ error: 'name required' });
    const b = await createBaseline({ spaceId, iterationId, name, description, baselineType, createdBy });
    res.status(201).json(b);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

// 对比基线 vs 现状
baselineRouter.get('/:id/compare', async (req, res) => {
  try {
    const result = await compareBaseline(req.params.id);
    res.json(result);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

baselineRouter.delete('/:id', async (req, res) => {
  try {
    await prisma.baseline.delete({ where: { id: req.params.id } });
    res.status(204).end();
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});
