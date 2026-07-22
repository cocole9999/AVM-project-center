/**
 * V1.8.1: 扩展 AI 工具集 — 覆盖所有 CRUD 实体
 * 让 AI 能创建项目/客户/车型/联系人/迭代/流程/工作项评论/通知已读
 */
import { prisma } from '../db';
import type { ToolDefinition } from './aiTools';

const N = (s: string) => s; // 保留 const 名称一致性

// 工具 9: 创建项目
export const createProject: ToolDefinition = {
  name: 'create_project',
  description: '创建一个 AVM 集成项目。必填：name, customerId 或 customerCode, carModelId 或 carModelCode, startDate, endDate。自动生成 project code。返回新项目 ID。',
  parameters: {
    type: 'object',
    properties: {
      name: { type: 'string', description: '项目名称' },
      description: { type: 'string', description: '项目描述' },
      customerCode: { type: 'string', description: '客户编码（如 GEELY-GALAXY-L7）' },
      customerId: { type: 'string', description: '客户 ID（可选）' },
      carModelCode: { type: 'string', description: '车型编码（如 GEELY-GALAXY-L7-CARMODEL）' },
      carModelId: { type: 'string', description: '车型 ID（可选）' },
      startDate: { type: 'string', description: '开始日期 YYYY-MM-DD' },
      endDate: { type: 'string', description: '结束日期 YYYY-MM-DD' },
      status: { type: 'string', description: '状态：planning/in_progress/completed/on_hold/cancelled' },
      billingType: { type: 'string', description: '计费方式：ODC/ODM/FIXED' },
      contractAmount: { type: 'number', description: '合同金额（元）' },
      budgetHours: { type: 'number', description: '预算工时' },
      risk: { type: 'string', description: '风险等级：low/medium/high' },
      pmUserName: { type: 'string', description: 'PM 姓名' },
      tags: { type: 'string', description: '标签（逗号分隔）' },
    },
    required: ['name', 'startDate', 'endDate'],
  },
  handler: async (args) => {
    if (!args.name) throw new Error('name 必填');
    if (!args.startDate || !args.endDate) throw new Error('startDate/endDate 必填');
    let customerId = args.customerId;
    if (!customerId && args.customerCode) {
      const c = await prisma.customer.findUnique({ where: { code: args.customerCode } });
      if (!c) throw new Error(`客户编码 ${args.customerCode} 不存在`);
      customerId = c.id;
    }
    let carModelId = args.carModelId;
    if (!carModelId && args.carModelCode) {
      const m = await prisma.carModel.findUnique({ where: { code: args.carModelCode } });
      if (!m) throw new Error(`车型编码 ${args.carModelCode} 不存在`);
      carModelId = m.id;
    }
    if (!customerId) throw new Error('必须提供 customerCode 或 customerId');
    if (!carModelId) throw new Error('必须提供 carModelCode 或 carModelId');
    // 自动生成 code：AVM-<CUSTOMER_CODE>-<CARMODEL_CODE>-<YEAR>[-序号]
    const customer = await prisma.customer.findUnique({ where: { id: customerId } });
    const carModel = await prisma.carModel.findUnique({ where: { id: carModelId } });
    const year = new Date().getFullYear();
    const baseCode = `AVM-${customer!.code}-${carModel!.code}-${year}`;
    let code = baseCode;
    let suffix = 1;
    while (await prisma.project.findUnique({ where: { code } })) {
      suffix++;
      code = `${baseCode}-${suffix}`;
      if (suffix > 100) throw new Error('自动生成项目 code 失败：尝试超过 100 次');
    }
    const p = await prisma.project.create({
      data: {
        code, name: args.name, description: args.description || '',
        customerId, carModelId,
        startDate: new Date(args.startDate),
        endDate: new Date(args.endDate),
        status: args.status || 'planning',
        billingType: args.billingType || 'ODC',
        contractAmount: args.contractAmount || 0,
        budgetHours: args.budgetHours || 0,
        risk: args.risk || 'medium',
        pmUserName: args.pmUserName || '',
        tags: args.tags || '',
        progress: 0,
      },
    });
    return { ok: true, id: p.id, code: p.code, message: `已创建项目 ${p.code}: ${p.name}` };
  },
};

