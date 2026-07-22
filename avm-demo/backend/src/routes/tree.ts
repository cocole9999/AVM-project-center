/**
 * 树形视图
 * 返回按父子层级组织的工作项树（可按类型/空间过滤）
 */
import { Router } from 'express';
import { prisma } from '../db';

export const treeRouter = Router();

// 树形数据
treeRouter.get('/', async (req, res) => {
  try {
    const { type, spaceId, rootId, status, q } = req.query as any;
    const where: any = {};
    if (type) where.type = type;
    if (spaceId) where.spaceId = spaceId;
    if (status) where.status = status;
    if (q) where.OR = [
      { title: { contains: q } },
      { key: { contains: q } },
    ];

    if (rootId) {
      // 单根树
      const root = await prisma.workItem.findUnique({ where: { id: rootId } });
      if (!root) return res.json([]);
      const tree = await buildSubtree(root, where);
      return res.json([tree]);
    }

    // 找所有根工作项（无 parentId）
    const roots = await prisma.workItem.findMany({
      where: { ...where, parentId: null },
      orderBy: [{ priority: 'asc' }, { createdAt: 'desc' }],
    });
    const trees = await Promise.all(roots.map(r => buildSubtree(r, where)));
    res.json(trees);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// 统计：每层节点数 + 总工时
treeRouter.get('/stats', async (req, res) => {
  try {
    const { type, spaceId } = req.query as any;
    const where: any = {};
    if (type) where.type = type;
    if (spaceId) where.spaceId = spaceId;
    const items = await prisma.workItem.findMany({ where });

    const stats: any = { total: items.length, byDepth: {}, totalEstimate: 0, totalActual: 0, byType: {} };
    for (const i of items) {
      // 深度
      let depth = 0;
      let cur = i;
      while (cur.parentId) {
        depth++;
        cur = await prisma.workItem.findUnique({ where: { id: cur.parentId } }) as any;
        if (!cur || depth > 10) break;
      }
      stats.byDepth[depth] = (stats.byDepth[depth] || 0) + 1;
      stats.totalEstimate += i.estimate || 0;
      stats.totalActual += i.actualHours || 0;
      stats.byType[i.type] = (stats.byType[i.type] || 0) + 1;
    }
    res.json(stats);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

async function buildSubtree(root: any, filter: any): Promise<any> {
  const children = await prisma.workItem.findMany({
    where: { parentId: root.id, ...(filter.status ? { status: filter.status } : {}) },
    orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }],
  });
  const childTrees = await Promise.all(children.map(c => buildSubtree(c, filter)));
  return {
    id: root.id,
    key: root.key,
    title: root.title,
    type: root.type,
    status: root.status,
    priority: root.priority,
    assignee: root.assignee,
    estimate: root.estimate,
    actualHours: root.actualHours,
    planStart: root.planStart,
    planEnd: root.planEnd,
    progress: root.estimate ? Math.min(100, Math.round((root.actualHours || 0) / root.estimate * 100)) : 0,
    hasChildren: childTrees.length > 0,
    childCount: childTrees.length,
    children: childTrees,
  };
}
