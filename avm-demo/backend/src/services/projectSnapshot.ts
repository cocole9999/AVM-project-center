/**
 * 项目快照 - 给 LLM 喂"项目真实数据"，避免幻觉
 *
 * 把 V1.7 全量数据（项目/客户/车型/联系人/工作项统计）打包成结构化文本，
 * 控制在 ~2-3k tokens 内，喂给 LLM 作为 system prompt 上下文。
 *
 * 调用方：aiEngine.enhanceWithLLM（每个问答前刷新一次）
 */
import { prisma } from '../db';

const RISK_LABEL: Record<string, string> = { low: '低', medium: '中', high: '高' };
const STATUS_LABEL: Record<string, string> = {
  planning: '规划中', in_progress: '进行中', completed: '已完成', on_hold: '暂停', cancelled: '已取消',
};
const BILLING_LABEL: Record<string, string> = { ODC: 'ODC 人月', ODM: 'ODM 包干', FIXED: '固定价' };

function fmtDate(d: Date | null | undefined): string {
  if (!d) return '-';
  const dt = typeof d === 'string' ? new Date(d) : d;
  return dt.toISOString().slice(0, 10);
}

function fmtMoney(n: number): string {
  if (!n) return '0';
  return (n / 10000).toFixed(1) + ' 万';
}

function pct(p: number): string {
  return `${p || 0}%`;
}

export interface SnapshotResult {
  text: string;          // 给 LLM 看的结构化文本
  stats: {               // 给前端/测试用的统计
    projects: number;
    customers: number;
    carModels: number;
    contacts: number;
    workItemCount: number;
  };
}

export async function buildProjectSnapshot(): Promise<SnapshotResult> {
  // 并发查所有实体
  const [projects, customers, carModels, contacts, workItems] = await Promise.all([
    prisma.project.findMany({
      include: { customer: { select: { code: true, name: true } }, carModel: { select: { code: true, name: true, brand: true } } },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.customer.findMany({ orderBy: { code: 'asc' } }),
    prisma.carModel.findMany({ orderBy: { code: 'asc' } }),
    prisma.contact.findMany({ include: { customer: { select: { name: true, code: true } } }, orderBy: [{ customerId: 'asc' }, { role: 'asc' }] }),
    prisma.workItem.findMany({ select: { id: true, status: true, priority: true, type: true, projectId: true, customerId: true, carModelId: true } }),
  ]);

  // 工作项统计
  const wiByStatus: Record<string, number> = {};
  const wiByPriority: Record<string, number> = {};
  const wiByProject: Record<string, number> = {};
  const wiByCustomer: Record<string, number> = {};
  for (const w of workItems) {
    wiByStatus[w.status] = (wiByStatus[w.status] || 0) + 1;
    wiByPriority[w.priority] = (wiByPriority[w.priority] || 0) + 1;
    if (w.projectId) wiByProject[w.projectId] = (wiByProject[w.projectId] || 0) + 1;
    if (w.customerId) wiByCustomer[w.customerId] = (wiByCustomer[w.customerId] || 0) + 1;
  }

  // ===== 文本拼接 =====
  const lines: string[] = [];

  lines.push('【AVM 项目中心数据快照】');
  lines.push(`生成时间：${new Date().toISOString().slice(0, 16).replace('T', ' ')}`);
  lines.push('');

  // 1. 项目（最重要，按风险 + 进度排序）
  lines.push(`## 1. 项目（共 ${projects.length} 个）`);
  lines.push('字段：项目编码 | 名称 | 客户 | 车型 | 合同额 | 计费 | 进度 | 风险 | 状态 | 起止 | 工作项数');
  const sorted = [...projects].sort((a, b) => {
    const r = (RISK_LABEL[b.risk] ? 1 : 0) - (RISK_LABEL[a.risk] ? 1 : 0);
    if (r !== 0) return r;
    return (b.contractAmount || 0) - (a.contractAmount || 0);
  });
  for (const p of sorted) {
    const riskTag = `风险=${RISK_LABEL[p.risk] || p.risk}`;
    const statusTag = STATUS_LABEL[p.status] || p.status;
    const billing = BILLING_LABEL[p.billingType] || p.billingType;
    const wi = wiByProject[p.id] || 0;
    lines.push(`- ${p.code} | ${p.name} | 客户=${p.customer.name} | 车型=${p.carModel.name}（${p.carModel.brand}）| 合同=${fmtMoney(p.contractAmount)} | ${billing} | 进度=${pct(p.progress)} | ${riskTag} | ${statusTag} | ${fmtDate(p.startDate)}~${fmtDate(p.endDate)} | 工作项 ${wi} 条`);
  }
  lines.push('');

  // 2. 客户（含 UPL/PPM 联系人）
  lines.push(`## 2. 客户（共 ${customers.length} 个）`);
  lines.push('字段：客户编码 | 名称 | 类型 | 主联系人 | 电话 | 状态');
  // 按客户分组联系人（只列 UPL/PPM 这种关键角色）
  const contactByCustomer: Record<string, { upl?: string; ppm?: string; avmContact?: string; test?: string; dev?: string }> = {};
  for (const c of contacts) {
    if (!contactByCustomer[c.customerId]) contactByCustomer[c.customerId] = {};
    const m = contactByCustomer[c.customerId];
    const entry = `${c.name}(${c.phone || '无电话'})`;
    if (c.role === 'UPL') m.upl = entry;
    else if (c.role === 'PPM') m.ppm = entry;
    else if (c.role === 'AVM接口人') m.avmContact = entry;
    else if (c.role === '测试') m.test = entry;
    else if (c.role === '开发') m.dev = entry;
  }
  for (const c of customers) {
    const ct = contactByCustomer[c.id] || {};
    const wi = wiByCustomer[c.id] || 0;
    const people = [
      ct.upl ? `UPL=${ct.upl}` : null,
      ct.ppm ? `PPM=${ct.ppm}` : null,
      ct.avmContact ? `AVM接口人=${ct.avmContact}` : null,
    ].filter(Boolean).join(' | ');
    lines.push(`- ${c.code} | ${c.name} | ${c.type} | ${c.contact || '-'} | ${c.phone || '-'} | ${c.status} | 项目 ${projects.filter(p => p.customerId === c.id).length} 个 / 工作项 ${wi} 条${people ? ' | ' + people : ''}`);
  }
  lines.push('');

  // 3. 车型
  lines.push(`## 3. 车型（共 ${carModels.length} 个）`);
  lines.push('字段：编码 | 名称 | 品牌 | 系列 | 平台 | 上市年');
  for (const m of carModels) {
    lines.push(`- ${m.code} | ${m.name} | ${m.brand} | ${m.series || '-'} | ${m.platform || '-'} | ${m.launchYear || '-'}`);
  }
  lines.push('');

  // 4. 工作项统计
  lines.push(`## 4. 工作项统计（共 ${workItems.length} 条）`);
  const statusParts = Object.entries(wiByStatus).map(([k, v]) => `${k}=${v}`).join(' / ');
  const prioParts = Object.entries(wiByPriority).map(([k, v]) => `${k}=${v}`).join(' / ');
  lines.push(`- 状态分布：${statusParts}`);
  lines.push(`- 优先级分布：${prioParts}`);
  lines.push('');

  lines.push('【快照结束】请基于以上真实数据回答用户问题。如果数据中没有答案，明确说"数据中没有 X 信息"，不要编造。');

  return {
    text: lines.join('\n'),
    stats: {
      projects: projects.length,
      customers: customers.length,
      carModels: carModels.length,
      contacts: contacts.length,
      workItemCount: workItems.length,
    },
  };
}
