/**
 * 工作移交（人员离职/转岗批量转交）
 */
import { Router } from 'express';
import { prisma } from '../db';
import { requireAuth, autoRole } from '../middleware/auth';
import { pushToUser } from '../services/wsServer';

export const handoverRouter = Router();

// V1.11: 鉴权 + 写保护
handoverRouter.use(requireAuth);
handoverRouter.use(autoRole());

// 列出移交记录
handoverRouter.get('/', async (req, res) => {
  try {
    const { fromUserId, toUserId, spaceId } = req.query as any;
    const where: any = {};
    if (fromUserId) where.fromUserId = fromUserId;
    if (toUserId) where.toUserId = toUserId;
    if (spaceId) where.spaceId = spaceId;
    const list = await prisma.workHandover.findMany({ where, orderBy: { createdAt: 'desc' } });
    res.json(list);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// 预览：某人的工作项统计
handoverRouter.get('/preview/:userId', async (req, res) => {
  try {
    const userId = req.params.userId;
    const user = await prisma.user.findUnique({ where: { username: userId } });
    if (!user) return res.status(404).json({ error: 'User not found' });
    const names = [user.username, user.displayName];

    const [assigned, reported, reviewing, allocated] = await Promise.all([
      prisma.workItem.findMany({
        where: { assignee: { in: names }, status: { notIn: ['已完成', '已关闭'] } },
        select: { id: true, key: true, title: true, status: true, priority: true, planEnd: true, type: true },
      }),
      prisma.workItem.count({ where: { reporter: { in: names } } }),
      prisma.review.count({ where: { participants: { some: { userId: { in: names } } } } }),
      prisma.resourceAllocation.count({ where: { userId: { in: names } } }),
    ]);

    res.json({
      user: { id: user.username, displayName: user.displayName, role: user.role },
      assignedCount: assigned.length,
      assigned: assigned.slice(0, 50),
      reportedCount: reported,
      reviewingCount: reviewing,
      allocationCount: allocated,
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// 执行移交
handoverRouter.post('/', async (req, res) => {
  try {
    const { fromUserId, toUserId, reason, options } = req.body;
    if (!fromUserId || !toUserId) return res.status(400).json({ error: 'fromUserId, toUserId required' });

    const fromUser = await prisma.user.findUnique({ where: { username: fromUserId } });
    const toUser = await prisma.user.findUnique({ where: { username: toUserId } });
    if (!fromUser || !toUser) return res.status(400).json({ error: 'user not found' });

    const fromNames = [fromUser.username, fromUser.displayName];
    const summary: any = { assigned: 0, reported: 0, reviews: 0, allocations: 0 };

    // 1. 移交工作项（assignee）
    if (options?.workItems !== false) {
      const result = await prisma.workItem.updateMany({
        where: { assignee: { in: fromNames }, status: { notIn: ['已完成', '已关闭'] } },
        data: { assignee: toUser.displayName },
      });
      summary.assigned = result.count;
    }

    // 2. 移交 reporter
    if (options?.reporter !== false) {
      const result = await prisma.workItem.updateMany({
        where: { reporter: { in: fromNames } },
        data: { reporter: toUser.displayName },
      });
      summary.reported = result.count;
    }

    // 3. 移交评审参与者
    if (options?.reviews !== false) {
      const result = await prisma.reviewParticipant.updateMany({
        where: { userId: { in: fromNames } },
        data: { userId: toUser.username, userName: toUser.displayName },
      });
      summary.reviews = result.count;
    }

    // 4. 移交排期
    if (options?.allocations !== false) {
      const result = await prisma.resourceAllocation.updateMany({
        where: { userId: { in: fromNames } },
        data: { userId: toUser.username, userName: toUser.displayName },
      });
      summary.allocations = result.count;
    }

    // 5. 通知
    const handoverNotif = await prisma.notification.create({
      data: {
        recipientId: toUser.username,
        type: 'handover', level: 'info',
        title: `收到 ${fromUser.displayName} 的工作移交`,
        content: reason || `${fromUser.displayName} 已将工作移交给你`,
        meta: JSON.stringify({ fromUserId: fromUser.username, workItems: summary.assigned, reviews: summary.reviews, allocations: summary.allocations }),
      },
    });
    // V1.15: WebSocket 实时推送
    pushToUser(toUser.id, {
      type: 'notification',
      notification: {
        id: handoverNotif.id,
        kind: 'handover',
        title: handoverNotif.title,
        content: handoverNotif.content,
        fromUser: fromUser.displayName,
        summary,
      },
    });

    // 6. 记录
    const handover = await prisma.workHandover.create({
      data: {
        spaceId: req.body.spaceId || null,
        fromUserId: fromUser.username, fromUserName: fromUser.displayName,
        toUserId: toUser.username, toUserName: toUser.displayName,
        workItemIds: '[]',
        reason: reason || '',
        status: 'done',
      },
    });

    res.status(201).json({ handover, summary });
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});
