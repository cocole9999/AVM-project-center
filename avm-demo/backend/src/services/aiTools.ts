/**
 * AI 工具集 - 让 LLM 通过 function calling 操作 AVM 数据
 *
 * 每个工具定义：
 * - name: 工具名（LLM 调）
 * - description: 工具描述（LLM 看到，决定何时调用）
 * - parameters: JSON Schema（LLM 用来生成参数）
 * - handler: 实际执行的函数
 */
import { prisma } from '../db';
import {
  createProject, updateProject, deleteProject,
  createCustomer, updateCustomer,
  createCarModel, updateCarModel,
  createContact, updateContact,
  createIteration, updateIteration,
  createFlow, updateFlow,
  createComment,
  markNotificationRead, listNotifications,
  deleteWorkItem,
  assignIteration,
} from './aiToolsExt';

// ========== 工具注册表 ==========
export interface ToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, any>;
    required?: string[];
  };
  // 简化 schema 让 LLM 更好理解
  handler: (args: any) => Promise<any>;
}

// ========== 工具 1: 列出项目 ==========
const listProjects: ToolDefinition = {
  name: 'list_projects',
  description: '列出/查询项目。可按客户/车型/状态/风险/进度过滤。返回项目列表（含合同额/进度/风险/状态等）。',
  parameters: {
    type: 'object',
    properties: {
      customerId: { type: 'string', description: '客户 ID（可选）' },
      carModelId: { type: 'string', description: '车型 ID（可选）' },
      status: { type: 'string', description: '项目状态：planning / in_progress / completed / on_hold / cancelled' },
      risk: { type: 'string', description: '风险等级：low / medium / high' },
      minProgress: { type: 'number', description: '最小进度 0-100（可选）' },
      maxProgress: { type: 'number', description: '最大进度 0-100（可选）' },
      keyword: { type: 'string', description: '按项目名/编码模糊搜索（可选）' },
      limit: { type: 'number', description: '返回数量上限，默认 20' },
    },
  },
  handler: async (args) => {
    const where: any = {};
    if (args.customerId) where.customerId = args.customerId;
    if (args.carModelId) where.carModelId = args.carModelId;
    if (args.status) where.status = args.status;
    if (args.risk) where.risk = args.risk;
    if (args.minProgress != null || args.maxProgress != null) {
      where.progress = {};
      if (args.minProgress != null) where.progress.gte = args.minProgress;
      if (args.maxProgress != null) where.progress.lte = args.maxProgress;
    }
    if (args.keyword) {
      where.OR = [
        { name: { contains: args.keyword } },
        { code: { contains: args.keyword } },
      ];
    }
    const list = await prisma.project.findMany({
      where,
      include: { customer: { select: { code: true, name: true } }, carModel: { select: { name: true, brand: true } } },
      orderBy: [{ risk: 'desc' }, { contractAmount: 'desc' }],
      take: Math.min(args.limit || 20, 50),
    });
    return list.map(p => ({
      id: p.id, code: p.code, name: p.name,
      customer: p.customer.name, carModel: `${p.carModel.name}（${p.carModel.brand}）`,
      contractAmount: p.contractAmount, billingType: p.billingType,
      progress: p.progress, risk: p.risk, status: p.status,
      startDate: p.startDate, endDate: p.endDate,
    }));
  },
};

// ========== 工具 2: 获取项目详情 ==========
const getProject: ToolDefinition = {
  name: 'get_project',
  description: '获取单个项目的详细信息：合同/进度/风险/状态/起止/PM/工作项数量等。',
  parameters: {
    type: 'object',
    properties: {
      id: { type: 'string', description: '项目 ID' },
      code: { type: 'string', description: '项目编码（如 AVM-GALAXY-L7-2026）' },
    },
  },
  handler: async (args) => {
    if (!args.id && !args.code) throw new Error('id 或 code 至少传一个');
    const p = await prisma.project.findFirst({
      where: args.id ? { id: args.id } : { code: args.code },
      include: {
        customer: { select: { code: true, name: true, contact: true, phone: true } },
        carModel: { select: { name: true, brand: true, platform: true } },
      },
    });
    if (!p) return { error: '项目不存在' };
    // 关联工作项数量
    const workItemCount = await prisma.workItem.count({ where: { projectId: p.id } });
    return {
      id: p.id, code: p.code, name: p.name, description: p.description,
      customer: p.customer, carModel: p.carModel,
      pmUserName: p.pmUserName, contractAmount: p.contractAmount, billingType: p.billingType,
      budgetHours: p.budgetHours, consumedHours: p.consumedHours,
      progress: p.progress, risk: p.risk, status: p.status,
      startDate: p.startDate, endDate: p.endDate,
      workItemCount,
    };
  },
};

