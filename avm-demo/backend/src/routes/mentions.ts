/**
 * V1.14 提及联想端点
 *
 * GET /api/mentions/search?q=&limit=10
 *   搜索用户用于 @ 联想 (匹配 username / displayName / department / email)
 *   返回 [{ id, username, displayName, department, avatarColor }]
 */
import { Router } from 'express';
import { prisma } from '../db';
import { requireAuth } from '../middleware/auth';

export const mentionRouter = Router();
mentionRouter.use(requireAuth);

mentionRouter.get('/search', async (req, res) => {
  try {
    const { q = '', limit = '10' } = req.query as Record<string, string | undefined>;
    const take = Math.min(Number(limit) || 10, 30);
    if (!q.trim()) {
      // 空 query 返回活跃用户 (按创建顺序前 10 个)
      const items = await prisma.user.findMany({
        where: { active: true },
        take,
        orderBy: { createdAt: 'asc' },
        select: { id: true, username: true, displayName: true, department: true, role: true, email: true },
      });
      return res.json(items.map(u => ({
        ...u,
        avatarColor: pickColor(u.username),
        mentionText: u.displayName,
      })));
    }
    const items = await prisma.user.findMany({
      where: {
        active: true,
        OR: [
          { username: { contains: q } },
          { displayName: { contains: q } },
          { department: { contains: q } },
          { email: { contains: q } },
        ],
      },
      take,
      orderBy: [{ displayName: 'asc' }],
      select: { id: true, username: true, displayName: true, department: true, role: true, email: true },
    });
    res.json(items.map(u => ({
      ...u,
      avatarColor: pickColor(u.username),
      mentionText: u.displayName,
    })));
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

const COLORS = ['#1677ff', '#722ed1', '#52c41a', '#fa8c16', '#cf1322', '#13c2c2', '#eb2f96'];
function pickColor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return COLORS[h % COLORS.length];
}
