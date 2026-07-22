import { Router } from 'express';
import { prisma } from '../db';

export const chartRouter = Router();

// 列出图表
chartRouter.get('/', async (req, res) => {
  const { dashboardId } = req.query;
  const where: any = {};
  if (dashboardId) where.dashboardId = String(dashboardId);
  const list = await prisma.chartConfig.findMany({
    where,
    orderBy: { position: 'asc' },
  });
  res.json(list);
});

// 获取图表
chartRouter.get('/:id', async (req, res) => {
  const c = await prisma.chartConfig.findUnique({ where: { id: req.params.id } });
  if (!c) return res.status(404).json({ error: 'Chart not found' });
  res.json(c);
});

// 创建图表
chartRouter.post('/', async (req, res) => {
  try {
    const c = await prisma.chartConfig.create({ data: req.body });
    res.status(201).json(c);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

chartRouter.patch('/:id', async (req, res) => {
  try {
    const c = await prisma.chartConfig.update({ where: { id: req.params.id }, data: req.body });
    res.json(c);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

chartRouter.delete('/:id', async (req, res) => {
  await prisma.chartConfig.delete({ where: { id: req.params.id } });
  res.status(204).end();
});

// 计算图表数据（按维度 + 指标聚合）
chartRouter.post('/:id/compute', async (req, res) => {
  try {
    const chart = await prisma.chartConfig.findUnique({ where: { id: req.params.id } });
    if (!chart) return res.status(404).json({ error: 'Chart not found' });
    const data = await computeChartData(chart, req.body.filters);
    res.json(data);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

// 直接根据配置计算（不持久化）
chartRouter.post('/preview', async (req, res) => {
  try {
    // preview 传入的是原始配置对象，需要将数组字段先序列化再让 computeChartData 解析
    const chart = {
      ...req.body,
      dimensions: typeof req.body.dimensions === 'string' ? req.body.dimensions : JSON.stringify(req.body.dimensions || []),
      measures: typeof req.body.measures === 'string' ? req.body.measures : JSON.stringify(req.body.measures || []),
      filters: typeof req.body.filters === 'string' ? req.body.filters : JSON.stringify(req.body.filters || []),
      options: typeof req.body.options === 'string' ? req.body.options : JSON.stringify(req.body.options || {}),
    };
    const data = await computeChartData(chart);
    res.json(data);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

// ========== 图表计算引擎 ==========

async function computeChartData(chart: any, extraFilters: any[] = []) {
  const dimensions = JSON.parse(chart.dimensions || '[]');
  const measures = JSON.parse(chart.measures || '[]');
  const filters = [...(JSON.parse(chart.filters || '[]')), ...extraFilters];
  const source = chart.source || 'work_items';

  let records: any[] = [];
  if (source === 'work_items') {
    records = await prisma.workItem.findMany();
  } else if (source === 'activities') {
    records = await prisma.activity.findMany();
  } else if (source === 'comments') {
    records = await prisma.comment.findMany();
  }

  // 应用筛选
  records = applyFilters(records, filters);

  // 分组聚合
  const groups = new Map<string, any[]>();
  for (const r of records) {
    const key = dimensions.map((d: any) => String((r as any)[d.field] ?? '空')).join('|');
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(r);
  }

  // 计算指标
  const result: any[] = [];
  for (const [key, group] of groups) {
    const row: any = {};
    const keys = key.split('|');
    dimensions.forEach((d: any, i: number) => {
      row[d.alias || d.field] = keys[i];
    });
    for (const m of measures) {
      row[m.alias || m.field] = computeMeasure(group, m);
    }
    result.push(row);
  }

  // 排序（按第一个 measure 倒序）
  const firstMeasure = measures[0];
  if (firstMeasure) {
    const alias = firstMeasure.alias || firstMeasure.field;
    result.sort((a, b) => (b[alias] || 0) - (a[alias] || 0));
  }

  return {
    chart: {
      id: chart.id,
      name: chart.name,
      chartType: chart.chartType,
      options: JSON.parse(chart.options || '{}'),
    },
    dimensions,
    measures,
    rows: result,
    total: result.reduce((s, r) => {
      const m = measures[0];
      return s + (m ? Number(r[m.alias || m.field] || 0) : 1);
    }, 0),
  };
}

function applyFilters(records: any[], filters: any[]): any[] {
  return records.filter(r => {
    for (const f of filters) {
      const v = (r as any)[f.field];
      const fv = f.value;
      switch (f.op) {
        case 'eq': if (v !== fv) return false; break;
        case 'neq': if (v === fv) return false; break;
        case 'in': if (!Array.isArray(fv) || !fv.includes(v)) return false; break;
        case 'notIn': if (Array.isArray(fv) && fv.includes(v)) return false; break;
        case 'contains': if (!String(v ?? '').includes(String(fv ?? ''))) return false; break;
        case 'gt': if (!(Number(v) > Number(fv))) return false; break;
        case 'lt': if (!(Number(v) < Number(fv))) return false; break;
        case 'notNull': if (v == null || v === '') return false; break;
        case 'isNull': if (v != null && v !== '') return false; break;
      }
    }
    return true;
  });
}

function computeMeasure(group: any[], m: any): number {
  const values = group
    .map(r => (r as any)[m.field])
    .filter(v => v != null && v !== '' && !isNaN(Number(v)))
    .map(Number);
  switch (m.aggregation) {
    case 'sum': return values.reduce((s, v) => s + v, 0);
    case 'avg': return values.length ? values.reduce((s, v) => s + v, 0) / values.length : 0;
    case 'max': return values.length ? Math.max(...values) : 0;
    case 'min': return values.length ? Math.min(...values) : 0;
    case 'count': return group.length;
    case 'countDistinct': return new Set(group.map(r => (r as any)[m.field])).size;
    default: return group.length;
  }
}