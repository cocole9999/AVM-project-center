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

    // ===== 智能直答：绕过 LLM 直接处理常见查询 =====
    // 某些模型（如 DeepSeek V4 Flash）的 function calling 不稳定，
    // 直接查库返回，不依赖 LLM。
    const cmdTrimmed = command.trim();
    const hasAssigneeQ = cmdTrimmed.includes('负责') || cmdTrimmed.includes('工作') || 
      cmdTrimmed.includes('任务') || cmdTrimmed.includes('缺陷') || cmdTrimmed.includes('需求');
    if (hasAssigneeQ) {
      const aiDbNames = await prisma.workItem.findMany({
        where: { assignee: { not: null } },
        distinct: ['assignee'],
        select: { assignee: true },
      });
      const aiNameList = aiDbNames.map(r => r.assignee).filter((n): n is string => !!n);
      const aiMatched = aiNameList.filter(n => {
        const s = n.slice(0, 2);
        return s.length >= 2 && cmdTrimmed.includes(s);
      });
      if (aiMatched.length > 0) {
        const aiAllItems = await prisma.workItem.findMany({
          where: { assignee: { not: null } },
          select: { key: true, type: true, title: true, status: true, priority: true, assignee: true, planEnd: true },
          orderBy: [{ assignee: 'asc' }, { priority: 'asc' }],
        });
        const aiByPerson: Record<string, any[]> = {};
        for (const it of aiAllItems) {
          const n = it.assignee || '未指派';
          if (!aiByPerson[n]) aiByPerson[n] = [];
          aiByPerson[n].push(it);
        }
        const aiLines: string[] = [];
        aiLines.push(`## 工作项 — 按负责人列出\n`);
        for (const name of aiMatched) {
          const items = aiByPerson[name] || [];
          aiLines.push(`### ${name}（${items.length} 项）`);
          for (const it of items) {
            const t = { requirement: '需求', task: '任务', bug: '缺陷', release: '发布' }[it.type as string] || it.type;
            aiLines.push(`- **${it.key}** ${it.title} | ${t} | ${it.status} | ${it.priority}${it.planEnd ? ' | 截止: ' + (it.planEnd as string).slice(0,10) : ''}`);
          }
          aiLines.push('');
        }
        aiLines.push(`---\n📊 共列出 ${aiMatched.reduce((s, n) => s + (aiByPerson[n] || []).length, 0)} 项工作项。`);
        return res.json({
          ok: true, command,
          reply: aiLines.join('\n'), toolCalls: [],
          usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
          llmModel: 'rule-engine', provider: 'rule-engine',
        });
      }
    }

    // ===== LLM 路径：注入全量数据让 LLM 直接回答 =====
    // 不依赖 function calling（DeepSeek 等模型不支持或不稳定）

    // 1. 拉所有工作项
    const allWis = await prisma.workItem.findMany({
      select: { key: true, type: true, title: true, status: true, priority: true, assignee: true, estimate: true, planStart: true, planEnd: true, actualHours: true, iterationId: true },
      orderBy: [{ priority: 'asc' }, { updatedAt: 'desc' }],
    });

    // 2. 拉所有项目
    const allProjects = await prisma.project.findMany({
      select: { code: true, name: true, status: true, risk: true, progress: true, billingType: true, contractAmount: true, startDate: true, endDate: true },
      orderBy: { code: 'asc' },
    });
    const projText = allProjects.map(p =>
      `- ${p.code} ${p.name} | 状态:${p.status} | 风险:${p.risk} | 进度:${p.progress}% | 合同:${(p.contractAmount/10000).toFixed(1)}万 | ${(p.startDate+"").slice(0,10)}~${(p.endDate+"").slice(0,10)}`
    ).join('\n');

    // 3. 工作项文本
    const wiText = allWis.map(w => {
      const typeLabel = { requirement: '需求', task: '任务', bug: '缺陷', release: '发布' }[w.type] || w.type;
      const assignee = w.assignee || '未指派';
      return `- ${w.key} [${typeLabel}] ${w.title} | 状态:${w.status} | 优先级:${w.priority} | 负责人:${assignee}${w.planEnd ? ' | 截止:' + (w.planEnd+"").slice(0,10) : ''}`;
    }).join('\n');

    // 4. 迭代
    const allIters = await prisma.iteration.findMany({
      select: { id: true, name: true, status: true, startDate: true, endDate: true },
      orderBy: { startDate: 'desc' },
      take: 10,
    });
    const iterText = allIters.map(i => {
      const total = allWis.filter(w => w.iterationId === i.id).length;
      return `- ${i.name} | 状态:${i.status} | ${(i.startDate+"").slice(0,10)}~${(i.endDate+"").slice(0,10)} | 工作项:${total}`;
    }).join('\n');

    // 5. 统计
    const byStatus: Record<string, number> = {};
    const byPrio: Record<string, number> = {};
    const byAssignee: Record<string, number> = {};
    const terminal = ['已完成', '已关闭', '已驳回', '已发布', '已验收'];
    const overdue = allWis.filter(w => w.planEnd && new Date(w.planEnd) < new Date() && !terminal.includes(w.status));
    for (const w of allWis) {
      byStatus[w.status] = (byStatus[w.status] || 0) + 1;
      byPrio[w.priority] = (byPrio[w.priority] || 0) + 1;
      if (w.assignee) byAssignee[w.assignee] = (byAssignee[w.assignee] || 0) + 1;
    }
    const assigneeTop = Object.entries(byAssignee).sort((a,b) => b[1]-a[1]).slice(0,5).map(([k,v]) => `${k}=${v}`).join(' / ');

    // 6. 构建数据 dump
    const dataDump = `## 项目数据（共${allProjects.length} 个）\n${projText}\n\n## 工作项数据（共 ${allWis.length} 项）\n${wiText}\n\n## 迭代/冲刺\n${iterText}\n\n## 统计数据\n- 状态分布: ${Object.entries(byStatus).map(([k,v]) => `${k}=${v}`).join(' / ')}\n- 优先级分布: ${Object.entries(byPrio).map(([k,v]) => `${k}=${v}`).join(' / ')}\n- 负责人分布(Top5): ${assigneeTop}\n- 超期项: ${overdue.length} 项`;

    const llmMessages: any[] = [
      { role: 'system', content: `你是一位 AVM 项目助理。以下是你需要知道的全部数据:\n\n${dataDump}\n\n请根据以上数据回答用户的问题。如果数据中没有答案，就说"数据中没有该信息"。不要编造。` },
    ];
    if (Array.isArray(history) && history.length > 0) {
      const trimmed = history.slice(-10).filter(m => ['user', 'assistant'].includes(m.role));
      for (const m of trimmed) llmMessages.push({ role: m.role, content: m.content || '' });
    }
    llmMessages.push({ role: 'user', content: command });

    const llmResult = await provider.chat(llmMessages as any, {
      model: (provider as any).defaultModel,
      temperature: 0.3,
      maxTokens: 2000,
    } as any);
    const replyText = llmResult.content || '（AI 未返回有效回答）';
    const usage: any = llmResult.usage || {};
    const pt = usage.promptTokens || 0;
    const ct = usage.completionTokens || 0;

    res.json({
      ok: true, command,
      reply: replyText,
      toolCalls: [],
      usage: { promptTokens: pt, completionTokens: ct, totalTokens: pt + ct },
      llmModel: llmResult.model || '',
      provider: (llmResult as any).provider || 'unknown',
    });
    return;
  } catch (e: any) {
    console.error('[ai-command]', e);
    res.status(500).json({ error: e.message || 'AI 处理出错' });
  }
});

