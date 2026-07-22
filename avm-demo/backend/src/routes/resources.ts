/**
 * 人员排期与负荷
 * 提供：按时间窗聚合每个人的总工时 / 跨工作项的甘特数据 / 负荷热力图
 */
import { Router } from 'express';
import { prisma } from '../db';
import { requireAuth, autoRole } from '../middleware/auth';

export const resourceRouter = Router();

// V1.11: 鉴权 + 写保护
resourceRouter.use(requireAuth);
resourceRouter.use(autoRole());

// 列出排期分配
resourceRouter.get('/allocations', async (req, res) => {
  const { userId, workItemId, spaceId, startDate, endDate } = req.query as any;
  const where: any = {};
  if (userId) where.userId = userId;
  if (workItemId) where.workItemId = workItemId;
  if (spaceId) where.spaceId = spaceId;
  if (startDate || endDate) {
    where.OR = [
      { startDate: { gte: startDate ? new Date(startDate) : undefined, lte: endDate ? new Date(endDate) : undefined } },
      { endDate: { gte: startDate ? new Date(startDate) : undefined, lte: endDate ? new Date(endDate) : undefined } },
    ];
  }
  const list = await prisma.resourceAllocation.findMany({
    where,
    orderBy: [{ userId: 'asc' }, { startDate: 'asc' }],
  });
  res.json(list);
});

// 创建排期
resourceRouter.post('/allocations', async (req, res) => {
  try {
    const a = await prisma.resourceAllocation.create({ data: req.body });
    res.status(201).json(a);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

// 更新排期
resourceRouter.patch('/allocations/:id', async (req, res) => {
  try {
    const a = await prisma.resourceAllocation.update({ where: { id: req.params.id }, data: req.body });
    res.json(a);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

// 删除排期
resourceRouter.delete('/allocations/:id', async (req, res) => {
  try {
    await prisma.resourceAllocation.delete({ where: { id: req.params.id } });
    res.status(204).end();
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

// 人员负荷汇总：每个人在时间窗内的总分配工时
resourceRouter.get('/load', async (req, res) => {
  try {
    const { startDate, endDate, spaceId } = req.query as any;
    if (!startDate || !endDate) {
      return res.status(400).json({ error: 'startDate and endDate required' });
    }
    const start = new Date(startDate);
    const end = new Date(endDate);

    const where: any = {
      // V1.8.3 修复：DB 存的 startDate/endDate 是本地 00:00 (UTC 16:00 前一天)
      // filter 改用"日历日"比较，避免 UTC vs 本地错位导致整批被排除
      AND: [
        { startDate: { lte: new Date(end.getTime() + 86400000) } },  // end +1 天容差
        { endDate: { gte: new Date(start.getTime() - 86400000) } },   // start -1 天容差
      ],
    };
    if (spaceId) where.spaceId = spaceId;

    const allocations = await prisma.resourceAllocation.findMany({ where });

    // 按人聚合
    const byUser: Record<string, { userId: string; userName: string; totalHours: number; items: any[]; dailyHours: Record<string, number> }> = {};
    for (const a of allocations) {
      if (!byUser[a.userId]) {
        byUser[a.userId] = { userId: a.userId, userName: a.userName, totalHours: 0, items: [], dailyHours: {} };
      }
      const u = byUser[a.userId];
      u.totalHours += a.allocatedHours;
      u.items.push({ workItemKey: a.workItemKey, workItemTitle: a.workItemTitle, startDate: a.startDate, endDate: a.endDate, hours: a.allocatedHours, type: a.type });

      // 拆分到天 — 用本地日期 (YYYY-MM-DD) 作为 key，避免 UTC 错位
      const startDate = new Date(a.startDate);
      const endDate = new Date(a.endDate);
      const days = Math.max(1, Math.ceil((endDate.getTime() - startDate.getTime()) / 86400000) + 1);
      const perDay = a.allocatedHours / days;
      // 本地日历日 key: 用 Y/M/D 拼
      const keyOf = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      // 截到本地 00:00 再比较，避免 UTC 偏移让 max/min 跨日错位
      const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
      const cursor = startOfDay(new Date(Math.max(startDate.getTime(), start.getTime())));
      const endCursor = startOfDay(new Date(Math.min(endDate.getTime(), end.getTime())));
      while (cursor <= endCursor) {
        const key = keyOf(cursor);
        u.dailyHours[key] = (u.dailyHours[key] || 0) + perDay;
        cursor.setDate(cursor.getDate() + 1);
      }
    }

    // 计算每天的工作日数（排除周末）
    const workingDays: string[] = [];
    const cursor = new Date(start);
    while (cursor <= end) {
      const dow = cursor.getDay();
      if (dow !== 0 && dow !== 6) {
        workingDays.push(cursor.toISOString().slice(0, 10));
      }
      cursor.setDate(cursor.getDate() + 1);
    }

    // 计算利用率（假设每天 8h）
    const result = Object.values(byUser).map(u => {
      const maxDaily = Math.max(0, ...Object.values(u.dailyHours));
      const avgDaily = workingDays.length ? u.totalHours / workingDays.length : 0;
      const utilization = workingDays.length ? (u.totalHours / (workingDays.length * 8)) * 100 : 0;
      let level: 'overload' | 'busy' | 'normal' | 'idle' = 'normal';
      if (utilization > 100) level = 'overload';
      else if (utilization > 80) level = 'busy';
      else if (utilization < 30) level = 'idle';
      return { ...u, maxDaily, avgDaily: Math.round(avgDaily * 10) / 10, utilization: Math.round(utilization), level };
    });

    res.json({ startDate: start, endDate: end, workingDays, users: result });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// 按工作项汇总：每个工作项分配给谁、占多少工时
resourceRouter.get('/by-work-item/:workItemId', async (req, res) => {
  const allocations = await prisma.resourceAllocation.findMany({
    where: { workItemId: req.params.workItemId },
    orderBy: { startDate: 'asc' },
  });
  const totalHours = allocations.reduce((s, a) => s + a.allocatedHours, 0);
  res.json({ allocations, totalHours });
});

// 按用户汇总：我的所有排期
resourceRouter.get('/by-user/:userId', async (req, res) => {
  const allocations = await prisma.resourceAllocation.findMany({
    where: { userId: req.params.userId },
    orderBy: { startDate: 'asc' },
  });
  const totalHours = allocations.reduce((s, a) => s + a.allocatedHours, 0);
  res.json({ allocations, totalHours });
});