// ========== 工具 3: 风险扫描 ==========
const scanRisks: ToolDefinition = {
  name: 'scan_risks',
  description: '扫描所有项目的风险，识别：1) 高风险项目 2) 进度严重落后 3) 接近/超过截止日 4) 预算超支。返回风险项目列表 + 风险类型。',
  parameters: {
    type: 'object',
    properties: {
      riskLevel: { type: 'string', description: '只看特定风险等级：low / medium / high（默认 all）' },
      includeOverdue: { type: 'boolean', description: '是否包含超期未完成的工作项，默认 true' },
    },
  },
  handler: async (args) => {
    const today = new Date();
    // 高风险 / 接近截止 / 进度慢
    const projects = await prisma.project.findMany({
      where: args.riskLevel ? { risk: args.riskLevel } : { status: { notIn: ['completed', 'cancelled'] } },
      include: { customer: { select: { name: true } }, carModel: { select: { name: true } } },
    });
    const risks: any[] = [];
    for (const p of projects) {
      const issues: string[] = [];
      // 风险等级
      if (p.risk === 'high') issues.push('风险等级高');
      // 进度低
      const daysLeft = Math.ceil((new Date(p.endDate).getTime() - today.getTime()) / 86400000);
      if (daysLeft < 0) issues.push(`已超期 ${-daysLeft} 天`);
      else if (daysLeft < 30 && p.progress < 50) issues.push(`剩余 ${daysLeft} 天但进度仅 ${p.progress}%`);
      // 预算超支
      if (p.budgetHours > 0 && p.consumedHours > p.budgetHours * 1.1) {
        issues.push(`工时已消耗 ${(p.consumedHours / p.budgetHours * 100).toFixed(0)}%（超 10%）`);
      }
      if (issues.length > 0) {
        risks.push({
          projectCode: p.code, projectName: p.name,
          customer: p.customer.name, carModel: p.carModel.name,
          progress: p.progress, risk: p.risk, status: p.status,
          daysLeft, contractAmount: p.contractAmount,
          issues,
        });
      }
    }
    // 超期工作项
    let overdueItems: any[] = [];
    if (args.includeOverdue !== false) {
      const items = await prisma.workItem.findMany({
        where: { planEnd: { lt: today }, status: { notIn: ['已完成', '已关闭', '已驳回', '已发布', '已验收'] } },
        take: 30,
      });
      overdueItems = items.map(i => ({
        key: i.key, title: i.title, priority: i.priority, status: i.status,
        daysOverdue: Math.ceil((today.getTime() - new Date(i.planEnd!).getTime()) / 86400000),
        assignee: i.assignee,
      }));
    }
    return { riskProjects: risks, overdueWorkItems: overdueItems, scannedAt: today.toISOString() };
  },
};

