/**
 * V1.7 联系人管理
 * 每个客户（内部项目组）下的联系人：UPL / PPM / 测试 / 开发 / AVM接口人
 */
import { Router } from 'express';
import { prisma } from '../db';
import { requireAuth, autoRole } from '../middleware/auth';
import { recordAudit, actorFromReq, diffFields } from '../utils/audit';

export const contactRouter = Router();

// V1.11: 鉴权 + 写保护
contactRouter.use(requireAuth);
contactRouter.use(autoRole());

// 列表（按 customerId 过滤）
contactRouter.get('/', async (req, res) => {
  const { customerId, role, q } = req.query as any;
  const where: any = {};
  if (customerId) where.customerId = customerId;
  if (role) where.role = role;
  if (q) {
    where.OR = [
      { name: { contains: q } },
      { department: { contains: q } },
      { phone: { contains: q } },
      { email: { contains: q } },
    ];
  }
  const list = await prisma.contact.findMany({
    where,
    include: { customer: { select: { id: true, name: true, shortName: true, code: true } } },
    orderBy: [{ customerId: 'asc' }, { primary: 'desc' }, { role: 'asc' }],
  });
  res.json(list);
});

// 详情
contactRouter.get('/:id', async (req, res) => {
  const c = await prisma.contact.findUnique({
    where: { id: req.params.id },
    include: { customer: true },
  });
  if (!c) return res.status(404).json({ error: '联系人不存在' });
  res.json(c);
});

// 创建
contactRouter.post('/', autoRole(), async (req, res) => {
  try {
    const c = await prisma.contact.create({ data: req.body });
    recordAudit('contact', c.id, 'create', null, { method: 'POST', summary: `创建联系人 ${c.name}` }, actorFromReq(req));
    res.status(201).json(c);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

// 批量创建
contactRouter.post('/batch', autoRole(), async (req, res) => {
  try {
    const { contacts } = req.body;
    const result = await prisma.$transaction(
      contacts.map((c: any) => prisma.contact.create({ data: c }))
    );
    recordAudit('contact', 'batch', 'create', null, { method: 'POST', summary: `批量创建 ${result.length} 个联系人` }, actorFromReq(req));
    res.status(201).json({ count: result.length, contacts: result });
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

// 更新
contactRouter.patch('/:id', autoRole(), async (req, res) => {
  try {
    const before = await prisma.contact.findUnique({ where: { id: req.params.id } });
    const c = await prisma.contact.update({ where: { id: req.params.id }, data: req.body });
    if (before) {
      const changes = diffFields(before as any, c as any, ['name', 'role', 'department', 'phone', 'email', 'feishuId', 'primary']);
      recordAudit('contact', c.id, 'update', changes, { method: 'PATCH', summary: `更新联系人 ${c.name} (${changes.length} 项)` }, actorFromReq(req));
    }
    res.json(c);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

// 删除
contactRouter.delete('/:id', autoRole(), async (req, res) => {
  try {
    const before = await prisma.contact.findUnique({ where: { id: req.params.id } });
    await prisma.contact.delete({ where: { id: req.params.id } });
    recordAudit('contact', req.params.id, 'delete', null, { method: 'DELETE', summary: `删除联系人 ${before?.name}` }, actorFromReq(req));
    res.json({ ok: true });
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});