// 工具 10: 更新项目
export const updateProject: ToolDefinition = {
  name: 'update_project',
  description: '更新项目字段。可通过 id 或 code 定位。',
  parameters: {
    type: 'object',
    properties: {
      id: { type: 'string', description: '项目 ID' },
      code: { type: 'string', description: '项目编码' },
      name: { type: 'string', description: '新名称' },
      description: { type: 'string' },
      status: { type: 'string' },
      progress: { type: 'number' },
      risk: { type: 'string' },
      contractAmount: { type: 'number' },
      budgetHours: { type: 'number' },
      consumedHours: { type: 'number' },
      pmUserName: { type: 'string' },
    },
  },
  handler: async (args) => {
    if (!args.id && !args.code) throw new Error('id 或 code 必填');
    const where = args.id ? { id: args.id } : { code: args.code };
    const data: any = {};
    ['name', 'description', 'status', 'risk', 'pmUserName'].forEach(f => { if (args[f] !== undefined) data[f] = args[f]; });
    if (args.progress !== undefined) data.progress = args.progress;
    if (args.contractAmount !== undefined) data.contractAmount = args.contractAmount;
    if (args.budgetHours !== undefined) data.budgetHours = args.budgetHours;
    if (args.consumedHours !== undefined) data.consumedHours = args.consumedHours;
    const p = await prisma.project.update({ where, data });
    return { ok: true, code: p.code, message: `已更新项目 ${p.code}` };
  },
};

// 工具 11: 删除项目
export const deleteProject: ToolDefinition = {
  name: 'delete_project',
  description: '删除一个项目。⚠️ 危险操作，会级联删除关联工作项。通过 id 或 code 定位。',
  parameters: {
    type: 'object',
    properties: {
      id: { type: 'string' },
      code: { type: 'string' },
    },
  },
  handler: async (args) => {
    if (!args.id && !args.code) throw new Error('id 或 code 必填');
    const where = args.id ? { id: args.id } : { code: args.code };
    await prisma.project.delete({ where });
    return { ok: true, message: `已删除项目 ${args.code || args.id}` };
  },
};

// 工具 12: 创建客户
export const createCustomer: ToolDefinition = {
  name: 'create_customer',
  description: '创建一个客户档案。必填：name。code 自动生成。',
  parameters: {
    type: 'object',
    properties: {
      name: { type: 'string', description: '客户名称' },
      type: { type: 'string', description: '类型：internal/external', enum: ['internal', 'external'] },
      industry: { type: 'string' },
      contact: { type: 'string', description: '主联系人姓名' },
      phone: { type: 'string' },
      email: { type: 'string' },
      address: { type: 'string' },
      description: { type: 'string' },
    },
    required: ['name'],
  },
  handler: async (args) => {
    if (!args.name) throw new Error('name 必填');
    // 智能生成 code：找现有 CUST-XXX 最大编号 +1 (避免 count+1 与现有编号冲突)
    const existing = await prisma.customer.findMany({
      where: { code: { startsWith: 'CUST-' } },
      select: { code: true },
    });
    let maxNum = 0;
    for (const e of existing) {
      const m = e.code.match(/^CUST-(\d+)$/);
      if (m) maxNum = Math.max(maxNum, parseInt(m[1]));
    }
    const code = `CUST-${String(maxNum + 1).padStart(3, '0')}`;
    const c = await prisma.customer.create({
      data: {
        code, name: args.name, shortName: args.name,
        type: args.type || 'internal',
        industry: args.industry || '',
        contact: args.contact || '', phone: args.phone || '',
        email: args.email || '', address: args.address || '',
        description: args.description || '',
        status: 'active',
      },
    });
    return { ok: true, id: c.id, code: c.code, message: `已创建客户 ${c.code}: ${c.name}` };
  },
};

