/**
 * 通知中心
 * 支持：手动创建（@人/指派/评审）、自动检测（临期/超期）、批量已读
 */
import { Router } from 'express';
import { prisma } from '../db';

export const notificationRouter = Router();

// 列出我的通知
notificationRouter.get('/', async (req, res) => {
  const userId = req.query.userId as string;
  const filter = req.query.filter as string; // all | unread | read
  if (!userId) return res.status(400).json({ error: 'userId required' });

  const where: any = { recipientId: userId };
  if (filter === 'unread') where.read = false;
  if (filter === 'read') where.read = true;

  const list = await prisma.notification.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: 100,
  });
  res.json(list);
});

// 未读数量
notificationRouter.get('/unread-count', async (req, res) => {
  const userId = req.query.userId as string;
  if (!userId) return res.json({ count: 0 });
  const count = await prisma.notification.count({
    where: { recipientId: userId, read: false },
  });
  res.json({ count });
});

// 创建通知（手动/系统调用）
notificationRouter.post('/', async (req, res) => {
  try {
    const { recipientId, type, level, title, content, link, resourceType, resourceId, actorId, spaceId } = req.body;
    const n = await prisma.notification.create({
      data: {
        recipientId,
        type,
        level: level || 'info',
        title,
        content: content || '',
        link: link || '',
        resourceType: resourceType || null,
        resourceId: resourceId || null,
        actorId: actorId || null,
        spaceId: spaceId || null,
      },
    });
    res.status(201).json(n);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

// 标记已读
notificationRouter.post('/:id/read', async (req, res) => {
  try {
    const n = await prisma.notification.update({
      where: { id: req.params.id },
      data: { read: true, readAt: new Date() },
    });
    res.json(n);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

// 全部已读
notificationRouter.post('/read-all', async (req, res) => {
  try {
    const { userId } = req.body;
    const result = await prisma.notification.updateMany({
      where: { recipientId: userId, read: false },
      data: { read: true, readAt: new Date() },
    });
    res.json({ updated: result.count });
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

// 删除通知
notificationRouter.delete('/:id', async (req, res) => {
  try {
    await prisma.notification.delete({ where: { id: req.params.id } });
    res.status(204).end();
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

// 自动扫描：生成临期/超期通知（供定时任务或手动触发）
notificationRouter.post('/scan-due', async (_req, res) => {
  try {
    const now = new Date();
    const threeDaysLater = new Date(Date.now() + 3 * 86400000);
    const created: any[] = [];

    // 临期：3 天内到期 + 未完成
    const dueSoon = await prisma.workItem.findMany({
      where: {
        planEnd: { gte: now, lte: threeDaysLater },
        status: { notIn: ['已完成', '已关闭', '已驳回', '已发布', '已验收'] },
        assignee: { not: null },
      },
    });
    for (const item of dueSoon) {
      if (!item.assignee) continue;
      // 查今天是否已发过临期通知
      const exist = await prisma.notification.findFirst({
        where: {
          recipientId: item.assignee,
          type: 'due_soon',
          resourceId: item.id,
          createdAt: { gte: new Date(now.getFullYear(), now.getMonth(), now.getDate()) },
        },
      });
      if (exist) continue;
      const days = Math.ceil((new Date(item.planEnd!).getTime() - now.getTime()) / 86400000);
      const n = await prisma.notification.create({
        data: {
          recipientId: item.assignee,
          type: 'due_soon',
          level: 'warning',
          title: `${item.key} 临期 ${days} 天`,
          content: item.title,
          resourceType: 'work_item',
          resourceId: item.id,
          link: `/work-items/${item.type}/${item.id}`,
        },
      });
      created.push(n);
    }

    // 超期：已过 planEnd + 未完成
    const overdue = await prisma.workItem.findMany({
      where: {
        planEnd: { lt: now },
        status: { notIn: ['已完成', '已关闭', '已驳回', '已发布', '已验收'] },
        assignee: { not: null },
      },
    });
    for (const item of overdue) {
      if (!item.assignee) continue;
      const exist = await prisma.notification.findFirst({
        where: {
          recipientId: item.assignee,
          type: 'overdue',
          resourceId: item.id,
          createdAt: { gte: new Date(now.getFullYear(), now.getMonth(), now.getDate()) },
        },
      });
      if (exist) continue;
      const days = Math.ceil((now.getTime() - new Date(item.planEnd!).getTime()) / 86400000);
      const n = await prisma.notification.create({
        data: {
          recipientId: item.assignee,
          type: 'overdue',
          level: 'error',
          title: `${item.key} 已超期 ${days} 天`,
          content: item.title,
          resourceType: 'work_item',
          resourceId: item.id,
          link: `/work-items/${item.type}/${item.id}`,
        },
      });
      created.push(n);
    }

    res.json({ created: created.length, items: created });
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});
