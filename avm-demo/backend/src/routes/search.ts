/**
 * 全局搜索
 * 跨工作项/迭代/评审/图表/仪表盘 的统一搜索
 */
import { Router } from 'express';
import { prisma } from '../db';
import { asyncHandler } from '../middleware/validate';

export const searchRouter = Router();

// 统一搜索：跨工作项、迭代、评审、图表、仪表盘、用户
searchRouter.get('/', async (req, res) => {
  try {
    const q = String(req.query.q || '').trim();
    const type = req.query.type as string; // 可选，按类型过滤
    const limit = Math.min(50, Number(req.query.limit) || 20);

    if (!q) return res.json({ total: 0, results: [] });

    const results: any[] = [];

    // 工作项
    if (!type || type === 'work_item') {
      const items = await prisma.workItem.findMany({
        where: {
          OR: [
            { title: { contains: q } },
            { description: { contains: q } },
            { key: { contains: q } },
            { labels: { contains: q } },
            { module: { contains: q } },
            { assignee: { contains: q } },
            { reporter: { contains: q } },
          ],
        },
        take: limit,
        orderBy: { updatedAt: 'desc' },
      });
      for (const i of items) {
        results.push({
          type: 'work_item',
          id: i.id,
          key: i.key,
          title: i.title,
          subtitle: `${i.type} · ${i.status} · ${i.priority}${i.assignee ? ' · @' + i.assignee : ''}`,
          icon: i.type === 'bug' ? 'bug' : i.type === 'requirement' ? 'requirement' : 'task',
          link: `/work-items/${i.type}/${i.id}`,
          updatedAt: i.updatedAt,
        });
      }
    }

    // 迭代
    if (!type || type === 'iteration') {
      const iters = await prisma.iteration.findMany({
        where: { OR: [{ name: { contains: q } }, { goal: { contains: q } }] },
        take: limit,
        orderBy: { startDate: 'desc' },
      });
      for (const i of iters) {
        results.push({
          type: 'iteration',
          id: i.id,
          title: i.name,
          subtitle: `迭代 · ${i.status} · ${i.goal?.slice(0, 30) || ''}`,
          icon: 'iteration',
          link: `/iterations/${i.id}`,
        });
      }
    }

    // 评审
    if (!type || type === 'review') {
      const reviews = await prisma.review.findMany({
        where: { OR: [{ title: { contains: q } }, { summary: { contains: q } }] },
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: { workItem: { select: { key: true, title: true } } },
      });
      for (const r of reviews) {
        results.push({
          type: 'review',
          id: r.id,
          title: r.title,
          subtitle: `评审 · ${r.status} · ${r.workItem?.key || ''} ${r.workItem?.title || ''}`,
          icon: 'review',
          link: `/reviews/${r.id}`,
          updatedAt: r.createdAt,
        });
      }
    }

    // 图表
    if (!type || type === 'chart') {
      const charts = await prisma.chartConfig.findMany({
        where: { name: { contains: q } },
        take: limit,
      });
      for (const c of charts) {
        results.push({
          type: 'chart',
          id: c.id,
          title: c.name,
          subtitle: `图表 · ${c.chartType}`,
          icon: 'chart',
          link: `/charts/${c.id}`,
        });
      }
    }

    // 仪表盘
    if (!type || type === 'dashboard') {
      const dashes = await prisma.dashboard.findMany({
        where: { OR: [{ name: { contains: q } }, { description: { contains: q } }] },
        take: limit,
      });
      for (const d of dashes) {
        results.push({
          type: 'dashboard',
          id: d.id,
          title: d.name,
          subtitle: `仪表盘 · ${d.scope}`,
          icon: 'dashboard',
          link: `/dashboards/${d.id}`,
        });
      }
    }

    // 用户
    if (!type || type === 'user') {
      const users = await prisma.user.findMany({
        where: {
          active: true,
          OR: [
            { username: { contains: q } },
            { displayName: { contains: q } },
            { email: { contains: q } },
            { department: { contains: q } },
          ],
        },
        take: limit,
      });
      for (const u of users) {
        results.push({
          type: 'user',
          id: u.id,
          title: u.displayName,
          subtitle: `@${u.username} · ${u.role}${u.department ? ' · ' + u.department : ''}`,
          icon: 'user',
          link: `/users/${u.id}`,
        });
      }
    }

    res.json({
      q,
      total: results.length,
      results: results.slice(0, limit),
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// 搜索建议（联想）
searchRouter.get('/suggest', asyncHandler(async (req, res) => {
  const q = String(req.query.q || '').trim();
  if (!q) return res.json([]);
  const items = await prisma.workItem.findMany({
    where: { OR: [{ key: { contains: q } }, { title: { contains: q } }] },
    take: 8,
    select: { key: true, title: true, type: true, id: true },
  });
  res.json(items.map(i => ({ key: i.key, title: i.title, type: i.type, link: `/work-items/${i.type}/${i.id}` })));
}));