// 工具 13: 更新客户
export const updateCustomer: ToolDefinition = {
  name: 'update_customer',
  description: '更新客户字段。',
  parameters: {
    type: 'object',
    properties: {
      id: { type: 'string' },
      code: { type: 'string' },
      name: { type: 'string' },
      contact: { type: 'string' },
      phone: { type: 'string' },
      email: { type: 'string' },
      address: { type: 'string' },
      status: { type: 'string' },
    },
  },
  handler: async (args) => {
    if (!args.id && !args.code) throw new Error('id 或 code 必填');
    const where = args.id ? { id: args.id } : { code: args.code };
    const data: any = {};
    ['name', 'contact', 'phone', 'email', 'address', 'status'].forEach(f => { if (args[f] !== undefined) data[f] = args[f]; });
    const c = await prisma.customer.update({ where, data });
    return { ok: true, code: c.code, message: `已更新客户 ${c.code}` };
  },
};

// 工具 14: 创建车型
export const createCarModel: ToolDefinition = {
  name: 'create_car_model',
  description: '创建一个车型档案。必填：name, brand。code 自动生成。',
  parameters: {
    type: 'object',
    properties: {
      name: { type: 'string', description: '车型名称（如 银河 L7）' },
      brand: { type: 'string', description: '品牌（吉利银河/极氪/领克/博越/熊猫mini）' },
      series: { type: 'string' },
      launchYear: { type: 'number' },
      segment: { type: 'string' },
      platform: { type: 'string' },
      description: { type: 'string' },
    },
    required: ['name', 'brand'],
  },
  handler: async (args) => {
    if (!args.name || !args.brand) throw new Error('name 和 brand 必填');
    // 智能生成 code：找现有 CAR-XXX 最大编号 +1
    const existing = await prisma.carModel.findMany({
      where: { code: { startsWith: 'CAR-' } },
      select: { code: true },
    });
    let maxNum = 0;
    for (const e of existing) {
      const m = e.code.match(/^CAR-(\d+)$/);
      if (m) maxNum = Math.max(maxNum, parseInt(m[1]));
    }
    const code = `CAR-${String(maxNum + 1).padStart(3, '0')}`;
    const m = await prisma.carModel.create({
      data: {
        code, name: args.name, brand: args.brand,
        series: args.series || '',
        launchYear: args.launchYear,
        segment: args.segment || '',
        platform: args.platform || '',
        description: args.description || '',
        status: 'active',
      },
    });
    return { ok: true, id: m.id, code: m.code, message: `已创建车型 ${m.code}: ${m.name}` };
  },
};

// 工具 15: 更新车型
export const updateCarModel: ToolDefinition = {
  name: 'update_car_model',
  description: '更新车型字段。',
  parameters: {
    type: 'object',
    properties: {
      id: { type: 'string' },
      code: { type: 'string' },
      name: { type: 'string' },
      brand: { type: 'string' },
      series: { type: 'string' },
      launchYear: { type: 'number' },
      platform: { type: 'string' },
    },
  },
  handler: async (args) => {
    if (!args.id && !args.code) throw new Error('id 或 code 必填');
    const where = args.id ? { id: args.id } : { code: args.code };
    const data: any = {};
    ['name', 'brand', 'series', 'launchYear', 'platform'].forEach(f => { if (args[f] !== undefined) data[f] = args[f]; });
    const m = await prisma.carModel.update({ where, data });
    return { ok: true, code: m.code, message: `已更新车型 ${m.code}` };
  },
};

// 工具 16: 创建联系人
export const createContact: ToolDefinition = {
  name: 'create_contact',
  description: '给指定客户创建一个联系人。必填：customerCode, name, role。',
  parameters: {
    type: 'object',
    properties: {
      customerCode: { type: 'string' },
      customerId: { type: 'string' },
      name: { type: 'string' },
      role: { type: 'string', description: '角色：UPL/PPM/测试/开发/AVM接口人', enum: ['UPL', 'PPM', '测试', '开发', 'AVM接口人'] },
      department: { type: 'string' },
      phone: { type: 'string' },
      email: { type: 'string' },
      feishuId: { type: 'string' },
      primary: { type: 'boolean', description: '是否主联系人' },
    },
    required: ['name', 'role'],
  },
  handler: async (args) => {
    if (!args.name || !args.role) throw new Error('name 和 role 必填');
    let customerId = args.customerId;
    if (!customerId && args.customerCode) {
      const c = await prisma.customer.findUnique({ where: { code: args.customerCode } });
      if (!c) throw new Error(`客户编码 ${args.customerCode} 不存在`);
      customerId = c.id;
    }
    if (!customerId) throw new Error('必须提供 customerCode 或 customerId');
    const c = await prisma.contact.create({
      data: {
        customerId, name: args.name, role: args.role,
        department: args.department || '',
        phone: args.phone || '', email: args.email || '',
        feishuId: args.feishuId || '',
        primary: args.primary || false,
      },
    });
    return { ok: true, id: c.id, message: `已创建联系人 ${c.name} (${c.role})` };
  },
};

