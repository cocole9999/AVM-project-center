/**
 * MCP Server 核心 - 工具/资源/提示词定义与执行
 * 同时被 HTTP 路由（routes/mcp.ts）和 stdio 入口（bin/mcp-stdio.ts）使用
 */
import { prisma } from '../db';

export const MCP_TOOLS = [
  {
    name: 'list_work_items',
    description: '查询工作项列表。支持按类型、状态、优先级、负责人、迭代过滤。',
    inputSchema: {
      type: 'object',
      properties: {
        type: { type: 'string', enum: ['requirement', 'task', 'bug', 'release'], description: '工作项类型' },
        status: { type: 'string', description: '状态（如：待评审、开发中、已完成）' },
        priority: { type: 'string', enum: ['P0', 'P1', 'P2', 'P3'], description: '优先级' },
        assignee: { type: 'string', description: '负责人' },
        iterationId: { type: 'string', description: '迭代 ID' },
        limit: { type: 'number', description: '返回数量（默认 20）' },
      },
    },
  },
  {
    name: 'get_work_item',
    description: '获取工作项详情，含评论、子项、关联。',
    inputSchema: {
      type: 'object',
      required: ['id'],
      properties: { id: { type: 'string', description: '工作项 ID' } },
    },
  },
  {
    name: 'create_work_item',
    description: '创建工作项。',
    inputSchema: {
      type: 'object',
      required: ['type', 'title'],
      properties: {
        type: { type: 'string', enum: ['requirement', 'task', 'bug', 'release'] },
        title: { type: 'string' },
        description: { type: 'string' },
        priority: { type: 'string', enum: ['P0', 'P1', 'P2', 'P3'] },
        assignee: { type: 'string' },
        estimate: { type: 'number' },
        module: { type: 'string' },
        reporter: { type: 'string' },
      },
    },
  },
  {
    name: 'update_work_item',
    description: '更新工作项（状态、负责人、估分等）。',
    inputSchema: {
      type: 'object',
      required: ['id'],
      properties: {
        id: { type: 'string' },
        status: { type: 'string' },
        priority: { type: 'string' },
        assignee: { type: 'string' },
        estimate: { type: 'number' },
        actualHours: { type: 'number' },
        description: { type: 'string' },
      },
    },
  },
  {
    name: 'add_comment',
    description: '为工作项添加评论。',
    inputSchema: {
      type: 'object',
      required: ['workItemId', 'content'],
      properties: {
        workItemId: { type: 'string' },
        content: { type: 'string' },
        author: { type: 'string' },
      },
    },
  },
  {
    name: 'search',
    description: '全局搜索：工作项、迭代、评审、图表、用户。',
    inputSchema: {
      type: 'object',
      required: ['q'],
      properties: { q: { type: 'string', description: '搜索关键词' } },
    },
  },
  {
    name: 'get_metrics',
    description: '获取项目核心指标：总数、状态分布、优先级分布、临期、超期。',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'get_team_workload',
    description: '获取团队成员工作量统计。',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'analyze_resources',
    description: 'AI 人力分析：评估时间窗内团队利用率、风险和建议。',
    inputSchema: {
      type: 'object',
      required: ['startDate', 'endDate'],
      properties: {
        startDate: { type: 'string', description: 'YYYY-MM-DD' },
        endDate: { type: 'string', description: 'YYYY-MM-DD' },
      },
    },
  },
  {
    name: 'trigger_automation',
    description: '手动触发一条自动化规则。',
    inputSchema: {
      type: 'object',
      required: ['ruleId', 'context'],
      properties: {
        ruleId: { type: 'string' },
        context: { type: 'object' },
      },
    },
  },
  {
    name: 'ai_qa',
    description: '对项目数据提问（启发式智能问答）。',
    inputSchema: {
      type: 'object',
      required: ['question'],
      properties: { question: { type: 'string' } },
    },
  },
  {
    name: 'ai_estimate',
    description: '基于历史相似工作项的估分建议。',
    inputSchema: {
      type: 'object',
      required: ['type', 'title'],
      properties: {
        type: { type: 'string' },
        title: { type: 'string' },
        description: { type: 'string' },
        module: { type: 'string' },
      },
    },
  },
  {
    name: 'ai_classify_bug',
    description: '对缺陷描述进行自动归类。',
    inputSchema: {
      type: 'object',
      required: ['title'],
      properties: {
        title: { type: 'string' },
        description: { type: 'string' },
      },
    },
  },
];

