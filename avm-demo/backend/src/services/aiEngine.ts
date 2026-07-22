﻿﻿﻿/**
 * AI 引擎（启发式实现）
 * 演示版本不依赖外部 LLM API，使用基于规则和历史数据的启发式算法
 * 真实生产环境可对接：
 *  - 私有化 LLM 网关
 *  - OpenAI / Claude / 国产大模型
 *  - Embedding + 相似度检索
 */
import { prisma } from '../db';

// ========== 估分建议 ==========
// 基于历史相似工作项的估分平均值
export async function suggestEstimate(data: {
  type: string;
  title: string;
  description?: string;
  module?: string;
}) {
  const { type, title, description = '', module: mod } = data;

  // 1. 查找同类型的历史工作项
  const history = await prisma.workItem.findMany({
    where: {
      type,
      estimate: { not: null },
      actualHours: { not: null },
    },
    take: 100,
    orderBy: { createdAt: 'desc' },
  });

  // 2. 计算相似度得分（基于标题和描述的关键字重合）
  const keywords = extractKeywords(`${title} ${description}`);
  const scored = history.map(h => {
    const hKeywords = extractKeywords(`${h.title} ${h.description || ''}`);
    const overlap = keywords.filter(k => hKeywords.includes(k)).length;
    const simScore = keywords.length ? overlap / keywords.length : 0;
    return { item: h, simScore };
  }).filter(s => s.simScore > 0)
    .sort((a, b) => b.simScore - a.simScore)
    .slice(0, 5);

  if (scored.length === 0) {
    // 无相似历史，返回同类型平均
    const allOfType = await prisma.workItem.findMany({
      where: { type, estimate: { not: null } },
      take: 50,
    });
    if (allOfType.length === 0) {
      return { estimate: 3, confidence: 0.2, reason: '无历史数据，建议先做小范围尝试' };
    }
    const avg = allOfType.reduce((s, i) => s + (i.estimate || 0), 0) / allOfType.length;
    return {
      estimate: Math.round(avg * 10) / 10,
      confidence: 0.4,
      reason: `基于${allOfType.length}个同类型工作项的平均估分`,
      similarItems: [],
    };
  }

  // 3. 加权平均（相似度作为权重）
  const totalWeight = scored.reduce((s, x) => s + x.simScore, 0);
  const weightedAvg = scored.reduce((s, x) => s + (x.item.estimate || 0) * x.simScore, 0) / totalWeight;
  const actualAvg = scored.reduce((s, x) => s + (x.item.actualHours || 0) * x.simScore, 0) / totalWeight;

  const result = {
    estimate: Math.round(weightedAvg * 10) / 10,
    actualEstimate: Math.round(actualAvg * 10) / 10,
    confidence: Math.min(0.95, 0.5 + scored[0].simScore),
    reason: `基于${scored.length}个相似工作项（最高相似度 ${(scored[0].simScore * 100).toFixed(0)}%）`,
    similarItems: scored.slice(0, 3).map(s => ({
      key: s.item.key,
      title: s.item.title,
      estimate: s.item.estimate,
      actualHours: s.item.actualHours,
      simScore: Math.round(s.simScore * 100),
    })),
  };
  return enhanceWithLLM(result, `基于启发式结果给用户专业建议：${data.title}`, `类型=${data.type} 建议估分=${result.estimate}`);
}

// ========== 缺陷归类 ==========
// 基于描述关键字的规则匹配
const BUG_RULES = [
  { category: 'UI/样式', keywords: ['样式', '颜色', '布局', '显示', '错位', 'css', '样式错乱', '字体', '图标', '背景'] },
  { category: '功能/逻辑', keywords: ['逻辑', '功能', '点击', '按钮', '提交', '保存', '查询', '删除', '新增', '编辑', '无效', '不生效', '错误'] },
  { category: '性能', keywords: ['慢', '卡', '性能', '加载', '响应', '超时', '白屏', '死锁', '内存', 'cpu'] },
  { category: '接口/API', keywords: ['接口', 'api', '请求', '返回', '参数', 'json', '状态码', '500', '404', '401'] },
  { category: '数据/数据库', keywords: ['数据', '数据库', 'sql', '表', '字段', '主键', '索引', '事务', '死锁', '脏数据', '空值', '重复'] },
  { category: '安全', keywords: ['安全', 'xss', 'csrf', 'sql注入', '权限', '越权', '漏洞', '泄露', '明文'] },
  { category: '兼容', keywords: ['兼容', 'chrome', 'safari', 'firefox', 'ie', 'edge', '移动端', 'ios', 'android', '微信'] },
  { category: '网络', keywords: ['网络', '断网', '离线', '同步', '连接', '超时'] },
  { category: '第三方依赖', keywords: ['依赖', '三方', 'sdk', '组件库', '插件', '升级'] },
];

