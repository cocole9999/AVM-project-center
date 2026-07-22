import { Router } from 'express';
import * as flowEngine from '../services/flowEngine';
import { prisma } from '../db';

export const flowRouter = Router();

// 列出所有节点流
flowRouter.get('/', async (_req, res) => {
  const flows = await flowEngine.listFlows();
  res.json(flows);
});

// 获取某个工作项类型的活跃节点流
flowRouter.get('/active/:workType', async (req, res) => {
  const flow = await flowEngine.getActiveFlow(req.params.workType);
  res.json(flow);
});

// 获取单个节点流详情（含 nodes + transitions）
flowRouter.get('/:id', async (req, res) => {
  const flow = await prisma.nodeFlow.findUnique({
    where: { id: req.params.id },
    include: { nodes: true, transitions: true },
  });
  if (!flow) return res.status(404).json({ error: 'Flow not found' });
  res.json(flow);
});

// 保存节点流
flowRouter.post('/', async (req, res) => {
  try {
    const flow = await flowEngine.saveFlow(req.body);
    res.status(201).json(flow);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

flowRouter.patch('/:id', async (req, res) => {
  try {
    const flow = await flowEngine.saveFlow({ ...req.body, id: req.params.id });
    res.json(flow);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

flowRouter.delete('/:id', async (req, res) => {
  try {
    await flowEngine.deleteFlow(req.params.id);
    res.status(204).end();
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

// 工作项流转
flowRouter.post('/transition/:workItemId', async (req, res) => {
  try {
    const { toNodeId, actor, comment } = req.body;
    const updated = await flowEngine.transitionWorkItem(req.params.workItemId, toNodeId, { actor: actor || '我', comment });
    res.json(updated);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

// 获取工作项可用的流转
flowRouter.get('/transitions/:workItemId', async (req, res) => {
  const list = await flowEngine.getAvailableTransitions(req.params.workItemId);
  res.json(list);
});