// 工具 17: 更新联系人
export const updateContact: ToolDefinition = {
  name: 'update_contact',
  description: '更新联系人字段。Contact.name 不唯一，定位时优先用 id；用 name 定位时会返回多个并报错。',
  parameters: {
    type: 'object',
    properties: {
      id: { type: 'string', description: '联系人 ID（推荐）' },
      name: { type: 'string', description: '当前姓名（用于定位）' },
      customerCode: { type: 'string', description: '客户编码（与 name 组合定位，避免歧义）' },
      newName: { type: 'string' },
      role: { type: 'string' },
      phone: { type: 'string' },
      email: { type: 'string' },
      department: { type: 'string' },
      primary: { type: 'boolean' },
    },
  },
  handler: async (args) => {
    if (!args.id && !args.name) throw new Error('id 或 name 必填');
    let contactId = args.id;
    if (!contactId) {
      const where: any = { name: args.name };
      if (args.customerCode) {
        const c = await prisma.customer.findUnique({ where: { code: args.customerCode } });
        if (!c) throw new Error(`客户 ${args.customerCode} 不存在`);
        where.customerId = c.id;
      }
      const found = await prisma.contact.findMany({ where });
      if (found.length === 0) throw new Error(`联系人 ${args.name} 不存在`);
      if (found.length > 1) throw new Error(`联系人 ${args.name} 在该客户下有 ${found.length} 个，请用 id 或 customerCode+name 唯一定位`);
      contactId = found[0].id;
    }
    const data: any = {};
    if (args.newName) data.name = args.newName;
    ['role', 'phone', 'email', 'department', 'primary'].forEach(f => { if (args[f] !== undefined) data[f] = args[f]; });
    const c = await prisma.contact.update({ where: { id: contactId }, data });
    return { ok: true, name: c.name, message: `已更新联系人 ${c.name}` };
  },
};

// 工具 18: 创建迭代
export const createIteration: ToolDefinition = {
  name: 'create_iteration',
  description: '创建一个迭代（sprint）。必填：name, startDate, endDate。',
  parameters: {
    type: 'object',
    properties: {
      name: { type: 'string', description: '迭代名称（如 Sprint 2026-Q3）' },
      startDate: { type: 'string', description: '开始日期 YYYY-MM-DD' },
      endDate: { type: 'string', description: '结束日期 YYYY-MM-DD' },
      goal: { type: 'string', description: '迭代目标' },
      status: { type: 'string', description: '状态：active/upcoming/completed', enum: ['active', 'upcoming', 'completed'] },
    },
    required: ['name', 'startDate', 'endDate'],
  },
  handler: async (args) => {
    if (!args.name) throw new Error('name 必填');
    const i = await prisma.iteration.create({
      data: {
        name: args.name, goal: args.goal || '',
        startDate: new Date(args.startDate), endDate: new Date(args.endDate),
        status: args.status || 'upcoming',
      },
    });
    return { ok: true, id: i.id, name: i.name, message: `已创建迭代 ${i.name}` };
  },
};

// 工具 19: 更新迭代
export const updateIteration: ToolDefinition = {
  name: 'update_iteration',
  description: '更新迭代字段。',
  parameters: {
    type: 'object',
    properties: {
      id: { type: 'string' },
      name: { type: 'string' },
      goal: { type: 'string' },
      status: { type: 'string' },
    },
  },
  handler: async (args) => {
    if (!args.id && !args.name) throw new Error('id 或 name 必填');
    const where = args.id ? { id: args.id } : { name: args.name };
    const data: any = {};
    ['goal', 'status'].forEach(f => { if (args[f] !== undefined) data[f] = args[f]; });
    const i = await prisma.iteration.update({ where, data });
    return { ok: true, name: i.name, message: `已更新迭代 ${i.name}` };
  },
};