export async function classifyBug(data: { title: string; description?: string }) {
  const text = `${data.title} ${data.description || ''}`.toLowerCase();

  const scores: Array<{ category: string; score: number; matched: string[] }> = [];
  for (const rule of BUG_RULES) {
    const matched = rule.keywords.filter(k => text.includes(k.toLowerCase()));
    if (matched.length > 0) {
      scores.push({ category: rule.category, score: matched.length, matched });
    }
  }

  scores.sort((a, b) => b.score - a.score);

  if (scores.length === 0) {
    const r = {
      category: '未分类',
      confidence: 0.3,
      suggestions: ['描述过于简短，请补充复现步骤和现象'],
    };
    return enhanceWithLLM(r, `基于规则匹配失败，给出归类建议：${data.title}`, '');
  }

  const top = scores[0];
  const confidence = Math.min(0.95, 0.4 + top.score * 0.15);

  const result = {
    category: top.category,
    confidence,
    matchedKeywords: top.matched,
    alternatives: scores.slice(1, 3).map(s => ({ category: s.category, score: s.score })),
    suggestedLabels: top.matched,
  };
  return enhanceWithLLM(result, `基于规则匹配的归类结果给用户专业建议：${data.title}`, `分类=${result.category} 置信度=${result.confidence}`);
}

// ========== 优先级建议 ==========
export async function suggestPriority(data: { type: string; title: string; description?: string; severity?: string }) {
  const text = `${data.title} ${data.description || ''}`.toLowerCase();

  // 高优先级关键字
  const p0Keywords = ['崩溃', '宕机', '严重', '紧急', '阻塞', 'p0', '线上', '数据丢失', '无法使用', '安全漏洞', '资金'];
  const p1Keywords = ['错误', '异常', '失败', '重要', '客户', '投诉', '影响', '回归'];
  const p2Keywords = ['体验', '建议', '优化', '改进', '完善'];

  const p0Score = p0Keywords.filter(k => text.includes(k)).length;
  const p1Score = p1Keywords.filter(k => text.includes(k)).length;
  const p2Score = p2Keywords.filter(k => text.includes(k)).length;

  // 缺陷类型 + S0/S1 直接升级
  if (data.type === 'bug' && data.severity) {
    if (data.severity === 'S0') return { priority: 'P0', reason: '缺陷严重程度为 S0' };
    if (data.severity === 'S1') return { priority: 'P1', reason: '缺陷严重程度为 S1' };
  }

  if (p0Score > 0) return { priority: 'P0', reason: `检测到高优先级关键字：${p0Keywords.filter(k => text.includes(k)).join('、')}` };
  if (p1Score > 0) return { priority: 'P1', reason: `检测到中优先级关键字：${p1Keywords.filter(k => text.includes(k)).join('、')}` };
  if (p2Score > 0) return { priority: 'P2', reason: '检测到优化/建议类关键字' };

  return { priority: 'P2', reason: '默认优先级' };
}

