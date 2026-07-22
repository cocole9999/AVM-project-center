/**
 * 基线管理服务
 * 计划快照 + 实际对比
 */
import { prisma } from '../db';

const DONE_STATUSES = ['已完成', '已验收', '已发布', '已关闭'];

interface BaselineSnapshotItem {
  itemId: string;
  key: string;
  title: string;
  type: string;
  status: string;
  priority: string;
  assignee: string;
  planStart: string | null;
  planEnd: string | null;
  estimate: number;
  module: string;
}

// 创建基线
export async function createBaseline(data: {
  spaceId?: string;
  iterationId?: string;
  name: string;
  description?: string;
  baselineType?: string;
  createdBy?: string;
}) {
  const where: any = {};
  if (data.spaceId) where.spaceId = data.spaceId;
  if (data.iterationId) where.iterationId = data.iterationId;

  const items = await prisma.workItem.findMany({
    where,
    orderBy: { createdAt: 'asc' },
  });

  const snapshot: BaselineSnapshotItem[] = items.map(i => ({
    itemId: i.id, key: i.key, title: i.title, type: i.type,
    status: i.status, priority: i.priority, assignee: i.assignee || '',
    planStart: i.planStart ? i.planStart.toISOString() : null,
    planEnd: i.planEnd ? i.planEnd.toISOString() : null,
    estimate: i.estimate || 0, module: i.module || '',
  }));

  const itemCount = items.length;
  const totalEstimate = items.reduce((s, i) => s + (i.estimate || 0), 0);

  let iterationName: string | null = null;
  if (data.iterationId) {
    const it = await prisma.iteration.findUnique({ where: { id: data.iterationId } });
    iterationName = it?.name || null;
  }

  return prisma.baseline.create({
    data: {
      spaceId: data.spaceId || null,
      iterationId: data.iterationId || null,
      iterationName,
      name: data.name,
      description: data.description || '',
      baselineType: data.baselineType || 'iteration',
      snapshot: JSON.stringify(snapshot),
      itemCount,
      totalEstimate,
      createdBy: data.createdBy || null,
    },
  });
}

// 对比基线 vs 现状
export async function compareBaseline(baselineId: string) {
  const baseline = await prisma.baseline.findUnique({ where: { id: baselineId } });
  if (!baseline) throw new Error('Baseline not found');

  const snapshot: BaselineSnapshotItem[] = JSON.parse(baseline.snapshot);
  const itemIds = snapshot.map(s => s.itemId);
  const current = await prisma.workItem.findMany({ where: { id: { in: itemIds } } });
  const currentMap = new Map(current.map(i => [i.id, i]));

  const changes = {
    added: [] as any[],     // 当前存在但基线没有
    removed: [] as any[],   // 基线有但当前不存在
    statusChanged: [] as any[],
    estimateChanged: [] as any[],
    planChanged: [] as any[],
    assigneeChanged: [] as any[],
    delayed: [] as any[],
    ahead: [] as any[],
    onTrack: [] as any[],
  };

  const snapshotMap = new Map(snapshot.map(s => [s.itemId, s]));

  // 基线有 vs 当前
  for (const s of snapshot) {
    const cur = currentMap.get(s.itemId);
    if (!cur) {
      changes.removed.push(s);
      continue;
    }
    if (cur.status !== s.status) {
      changes.statusChanged.push({ key: s.key, title: s.title, from: s.status, to: cur.status });
    }
    if (Math.abs((cur.estimate || 0) - s.estimate) > 0.01) {
      changes.estimateChanged.push({ key: s.key, title: s.title, from: s.estimate, to: cur.estimate, diff: (cur.estimate || 0) - s.estimate });
    }
    if (cur.assignee !== s.assignee) {
      changes.assigneeChanged.push({ key: s.key, title: s.title, from: s.assignee, to: cur.assignee || '' });
    }
    // 排期
    const curStart = cur.planStart ? cur.planStart.getTime() : 0;
    const baseStart = s.planStart ? new Date(s.planStart).getTime() : 0;
    const curEnd = cur.planEnd ? cur.planEnd.getTime() : 0;
    const baseEnd = s.planEnd ? new Date(s.planEnd).getTime() : 0;
    if (Math.abs(curStart - baseStart) > 86400000 || Math.abs(curEnd - baseEnd) > 86400000) {
      changes.planChanged.push({
        key: s.key, title: s.title,
        from: { start: s.planStart, end: s.planEnd },
        to: { start: cur.planStart, end: cur.planEnd },
        delayDays: curEnd && baseEnd ? Math.round((curEnd - baseEnd) / 86400000) : 0,
      });
    }
    // 进度 vs 基线
    if (DONE_STATUSES.includes(cur.status) && !DONE_STATUSES.includes(s.status)) {
      changes.ahead.push({ key: s.key, title: s.title });
    } else if (cur.planEnd && new Date(cur.planEnd) < new Date() && !DONE_STATUSES.includes(cur.status)) {
      changes.delayed.push({ key: s.key, title: s.title, delayDays: Math.round((Date.now() - new Date(cur.planEnd).getTime()) / 86400000) });
    } else if (DONE_STATUSES.includes(s.status) && !DONE_STATUSES.includes(cur.status)) {
      // 基线已完成但现状未完成
    } else {
      changes.onTrack.push({ key: s.key, title: s.title });
    }
  }

  // 评估偏差
  const stats = {
    totalItems: snapshot.length,
    changed: changes.statusChanged.length + changes.estimateChanged.length + changes.planChanged.length + changes.assigneeChanged.length,
    delayed: changes.delayed.length,
    ahead: changes.ahead.length,
    onTrack: changes.onTrack.length,
    healthScore: Math.max(0, 100 - changes.delayed.length * 5 - changes.estimateChanged.length * 2 - changes.planChanged.length * 3),
  };

  return { baseline, changes, stats };
}
