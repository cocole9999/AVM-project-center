/**
 * /api/ai/command - AI 命令端点（function calling）
 *
 * 用户给一个自然语言命令（如"创建一个 P0 需求：AVM 透明底盘"），
 * LLM 自主决定调哪些工具（create_work_item），返回结果 + 自然语言总结。
 */
import { Router } from 'express';
import { getLLMProvider, clearLLMCache } from '../services/llmProvider';
import { buildProjectSnapshot } from '../services/projectSnapshot';
import { toolsToOpenAIFormat, executeTool } from '../services/aiTools';
import { prisma } from '../db';
import { runRiskScan, startRiskScanner } from '../services/riskScanner';
import { actorFromReq } from '../utils/audit';

export const aiCommandRouter = Router();

// 列出所有可用工具
aiCommandRouter.get('/tools', (_req, res) => {
  res.json({ tools: toolsToOpenAIFormat() });
});

interface CommandRequest {
  command: string;        // 用户命令（如 "创建一个 P0 需求：AVM 透明底盘"）
  context?: any;          // 可选上下文（如当前页面信息）
  maxSteps?: number;      // 最大工具调用轮次，默认 5
  history?: Array<{       // V1.8.3 多轮对话历史
    role: 'user' | 'assistant' | 'tool';
    content?: string;
    tool_calls?: any[];
    tool_call_id?: string;
  }>;
}

interface ToolCallRecord {
  name: string;
  args: any;
  result: any;
  error?: string;
}