// 工具 20: 创建流程 (NodeFlow)
export const createFlow: ToolDefinition = {
  name: 'create_flow',
  description: '创建一个节点流（流程模板，对应 NodeFlow 表）。必填：name, workType。workType 是流程类型标识（如 requirement/task/bug/release），与 isActive 构成唯一索引。',
  parameters: {
    type: 'object',
    properties: {
      name: { type: 'string', description: '流程名称' },
      workType: { type: 'string', description: '工作类型：requirement/task/bug/release', enum: ['requirement', 'task', 'bug', 'release'] },
      description: { type: 'string' },
      isActive: { type: 'boolean', description: '是否启用，默认 true' },
    },
    required: ['name', 'workType'],
  },
  handler: async (args) => {
    if (!args.name || !args.workType) throw new Error('name 和 workType 必填');
    // 检查 (workType, isActive) 唯一
    const isActive = args.isActive !== false;
    const exists = await prisma.nodeFlow.findFirst({ where: { workType: args.workType, isActive } });
    if (exists) throw new Error(`已存在 workType=${args.workType} isActive=${isActive} 的流程 (${exists.name})`);
    const f = await prisma.nodeFlow.create({
      data: {
        name: args.name, workType: args.workType,
        description: args.description || '',
        isActive,
        version: 1,
      },
    });
    return { ok: true, id: f.id, name: f.name, message: `已创建流程 ${f.name} (workType=${f.workType})` };
  },
};

// 工具 21: 更新流程 (NodeFlow)
export const updateFlow: ToolDefinition = {
  name: 'update_flow',
  description: '更新节点流字段。NodeFlow.name 不唯一，需先 findFirst 定位再 update。',
  parameters: {
    type: 'object',
    properties: {
      id: { type: 'string', description: '流程 ID（推荐）' },
      name: { type: 'string', description: '当前流程名称（用于定位，可能不唯一）' },
      newName: { type: 'string', description: '新名称' },
      description: { type: 'string' },
      isActive: { type: 'boolean' },
    },
  },
  handler: async (args) => {
    if (!args.id && !args.name) throw new Error('id 或 name 必填');
    let flowId = args.id;
    if (!flowId) {
      const existing = await prisma.nodeFlow.findFirst({ where: { name: args.name } });
      if (!existing) throw new Error(`流程 ${args.name} 不存在`);
      flowId = existing.id;
    }
    const data: any = {};
    if (args.newName) data.name = args.newName;
    if (args.description !== undefined) data.description = args.description;
    if (args.isActive !== undefined) data.isActive = args.isActive;
    const f = await prisma.nodeFlow.update({ where: { id: flowId }, data });
    return { ok: true, name: f.name, message: `已更新流程 ${f.name}` };
  },
};

// 工具 22: 创建工作项评论
export const createComment: ToolDefinition = {
  name: 'create_comment',
  description: '给工作项加一条评论。必填：workItemKey, content。',
  parameters: {
    type: 'object',
    properties: {
      workItemKey: { type: 'string', description: '工作项编号（如 REQ-1）' },
      workItemId: { type: 'string', description: '工作项 ID' },
      content: { type: 'string', description: '评论内容' },
      author: { type: 'string', description: '评论人（默认 AI 助理）' },
    },
    required: ['content'],
  },
  handler: async (args) => {
    if (!args.content) throw new Error('content 必填');
    let workItemId = args.workItemId;
    if (!workItemId && args.workItemKey) {
      const w = await prisma.workItem.findUnique({ where: { key: args.workItemKey } });
      if (!w) throw new Error(`工作项 ${args.workItemKey} 不存在`);
      workItemId = w.id;
    }
    if (!workItemId) throw new Error('必须提供 workItemKey 或 workItemId');
    const c = await prisma.comment.create({
      data: {
        workItemId, content: args.content,
        author: args.author || 'AI 助理',
      },
    });
    return { ok: true, id: c.id, message: `已加评论 (by ${c.author})` };
  },
};