// ========== 工具 4: 创建工作项 ==========
const createWorkItem: ToolDefinition = {
  name: 'create_work_item',
  description: '创建一个新工作项（需求/任务/缺陷/发布）。必填 type 和 title，其他字段可选。返回创建的工作项 ID。',
  parameters: {
    type: 'object',
    properties: {
      type: { type: 'string', description: '类型：requirement / task / bug / release', enum: ['requirement', 'task', 'bug', 'release'] },
      title: { type: 'string', description: '标题（一句话）' },
      description: { type: 'string', description: '详细描述（可选）' },
      priority: { type: 'string', description: '优先级：P0 / P1 / P2 / P3（默认 P2）', enum: ['P0', 'P1', 'P2', 'P3'] },
      projectId: { type: 'string', description: '关联项目 ID（可选）' },
      projectCode: { type: 'string', description: '关联项目编码（如 AVM-GALAXY-L7-2026，可选）' },
      assignee: { type: 'string', description: '负责人姓名（可选）' },
      reporter: { type: 'string', description: '报告人姓名（可选，默认 "AI 助理"）' },
      estimate: { type: 'number', description: '估算工时（可选）' },
      dueDate: { type: 'string', description: '截止日 YYYY-MM-DD（可选）' },
    },
    required: ['type', 'title'],
  },
  handler: async (args) => {
    if (!args.type || !args.title) throw new Error('type 和 title 必填');
    // 解析 projectId
    let projectId = args.projectId;
    if (!projectId && args.projectCode) {
      const p = await prisma.project.findUnique({ where: { code: args.projectCode } });
      if (!p) throw new Error(`项目编码 ${args.projectCode} 不存在`);
      projectId = p.id;
    }
    // 生成 key
    const prefix = { requirement: 'REQ', task: 'TASK', bug: 'BUG', release: 'REL' }[args.type] || 'ITEM';
    const count = await prisma.workItem.count({ where: { type: args.type } });
    const key = `${prefix}-${count + 1}`;
    const item = await prisma.workItem.create({
      data: {
        key, type: args.type, title: args.title,
        description: args.description || '',
        priority: args.priority || 'P2',
        projectId: projectId || null,
        assignee: args.assignee || '未分配',
        reporter: args.reporter || 'AI 助理',
        status: '待领取',
        estimate: args.estimate || 0,
        planEnd: args.dueDate ? new Date(args.dueDate) : null,
      },
    });
    return { ok: true, key, id: item.id, message: `已创建 ${args.type} ${key}: ${args.title}` };
  },
};

// ========== 工具 5: 更新工作项 ==========
const updateWorkItem: ToolDefinition = {
  name: 'update_work_item',
  description: '更新工作项的字段。可以通过 key（如 REQ-1）或 id 定位。可改：title/description/priority/status/assignee/estimate/dueDate。',
  parameters: {
    type: 'object',
    properties: {
      key: { type: 'string', description: '工作项编号（如 REQ-1）' },
      id: { type: 'string', description: '工作项 ID' },
      title: { type: 'string', description: '新标题' },
      description: { type: 'string', description: '新描述' },
      priority: { type: 'string', description: '新优先级 P0/P1/P2/P3' },
      status: { type: 'string', description: '新状态' },
      assignee: { type: 'string', description: '新负责人' },
      estimate: { type: 'number', description: '新估算工时' },
      dueDate: { type: 'string', description: '新截止日 YYYY-MM-DD' },
    },
  },
  handler: async (args) => {
    if (!args.id && !args.key) throw new Error('id 或 key 至少传一个');
    const where = args.id ? { id: args.id } : { key: args.key };
    const existing = await prisma.workItem.findUnique({ where });
    if (!existing) throw new Error('工作项不存在');
    const data: any = {};
    ['title', 'description', 'priority', 'status', 'assignee'].forEach(f => { if (args[f] !== undefined) data[f] = args[f]; });
    if (args.estimate !== undefined) data.estimate = args.estimate;
    if (args.dueDate !== undefined) data.planEnd = new Date(args.dueDate);
    const item = await prisma.workItem.update({ where, data });
    return { ok: true, key: item.key, message: `已更新 ${item.key}: ${item.title}` };
  },
};