aiCommandRouter.post('/command', async (req, res) => {
  try {
    const { command, context, maxSteps = 5, history } = req.body as CommandRequest;
    if (!command) return res.status(400).json({ error: 'command 必填' });

    const provider = await getLLMProvider();
    if (!provider.isAvailable() || provider.name === 'mock') {
      return res.status(400).json({ error: 'LLM 未配置，请先在 LLM 设置里配置 API Key' });
    }

    // 拉项目快照（5 分钟缓存）让 LLM 知道有哪些项目/客户
    const snapshot = await buildProjectSnapshot();

    // 工具列表
    const tools = toolsToOpenAIFormat();
    const messages: any[] = [
      {
        role: 'system',
        content: `${snapshot.text}\n\n你是一位 AVM 项目管理专家。用户会用自然语言给你命令，你需要用提供的工具来执行操作。\n\n规则：\n1. 必须基于项目快照和工具返回的真实数据回答\n2. 调用工具前先想清楚要哪些参数；可以并行调用多个工具\n3. 工具调用结果要简洁总结给用户\n4. 数据中没有的字段必须明确说"数据中没有"\n5. 严禁编造项目/客户/合同额/联系人等任何数据\n6. 多轮对话时记住上文提到的项目/工作项/客户名，回复中可以直接引用简称`,
      },
    ];
    if (context) {
      messages.push({ role: 'system', content: `当前页面上下文：${JSON.stringify(context)}` });
    }
    // V1.8.3: 注入多轮对话历史（限制总 token 防止爆）
    if (Array.isArray(history) && history.length > 0) {
      // 只取最近 20 条，role 限定为 user/assistant/tool
      const trimmed = history.slice(-20).filter(m => ['user', 'assistant', 'tool'].includes(m.role));
      for (const m of trimmed) {
        if (m.role === 'user' && typeof m.content === 'string') {
          messages.push({ role: 'user', content: m.content });
        } else if (m.role === 'assistant') {
          messages.push({
            role: 'assistant',
            content: m.content || null,
            ...(Array.isArray(m.tool_calls) && m.tool_calls.length > 0 ? { tool_calls: m.tool_calls } : {}),
          });
        } else if (m.role === 'tool' && m.tool_call_id) {
          messages.push({ role: 'tool', tool_call_id: m.tool_call_id, content: m.content || '' });
        }
      }
    }
    messages.push({ role: 'user', content: command });

    // 循环：让 LLM 多次调工具直到得到最终回答
    const toolCalls: ToolCallRecord[] = [];
    let finalContent = '';
    let totalPromptTokens = 0;
    let totalCompletionTokens = 0;
    const steps = Math.min(maxSteps, 8);

    for (let i = 0; i < steps; i++) {
      const r: any = await provider.chat(messages as any, {
        model: (provider as any).defaultModel,
        temperature: 0.2,
        maxTokens: 1500,
        tools,
        tool_choice: i === 0 ? 'auto' : 'auto',  // 一直允许 LLM 调工具
      } as any, undefined as any);
      if (r.usage) {
        totalPromptTokens += r.usage.promptTokens || 0;
        totalCompletionTokens += r.usage.completionTokens || 0;
      }
      const msg = (r as any).rawMessage; // 拿原始消息（含 tool_calls）
      const content = r.content || '';
      const toolCallsInMsg = (r as any).toolCalls || [];

      // 如果没有 tool_calls，结束
      if (!toolCallsInMsg || toolCallsInMsg.length === 0) {
        finalContent = content;
        break;
      }

      // 记录 assistant 消息（带 tool_calls）
      messages.push({
        role: 'assistant',
        content: content || null,
        tool_calls: toolCallsInMsg,
      });

      // 执行每个 tool_call
      for (const tc of toolCallsInMsg) {
        const name = tc.function.name;
        let args: any = {};
        try { args = JSON.parse(tc.function.arguments || '{}'); }
        catch { args = {}; }
        try {
          const result = await executeTool(name, args);
          toolCalls.push({ name, args, result });
          messages.push({
            role: 'tool',
            tool_call_id: tc.id,
            content: typeof result === 'string' ? result : JSON.stringify(result, null, 2).slice(0, 4000),
          });
        } catch (e: any) {
          toolCalls.push({ name, args, result: null, error: e.message });
          messages.push({
            role: 'tool',
            tool_call_id: tc.id,
            content: `错误: ${e.message}`,
          });
        }
      }
    }

    res.json({
      ok: true,
      command,
      reply: finalContent,
      toolCalls,
      usage: { promptTokens: totalPromptTokens, completionTokens: totalCompletionTokens, totalTokens: totalPromptTokens + totalCompletionTokens },
      llmModel: (provider as any).defaultModel,
      provider: provider.name,
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * /api/ai/suggestions - 给当前页面推荐 AI 可执行的操作
 * 用于"AI 助理"按钮浮出快捷建议
 */
aiCommandRouter.post('/suggestions', async (req, res) => {
  try {
    const { page, data } = req.body;
    if (!page) return res.json({ suggestions: [] });
    // 基于 page 给一些常用建议
    const map: Record<string, string[]> = {
      workitems: [
        '创建一个 P0 需求',
        '检查所有超期工作项',
        '风险扫描',
        '给我推荐一个负责人',
      ],
      projects: [
        '项目整体进度怎么样',
        '检查所有项目风险',
        '列出所有客户的项目',
        '哪些项目预算快超了',
      ],
      workitem_detail: [
        '这个工作项要分配给谁',
        '这个工作项的预估工时是否合理',
        '类似的历史工作项有哪些',
        '给这个工作项做一个风险评估',
      ],
      dashboard: [
        '本月整体项目健康度',
        'P0 紧急项有哪些',
        '我的待办',
        '哪些项目需要关注',
      ],
    };
    res.json({ suggestions: map[page] || [
      'AVM 项目中心有几个项目？',
      '哪些项目风险最高？',
      '检查所有超期工作项',
      '创建一个需求',
    ] });
  } catch (e: any) {
    res.json({ suggestions: [] });
  }
});

// 手动触发风险扫描（写入 Notification 中心）
aiCommandRouter.post('/risk-scan', async (req, res) => {
  try {
    const result = await runRiskScan('manual');
    res.json({ ok: true, ...result });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * AI 帮我填（创建工作项表单）
 * 输入：title + 可选 type/priority
 * 输出：自动补全的 description / estimate / projectId / projectCode / assignee / priority / type
 */
aiCommandRouter.post('/fill-work-item', async (req, res) => {
  try {
    const { title, type, priority, hint } = req.body;
    if (!title || title.length < 2) return res.status(400).json({ error: 'title 至少 2 字符' });

    const provider = await getLLMProvider();
    if (!provider.isAvailable() || provider.name === 'mock') {
      return res.status(400).json({ error: 'LLM 未配置' });
    }

    // 拉项目快照（项目/客户/车型/人员）
    const snapshot = await buildProjectSnapshot();

    // 同时查人员清单（assignee 候选）
    const users = await prisma.user.findMany({ select: { displayName: true, username: true, role: true, department: true } });
    const userList = users.map(u => `${u.displayName} (${u.role}, ${u.department || '未填'})`).join('、');

    const prompt = `你是一位资深 AVM 项目经理。用户要创建一个工作项，标题是："${title}"${type ? `，类型已选：${type}` : ''}${priority ? `，优先级已选：${priority}` : ''}${hint ? `\n补充说明：${hint}` : ''}

请基于项目快照和人员清单，**只返回一个 JSON 对象**（不要其他文字），字段如下：
{
  "type": "requirement" | "task" | "bug" | "release",  // 工作项类型
  "priority": "P0" | "P1" | "P2" | "P3",  // 优先级
  "description": "详细描述（Markdown 格式，2-4 句话，标题+验收标准+依赖）",
  "estimate": 估算工时（小时，数字，参考类似历史工作项）,
  "assignee": 推荐的负责人（必须是人员清单里存在的 displayName）,
  "projectCode": 推荐关联的项目编码（"${snapshot.text.split('项目').length > 2 ? '如 AVM-GALAXY-L7-2026' : '无需关联'}"）,
  "reasoning": "为什么这样推荐（一句话）"
}

规则：
1. assignee 必须从人员清单中精确选择
2. projectCode 必须从快照中真实存在的项目里选（最相关的）
3. estimate 参考历史类似工作项
4. 不在数据中的字段必须填 null
5. description 用中文`;

    const r = await provider.chat([
      { role: 'system', content: `${snapshot.text}\n\n【人员清单】\n${userList}\n\n你只返回 JSON，不要其他文字。` },
      { role: 'user', content: prompt },
    ], { temperature: 0.3, maxTokens: 1000 });

    // 解析 JSON
    const text = r.content.trim();
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return res.status(500).json({ error: 'AI 没返回有效 JSON', raw: text });
    const filled = JSON.parse(jsonMatch[0]);

    // 解析 projectCode → projectId
    let projectId: string | null = null;
    if (filled.projectCode && filled.projectCode !== '无需关联') {
      const p = await prisma.project.findUnique({ where: { code: filled.projectCode } });
      if (p) projectId = p.id;
    }

    // 校验 assignee 必须在人员清单里（允许 null）
    const validAssignees = new Set(users.map(u => u.displayName));
    if (filled.assignee && !validAssignees.has(filled.assignee)) {
      filled.assignee = null;
    }

    res.json({
      ok: true,
      filled: {
        type: filled.type || type || 'task',
        priority: filled.priority || priority || 'P2',
        description: filled.description || '',
        estimate: typeof filled.estimate === 'number' ? filled.estimate : 0,
        assignee: filled.assignee || '',
        projectId,
        projectCode: filled.projectCode || '',
      },
      reasoning: filled.reasoning || '',
      llmModel: r.model,
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * AI 推荐负责人
 * 输入：title + type + priority + projectCode
 * 输出：assignee + reasoning（基于历史工作项 + 负载）
 */
aiCommandRouter.post('/suggest-assignee', async (req, res) => {
  try {
    const { title, type, priority, projectCode, hint } = req.body;
    if (!title) return res.status(400).json({ error: 'title 必填' });

    const provider = await getLLMProvider();
    if (!provider.isAvailable() || provider.name === 'mock') {
      return res.status(400).json({ error: 'LLM 未配置' });
    }

    // 查历史工作项（最近 30 天）按 assignee 统计
    const since = new Date(Date.now() - 30 * 86400000);
    const items = await prisma.workItem.findMany({
      where: { createdAt: { gte: since } },
      select: { assignee: true, type: true, status: true, priority: true },
    });
    const userLoad: Record<string, { total: number; active: number; p0p1: number; types: Record<string, number> }> = {};
    for (const i of items) {
      if (!i.assignee) continue;
      if (!userLoad[i.assignee]) userLoad[i.assignee] = { total: 0, active: 0, p0p1: 0, types: {} };
      userLoad[i.assignee].total++;
      if (!['已完成', '已关闭', '已驳回', '已发布', '已验收'].includes(i.status)) {
        userLoad[i.assignee].active++;
        if (i.priority === 'P0' || i.priority === 'P1') userLoad[i.assignee].p0p1++;
      }
      userLoad[i.assignee].types[i.type] = (userLoad[i.assignee].types[i.type] || 0) + 1;
    }

    const users = await prisma.user.findMany({ select: { displayName: true, username: true, role: true, department: true } });
    const userList = users.map(u => {
      const load = userLoad[u.displayName] || { total: 0, active: 0, p0p1: 0, types: {} };
      return `${u.displayName} (${u.role}, ${u.department || '未填'}, 30天总 ${load.total} 条 / 在做 ${load.active} 条 / P0P1 ${load.p0p1} 条, 类型分布 ${JSON.stringify(load.types)})`;
    }).join('\n');

    const prompt = `你是 AVM 项目分配专家。要分配一个新工作项：
- 标题：${title}
- 类型：${type || '不指定'}
- 优先级：${priority || '不指定'}
- 项目：${projectCode || '不指定'}${hint ? `\n- 补充：${hint}` : ''}

【人员清单】（含 30 天负载）
${userList}

请只返回一个 JSON 对象：
{
  "assignee": "推荐负责人（必须精确匹配人员清单中的 displayName）",
  "reasoning": "为什么推荐（结合角色 + 负载 + 类型匹配，2-3 句话）"
}

规则：
1. 优先选角色匹配的（bug 给开发/测试；requirement/task 给对应模块；release 给开发）
2. 同等条件下选 active 少、P0P1 少的（避免负载过重）
3. assignee 必须精确匹配人员清单`;

    const r = await provider.chat([
      { role: 'system', content: '你只返回 JSON，不要其他文字。' },
      { role: 'user', content: prompt },
    ], { temperature: 0.3, maxTokens: 1500 });

    const text = r.content.trim();
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return res.status(500).json({ error: 'AI 没返回有效 JSON', raw: text });
    const result = JSON.parse(jsonMatch[0]);

    // 校验 assignee
    const validAssignees = new Set(users.map(u => u.displayName));
    if (!validAssignees.has(result.assignee)) {
      return res.status(500).json({ error: 'AI 推荐的人员不在人员清单里', raw: result });
    }

    res.json({
      ok: true,
      assignee: result.assignee,
      reasoning: result.reasoning || '',
      llmModel: r.model,
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * 通用 AI 填表 - 支持多种表单类型
 * POST /api/ai-command/fill-form
 * body: { formType: 'customer' | 'car_model' | 'project' | 'contact' | 'iteration' | 'flow', title/name/hint/partial, ... }
 * 返回: { ok, filled: { ...form fields... }, reasoning }
 */
const FILL_FORM_PROMPTS: Record<string, { fields: string; rule: string; buildSnapshot?: boolean }> = {
  customer: {
    fields: `{
  "name": "客户全称（如 吉利银河 L7 项目组）",
  "shortName": "简称（如 银河L7）",
  "type": "internal" | "external",
  "industry": "行业（如 汽车主机厂 / Tier1 / 软件供应商）",
  "contact": "主联系人姓名",
  "phone": "联系电话",
  "email": "邮箱",
  "address": "地址",
  "description": "客户背景、合作范围等 1-2 句话"
}`,
    rule: `1. name 必填
2. type 默认 internal（吉利内部项目组居多）
3. industry 默认 "汽车主机厂"
4. 邮箱/电话格式要合理
5. 没填的字段填空字符串或 null`,
  },
  car_model: {
    fields: `{
  "name": "车型名称（如 银河 L7）",
  "brand": "品牌（吉利银河/极氪/领克/博越/熊猫mini）",
  "series": "系列（如 Galaxy / Zeekr）",
  "launchYear": 2026,
  "segment": "细分市场（如 SUV/轿车/MPV）",
  "platform": "平台（如 SEA/CMA/SPA）",
  "description": "1 句话说明"
}`,
    rule: `1. name 和 brand 必填
2. launchYear 用 4 位数字
3. brand 必须从已知的列表中选（吉利银河/极氪/领克/博越/熊猫mini/吉利/沃尔沃等）`,
  },
  project: {
    fields: `{
  "name": "项目名称（如 银河 L7 AVM 2.5 集成项目）",
  "description": "项目范围、目标 1-2 句话",
  "customerCode": "客户编码（如 GEELY-GALAXY-L7，从数据中选）",
  "carModelCode": "车型编码（如 GEELY-GALAXY-L7-CARMODEL，从数据中选）",
  "startDate": "YYYY-MM-DD",
  "endDate": "YYYY-MM-DD",
  "status": "planning" | "in_progress" | "completed" | "on_hold",
  "billingType": "ODC" | "ODM" | "FIXED",
  "contractAmount": 合同金额（元）,
  "risk": "low" | "medium" | "high",
  "pmUserName": "PM 姓名（从人员清单中选）"
}`,
    rule: `1. name/startDate/endDate 必填
2. customerCode 和 carModelCode 必须从数据中真实存在的编码里选
3. PM 从人员清单中选
4. 风险根据项目复杂度评估
5. 合同金额按客户/车型级别估算`,
    buildSnapshot: true,
  },
  contact: {
    fields: `{
  "name": "联系人姓名",
  "role": "UPL" | "PPM" | "测试" | "开发" | "AVM接口人",
  "department": "部门",
  "phone": "电话",
  "email": "邮箱",
  "feishuId": "飞书 ID",
  "primary": true | false
}`,
    rule: `1. name 和 role 必填
2. role 从给定列表选
3. phone/email/feishuId 留空时填 null
4. primary 默认 false`,
  },
  iteration: {
    fields: `{
  "name": "迭代名称（如 Sprint 2026-Q1）",
  "goal": "迭代目标（1-2 句话）",
  "startDate": "YYYY-MM-DD",
  "endDate": "YYYY-MM-DD",
  "status": "active" | "upcoming" | "completed"
}`,
    rule: `1. name/startDate/endDate 必填
2. status 默认 upcoming
3. endDate > startDate`,
  },
  flow: {
    fields: `{
  "name": "流程名称",
  "workType": "requirement" | "task" | "bug" | "release",
  "description": "流程说明 1 句话"
}`,
    rule: `1. name 和 workType 必填
2. workType 决定流程适配的工作项类型
3. description 简明`,
  },
  dependency: {
    fields: `{
  "type": "台架" | "实车" | "车模" | "SDB" | "UE" | "UI" | "标定" | "其他",
  "name": "依赖名称",
  "owner": "负责人姓名",
  "status": "pending" | "preparing" | "ready" | "blocked",
  "expectedDate": "YYYY-MM-DD（预计就绪时间）",
  "description": "1 句话说明",
  "projectCode": "从数据中选（不填则不关联项目）"
}`,
    rule: `1. type 和 name 必填
2. expectedDate 用未来日期
3. status 默认 preparing
4. owner 从人员清单中选
5. projectCode 从快照真实存在的项目编码中选`,
    buildSnapshot: true,
  },
};

aiCommandRouter.post('/fill-form', async (req, res) => {
  try {
    const { formType, ...formData } = req.body;
    if (!formType) return res.status(400).json({ error: 'formType 必填 (customer/car_model/project/contact/iteration/flow)' });
    const cfg = FILL_FORM_PROMPTS[formType];
    if (!cfg) return res.status(400).json({ error: `不支持的 formType: ${formType}` });

    const provider = await getLLMProvider();
    if (!provider.isAvailable() || provider.name === 'mock') {
      return res.status(400).json({ error: 'LLM 未配置' });
    }

    // 拉快照
    const snapshot = cfg.buildSnapshot ? await buildProjectSnapshot() : null;
    // 拉人员清单（PM/负责人可能用）
    const users = await prisma.user.findMany({ select: { displayName: true, role: true, department: true } });
    const userList = users.map(u => `${u.displayName} (${u.role}, ${u.department || '未填'})`).join('、');

    // 构造 prompt：把已填字段一起喂进去
    const filledKeys = Object.keys(formData).filter(k => formData[k] != null && formData[k] !== '');
    const userFilled = filledKeys.length > 0
      ? `\n\n用户已经填了：${JSON.stringify(formData, null, 2)}\n（保留用户已填字段，仅补全未填的）`
      : '';

    const prompt = `你是一位 AVM 项目管理专家。用户要创建一个【${formType}】，用户给的描述信息：${JSON.stringify(formData)}${userFilled}

请基于${snapshot ? '项目快照和' : ''}人员清单，**只返回一个 JSON 对象**（不要其他文字），字段如下：
${cfg.fields}

${snapshot ? `【项目快照】\n${snapshot.text}\n\n` : ''}【人员清单】
${userList}

规则：
${cfg.rule}
6. 客户/车型/项目的编码必须从数据中真实存在的选，不要编造
7. 不在数据中的字段必须填 null 或空字符串`;

    const r = await provider.chat([
      { role: 'system', content: '你只返回 JSON，不要其他文字。' },
      { role: 'user', content: prompt },
    ], { temperature: 0.3, maxTokens: 1200 });

    const text = r.content.trim();
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return res.status(500).json({ error: 'AI 没返回有效 JSON', raw: text });
    const filled = JSON.parse(jsonMatch[0]);

    res.json({
      ok: true,
      filled,
      reasoning: filled.reasoning || '',
      llmModel: r.model,
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * 通知一键创建跟进任务
 * POST /api/notifications/:id/create-follow-up
 * body: { assignee?: string, priority?: 'P0'|'P1'|'P2'|'P3', type?: 'task'|'bug' }
 * 从通知的 title/content/link 自动生成工作项
 */
aiCommandRouter.post('/notifications/:id/create-follow-up', async (req, res) => {
  try {
    const { id } = req.params;
    const { assignee, priority = 'P2', type = 'task' } = req.body;
    if (!id) return res.status(400).json({ error: 'id 必填' });

    const notif = await prisma.notification.findUnique({ where: { id } });
    if (!notif) return res.status(404).json({ error: '通知不存在' });

    // 提取项目编码（从 link 中，如 risk_scan:AVM-LYNK-09-2026:high）
    let projectId: string | null = null;
    let projectCode: string | undefined;
    if (notif.link) {
      const m = notif.link.match(/(AVM-[A-Z0-9-]+)/);
      if (m) {
        projectCode = m[1];
        const p = await prisma.project.findUnique({ where: { code: projectCode } });
        if (p) projectId = p.id;
      }
    }

    // 生成 workItem key
    const prefix = { requirement: 'REQ', task: 'TASK', bug: 'BUG', release: 'REL' }[type] || 'TASK';
    const count = await prisma.workItem.count({ where: { type } });
    const key = `${prefix}-${count + 1}`;

    // 从通知内容生成工作项 title/description
    const title = notif.title.length > 60 ? notif.title.slice(0, 57) + '...' : notif.title;
    const description = `**跟进通知**: ${notif.title}\n\n${notif.content || '(无内容)'}\n\n**原通知链接**: ${notif.link || 'N/A'}\n**风险等级**: ${notif.level || 'info'}\n**创建时间**: ${notif.createdAt}`;

    const item = await prisma.workItem.create({
      data: {
        key, type, title, description,
        priority,
        status: '待领取',
        projectId: projectId || null,
        assignee: assignee || notif.recipientId || '未分配',
        reporter: notif.recipientId || 'AI 助理',
        customerId: notif.resourceType === 'customer' ? notif.resourceId : null,
      },
    });

    // 标记通知已读
    await prisma.notification.update({
      where: { id },
      data: { read: true, readAt: new Date() },
    });

    res.json({
      ok: true,
      workItem: { key: item.key, id: item.id, title: item.title, type: item.type, priority: item.priority },
      message: `已创建跟进任务 ${item.key}: ${item.title}`,
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * AI 周报生成
 * GET /api/ai-command/weekly-report
 * query: { period?: 'week' | 'month' | 'custom', startDate?, endDate?, user?, projectCode? }
 * 拉取项目/风险/活动/工作项等数据 → LLM 生成 Markdown 周报
 */
aiCommandRouter.get('/weekly-report', async (req, res) => {
  try {
    const period = (req.query.period as string) || 'week';
    const customStart = req.query.startDate ? new Date(req.query.startDate as string) : null;
    const customEnd = req.query.endDate ? new Date(req.query.endDate as string) : null;
    const userName = (req.query.user as string) || null; // null = 全部
    const projectCode = (req.query.projectCode as string) || null;

    // V1.27: 日期格式校验, 避免非法日期导致后续 prisma 查询崩溃
    if (req.query.startDate && (!customStart || isNaN(customStart.getTime()))) {
      return res.status(400).json({ error: `startDate 格式无效: ${req.query.startDate}` });
    }
    if (req.query.endDate && (!customEnd || isNaN(customEnd.getTime()))) {
      return res.status(400).json({ error: `endDate 格式无效: ${req.query.endDate}` });
    }
    if (customStart && customEnd && customStart.getTime() > customEnd.getTime()) {
      return res.status(400).json({ error: 'startDate 必须早于 endDate' });
    }

    const now = new Date();
    let start: Date;
    let end: Date = now;
    let periodLabel: string;
    if (customStart && customEnd) {
      start = customStart;
      end = customEnd;
      periodLabel = `${start.toISOString().slice(0, 10)} ~ ${end.toISOString().slice(0, 10)}`;
    } else if (period === 'month') {
      start = new Date(now.getTime() - 30 * 86400000);
      periodLabel = `过去 30 天`;
    } else {
      start = new Date(now.getTime() - 7 * 86400000);
      periodLabel = `过去 7 天`;
    }

    // 1) 项目健康度
    const projectWhere: any = {};
    if (projectCode) projectWhere.code = projectCode;
    const projects = await prisma.project.findMany({
      where: projectWhere,
      include: {
        customer: { select: { name: true, code: true } },
        carModel: { select: { name: true, brand: true, code: true } },
        _count: { select: { workItems: true } },
      },
    });
    const today = new Date();
    const projectHealth = projects.map(p => {
      const daysLeft = Math.ceil((new Date(p.endDate).getTime() - today.getTime()) / 86400000);
      return {
        code: p.code, name: p.name, status: p.status, progress: p.progress, risk: p.risk,
        customer: p.customer?.name, carModel: p.carModel?.name,
        contractAmount: p.contractAmount, billingType: p.billingType, pmUserName: p.pmUserName,
        daysLeft, workItemCount: p._count.workItems,
        startDate: p.startDate, endDate: p.endDate,
      };
    });

    // 2) 本周活动 (项目/工作项变更)
    const recentActivities = await prisma.activity.findMany({
      where: { createdAt: { gte: start, lte: end } },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    // 3) 本周工作项变化：新增 / 完成 / 状态变更
    const whereBase: any = { createdAt: { gte: start, lte: end } };
    if (userName) {
      whereBase.OR = [{ reporter: userName }, { assignee: userName }];
    }
    if (projectCode) {
      const p = projects.find(p => p.code === projectCode);
      if (p) whereBase.projectId = p.id;
    }
    const newItems = await prisma.workItem.findMany({
      where: whereBase,
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
    const completedItems = await prisma.workItem.findMany({
      where: { ...whereBase, actualEnd: { gte: start, lte: end } },
      orderBy: { actualEnd: 'desc' },
      take: 20,
    });
    // P0/P1 当前未完成
    const criticalItems = await prisma.workItem.findMany({
      where: {
        priority: { in: ['P0', 'P1'] },
        status: { notIn: ['已完成', '已关闭', '已驳回', '已发布', '已验收'] },
        ...(userName ? { OR: [{ reporter: userName }, { assignee: userName }] } : {}),
        ...(projectCode ? { projectId: projects.find(p => p.code === projectCode)?.id } : {}),
      },
      take: 20,
    });

    // 4) 当前风险项目
    const highRiskProjects = projectHealth.filter(p => p.risk === 'high');

    // 5) 先用模板生成基础 Markdown (不依赖 LLM)
    const reportMd = generateReportMarkdown({
      periodLabel, start, end, projects: projectHealth,
      newItems, completedItems, criticalItems, highRiskProjects, recentActivities,
      userName, projectCode,
    });

    // 6) 可选: 用 LLM 润色 (失败也不影响)
    let llmModel: string | null = null;
    let finalReport = reportMd;
    try {
      const provider = await getLLMProvider();
      if (provider.isAvailable() && provider.name !== 'mock') {
        const dataSummary = `
# 数据快照
- 时间范围: ${periodLabel} (${start.toISOString().slice(0,10)} ~ ${end.toISOString().slice(0,10)})
- 项目总数: ${projects.length}
- 高风险项目: ${highRiskProjects.length}
- 新增工作项: ${newItems.length}
- 完成工作项: ${completedItems.length}
- P0/P1 紧急: ${criticalItems.length}
- 活动数: ${recentActivities.length}

# 项目
${projectHealth.slice(0, 10).map(p => `- ${p.code} ${p.name} (${p.status}, 进度 ${p.progress}%, 风险 ${p.risk}, 客户 ${p.customer || '-'}, 剩 ${p.daysLeft} 天)`).join('\n') || '（无）'}

# 本周新增
${newItems.slice(0, 20).map(i => `- [${i.type}] ${i.key} ${i.title} (${i.priority}, 负责人 ${i.assignee || '-'})`).join('\n') || '（无）'}

# 本周完成
${completedItems.slice(0, 20).map(i => `- ${i.key} ${i.title} (${i.assignee || '-'})`).join('\n') || '（无）'}

# P0/P1 当前未完成
${criticalItems.slice(0, 20).map(i => `- ${i.key} ${i.title} (${i.priority}, ${i.status}, 负责人 ${i.assignee || '-'})`).join('\n') || '（无）'}

# 风险项目
${highRiskProjects.map(p => `- ${p.code} ${p.name} (进度 ${p.progress}%, 风险 ${p.risk})`).join('\n') || '（无）'}

# 最近活动
${recentActivities.slice(0, 20).map(a => `- ${a.createdAt.toISOString().slice(0,10)} ${a.actor} ${a.action} ${a.field || ''} ${a.oldValue || ''} → ${a.newValue || ''}`).join('\n') || '（无）'}
`;
        const prompt = `你是一位资深的 AVM 项目经理，需要基于下面的项目数据，生成一份给领导看的周报。

## 要求
1. **Markdown 格式**，适合直接发到飞书/邮件
2. **结构清晰**：概览、关键指标、项目进展（每个高优先级项目一段）、风险预警、本周亮点、下周建议
3. **数据驱动**：所有结论都要从下面数据出发，不要编造
4. **重点突出**：高风险项目、超期项目、P0/P1 必须提到
5. **语言专业简洁**：每段不超过 3 行
6. **不要寒暄**，直接进入正题
7. 用中文

${dataSummary}

请生成周报（直接输出 Markdown，不要其他文字）：`;

    const r = await provider.chat([
      { role: 'system', content: '你是 AVM 项目管理专家，输出专业的项目周报。用中文。直接输出 Markdown，不要其他文字。' },
      { role: 'user', content: prompt },
    ], { temperature: 0.3, maxTokens: 3000 });
    finalReport = r.content;
    llmModel = r.model;
      }
    } catch (llmErr) {
      console.warn('[weekly-report] LLM 润色失败, 使用模板报告:', (llmErr as any).message);
    }

    // V1.26: 写入历史记录 (失败不影响响应)
    try {
      const actor = actorFromReq(req);
      await prisma.aIReport.create({
        data: {
          type: period,
          periodLabel,
          startDate: start,
          endDate: end,
          content: finalReport,
          summary: JSON.stringify({
            projectCount: projects.length,
            highRiskCount: highRiskProjects.length,
            newItemCount: newItems.length,
            completedItemCount: completedItems.length,
            criticalItemCount: criticalItems.length,
            activityCount: recentActivities.length,
          }),
          llmModel: llmModel,
          userFilter: userName,
          projectCode,
          createdBy: actor?.username || '',
        },
      });
    } catch (writeErr) {
      console.warn('[weekly-report] 写 AIReport 失败:', (writeErr as any).message);
    }

    res.json({
      ok: true,
      period: { start, end, label: periodLabel },
      summary: {
        projectCount: projects.length,
        highRiskCount: highRiskProjects.length,
        newItemCount: newItems.length,
        completedItemCount: completedItems.length,
        criticalItemCount: criticalItems.length,
        activityCount: recentActivities.length,
      },
      report: finalReport,
      llmModel,
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * V1.26 取最近一次生成的周报/月报（仪表盘默认展示用）
 * GET /api/ai-command/reports/latest
 * query: { type?: 'week' | 'month' | 'quarter' | 'custom' } 缺省 type 取任意最新一份
 * 返回: { ok, report: { id, type, periodLabel, startDate, endDate, content, summary, llmModel, createdBy, createdAt } | null }
 */
aiCommandRouter.get('/reports/latest', async (req, res) => {
  try {
    const type = (req.query.type as string) || '';
    const where: any = {};
    if (type === 'week' || type === 'month' || type === 'quarter' || type === 'custom') {
      where.type = type;
    }
    const latest = await prisma.aIReport.findFirst({
      where,
      orderBy: { createdAt: 'desc' },
    });
    if (!latest) {
      return res.json({ ok: true, report: null });
    }
    res.json({
      ok: true,
      report: {
        id: latest.id,
        type: latest.type,
        periodLabel: latest.periodLabel,
        startDate: latest.startDate,
        endDate: latest.endDate,
        content: latest.content,
        summary: latest.summary ? JSON.parse(latest.summary) : null,
        llmModel: latest.llmModel,
        createdBy: latest.createdBy,
        createdAt: latest.createdAt,
      },
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * V1.26 取最近 N 份报告历史（仪表盘"查看历史"用）
 * GET /api/ai-command/reports/list
 * query: { type?, limit? }  default limit=10
 */
aiCommandRouter.get('/reports/list', async (req, res) => {
  try {
    const type = (req.query.type as string) || '';
    const limit = Math.min(parseInt((req.query.limit as string) || '10', 10) || 10, 50);
    const where: any = {};
    if (type) where.type = type;
    const list = await prisma.aIReport.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        id: true, type: true, periodLabel: true, createdAt: true,
        llmModel: true, createdBy: true,
      },
    });
    res.json({ ok: true, items: list });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * V1.20: 月报 — 周期 30 天 / 季度 90 天，模板化 + LLM 润色
 * GET /api/ai-command/monthly-report
 * query: { period?: 'month' | 'quarter' | 'custom', startDate?, endDate?, user?, projectCode? }
 */
aiCommandRouter.get('/monthly-report', async (req, res) => {
  try {
    const period = (req.query.period as string) || 'month';
    const customStart = req.query.startDate ? new Date(req.query.startDate as string) : null;
    const customEnd = req.query.endDate ? new Date(req.query.endDate as string) : null;
    const userName = (req.query.user as string) || null;
    const projectCode = (req.query.projectCode as string) || null;

    // V1.27: 日期格式校验
    if (req.query.startDate && (!customStart || isNaN(customStart.getTime()))) {
      return res.status(400).json({ error: `startDate 格式无效: ${req.query.startDate}` });
    }
    if (req.query.endDate && (!customEnd || isNaN(customEnd.getTime()))) {
      return res.status(400).json({ error: `endDate 格式无效: ${req.query.endDate}` });
    }
    if (customStart && customEnd && customStart.getTime() > customEnd.getTime()) {
      return res.status(400).json({ error: 'startDate 必须早于 endDate' });
    }

    const now = new Date();
    let start: Date;
    let end: Date = now;
    let periodLabel: string;
    if (customStart && customEnd) {
      start = customStart;
      end = customEnd;
      periodLabel = `${start.toISOString().slice(0, 10)} ~ ${end.toISOString().slice(0, 10)}`;
    } else if (period === 'quarter') {
      start = new Date(now.getTime() - 90 * 86400000);
      periodLabel = '过去 90 天';
    } else {
      start = new Date(now.getTime() - 30 * 86400000);
      periodLabel = '过去 30 天';
    }

    // 复用 weekly-report 的数据采集
    const projectWhere: any = {};
    if (projectCode) projectWhere.code = projectCode;
    const projects = await prisma.project.findMany({
      where: projectWhere,
      include: {
        customer: { select: { name: true, code: true } },
        carModel: { select: { name: true, brand: true, code: true } },
        _count: { select: { workItems: true } },
      },
    });
    const today = new Date();
    const projectHealth = projects.map(p => {
      const daysLeft = Math.ceil((new Date(p.endDate).getTime() - today.getTime()) / 86400000);
      return {
        code: p.code, name: p.name, status: p.status, progress: p.progress, risk: p.risk,
        customer: p.customer?.name, carModel: p.carModel?.name,
        contractAmount: p.contractAmount, billingType: p.billingType, pmUserName: p.pmUserName,
        daysLeft, workItemCount: p._count.workItems,
        startDate: p.startDate, endDate: p.endDate,
      };
    });

    const recentActivities = await prisma.activity.findMany({
      where: { createdAt: { gte: start, lte: end } },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    const whereBase: any = { createdAt: { gte: start, lte: end } };
    if (userName) {
      whereBase.OR = [{ reporter: userName }, { assignee: userName }];
    }
    if (projectCode) {
      const p = projects.find(p => p.code === projectCode);
      if (p) whereBase.projectId = p.id;
    }
    const newItems = await prisma.workItem.findMany({
      where: whereBase, orderBy: { createdAt: 'desc' }, take: 50,
    });
    const completedItems = await prisma.workItem.findMany({
      where: { ...whereBase, actualEnd: { gte: start, lte: end } },
      orderBy: { actualEnd: 'desc' }, take: 50,
    });
    const criticalItems = await prisma.workItem.findMany({
      where: {
        priority: { in: ['P0', 'P1'] },
        status: { notIn: ['已完成', '已关闭', '已驳回', '已发布', '已验收'] },
        ...(userName ? { OR: [{ reporter: userName }, { assignee: userName }] } : {}),
        ...(projectCode ? { projectId: projects.find(p => p.code === projectCode)?.id } : {}),
      },
      take: 30,
    });
    const highRiskProjects = projectHealth.filter(p => p.risk === 'high');

    // 月报模板
    const reportMd = generateReportMarkdown({
      periodLabel, start, end, projects: projectHealth,
      newItems, completedItems, criticalItems, highRiskProjects, recentActivities,
      userName, projectCode, isMonthly: true,
    });

    // V1.26: 写入历史记录
    try {
      const actor = actorFromReq(req);
      await prisma.aIReport.create({
        data: {
          type: period,
          periodLabel,
          startDate: start,
          endDate: end,
          content: reportMd,
          summary: JSON.stringify({
            projectCount: projects.length,
            highRiskCount: highRiskProjects.length,
            newItemCount: newItems.length,
            completedItemCount: completedItems.length,
            criticalItemCount: criticalItems.length,
            activityCount: recentActivities.length,
          }),
          llmModel: null,
          userFilter: userName,
          projectCode,
          createdBy: actor?.username || '',
        },
      });
    } catch (writeErr) {
      console.warn('[monthly-report] 写 AIReport 失败:', (writeErr as any).message);
    }

    res.json({
      ok: true,
      period: { start, end, label: periodLabel },
      summary: {
        projectCount: projects.length,
        highRiskCount: highRiskProjects.length,
        newItemCount: newItems.length,
        completedItemCount: completedItems.length,
        criticalItemCount: criticalItems.length,
        activityCount: recentActivities.length,
      },
      report: reportMd,
      llmModel: null,
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * V1.20 模板化报告生成器 — 不依赖 LLM，直接基于真实数据生成 Markdown 周报/月报
 */
function generateReportMarkdown(opts: {
  periodLabel: string;
  start: Date;
  end: Date;
  projects: any[];
  newItems: any[];
  completedItems: any[];
  criticalItems: any[];
  highRiskProjects: any[];
  recentActivities: any[];
  userName: string | null;
  projectCode: string | null;
  isMonthly?: boolean;
}): string {
  const { periodLabel, start, end, projects, newItems, completedItems, criticalItems, highRiskProjects, recentActivities, userName, projectCode, isMonthly } = opts;
  const title = isMonthly ? 'AVM 项目月报' : 'AVM 项目周报';
  const scope = userName ? `（范围: ${userName}）` : '（范围: 全部）';
  const projectScope = projectCode ? ` 项目 ${projectCode}` : '';

  const lines: string[] = [];
  lines.push(`# ${title}${projectScope}`);
  lines.push('');
  lines.push(`> **报告周期**: ${periodLabel} (${start.toISOString().slice(0, 10)} ~ ${end.toISOString().slice(0, 10)})  `);
  lines.push(`> **生成时间**: ${new Date().toLocaleString('zh-CN')}  `);
  lines.push(`> **数据范围**: ${scope}`);
  lines.push('');

  // 1) 概览
  lines.push('## 一、概览');
  lines.push('');
  lines.push(`| 指标 | 数值 |`);
  lines.push(`|------|------|`);
  lines.push(`| 项目总数 | ${projects.length} |`);
  lines.push(`| 高风险项目 | ${highRiskProjects.length} |`);
  lines.push(`| 新增工作项 | ${newItems.length} |`);
  lines.push(`| 完成工作项 | ${completedItems.length} |`);
  lines.push(`| P0/P1 未完成 | ${criticalItems.length} |`);
  lines.push(`| 团队活动 | ${recentActivities.length} 次 |`);
  lines.push('');

  // 2) 项目健康度
  if (projects.length > 0) {
    lines.push('## 二、项目健康度');
    lines.push('');
    lines.push(`| 项目 | 状态 | 进度 | 风险 | 客户/车型 | 剩余 |`);
    lines.push(`|------|------|------|------|----------|------|`);
    for (const p of projects.slice(0, 15)) {
      const progress = `${p.progress || 0}%`;
      const daysLeft = p.daysLeft < 0 ? `⚠️ 超 ${Math.abs(p.daysLeft)} 天` : `${p.daysLeft} 天`;
      const customer = p.customer || '-';
      const carModel = p.carModel || '-';
      const riskEmoji = p.risk === 'high' ? '🔴' : p.risk === 'medium' ? '🟡' : '🟢';
      lines.push(`| ${p.code} ${p.name} | ${p.status} | ${progress} | ${riskEmoji} ${p.risk || '-'} | ${customer} / ${carModel} | ${daysLeft} |`);
    }
    if (projects.length > 15) {
      lines.push(`| ... | 还有 ${projects.length - 15} 个项目未显示 |`);
    }
    lines.push('');
  }

  // 3) 本期完成
  if (completedItems.length > 0) {
    lines.push('## 三、本期完成');
    lines.push('');
    for (const i of completedItems.slice(0, 15)) {
      const when = i.actualEnd ? new Date(i.actualEnd).toLocaleDateString('zh-CN') : '-';
      lines.push(`- ✅ **${i.key}** ${i.title} *(负责人: ${i.assignee || '未指派'}, 完成于 ${when})*`);
    }
    if (completedItems.length > 15) {
      lines.push(`- ... 还有 ${completedItems.length - 15} 个已完成项`);
    }
    lines.push('');
  }

  // 4) 本期新增
  if (newItems.length > 0) {
    lines.push('## 四、本期新增');
    lines.push('');
    for (const i of newItems.slice(0, 15)) {
      lines.push(`- 🆕 [${i.type}] **${i.key}** ${i.title} *(${i.priority}, 负责人: ${i.assignee || '未指派'})*`);
    }
    if (newItems.length > 15) {
      lines.push(`- ... 还有 ${newItems.length - 15} 个新增项`);
    }
    lines.push('');
  }

  // 5) P0/P1 当前未完成
  if (criticalItems.length > 0) {
    lines.push('## 五、紧急待办 (P0/P1)');
    lines.push('');
    for (const i of criticalItems.slice(0, 15)) {
      const overdue = i.planEnd && new Date(i.planEnd) < new Date() ? ' 🔴 超期' : '';
      lines.push(`- 🚨 **${i.key}** ${i.title} *(${i.priority}, ${i.status}, 负责人: ${i.assignee || '未指派'})${overdue}*`);
    }
    if (criticalItems.length > 15) {
      lines.push(`- ... 还有 ${criticalItems.length - 15} 项 P0/P1`);
    }
    lines.push('');
  }

  // 6) 风险项目
  if (highRiskProjects.length > 0) {
    lines.push('## 六、高风险项目');
    lines.push('');
    for (const p of highRiskProjects) {
      lines.push(`- 🔴 **${p.code}** ${p.name} (进度 ${p.progress || 0}%, 客户 ${p.customer || '-'})`);
    }
    lines.push('');
  }

  // 7) 月报特别段: 月度汇总
  if (isMonthly) {
    lines.push('## 七、月度趋势');
    lines.push('');
    const weeksOfMonth = Math.ceil((end.getTime() - start.getTime()) / (7 * 86400000));
    lines.push(`- 报告周期内统计 **${weeksOfMonth} 周**`);
    lines.push(`- 平均每周新增工作项 **${(newItems.length / weeksOfMonth).toFixed(1)}** 条`);
    lines.push(`- 平均每周完成工作项 **${(completedItems.length / weeksOfMonth).toFixed(1)}** 条`);
    lines.push(`- 团队活跃度: **${recentActivities.length}** 次操作 (平均 ${(recentActivities.length / weeksOfMonth).toFixed(1)} 次/周)`);
    lines.push('');
  }

  lines.push('---');
  lines.push(`*本报告由 AVM 平台自动生成 · ${new Date().toLocaleString('zh-CN')}*`);
  return lines.join('\n');
}
