/**
 * 工作项资源库（模板复用）
 */
import { Router } from 'express';
import { prisma } from '../db';

export const templateRouter = Router();

// 列出
templateRouter.get('/', async (req, res) => {
  try {
    const { spaceId, workType, category } = req.query as any;
    const where: any = {};
    if (spaceId) where.spaceId = spaceId;
    if (workType) where.workType = workType;
    if (category) where.category = category;
    const list = await prisma.workItemTemplate.findMany({ where, orderBy: { useCount: 'desc' } });
    res.json(list);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

templateRouter.get('/:id', async (req, res) => {
  const t = await prisma.workItemTemplate.findUnique({ where: { id: req.params.id } });
  if (!t) return res.status(404).json({ error: 'Template not found' });
  res.json(t);
});

templateRouter.post('/', async (req, res) => {
  try {
    const { spaceId, name, workType, description, defaultFields, childItems, tags, category, createdBy } = req.body;
    if (!name || !workType) return res.status(400).json({ error: 'name, workType required' });
    const t = await prisma.workItemTemplate.create({
      data: {
        spaceId: spaceId || null, name, workType,
        description: description || '',
        defaultFields: typeof defaultFields === 'string' ? defaultFields : JSON.stringify(defaultFields || {}),
        childItems: typeof childItems === 'string' ? childItems : JSON.stringify(childItems || []),
        tags: tags || '',
        category: category || '通用',
        createdBy: createdBy || null,
      },
    });
    res.status(201).json(t);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

templateRouter.patch('/:id', async (req, res) => {
  try {
    const t = await prisma.workItemTemplate.update({ where: { id: req.params.id }, data: req.body });
    res.json(t);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

templateRouter.delete('/:id', async (req, res) => {
  try {
    await prisma.workItemTemplate.delete({ where: { id: req.params.id } });
    res.status(204).end();
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

// 基于模板创建工作项（含子工作项）
templateRouter.post('/:id/apply', async (req, res) => {
  try {
    const t = await prisma.workItemTemplate.findUnique({ where: { id: req.params.id } });
    if (!t) return res.status(404).json({ error: 'Template not found' });

    const defaults = JSON.parse(t.defaultFields || '{}');
    const childItems = JSON.parse(t.childItems || '[]');

    // 生成主工作项
    const key = await generateKey(t.workType, req.body.spaceId);
    const mainItem = await prisma.workItem.create({
      data: {
        type: t.workType,
        key,
        title: req.body.title || t.name,
        description: req.body.description || t.description,
        status: '待评审',
        reporter: 'system',
        ...defaults,
        ...req.body.overrides,
        space: req.body.spaceId || t.spaceId ? { connect: { id: req.body.spaceId || t.spaceId } } : undefined,
      },
    });

    // 递归创建子项
    async function createChildren(items: any[], parentId: string) {
      for (const ci of items) {
        const childKey = await generateKey(ci.type || t.workType, req.body.spaceId);
        const child = await prisma.workItem.create({
          data: {
            type: ci.type || t.workType,
            key: childKey,
            title: ci.title,
            description: ci.description || '',
            status: '待评审',
            reporter: 'system',
            ...ci.defaults,
            parent: { connect: { id: parentId } },
            space: req.body.spaceId || t.spaceId ? { connect: { id: req.body.spaceId || t.spaceId } } : undefined,
          },
        });
        if (ci.children?.length) {
          await createChildren(ci.children, child.id);
        }
      }
    }
    if (childItems.length) await createChildren(childItems, mainItem.id);

    // 增加模板使用次数
    await prisma.workItemTemplate.update({ where: { id: t.id }, data: { useCount: { increment: 1 } } });

    // 返回完整对象
    const result = await prisma.workItem.findUnique({ where: { id: mainItem.id }, include: { children: true } });
    res.status(201).json(result);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

async function generateKey(type: string, _spaceId?: string): Promise<string> {
  const prefix = { requirement: 'REQ', task: 'TASK', bug: 'BUG', release: 'REL' }[type] || 'ITEM';
  const count = await prisma.workItem.count({ where: { type } });
  return `${prefix}-${count + 1}`;
}