// ========== 工具 6: 列出工作项 ==========
const listWorkItems: ToolDefinition = {
  name: 'list_work_items',
  description: '查询工作项列表。可按类型/优先级/状态/项目/负责人/关键词等多种条件筛选。适合回答"有哪些P0缺陷""列出某个项目的需求""我的任务有哪些"等。返回标题/编号/状态/负责人/优先级/起止日期等。',
  parameters: {
    type: 'object',
    properties: {
      type: { type: 'string', description: '类型：requirement（需求）/ task（任务）/ bug（缺陷）/ release（发布）' },
      priority: { type: 'string', description: '优先级：P0/P1/P2/P3，多个用逗号分隔' },
      status: { type: 'string', description: '状态名（如 待领取/已完成/开发中），多个用逗号分隔' },
      projectCode: { type: 'string', description: '按项目编码过滤（如 AVM-GALAXY-L7-2026）' },
      assignee: { type: 'string', description: '按负责人姓名过滤' },
      keyword: { type: 'string', description: '按标题/编号模糊搜索' },
      isOverdue: { type: 'boolean', description: 'true=只看已超期的（planEnd < today 且未完成）' },
      limit: { type: 'number', description: '返回数量上限，默认 20，最多 50' },
    },
  },
  handler: async (args) => {
    const where: any = {};
    if (args.type) where.type = args.type;
    if (args.priority) {
      const priorities = args.priority.split(',').map((s: string) => s.trim());
      where.priority = priorities.length === 1 ? priorities[0] : { in: priorities };
    }
    if (args.status) {
      const statuses = args.status.split(',').map((s: string) => s.trim());
      where.status = statuses.length === 1 ? statuses[0] : { in: statuses };
    }
    if (args.assignee) where.assignee = { contains: args.assignee };
    if (args.projectCode) {
      const p = await prisma.project.findUnique({ where: { code: args.projectCode } });
      if (p) where.projectId = p.id;
    }
    if (args.keyword) {
      where.OR = [
        { title: { contains: args.keyword } },
        { key: { contains: args.keyword } },
      ];
    }
    if (args.isOverdue) {
      const now = new Date();
      where.planEnd = { lt: now };
      where.status = { notIn: ['已完成', '已关闭', '已驳回', '已发布', '已验收'] };
    }
    const list = await prisma.workItem.findMany({
      where, take: Math.min(args.limit || 20, 50), orderBy: [{ priority: 'asc' }, { updatedAt: 'desc' }],
    });
    return list.map(i => ({
      key: i.key, type: i.type, title: i.title,
      priority: i.priority, status: i.status, assignee: i.assignee,
      projectId: i.projectId, estimate: i.estimate, actualHours: i.actualHours,
      planStart: i.planStart, planEnd: i.planEnd,
    }));
  },
};

// ========== 工具 7: 列出客户/车型/联系人（辅助上下文） ==========
const listCustomers: ToolDefinition = {
  name: 'list_customers',
  description: '列出客户档案。可按状态过滤。',
  parameters: { type: 'object', properties: { status: { type: 'string', description: 'active/inactive/archived' } } },
  handler: async (args) => {
    const where: any = {};
    if (args.status) where.status = args.status;
    const list = await prisma.customer.findMany({ where, orderBy: { code: 'asc' } });
    return list.map(c => ({ id: c.id, code: c.code, name: c.name, type: c.type, status: c.status, contact: c.contact }));
  },
};

// ========== 工具 8: 列出联系人 ==========
const listContacts: ToolDefinition = {
  name: 'list_contacts',
  description: '列出客户联系人。可按客户/角色过滤。常用于"找某客户的 UPL"。',
  parameters: {
    type: 'object',
    properties: {
      customerCode: { type: 'string', description: '按客户编码过滤' },
      role: { type: 'string', description: '按角色过滤（UPL/PPM/测试/开发/AVM接口人）' },
      name: { type: 'string', description: '按姓名搜索' },
    },
  },
  handler: async (args) => {
    const where: any = {};
    if (args.role) where.role = args.role;
    if (args.name) where.name = { contains: args.name };
    if (args.customerCode) {
      const c = await prisma.customer.findUnique({ where: { code: args.customerCode } });
      if (c) where.customerId = c.id;
    }
    const list = await prisma.contact.findMany({ where, include: { customer: { select: { name: true, code: true } } } });
    return list.map(c => ({
      id: c.id, name: c.name, role: c.role, phone: c.phone, email: c.email, department: c.department,
      customer: c.customer.name, customerCode: c.customer.code,
    }));
  },
};

