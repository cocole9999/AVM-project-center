/**
 * 无代码自动化引擎
 * 触发器 → 条件 → 操作 三段式
 * 支持：手动触发 / 测试运行 / 启用启用 / 执行日志
 */
import { Router } from 'express';
import { prisma } from '../db';
import { runAutomation, listTriggers, listActions, listConditions, testRule } from '../services/automationEngine';
import { requireAuth, autoRole } from '../middleware/auth';

export const automationRouter = Router();

// V1.11: 鉴权 + 写保护
automationRouter.use(requireAuth);
automationRouter.use(autoRole());

// 列出所有自动化规则
automationRouter.get('/rules', async (req, res) => {
  try {
    const { spaceId, enabled } = req.query as any;
    const where: any = {};
    if (spaceId) where.spaceId = spaceId;
    if (enabled !== undefined) where.enabled = enabled === 'true';
    const list = await prisma.automationRule.findMany({ where, orderBy: { createdAt: 'desc' } });
    res.json(list);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

automationRouter.get('/rules/:id', async (req, res) => {
  const r = await prisma.automationRule.findUnique({ where: { id: req.params.id } });
  if (!r) return res.status(404).json({ error: 'Rule not found' });
  res.json(r);
});

automationRouter.post('/rules', async (req, res) => {
  try {
    const { spaceId, name, description, trigger, conditions, actions, createdBy } = req.body;
    if (!name || !trigger || !actions) return res.status(400).json({ error: 'name, trigger, actions required' });
    const r = await prisma.automationRule.create({
      data: {
        spaceId: spaceId || null, name, description: description || '',
        trigger: typeof trigger === 'string' ? trigger : JSON.stringify(trigger),
        conditions: typeof conditions === 'string' ? conditions : JSON.stringify(conditions || []),
        actions: typeof actions === 'string' ? actions : JSON.stringify(actions),
        createdBy: createdBy || null,
      },
    });
    res.status(201).json(r);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

automationRouter.patch('/rules/:id', async (req, res) => {
  try {
    const body = { ...req.body };
    if (body.trigger && typeof body.trigger !== 'string') body.trigger = JSON.stringify(body.trigger);
    if (body.conditions && typeof body.conditions !== 'string') body.conditions = JSON.stringify(body.conditions);
    if (body.actions && typeof body.actions !== 'string') body.actions = JSON.stringify(body.actions);
    const r = await prisma.automationRule.update({ where: { id: req.params.id }, data: body });
    res.json(r);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

automationRouter.delete('/rules/:id', async (req, res) => {
  try {
    await prisma.automationRule.delete({ where: { id: req.params.id } });
    res.status(204).end();
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

// 启用/禁用
automationRouter.post('/rules/:id/toggle', async (req, res) => {
  try {
    const r = await prisma.automationRule.findUnique({ where: { id: req.params.id } });
    if (!r) return res.status(404).json({ error: 'Rule not found' });
    const updated = await prisma.automationRule.update({
      where: { id: req.params.id },
      data: { enabled: !r.enabled },
    });
    res.json(updated);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

// 手动触发
automationRouter.post('/rules/:id/run', async (req, res) => {
  try {
    const r = await prisma.automationRule.findUnique({ where: { id: req.params.id } });
    if (!r) return res.status(404).json({ error: 'Rule not found' });
    const result = await runAutomation(r, req.body.context || {});
    res.json(result);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

// 测试（干跑，不写实际数据）
automationRouter.post('/rules/:id/test', async (req, res) => {
  try {
    const r = await prisma.automationRule.findUnique({ where: { id: req.params.id } });
    if (!r) return res.status(404).json({ error: 'Rule not found' });
    const result = await testRule(r, req.body.context || {});
    res.json(result);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

// 元信息：可用触发器/条件/操作
automationRouter.get('/meta/triggers', (_req, res) => res.json(listTriggers()));
automationRouter.get('/meta/conditions', (_req, res) => res.json(listConditions()));
automationRouter.get('/meta/actions', (_req, res) => res.json(listActions()));

// 执行日志
automationRouter.get('/logs', async (req, res) => {
  try {
    const { ruleId, limit } = req.query as any;
    const where: any = {};
    if (ruleId) where.ruleId = ruleId;
    const list = await prisma.automationLog.findMany({
      where, orderBy: { createdAt: 'desc' }, take: Number(limit) || 50,
    });
    res.json(list);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});
