import { Router } from 'express';
import { prisma } from '../db';

export const dashboardRouter = Router();

dashboardRouter.get('/', async (_req, res) => {
  const list = await prisma.dashboard.findMany({
    orderBy: { updatedAt: 'desc' },
    include: { _count: { select: { charts: true } } },
  });
  res.json(list);
});

dashboardRouter.get('/:id', async (req, res) => {
  const d = await prisma.dashboard.findUnique({
    where: { id: req.params.id },
    include: { charts: { orderBy: { position: 'asc' } } },
  });
  if (!d) return res.status(404).json({ error: 'Dashboard not found' });
  res.json(d);
});

dashboardRouter.post('/', async (req, res) => {
  try {
    const d = await prisma.dashboard.create({ data: req.body });
    res.status(201).json(d);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

dashboardRouter.patch('/:id', async (req, res) => {
  try {
    const d = await prisma.dashboard.update({ where: { id: req.params.id }, data: req.body });
    res.json(d);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

dashboardRouter.delete('/:id', async (req, res) => {
  await prisma.dashboard.delete({ where: { id: req.params.id } });
  res.status(204).end();
});