// ========== 工具 9: 查询迭代/冲刺 ==========
const listIterations: ToolDefinition = {
  name: 'list_iterations',
  description: '查询迭代/冲刺列表。可按状态过滤（active/planning/completed）。返回每个迭代的工作项数量、起止日期、进度。',
  parameters: {
    type: 'object',
    properties: {
      status: { type: 'string', description: '迭代状态：active / planning / completed（可选）' },
      spaceId: { type: 'string', description: '所属空间 ID（可选）' },
      limit: { type: 'number', description: '返回数量上限，默认 10' },
    },
  },
  handler: async (args) => {
    const where: any = {};
    if (args.status) where.status = args.status;
    if (args.spaceId) where.spaceId = args.spaceId;
    const list = await prisma.iteration.findMany({
      where,
      include: {
        _count: { select: { workItems: true } },
        workItems: { select: { status: true } },
      },
      orderBy: { startDate: 'desc' },
      take: Math.min(args.limit || 10, 30),
    });
    return list.map(i => {
      const total = i.workItems.length;
      const done = i.workItems.filter(w => ['已完成', '已关闭', '已验收', '已发布'].includes(w.status)).length;
      return {
        id: i.id, name: i.name, status: i.status,
        startDate: i.startDate, endDate: i.endDate,
        workItemCount: total,
        completionRate: total > 0 ? Math.round(done / total * 100) + '%' : '0%',
      };
    });
  },
};

// ========== 工具 10: 查询活动日志 ==========
const queryActivities: ToolDefinition = {
  name: 'query_activities',
  description: '查询系统的最近活动/变更记录。适合回答"最近发生了什么""谁改了什么""张三最近做了什么"。可限定工作项、操作人、操作类型。',
  parameters: {
    type: 'object',
    properties: {
      workItemKey: { type: 'string', description: '按工作项编号过滤（如 REQ-1、TASK-2）' },
      actor: { type: 'string', description: '按操作人过滤（用户名或显示名）' },
      action: { type: 'string', description: '操作类型：created / status_changed / field_changed' },
      days: { type: 'number', description: '最近 N 天的活动，默认 7 天' },
      limit: { type: 'number', description: '返回数量上限，默认 20' },
    },
  },
  handler: async (args) => {
    const where: any = {};
    if (args.workItemKey) {
      const wi = await prisma.workItem.findUnique({ where: { key: args.workItemKey } });
      if (wi) where.workItemId = wi.id;
    }
    if (args.actor) where.actor = { contains: args.actor };
    if (args.action) where.action = args.action;
    if (args.days) {
      const since = new Date(Date.now() - args.days * 86400000);
      where.createdAt = { gte: since };
    }
    const list = await prisma.activity.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: Math.min(args.limit || 20, 50),
    });
    return list.map(a => ({
      actor: a.actor, action: a.action, field: a.field,
      oldValue: a.oldValue, newValue: a.newValue,
      time: a.createdAt,
      workItemId: a.workItemId,
    }));
  },
};

// ========== 工具 11: 全局搜索 ==========
const searchAll: ToolDefinition = {
  name: 'search_all',
  description: '全局搜索，跨工作项、项目、客户、车型、联系人搜索。适合回答"帮我找一下XX相关的所有信息"。',
  parameters: {
    type: 'object',
    properties: {
      keyword: { type: 'string', description: '搜索关键词' },
      types: { type: 'string', description: '限定搜索范围，逗号分隔：work_items / projects / customers / car_models / contacts（默认全部）' },
      limit: { type: 'number', description: '每类返回上限，默认 5' },
    },
  },
  handler: async (args) => {
    const q = args.keyword || '';
    const types = (args.types || '').split(',').map((t: string) => t.trim()).filter(Boolean);
    const limit = Math.min(args.limit || 5, 20);
    const result: any = {};
    if (types.length === 0 || types.includes('work_items')) {
      const items = await prisma.workItem.findMany({
        where: { OR: [{ title: { contains: q } }, { key: { contains: q } }, { description: { contains: q } }] },
        take: limit, orderBy: { updatedAt: 'desc' },
        select: { key: true, title: true, type: true, status: true, priority: true, assignee: true },
      });
      result.workItems = items;
    }
    if (types.length === 0 || types.includes('projects')) {
      const projects = await prisma.project.findMany({
        where: { OR: [{ name: { contains: q } }, { code: { contains: q } }] },
        take: limit,
        select: { code: true, name: true, status: true, risk: true, progress: true },
      });
      result.projects = projects;
    }
    if (types.length === 0 || types.includes('customers')) {
      const customers = await prisma.customer.findMany({
        where: { OR: [{ name: { contains: q } }, { code: { contains: q } }] },
        take: limit,
        select: { code: true, name: true, status: true, contact: true },
      });
      result.customers = customers;
    }
    if (types.length === 0 || types.includes('car_models')) {
      const models = await prisma.carModel.findMany({
        where: { OR: [{ name: { contains: q } }, { code: { contains: q } }, { brand: { contains: q } }] },
        take: limit,
        select: { code: true, name: true, brand: true, platform: true },
      });
      result.carModels = models;
    }
    if (types.length === 0 || types.includes('contacts')) {
      const contacts = await prisma.contact.findMany({
        where: { OR: [{ name: { contains: q } }, { department: { contains: q } }, { role: { contains: q } }] },
        take: limit,
        select: { name: true, role: true, phone: true, department: true, customer: { select: { name: true, code: true } } },
      });
      result.contacts = contacts;
    }
    return result;
  },
};

