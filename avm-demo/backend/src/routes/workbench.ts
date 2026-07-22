/**
 * 工作台：个人事务聚合
 * 提供：我的待办、我负责的、我跟进的、我围观的 + 4 个核心指标 + 临期项
 */
import { Router } from 'express';
import { prisma } from '../db';

export const workbenchRouter = Router();

// 获取我的工作台
workbenchRouter.get('/me', async (req, res) => {
  try {
    const userId = req.query.userId as string || 'me';
    // 兼容 username 和 displayName（如 "zhangsan" 或 "张三"）
    const user = await prisma.user.findUnique({ where: { username: userId } });
    const names = user ? [user.username, user.displayName] : [userId];

    // 1. 我负责的
    const myAssigned = await prisma.workItem.findMany({
      where: {
        assignee: { in: names },
        status: { notIn: ['已完成', '已关闭'] },
      },
      orderBy: [{ priority: 'asc' }, { planEnd: 'asc' }],
      take: 20,
    });

    // 2. 我创建的
    const myCreated = await prisma.workItem.findMany({
      where: { reporter: { in: names } },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });

    // 3. 我评论过的（最近 10 个相关工作项）
    const myComments = await prisma.comment.findMany({
      where: { author: { in: names } },
      orderBy: { createdAt: 'desc' },
      take: 10,
      include: { workItem: { select: { id: true, key: true, title: true, type: true, status: true } } },
    });
    const myInvolved = myComments
      .map(c => c.workItem)
      .filter((w, idx, arr) => w && arr.findIndex(x => x.id === w.id) === idx)
      .slice(0, 10);

    // 4. 临期 + 超期
    const now = new Date();
    const threeDaysLater = new Date(Date.now() + 3 * 86400000);
    const myDue = await prisma.workItem.findMany({
      where: {
        assignee: { in: names },
        planEnd: { gte: now, lte: threeDaysLater },
        status: { notIn: ['已完成', '已关闭', '已驳回', '已发布', '已验收'] },
      },
      orderBy: { planEnd: 'asc' },
    });
    const myOverdue = await prisma.workItem.findMany({
      where: {
        assignee: { in: names },
        planEnd: { lt: now },
        status: { notIn: ['已完成', '已关闭', '已驳回', '已发布', '已验收'] },
      },
      orderBy: { planEnd: 'asc' },
    });

    // 5. 待我评审
    const myPendingReviews = await prisma.review.findMany({
      where: {
        status: { in: ['pending', 'in_progress'] },
        participants: { some: { userId: { in: names }, hasResponded: false } },
      },
      include: { workItem: { select: { key: true, title: true } } },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });

    // 6. 我的未读通知
    const myUnreadNotifs = await prisma.notification.findMany({
      where: { recipientId: userId, read: false },
      orderBy: { createdAt: 'desc' },
      take: 5,
    });

    // 7. 核心指标
    const myTotal = await prisma.workItem.count({ where: { assignee: { in: names } } });
    const myCompleted = await prisma.workItem.count({ where: { assignee: { in: names }, status: '已完成' } });
    const myInProgress = await prisma.workItem.count({
      where: { assignee: { in: names }, status: { in: ['进行中', '开发中', '验收中', '测试中', '修复中'] } },
    });
    const myToStart = await prisma.workItem.count({
      where: { assignee: { in: names }, status: { in: ['待评审', '已规划', '待处理', '待开发', '待修复', '待验收'] } },
    });

    // 8. 资源负荷（7 天）
    const weekStart = new Date();
    weekStart.setHours(0, 0, 0, 0);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 7);
    const myAllocations = await prisma.resourceAllocation.findMany({
      where: {
        userId: { in: names },
        startDate: { lte: weekEnd },
        endDate: { gte: weekStart },
      },
      orderBy: { startDate: 'asc' },
    });
    const myWeekHours = myAllocations.reduce((s, a) => s + a.allocatedHours, 0);
    const weekCapacity = 5 * 8; // 5 工作日 * 8h
    const weekUtilization = Math.round((myWeekHours / weekCapacity) * 100);

    res.json({
      userId,
      metrics: {
        total: myTotal,
        completed: myCompleted,
        inProgress: myInProgress,
        toStart: myToStart,
        overdue: myOverdue.length,
        dueSoon: myDue.length,
        weekHours: Math.round(myWeekHours * 10) / 10,
        weekCapacity,
        weekUtilization,
      },
      myAssigned,
      myCreated,
      myInvolved,
      myDue,
      myOverdue,
      myPendingReviews,
      myUnreadNotifs,
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// 团队工作台（管理员视角）
workbenchRouter.get('/team', async (req, res) => {
  try {
    const spaceId = req.query.spaceId as string;
    const where: any = { assignee: { not: null } };
    if (spaceId) where.spaceId = spaceId;

    // 按人汇总
    const items = await prisma.workItem.findMany({
      where: { status: { notIn: ['已完成', '已关闭'] } },
    });
    const byUser: Record<string, { userId: string; count: number; p0Count: number; overdueCount: number }> = {};
    const now = new Date();
    for (const i of items) {
      if (!i.assignee) continue;
      if (!byUser[i.assignee]) byUser[i.assignee] = { userId: i.assignee, count: 0, p0Count: 0, overdueCount: 0 };
      byUser[i.assignee].count++;
      if (i.priority === 'P0') byUser[i.assignee].p0Count++;
      if (i.planEnd && new Date(i.planEnd) < now) byUser[i.assignee].overdueCount++;
    }
    res.json(Object.values(byUser).sort((a, b) => b.count - a.count));
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// 获取/保存工作台布局
workbenchRouter.get('/layout/:userId', async (req, res) => {
  const config = await prisma.workbenchConfig.findUnique({ where: { userId: req.params.userId } });
  res.json(config || { userId: req.params.userId, layout: '[]', preferences: '{}' });
});

workbenchRouter.post('/layout/:userId', async (req, res) => {
  try {
    const { layout, defaultSpaceId, preferences } = req.body;
    const c = await prisma.workbenchConfig.upsert({
      where: { userId: req.params.userId },
      create: {
        userId: req.params.userId,
        layout: typeof layout === 'string' ? layout : JSON.stringify(layout || []),
        defaultSpaceId: defaultSpaceId || null,
        preferences: typeof preferences === 'string' ? preferences : JSON.stringify(preferences || {}),
      },
      update: {
        ...(layout !== undefined && { layout: typeof layout === 'string' ? layout : JSON.stringify(layout) }),
        ...(defaultSpaceId !== undefined && { defaultSpaceId }),
        ...(preferences !== undefined && { preferences: typeof preferences === 'string' ? preferences : JSON.stringify(preferences) }),
      },
    });
    res.json(c);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});
