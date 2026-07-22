import { Router } from 'express';
import * as ai from '../services/aiEngine';
import { prisma } from '../db';
import { getLLMProvider } from '../services/llmProvider';

export const aiRouter = Router();

// 估分建议
aiRouter.post('/suggest-estimate', async (req, res) => {
  try {
    const result = await ai.suggestEstimate(req.body);
    res.json(result);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

// 缺陷归类
aiRouter.post('/classify-bug', async (req, res) => {
  try {
    const result = await ai.classifyBug(req.body);
    res.json(result);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

// 优先级建议
aiRouter.post('/suggest-priority', async (req, res) => {
  try {
    const result = await ai.suggestPriority(req.body);
    res.json(result);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

// 风险评估
aiRouter.post('/assess-risk/:workItemId', async (req, res) => {
  try {
    const result = await ai.assessRisk({ workItemId: req.params.workItemId });
    res.json(result);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

// 智能问答
aiRouter.post('/qa', async (req, res) => {
  try {
    const { question } = req.body;
    const result = await ai.smartQA(question);
    res.json(result);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

// 个人周报 (V1.7 旧版，V1.9 用 /api/ai-command/weekly-report 替代)
aiRouter.get('/weekly-report', async (req, res) => {
  try {
    let userName = (req.query.user as string) || '我';
    // 防止非法值（前端误传 period='week' 之类的）
    if (userName === 'week' || userName === 'month' || userName.length > 50) {
      userName = '我';
    }
    const result = await ai.generateWeeklyReport(userName);
    res.json(result);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

// AI 字段配置
aiRouter.get('/configs', async (_req, res) => {
  const list = await prisma.aIFieldConfig.findMany({ orderBy: { name: 'asc' } });
  res.json(list);
});

aiRouter.post('/configs', async (req, res) => {
  try {
    const c = await prisma.aIFieldConfig.create({ data: req.body });
    res.status(201).json(c);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

aiRouter.patch('/configs/:id', async (req, res) => {
  try {
    const c = await prisma.aIFieldConfig.update({ where: { id: req.params.id }, data: req.body });
    res.json(c);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

aiRouter.delete('/configs/:id', async (req, res) => {
  await prisma.aIFieldConfig.delete({ where: { id: req.params.id } });
  res.status(204).end();
});

// AI 执行日志
aiRouter.get('/logs', async (req, res) => {
  const list = await prisma.aIRunLog.findMany({
    orderBy: { createdAt: 'desc' },
    take: Number(req.query.limit) || 50,
  });
  res.json(list);
});

// LLM 状态
aiRouter.get('/llm-status', async (_req, res) => {
  res.json(await ai.llmStatus());
});

/**
 * V1.21 AI 拆子任务
 * POST /api/ai/decompose
 * body: { workItemId }
 * 返回: { subtasks: [{ title, type, priority, estimate, reason }] }
 */
aiRouter.post('/decompose', async (req, res) => {
  try {
    const { workItemId } = req.body;
    if (!workItemId) return res.status(400).json({ error: 'workItemId required' });
    const item = await prisma.workItem.findUnique({ where: { id: workItemId } });
    if (!item) return res.status(404).json({ error: 'work item not found' });

    const provider = await getLLMProvider();
    if (!provider.isAvailable() || provider.name === 'mock') {
      // LLM 不可用 — 返回模板化子任务
      return res.json({
        ok: true,
        llmModel: null,
        parent: { id: item.id, key: item.key, title: item.title },
        subtasks: generateTemplateSubtasks(item),
        note: 'LLM 不可用, 使用模板拆分 (按工作项类型和关键字生成通用子任务)',
      });
    }

    const prompt = `你是 AVM 项目拆解专家。下面是一个工作项:
- 标题: ${item.title}
- 描述: ${item.description || '(无)'}
- 类型: ${item.type}
- 优先级: ${item.priority}
- 估分: ${item.estimate || '?'} SP

请把它拆成 3-8 个可独立执行的子任务 (类型 task 或 bug), 严格按 JSON 数组返回:
[
  {"title": "...", "type": "task|bug", "priority": "P0|P1|P2|P3", "estimate": 数字(估时小时), "reason": "为什么这样拆"}
]

要求:
- 每个子任务可由 1 人独立完成
- 子任务粒度适中 (4-16 小时)
- 子任务按依赖顺序排 (前面的先做)
- 输出**只**包含 JSON 数组, 不要其他文字`;

    const r = await provider.chat([
      { role: 'system', content: '你是 AVM 项目拆解专家, 输出严谨的 JSON 数组。' },
      { role: 'user', content: prompt },
    ], { temperature: 0.4, maxTokens: 2000 });

    // 解析 JSON
    let subtasks: any[] = [];
    try {
      // 提取 JSON 块 (AI 可能包在 \`\`\`json ... \`\`\`)
      let content = r.content.trim();
      const jsonMatch = content.match(/```(?:json)?\s*([\s\S]+?)\s*```/);
      if (jsonMatch) content = jsonMatch[1];
      const arrMatch = content.match(/\[[\s\S]*\]/);
      if (arrMatch) content = arrMatch[0];
      const parsed = JSON.parse(content);
      if (Array.isArray(parsed)) {
        subtasks = parsed.map((s: any) => ({
          title: String(s.title || '').slice(0, 200),
          type: ['requirement', 'task', 'bug', 'release'].includes(s.type) ? s.type : 'task',
          priority: ['P0', 'P1', 'P2', 'P3'].includes(s.priority) ? s.priority : 'P2',
          estimate: Number(s.estimate) || undefined,
          reason: String(s.reason || '').slice(0, 200),
        })).filter((s: any) => s.title);
      }
    } catch (parseErr) {
      return res.status(500).json({ error: 'AI 返回非 JSON, 解析失败: ' + (parseErr as any).message, raw: r.content });
    }

    res.json({
      ok: true,
      llmModel: r.model,
      parent: { id: item.id, key: item.key, title: item.title },
      subtasks,
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * 模板化子任务生成 (LLM 不可用时降级)
 */
function generateTemplateSubtasks(item: any): any[] {
  const type = item.type;
  if (type === 'requirement') {
    return [
      { title: `${item.title} - 需求评审与确认`, type: 'task', priority: 'P1', estimate: 4, reason: '与客户/产品对齐验收标准' },
      { title: `${item.title} - 技术方案设计`, type: 'task', priority: 'P1', estimate: 8, reason: '方案评审后开始编码' },
      { title: `${item.title} - 核心功能开发`, type: 'task', priority: 'P1', estimate: 16, reason: '按模块拆分多人并行' },
      { title: `${item.title} - 单元测试 + 集成测试`, type: 'task', priority: 'P1', estimate: 8, reason: '保证质量' },
      { title: `${item.title} - 联调 + UAT`, type: 'task', priority: 'P2', estimate: 8, reason: '客户验收' },
    ];
  }
  if (type === 'task') {
    return [
      { title: `${item.title} - 任务拆解与排期`, type: 'task', priority: 'P2', estimate: 2, reason: '明确子步骤' },
      { title: `${item.title} - 代码实现`, type: 'task', priority: 'P2', estimate: 8, reason: '主要工作量' },
      { title: `${item.title} - 自测 + Code Review`, type: 'task', priority: 'P2', estimate: 4, reason: '保证质量' },
    ];
  }
  if (type === 'bug') {
    return [
      { title: `${item.title} - 复现与根因分析`, type: 'task', priority: 'P1', estimate: 4, reason: '找到根因再动手' },
      { title: `${item.title} - 修复方案实施`, type: 'task', priority: 'P1', estimate: 8, reason: '主工作量' },
      { title: `${item.title} - 回归测试`, type: 'task', priority: 'P1', estimate: 4, reason: '防止新问题' },
    ];
  }
  // 默认
  return [
    { title: `${item.title} - 计划与拆解`, type: 'task', priority: 'P2', estimate: 2, reason: '明确步骤' },
    { title: `${item.title} - 执行`, type: 'task', priority: 'P2', estimate: 8, reason: '主要工作' },
    { title: `${item.title} - 验收`, type: 'task', priority: 'P2', estimate: 4, reason: '完成闭环' },
  ];
}