// ========== 工具 12: 查询外部依赖 ==========
const queryDependencies: ToolDefinition = {
  name: 'query_dependencies',
  description: '查询外部依赖（台架/实车/车模/SDB/UE/UI/标定等）。可按类型/状态/负责人/关联项目筛选。',
  parameters: {
    type: 'object',
    properties: {
      type: { type: 'string', description: '依赖类型：台架 / 实车 / 车模 / SDB / UE / UI / 标定 / 其他' },
      status: { type: 'string', description: '状态：pending / preparing / ready / blocked / cancelled' },
      owner: { type: 'string', description: '按负责人过滤' },
      projectCode: { type: 'string', description: '按关联项目编码过滤' },
      isOverdue: { type: 'boolean', description: 'true=只看超期的（expectedDate < today 且未 ready）' },
      limit: { type: 'number', description: '返回数量上限，默认 20' },
    },
  },
  handler: async (args) => {
    const where: any = {};
    if (args.type) where.type = args.type;
    if (args.status) where.status = args.status;
    if (args.owner) where.owner = { contains: args.owner };
    if (args.projectCode) {
      const p = await prisma.project.findUnique({ where: { code: args.projectCode } });
      if (p) where.projectId = p.id;
    }
    if (args.isOverdue) {
      where.expectedDate = { lt: new Date() };
      where.status = { not: 'ready' };
    }
    const list = await prisma.externalDependency.findMany({
      where, orderBy: [{ status: 'asc' }, { expectedDate: 'asc' }],
      take: Math.min(args.limit || 20, 50),
    });
    return list.map(d => ({
      type: d.type, name: d.name, status: d.status,
      owner: d.owner, expectedDate: d.expectedDate,
      actualDate: d.actualDate, blocker: d.blocker,
    }));
  },
};

// ========== 注册所有工具 ==========
export const TOOLS: ToolDefinition[] = [
  // 8 个核心工具 (V1.8): 查询 + 工作项 CRUD
  listProjects, getProject, scanRisks,
  createWorkItem, updateWorkItem, listWorkItems,
  listCustomers, listContacts,
  // 新增查询工具
  listIterations, queryActivities, searchAll, queryDependencies,
  // 18 个扩展工具 (V1.8.1): 全量实体 CRUD
  createProject, updateProject, deleteProject,
  createCustomer, updateCustomer,
  createCarModel, updateCarModel,
  createContact, updateContact,
  createIteration, updateIteration,
  createFlow, updateFlow,
  createComment,
  markNotificationRead, listNotifications,
  deleteWorkItem,
  assignIteration,
];

// 把 TOOLS 转成 OpenAI function calling 格式
export function toolsToOpenAIFormat() {
  return TOOLS.map(t => ({
    type: 'function',
    function: {
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    },
  }));
}

export async function executeTool(name: string, args: any): Promise<any> {
  const tool = TOOLS.find(t => t.name === name);
  if (!tool) throw new Error(`未知工具: ${name}`);
  return await tool.handler(args);
}