// ========== 风险评估 ==========
export async function assessRisk(data: {
  workItemId: string;
}) {
  const item = await prisma.workItem.findUnique({
    where: { id: data.workItemId },
    include: {
      children: true,
      iteration: true,
    },
  });
  if (!item) throw new Error('工作项不存在');

  const risks: Array<{ type: string; level: 'high' | 'medium' | 'low'; description: string }> = [];
  let riskScore = 0;

  // 1. 排期风险
  if (item.planEnd && !['已完成', '已关闭', '已驳回', '已发布', '已验收'].includes(item.status)) {
    const days = Math.ceil((new Date(item.planEnd).getTime() - Date.now()) / 86400000);
    if (days < 0) {
      risks.push({ type: '排期', level: 'high', description: `已超期 ${-days} 天` });
      riskScore += 30;
    } else if (days <= 2) {
      risks.push({ type: '排期', level: 'medium', description: `临期 ${days} 天` });
      riskScore += 15;
    }
  }

  // 2. 工时超支风险
  if (item.estimate && item.actualHours && item.actualHours > item.estimate) {
    const overrun = ((item.actualHours - item.estimate) / item.estimate * 100).toFixed(0);
    risks.push({ type: '工时', level: 'high', description: `工时超支 ${overrun}%` });
    riskScore += 25;
  } else if (item.estimate && item.actualHours && item.actualHours / item.estimate > 0.8) {
    risks.push({ type: '工时', level: 'medium', description: `工时已消耗 ${Math.round(item.actualHours / item.estimate * 100)}%` });
    riskScore += 10;
  }

  // 3. 阻塞风险（有阻塞关系）
  const blocked = await prisma.workItemRelation.count({
    where: { toId: item.id, relationType: '阻塞' },
  });
  if (blocked > 0) {
    risks.push({ type: '阻塞', level: 'high', description: `被 ${blocked} 个工作项阻塞` });
    riskScore += 20;
  }

  // 4. 子项完成度
  if (item.children && item.children.length > 0) {
    const completed = item.children.filter(c => ['已完成', '已关闭', '已发布', '已验收'].includes(c.status)).length;
    const ratio = completed / item.children.length;
    if (item.planEnd && ratio < 0.5 && new Date(item.planEnd).getTime() < Date.now() + 7 * 86400000) {
      risks.push({ type: '进度', level: 'medium', description: `子项完成率仅 ${(ratio * 100).toFixed(0)}%` });
      riskScore += 15;
    }
  }

  // 5. 高优先级但未指派
  if (item.priority === 'P0' && !item.assignee) {
    risks.push({ type: '资源', level: 'high', description: 'P0 紧急项未指派负责人' });
    riskScore += 20;
  }

  let level: 'low' | 'medium' | 'high' = 'low';
  if (riskScore >= 50) level = 'high';
  else if (riskScore >= 25) level = 'medium';

  return { level, score: riskScore, risks };
}

// ========== 智能问答 ==========
// 基于关键字解析 + 数据查询
// 注意：不要用 toLowerCase() 处理中文字符串，会把中文变成 ?
// 改用大小写不敏感正则 (i 标志) + 保留中文字符
export async function smartQA(question: string) {
  const q = question.trim();

  // 模式匹配
  const patterns: Array<{ regex: RegExp; handler: () => Promise<any> }> = [
    {
      regex: /(\d+)\s*个?(需求|任务|缺陷|版本)/i,
      handler: async () => {
        const m = q.match(/(\d+)\s*个?(需求|任务|缺陷|版本)/i)!;
        const type = ({ '需求': 'requirement', '任务': 'task', '缺陷': 'bug', '版本': 'release' } as any)[m[2]] || m[2];
        const count = await prisma.workItem.count({ where: { type } });
        return { answer: `系统当前共有 ${count} 个${m[2]}。`, data: { type, count } };
      },
    },
    {
      regex: /p0.*多少|p0.*数量|多少.*p0/i,
      handler: async () => {
        const count = await prisma.workItem.count({ where: { priority: 'P0' } });
        return { answer: `P0 紧急工作项共 ${count} 个。`, data: { count } };
      },
    },
    {
      regex: /超期|延期|逾期/,
      handler: async () => {
        const items = await prisma.workItem.findMany({
          where: {
            planEnd: { lt: new Date() },
            status: { notIn: ['已完成', '已关闭', '已驳回', '已发布', '已验收'] },
          },
        });
        return {
          answer: `当前有 ${items.length} 个工作项已超期未完成。`,
          data: { count: items.length, items: items.slice(0, 10).map(i => ({ key: i.key, title: i.title, planEnd: i.planEnd })) },
        };
      },
    },
    {
      regex: /我(负责|的).*多少/,
      handler: async () => {
        const count = await prisma.workItem.count({ where: { assignee: '我' } });
        return { answer: `你当前负责 ${count} 个工作项。` };
      },
    },
    {
      regex: /迭代|冲刺/,
      handler: async () => {
        const iters = await prisma.iteration.findMany({ include: { _count: { select: { workItems: true } } } });
        return {
          answer: `系统共 ${iters.length} 个迭代，其中 ${iters.filter(i => i.status === 'active').length} 个进行中。`,
          data: { iterations: iters },
        };
      },
    },
    {
      regex: /状态.*分布|状态统计/,
      handler: async () => {
        const groups = await prisma.workItem.groupBy({ by: ['status'], _count: { _all: true } });
        const total = groups.reduce((s, g) => s + g._count._all, 0);
        const top = groups.sort((a, b) => b._count._all - a._count._all).slice(0, 3);
        return {
          answer: `最常见的状态：${top.map(t => `${t.status} (${t._count._all}个)`).join('、')}，共 ${total} 个工作项。`,
          data: { groups, total },
        };
      },
    },
  ];

  for (const p of patterns) {
    if (p.regex.test(q)) {
      const r: any = await p.handler();
      // 模式命中也走 LLM 增强 + 标注 model
      return await enhanceWithLLM(r, question, `模板问题：${q}\n基础答案：${r.answer}`);
    }
  }

  // 兜底：基于相似标题搜索
  const keywords = extractKeywords(q);
  if (keywords.length > 0) {
    const items = await prisma.workItem.findMany({
      where: {
        OR: keywords.map(k => ({
          OR: [
            { title: { contains: k } },
            { description: { contains: k } },
            { key: { contains: k } },
          ],
        })),
      },
      take: 5,
    });
    if (items.length > 0) {
      const r = {
        answer: `找到 ${items.length} 个可能相关的工作项：\n${items.map(i => `- ${i.key} ${i.title}`).join('\n')}`,
        data: { items },
      };
      return await enhanceWithLLM(r, question, `关键词搜索：${keywords.join(', ')}\n命中 ${items.length} 个工作项`);
    }
  }

  const fallback = {
    answer: '抱歉，没有理解你的问题。你可以问："P0 多少个？"、"超期的工作项有哪些？"、"迭代有几个？"',
    suggestions: [
      'P0 紧急项有多少个？',
      '当前超期的工作项',
      '需求有多少个？',
      '状态分布',
      '迭代有几个？',
    ],
  };
  // 用 LLM 兜底回答任何自由文本问题
  return enhanceWithLLM(fallback, question, 'AVM 项目数据中未匹配到模板问题。请基于问题自由回答，给出专业建议。');
}