// 工具 23: 标记通知已读
export const markNotificationRead: ToolDefinition = {
  name: 'mark_notification_read',
  description: '把通知标记为已读。可以通过 id 或 recipientId 批量标记所有未读。',
  parameters: {
    type: 'object',
    properties: {
      id: { type: 'string', description: '单条通知 ID（可选）' },
      recipientId: { type: 'string', description: '用户标识（可选，批量标记该用户所有未读）' },
      markAll: { type: 'boolean', description: '是否标记所有未读（不区分用户）' },
    },
  },
  handler: async (args) => {
    if (args.id) {
      await prisma.notification.update({ where: { id: args.id }, data: { read: true, readAt: new Date() } });
      return { ok: true, message: '已标记单条为已读' };
    }
    if (args.recipientId) {
      const r = await prisma.notification.updateMany({
        where: { recipientId: args.recipientId, read: false },
        data: { read: true, readAt: new Date() },
      });
      return { ok: true, count: r.count, message: `已标记 ${r.count} 条为已读` };
    }
    if (args.markAll) {
      const r = await prisma.notification.updateMany({
        where: { read: false },
        data: { read: true, readAt: new Date() },
      });
      return { ok: true, count: r.count, message: `已标记 ${r.count} 条为已读` };
    }
    throw new Error('必须传 id / recipientId / markAll');
  },
};

// 工具 24: 列出通知
export const listNotifications: ToolDefinition = {
  name: 'list_notifications',
  description: '列出用户的通知。可按 read 状态过滤。',
  parameters: {
    type: 'object',
    properties: {
      recipientId: { type: 'string', description: '用户标识（如 admin）' },
      unreadOnly: { type: 'boolean', description: '只看未读' },
      type: { type: 'string', description: '通知类型过滤（如 ai_risk_alert）' },
      limit: { type: 'number', description: '返回数量上限，默认 20' },
    },
  },
  handler: async (args) => {
    const where: any = {};
    if (args.recipientId) where.recipientId = args.recipientId;
    if (args.unreadOnly) where.read = false;
    if (args.type) where.type = args.type;
    const list = await prisma.notification.findMany({
      where, take: Math.min(args.limit || 20, 50),
      orderBy: { createdAt: 'desc' },
    });
    return list.map(n => ({
      id: n.id, type: n.type, level: n.level, title: n.title,
      content: n.content, read: n.read, createdAt: n.createdAt,
    }));
  },
};

// 工具 25: 删除工作项
export const deleteWorkItem: ToolDefinition = {
  name: 'delete_work_item',
  description: '⚠️ 危险操作，删除一个工作项。',
  parameters: {
    type: 'object',
    properties: { id: { type: 'string' }, key: { type: 'string' } },
  },
  handler: async (args) => {
    if (!args.id && !args.key) throw new Error('id 或 key 必填');
    const where = args.id ? { id: args.id } : { key: args.key };
    await prisma.workItem.delete({ where });
    return { ok: true, message: `已删除工作项 ${args.key || args.id}` };
  },
};

// 工具 26: 给工作项分配迭代
export const assignIteration: ToolDefinition = {
  name: 'assign_iteration',
  description: '把工作项分配到一个迭代（sprint）。',
  parameters: {
    type: 'object',
    properties: {
      workItemKey: { type: 'string' },
      workItemId: { type: 'string' },
      iterationName: { type: 'string', description: '迭代名称（推荐用名称）' },
      iterationId: { type: 'string' },
    },
  },
  handler: async (args) => {
    if (!args.iterationId && !args.iterationName) throw new Error('iterationId 或 iterationName 必填');
    let workItemId = args.workItemId;
    if (!workItemId && args.workItemKey) {
      const w = await prisma.workItem.findUnique({ where: { key: args.workItemKey } });
      if (!w) throw new Error(`工作项 ${args.workItemKey} 不存在`);
      workItemId = w.id;
    }
    let iterationId = args.iterationId;
    if (!iterationId && args.iterationName) {
      const it = await prisma.iteration.findFirst({ where: { name: args.iterationName } });
      if (!it) throw new Error(`迭代 ${args.iterationName} 不存在`);
      iterationId = it.id;
    }
    const w = await prisma.workItem.update({ where: { id: workItemId }, data: { iterationId } });
    return { ok: true, key: w.key, message: `已把 ${w.key} 分配到迭代` };
  },
};
