/**
 * 空间管理
 * 多空间：演示版先用 1-2 个空间，逐步支持多租户
 */
import { Router } from 'express';
import { prisma } from '../db';

export const spaceRouter = Router();

// 列出所有空间
spaceRouter.get('/', async (_req, res) => {
  try {
    const list = await prisma.space.findMany({ orderBy: { createdAt: 'asc' } });
    res.json(list);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// 获取空间详情
spaceRouter.get('/:id', async (req, res) => {
  const space = await prisma.space.findUnique({
    where: { id: req.params.id },
    include: { _count: { select: { members: true, workItems: true, iterations: true } } },
  });
  if (!space) return res.status(404).json({ error: 'Space not found' });
  res.json(space);
});

// 创建空间
spaceRouter.post('/', async (req, res) => {
  try {
    const { name, code, description, icon, ownerId } = req.body;
    const space = await prisma.space.create({
      data: {
        name,
        code: code || name.toLowerCase().replace(/\s+/g, '-'),
        description: description || '',
        icon: icon || 'project',
        ownerId,
      },
    });
    res.status(201).json(space);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

// 更新空间
spaceRouter.patch('/:id', async (req, res) => {
  try {
    const space = await prisma.space.update({ where: { id: req.params.id }, data: req.body });
    res.json(space);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

// 空间成员列表
spaceRouter.get('/:id/members', async (req, res) => {
  const members = await prisma.spaceMember.findMany({
    where: { spaceId: req.params.id },
    orderBy: [{ role: 'asc' }, { userName: 'asc' }],
  });
  res.json(members);
});

// 添加空间成员
spaceRouter.post('/:id/members', async (req, res) => {
  try {
    const { userId, userName, role } = req.body;
    const m = await prisma.spaceMember.create({
      data: { spaceId: req.params.id, userId, userName, role: role || 'member' },
    });
    // 更新空间成员数
    await prisma.space.update({
      where: { id: req.params.id },
      data: { memberCount: { increment: 1 } },
    });
    res.status(201).json(m);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

// 移除空间成员
spaceRouter.delete('/:id/members/:userId', async (req, res) => {
  try {
    await prisma.spaceMember.delete({
      where: { spaceId_userId: { spaceId: req.params.id, userId: req.params.userId } },
    });
    await prisma.space.update({
      where: { id: req.params.id },
      data: { memberCount: { decrement: 1 } },
    });
    res.status(204).end();
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

// 当前用户的空间
spaceRouter.get('/me/:userId', async (req, res) => {
  const memberships = await prisma.spaceMember.findMany({
    where: { userId: req.params.userId },
    include: { space: true },
  });
  res.json(memberships.map(m => m.space));
});
