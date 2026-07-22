/**
 * 个人收藏
 * 支持：工作项/图表/仪表盘/视图/迭代 的快速收藏
 */
import { Router } from 'express';
import { prisma } from '../db';

export const favoriteRouter = Router();

// 列出我的收藏
favoriteRouter.get('/', async (req, res) => {
  const userId = req.query.userId as string;
  const folder = req.query.folder as string;
  if (!userId) return res.status(400).json({ error: 'userId required' });
  const where: any = { userId };
  if (folder) where.folder = folder;
  const list = await prisma.favorite.findMany({
    where,
    orderBy: [{ folder: 'asc' }, { position: 'asc' }, { createdAt: 'desc' }],
  });
  res.json(list);
});

// 添加收藏
favoriteRouter.post('/', async (req, res) => {
  try {
    const { userId, resourceType, resourceId, title, subtitle, icon, link, folder, spaceId } = req.body;
    if (!userId || !resourceType || !resourceId) {
      return res.status(400).json({ error: 'userId, resourceType, resourceId required' });
    }
    const f = await prisma.favorite.upsert({
      where: {
        userId_resourceType_resourceId: { userId, resourceType, resourceId },
      },
      create: {
        userId,
        resourceType,
        resourceId,
        title: title || '',
        subtitle: subtitle || '',
        icon: icon || 'star',
        link: link || '',
        folder: folder || '默认',
        spaceId: spaceId || null,
      },
      update: {}, // 已存在则不变
    });
    res.status(201).json(f);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

// 取消收藏
favoriteRouter.delete('/:id', async (req, res) => {
  try {
    await prisma.favorite.delete({ where: { id: req.params.id } });
    res.status(204).end();
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

// 按 resourceType+resourceId 取消收藏
favoriteRouter.delete('/', async (req, res) => {
  try {
    const { userId, resourceType, resourceId } = req.query as any;
    if (!userId || !resourceType || !resourceId) {
      return res.status(400).json({ error: 'userId, resourceType, resourceId required' });
    }
    await prisma.favorite.delete({
      where: {
        userId_resourceType_resourceId: { userId, resourceType, resourceId },
      },
    });
    res.status(204).end();
  } catch (e: any) {
    res.status(404).json({ error: e.message });
  }
});

// 更新收藏（改分组/排序）
favoriteRouter.patch('/:id', async (req, res) => {
  try {
    const { folder, position, title } = req.body;
    const f = await prisma.favorite.update({
      where: { id: req.params.id },
      data: { ...(folder !== undefined && { folder }), ...(position !== undefined && { position }), ...(title && { title }) },
    });
    res.json(f);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});