export async function executeTool(name: string, args: any): Promise<any> {
  switch (name) {
    case 'list_work_items': {
      const where: any = {};
      if (args.type) where.type = args.type;
      if (args.status) where.status = args.status;
      if (args.priority) where.priority = args.priority;
      if (args.assignee) where.assignee = args.assignee;
      if (args.iterationId) where.iterationId = args.iterationId;
      return prisma.workItem.findMany({
        where, take: Number(args.limit) || 20,
        orderBy: { updatedAt: 'desc' },
        select: { id: true, key: true, title: true, type: true, status: true, priority: true, assignee: true, estimate: true, planEnd: true, updatedAt: true },
      });
    }
    case 'get_work_item': {
      return prisma.workItem.findUnique({
        where: { id: args.id },
        include: {
          comments: { orderBy: { createdAt: 'desc' }, take: 10 },
          children: { select: { id: true, key: true, title: true, status: true, priority: true } },
          _count: { select: { comments: true, children: true, reviews: true } },
        },
      });
    }
    case 'create_work_item': {
      const count = await prisma.workItem.count({ where: { type: args.type } });
      const prefix = { requirement: 'REQ', task: 'TASK', bug: 'BUG', release: 'REL' }[args.type] || 'ITEM';
      return prisma.workItem.create({
        data: {
          type: args.type, key: `${prefix}-${count + 1}`, title: args.title,
          description: args.description || '',
          status: '待评审', priority: args.priority || 'P2',
          assignee: args.assignee || null,
          estimate: args.estimate || null,
          module: args.module || null,
          reporter: args.reporter || 'mcp',
        },
      });
    }
    case 'update_work_item': {
      const data: any = {};
      for (const k of ['status', 'priority', 'assignee', 'estimate', 'actualHours', 'description']) {
        if (args[k] !== undefined) data[k] = args[k];
      }
      return prisma.workItem.update({ where: { id: args.id }, data });
    }
    case 'add_comment': {
      return prisma.comment.create({
        data: {
          workItemId: args.workItemId,
          author: args.author || 'mcp',
          content: args.content,
        },
      });
    }
    case 'search': {
      const q = String(args.q);
      const items = await prisma.workItem.findMany({
        where: { OR: [{ title: { contains: q } }, { description: { contains: q } }, { key: { contains: q } }, { assignee: { contains: q } }] },
        take: 20,
        select: { id: true, key: true, title: true, type: true, status: true, priority: true, assignee: true },
      });
      return items;
    }
    case 'get_metrics': {
      const [total, byType, byStatus, byPriority, overdue, dueSoon] = await Promise.all([
        prisma.workItem.count(),
        prisma.workItem.groupBy({ by: ['type'], _count: { _all: true } }),
        prisma.workItem.groupBy({ by: ['status'], _count: { _all: true } }),
        prisma.workItem.groupBy({ by: ['priority'], _count: { _all: true } }),
        prisma.workItem.count({ where: { planEnd: { lt: new Date() }, status: { notIn: ['已完成', '已关闭'] } } }),
        prisma.workItem.count({ where: { planEnd: { gte: new Date(), lte: new Date(Date.now() + 3 * 86400000) }, status: { notIn: ['已完成', '已关闭'] } } }),
      ]);
      return { total, byType, byStatus, byPriority, overdue, dueSoon };
    }
    case 'get_team_workload': {
      const users = await prisma.user.findMany({ where: { active: true } });
      return Promise.all(users.map(async u => {
        const [active, completed] = await Promise.all([
          prisma.workItem.count({ where: { assignee: { in: [u.username, u.displayName] }, status: { notIn: ['已完成', '已关闭'] } } }),
          prisma.workItem.count({ where: { assignee: { in: [u.username, u.displayName] }, status: '已完成' } }),
        ]);
        return { userId: u.username, displayName: u.displayName, active, completed };
      }));
    }
    case 'analyze_resources': {
      const { analyzeResources } = await import('./resourceAnalysisEngine');
      return analyzeResources(args.startDate, args.endDate);
    }
    case 'trigger_automation': {
      const rule = await prisma.automationRule.findUnique({ where: { id: args.ruleId } });
      if (!rule) throw new Error('Rule not found');
      const { runAutomation } = await import('./automationEngine');
      return runAutomation(rule, args.context || {});
    }
    case 'ai_qa': {
      const { smartQA } = await import('./aiEngine');
      return smartQA(args.question);
    }
    case 'ai_estimate': {
      const { suggestEstimate } = await import('./aiEngine');
      return suggestEstimate({ type: args.type, title: args.title, description: args.description, module: args.module });
    }
    case 'ai_classify_bug': {
      const { classifyBug } = await import('./aiEngine');
      return classifyBug({ title: args.title, description: args.description });
    }
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

export async function listResources() {
  const items = await prisma.workItem.findMany({
    take: 50, orderBy: { updatedAt: 'desc' },
    select: { id: true, key: true, title: true, type: true, status: true, priority: true, assignee: true, updatedAt: true },
  });
  return items.map(i => ({
    uri: `avm://work-item/${i.id}`,
    name: `${i.key} ${i.title}`,
    description: `${i.type} · ${i.status} · ${i.priority}${i.assignee ? ' · @' + i.assignee : ''}`,
    mimeType: 'application/json',
  }));
}

export async function readResource(uri: string) {
  const m = uri.match(/^avm:\/\/work-item\/(.+)$/);
  if (!m) throw new Error('Unsupported URI scheme');
  const item = await prisma.workItem.findUnique({
    where: { id: m[1] },
    include: { comments: true, children: { select: { id: true, key: true, title: true, status: true } } },
  });
  if (!item) throw new Error('Resource not found');
  return { uri, mimeType: 'application/json', content: item };
}

/**
 * JSON-RPC 2.0 共用处理器 (V1.8.5)
 * stdio 模式（mcp-stdio.ts）+ HTTP+SSE 模式（routes/mcp.ts /stream）都调这个
 * 返回 { response: JsonRpcResponse | null, isError?: boolean, rawResult?: any }
 *   - response: 给客户端的 JSON-RPC 响应（成功/错误）；null 表示通知（无 id 不返回）
 *   - toolResult: 工具调用的 content 包装（用于 SSE 序列化）
 */
export interface JsonRpcRequest { jsonrpc?: string; id?: number | string; method: string; params?: any }
export interface JsonRpcResponse { jsonrpc: '2.0'; id: number | string; result?: any; error?: { code: number; message: string; data?: any } }

export const SERVER_INFO = {
  name: 'avm-mcp-server',
  version: '1.0.0',
  protocolVersion: '2024-11-05',
};

export const CAPABILITIES = {
  tools: { listChanged: false },
  resources: { subscribe: false, listChanged: false },
  prompts: { listChanged: false },
};

function toolResultContent(content: any, isError = false) {
  return {
    content: [
      { type: 'text', text: typeof content === 'string' ? content : JSON.stringify(content, null, 2) },
    ],
    isError,
  };
}

/** 统一处理一个 JSON-RPC 请求，返回响应对象（id 是 undefined 时返回 null） */
export async function handleJsonRpcRequest(req: JsonRpcRequest): Promise<JsonRpcResponse | null> {
  const { id, method, params } = req;
  const isNotification = id === undefined;

  const respond = (result: any): JsonRpcResponse => ({ jsonrpc: '2.0', id: id!, result });
  const respondError = (code: number, message: string, data?: any): JsonRpcResponse => ({ jsonrpc: '2.0', id: id!, error: { code, message, data } });

  try {
    switch (method) {
      case 'initialize':
        if (isNotification) return null;
        return respond({
          protocolVersion: SERVER_INFO.protocolVersion,
          serverInfo: SERVER_INFO,
          capabilities: CAPABILITIES,
        });

      case 'ping':
        if (isNotification) return null;
        return respond({});

      case 'tools/list':
        if (isNotification) return null;
        return respond({ tools: MCP_TOOLS });

      case 'tools/call': {
        const { name, arguments: args = {} } = params || {};
        const tool = MCP_TOOLS.find(t => t.name === name);
        if (!tool) {
          if (isNotification) return null;
          return respond(toolResultContent(`Tool not found: ${name}`, true));
        }
        try {
          const result = await executeTool(name, args);
          if (isNotification) return null;
          return respond(toolResultContent(result));
        } catch (e: any) {
          if (isNotification) return null;
          return respond(toolResultContent({ error: e.message }, true));
        }
      }

      case 'resources/list':
        if (isNotification) return null;
        return respond({ resources: await listResources() });

      case 'resources/read': {
        const { uri } = params || {};
        try {
          const data = await readResource(uri);
          if (isNotification) return null;
          return respond({
            contents: [
              { uri, mimeType: data.mimeType, text: JSON.stringify(data.content, null, 2) },
            ],
          });
        } catch (e: any) {
          if (isNotification) return null;
          return respondError(-32002, e.message);
        }
      }

      case 'prompts/list':
        if (isNotification) return null;
        return respond({
          prompts: PROMPT_TEMPLATES.map(t => ({
            name: t.id,
            description: t.description,
            arguments: [],
          })),
        });

      case 'prompts/get': {
        const { name } = params || {};
        const tpl = PROMPT_TEMPLATES.find(t => t.id === name);
        if (!tpl) {
          if (isNotification) return null;
          return respondError(-32002, `Prompt not found: ${name}`);
        }
        if (isNotification) return null;
        return respond({
          description: tpl.description,
          messages: [
            { role: 'user', content: { type: 'text', text: tpl.template } },
          ],
        });
      }

      default:
        if (isNotification) return null;
        return respondError(-32601, `Method not found: ${method}`);
    }
  } catch (e: any) {
    if (isNotification) return null;
    return respondError(-32603, e.message || 'Internal error');
  }
}

export const PROMPT_TEMPLATES = [
  {
    id: 'daily-standup',
    name: '每日站会',
    description: '基于当前数据生成每日站会报告',
    template: `基于 AVM 当前数据：
- 调用 get_team_workload 了解团队分工
- 调用 get_metrics 了解项目状态
- 调用 ai_qa("超期的工作项有哪些？") 找出风险
生成简洁的每日站会报告。`,
  },
  {
    id: 'sprint-review',
    name: '迭代回顾',
    description: '基于当前迭代数据生成回顾报告',
    template: `回顾本次迭代：
- 调用 list_work_items(type=task, iterationId=...) 获取所有任务
- 调用 analyze_resources(startDate, endDate) 评估人力
- 调用 search("超期") 找超期项
生成本迭代的回顾报告。`,
  },
  {
    id: 'risk-assessment',
    name: '风险评估',
    description: '评估当前项目风险',
    template: `执行项目风险评估：
- 调用 get_metrics 看临期/超期
- 调用 analyze_resources 看人力过载
- 调用 search("P0") 找紧急项
- 调用 ai_qa("状态分布") 看健康度
输出风险清单和缓解建议。`,
  },
  {
    id: 'new-dev-onboarding',
    name: '新人入职',
    description: '为新成员生成项目概览',
    template: `为新成员生成项目入门指南：
- 调用 get_metrics 了解项目规模
- 调用 list_work_items(type=requirement, status=已规划) 了解待开发需求
- 调用 get_team_workload 了解团队
- 搜索 "架构" / "设计" 找核心文档
生成 5 分钟阅读的入门指南。`,
  },
];