// ========== 报告生成器（模板化，不依赖 LLM） ==========
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

// ========== 智能直答引擎 ==========
// 常见查询不经过 LLM，直接查库并格式化返回，更可靠更快速
async function tryDirectAnswer(command: string): Promise<string | null> {
  const cmd = command.trim();

  // 1. 按负责人查询工作项: "张三的工作项" "李四负责的任务" "列出张三和李四的工作"
  const hasAssigneeQuery = cmd.includes('负责') || cmd.includes('工作') || cmd.includes('任务') ||
    cmd.includes('缺陷') || cmd.includes('需求') || cmd.includes('谁');

  if (hasAssigneeQuery) {
    // 快速检查：DB 中有没有人名出现在用户输入中
    const dbNamesRaw = await prisma.workItem.findMany({
      where: { assignee: { not: null } },
      distinct: ['assignee'],
      select: { assignee: true },
    });
    const dbNames = dbNamesRaw.map(r => r.assignee).filter((n): n is string => !!n);
    // 用前两字匹配姓名（张三 → 匹配 张三（研发一组））
    const matchedDbNames = dbNames.filter(n => {
      const short = n.slice(0, 2);
      return short.length >= 2 && cmd.includes(short);
    });

    if (matchedDbNames.length === 0) return null; // 用户没问具体负责人

    // 查所有工作项并按负责人分组
    const allItems = await prisma.workItem.findMany({
      where: { assignee: { not: null } },
      select: { key: true, type: true, title: true, status: true, priority: true, assignee: true, planEnd: true },
      orderBy: [{ assignee: 'asc' }, { priority: 'asc' }],
    });
    const byAssignee: Record<string, any[]> = {};
    for (const i of allItems) {
      const name = i.assignee || '未指派';
      if (!byAssignee[name]) byAssignee[name] = [];
      byAssignee[name].push(i);
    }

    const lines: string[] = [];
    lines.push(`## 工作项 — 按负责人列出\n`);
    for (const name of matchedDbNames) {
      const items = byAssignee[name] || [];
      lines.push(`### ${name}（${items.length} 项）`);
      for (const i of items) {
        const typeLabel = { requirement: '需求', task: '任务', bug: '缺陷', release: '发布' }[i.type as string] || i.type;
        const dueInfo = i.planEnd ? ` | 截止: ${(i.planEnd as string).slice(0, 10)}` : '';
        lines.push(`- **${i.key}** ${i.title} | ${typeLabel} | ${i.status} | ${i.priority}${dueInfo}`);
      }
      lines.push('');
    }
    lines.push(`---\n📊 共列出 ${matchedDbNames.reduce((s, n) => s + ((byAssignee[n] || []).length), 0)} 项工作项。`);
    return lines.join('\n');
  }

  return null;
}