// ========== 个人周报生成 ==========
export async function generateWeeklyReport(userName: string = '我') {
  const oneWeekAgo = new Date(Date.now() - 7 * 86400000);

  const [completed, inProgress, created, comments] = await Promise.all([
    prisma.workItem.findMany({
      where: { assignee: userName, actualEnd: { gte: oneWeekAgo } },
      orderBy: { actualEnd: 'desc' },
    }),
    prisma.workItem.findMany({
      where: {
        assignee: userName,
        status: { notIn: ['已完成', '已关闭', '已驳回', '已发布', '已验收'] },
      },
      take: 20,
    }),
    prisma.workItem.findMany({
      where: { reporter: userName, createdAt: { gte: oneWeekAgo } },
    }),
    prisma.comment.findMany({
      where: { author: userName, createdAt: { gte: oneWeekAgo } },
    }),
  ]);

  const totalCompletedEstimate = completed.reduce((s, i) => s + (i.estimate || 0), 0);
  const totalActualHours = completed.reduce((s, i) => s + (i.actualHours || 0), 0);

  return {
    period: { start: oneWeekAgo, end: new Date() },
    completed: {
      count: completed.length,
      totalEstimate: totalCompletedEstimate,
      totalActualHours,
      items: completed.map(i => ({ key: i.key, title: i.title, estimate: i.estimate })),
    },
    inProgress: {
      count: inProgress.length,
      items: inProgress.slice(0, 10).map(i => ({ key: i.key, title: i.title, status: i.status })),
    },
    created: { count: created.length, items: created.map(i => ({ key: i.key, title: i.title })) },
    comments: { count: comments.length },
    summary: `本周完成 ${completed.length} 个工作项（估分 ${totalCompletedEstimate}，实际工时 ${totalActualHours}）；进行中 ${inProgress.length} 个；新增创建 ${created.length} 个；发表评论 ${comments.length} 条。`,
  };
}

