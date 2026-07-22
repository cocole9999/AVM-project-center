/**
 * 聚合字段引擎
 * 子工作项的 sum/avg/max/min/count + 完成度统计
 */
import { prisma } from '../db';
import { computeFormulaField, computeItemFormulas } from './formulaEngine';

type AggregationType = 'sum' | 'avg' | 'max' | 'min' | 'count' | 'countDone' | 'countOver' | 'progress';

function getFieldValue(item: any, sourceField: string): number {
  switch (sourceField) {
    case 'estimate': return item.estimate ?? 0;
    case 'actualHours': return item.actualHours ?? 0;
    case 'storyPoints': return item.storyPoints ?? 0;
    case 'remaining': return Math.max(0, (item.estimate ?? 0) - (item.actualHours ?? 0));
    case 'progress':
      if (!item.estimate || item.estimate === 0) return 0;
      return Math.min(1, (item.actualHours ?? 0) / item.estimate);
    default: return 0;
  }
}

function aggregate(items: any[], agg: AggregationType, sourceField: string): number {
  if (agg === 'count') return items.length;
  if (agg === 'countDone') {
    return items.filter(i => ['已完成', '已验收', '已发布', '已关闭'].includes(i.status)).length;
  }
  if (agg === 'countOver') {
    const now = new Date();
    return items.filter(i =>
      i.planEnd && new Date(i.planEnd) < now &&
      !['已完成', '已验收', '已发布', '已关闭'].includes(i.status)
    ).length;
  }
  if (agg === 'progress') {
    if (items.length === 0) return 0;
    const done = items.filter(i => ['已完成', '已验收', '已发布', '已关闭'].includes(i.status)).length;
    return done / items.length;
  }
  const values = items.map(i => getFieldValue(i, sourceField)).filter(v => v != null);
  if (values.length === 0) return 0;
  switch (agg) {
    case 'sum': return values.reduce((a, b) => a + b, 0);
    case 'avg': return values.reduce((a, b) => a + b, 0) / values.length;
    case 'max': return Math.max(...values);
    case 'min': return Math.min(...values);
    default: return 0;
  }
}

function getAllDescendantIds(items: any[]): string[] {
  return items.flatMap(i => [i.id, ...getAllDescendantIds(i.children || [])]);
}

// 计算某个 RollupField 在所有父工作项上的值
export async function computeRollupField(rollupFieldId: string): Promise<Record<string, number>> {
  const field = await prisma.rollupField.findUnique({ where: { id: rollupFieldId } });
  if (!field) throw new Error('Rollup field not found');

  // 父工作项列表
  const parents = await prisma.workItem.findMany({
    where: { type: field.workType, ...(field.spaceId ? { spaceId: field.spaceId } : {}) },
  });

  // 对每个父工作项，递归取所有后代
  const values: Record<string, number> = {};
  for (const p of parents) {
    // 取所有子工作项（递归）
    const allChildren = await getAllDescendants(p.id, field.childType);
    values[p.id] = aggregate(allChildren, field.aggregation as AggregationType, field.sourceField);
  }

  await prisma.rollupField.update({
    where: { id: rollupFieldId },
    data: { cachedValues: JSON.stringify(values) },
  });
  return values;
}

async function getAllDescendants(parentId: string, childType: string): Promise<any[]> {
  const direct = await prisma.workItem.findMany({ where: { parentId, type: childType } });
  let all = [...direct];
  for (const d of direct) {
    const sub = await getAllDescendants(d.id, childType);
    all = all.concat(sub);
  }
  return all;
}

// 给单个父工作项计算所有 RollupField
export async function computeItemRollups(parentItemId: string): Promise<Record<string, number>> {
  const parent = await prisma.workItem.findUnique({ where: { id: parentItemId } });
  if (!parent) return {};

  const fields = await prisma.rollupField.findMany({
    where: { workType: parent.type, enabled: true, OR: [{ spaceId: parent.spaceId }, { spaceId: null }] },
  });
  // 兼容：把 workType 转成 type 用于 formulaEngine 调用

  const result: Record<string, number> = {};
  for (const f of fields) {
    const children = await getAllDescendants(parentItemId, f.childType);
    result[f.fieldKey] = aggregate(children, f.aggregation as AggregationType, f.sourceField);
  }
  return result;
}

// 综合计算：返回工作项的所有派生字段（公式 + 聚合）
export async function computeItemDerivedFields(workItemId: string): Promise<{
  formulas: Record<string, number>;
  rollups: Record<string, number>;
}> {
  const [formulas, rollups] = await Promise.all([
    computeItemFormulas(workItemId),
    computeItemRollups(workItemId),
  ]);
  return { formulas, rollups };
}

// 批量重算所有公式 + 聚合字段（供管理界面/手动触发）
export async function recomputeAllDerivedFields(spaceId?: string): Promise<{
  formulasCount: number;
  rollupsCount: number;
  duration: number;
}> {
  const start = Date.now();
  const where: any = { enabled: true };
  if (spaceId) where.spaceId = spaceId;

  const formulaFields = await prisma.formulaField.findMany({ where });
  const rollupFields = await prisma.rollupField.findMany({ where });

  for (const f of formulaFields) {
    await computeFormulaField(f.id);
  }
  for (const r of rollupFields) {
    await computeRollupField(r.id);
  }
  return {
    formulasCount: formulaFields.length,
    rollupsCount: rollupFields.length,
    duration: Date.now() - start,
  };
}