// ========== 工具函数 ==========
function extractKeywords(text: string): string[] {
  if (!text) return [];
  // 移除停用词
  const stopWords = new Set(['的', '了', '和', '是', '在', '我', '你', '他', '她', '它', '们', '与', '及', '或', '一个', '一些', '我们', '你们', '他们', '请', '可以', '需要', '应该', '支持', '实现', '完成', '添加', '删除', '修改', '优化']);
  // 简单中文分词（按 2-4 字切片）
  const words: string[] = [];
  const cleaned = text.replace(/[^\u4e00-\u9fa5a-zA-Z0-9]/g, ' ');
  // 英文按空格分
  for (const w of cleaned.split(/\s+/)) {
    if (w.length >= 2 && !stopWords.has(w.toLowerCase())) {
      words.push(w.toLowerCase());
    }
  }
  // 中文按 2-4 字窗口
  const chineseOnly = text.replace(/[^\u4e00-\u9fa5]/g, '');
  for (let i = 0; i < chineseOnly.length - 1; i++) {
    for (let len = 2; len <= 4 && i + len <= chineseOnly.length; len++) {
      const w = chineseOnly.slice(i, i + len);
      if (!stopWords.has(w)) words.push(w);
    }
  }
  return [...new Set(words)];
}

// ========== LLM 增强（可选） ==========
// 当 LLM 可用时，在启发式结果之上加一段 LLM 生成的自然语言解读。
// LLM 不可用 / 失败时静默返回原结果。
import { getLLMProvider, getLLMStatus } from './llmProvider';
import { buildProjectSnapshot } from './projectSnapshot';

export function llmStatus() {
  return getLLMStatus();
}

// 单例 snapshot 缓存（5 分钟刷新一次；和 LLM cache TTL 对齐）
let _snapshotCache: { text: string; ts: number } | null = null;
const SNAPSHOT_TTL = 5 * 60_000;
async function getProjectSnapshotText(): Promise<string> {
  if (_snapshotCache && Date.now() - _snapshotCache.ts < SNAPSHOT_TTL) return _snapshotCache.text;
  const s = await buildProjectSnapshot();
  _snapshotCache = { text: s.text, ts: Date.now() };
  return s.text;
}

export async function enhanceWithLLM(
  baseResult: any,
  prompt: string,
  context?: string
): Promise<any & { llmEnhanced?: boolean; llmInsight?: string; llmModel?: string; llmContext?: { snapshot: boolean; items: number } }> {
  const provider = await getLLMProvider();
  // 总是附上当前 model + provider（即使 LLM 没调成功也告知）
  const baseWithModel = {
    ...baseResult,
    llmModel: (provider as any).defaultModel || (provider as any).displayName || provider.name,
    provider: provider.name,
  };
  if (!provider.isAvailable() || provider.name === 'mock') return { ...baseWithModel, llmEnhanced: false };
  try {
    // 拉项目快照（5 分钟缓存），让 LLM 基于真实数据推理
    const snapshot = await getProjectSnapshotText();
    const messages: any[] = [];
    // system prompt 顺序：项目快照（最权威） → 本次上下文（特定子任务） → 严格指令
    messages.push({
      role: 'system',
      content: `${snapshot}\n\n你是一位资深 AVM 项目管理专家。基于上面的【项目快照】和【本次数据上下文】回答用户问题。\n\n严格规则：\n1. 只能使用项目快照和本次上下文中的真实数据\n2. 不在数据中的字段（合同额/进度/风险/UPL 等），必须明确说"数据中没有 X 信息"\n3. 严禁编造项目、客户、车型、合同额、联系人姓名等任何数据\n4. 回答简洁专业，给出风险点 / 建议 / 责任人建议`,
    });
    if (context) {
      messages.push({ role: 'system', content: `本次数据上下文：\n${context}` });
    }
    messages.push({ role: 'user', content: prompt });
    const r = await provider.chat(messages, { temperature: 0.3, maxTokens: 800 });
    // LLM 增强成功：用 LLM 输出作为主回答（answer 字段），避免前端显示"基础版+LLM 版"重复
    // - 保留 baseResult.answer 作为 llmInsight 字段（如果不同），让"基础 vs LLM 增强"可对比
    const llmOutput = (r.content || '').trim();
    const baseAnswer = (baseResult?.answer || '').trim();
    const useLLMAsMain = llmOutput && llmOutput !== baseAnswer;
    return {
      ...baseWithModel,
      answer: useLLMAsMain ? llmOutput : (baseAnswer || llmOutput),
      llmEnhanced: true,
      llmInsight: useLLMAsMain && baseAnswer ? `基础回答：${baseAnswer}` : undefined,
      llmModel: r.model,
      llmContext: { snapshot: true, items: snapshot.length },
    };
  } catch (e: any) {
    return { ...baseWithModel, llmEnhanced: false, llmError: e.message };
  }
}