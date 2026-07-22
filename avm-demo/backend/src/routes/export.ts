/**
 * 数据导出路由 - Excel/CSV
 * GET /api/export/work-items?format=xlsx&type=requirement&status=...
 * GET /api/export/projects?format=xlsx
 * GET /api/export/customers?format=xlsx
 * GET /api/export/car-models?format=xlsx
 * 支持 format=xlsx | csv
 */
import { Router } from 'express';
import * as XLSX from 'xlsx';
import { prisma } from '../db';

export const exportRouter = Router();

function parseFormat(q: any): 'xlsx' | 'csv' {
  return q.format === 'csv' ? 'csv' : 'xlsx';
}

function parseBool(v: any): boolean | undefined {
  if (v === undefined) return undefined;
  return v === 'true' || v === '1' || v === true;
}

function sendFile(res: any, filename: string, format: 'xlsx' | 'csv', rows: any[]) {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');

  if (format === 'xlsx') {
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}.xlsx"`);
    res.send(buf);
  } else {
    const csv = XLSX.utils.sheet_to_csv(ws);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}.csv"`);
    // 加 BOM 让 Excel 识别 UTF-8
    res.send('\ufeff' + csv);
  }
}

/**
 * 导出工作项
 * 支持过滤: type, status, priority, projectCode, customerCode, assignee, keyword
 */
exportRouter.get('/work-items', async (req, res) => {
  try {
    const format = parseFormat(req.query);
    const where: any = {};
    if (req.query.type) where.type = req.query.type;
    if (req.query.status) where.status = req.query.status;
    if (req.query.priority) where.priority = req.query.priority;
    if (req.query.assignee) where.assignee = req.query.assignee;
    if (req.query.projectCode) {
      const p = await prisma.project.findUnique({ where: { code: req.query.projectCode as string } });
      if (p) where.projectId = p.id;
    }
    if (req.query.customerCode) {
      const c = await prisma.customer.findUnique({ where: { code: req.query.customerCode as string } });
      if (c) where.customerId = c.id;
    }
    if (req.query.keyword) {
      where.OR = [
        { title: { contains: req.query.keyword as string } },
        { key: { contains: req.query.keyword as string } },
      ];
    }
    const items = await prisma.workItem.findMany({
      where,
      include: {
        project: { select: { code: true, name: true } },
        customer: { select: { code: true, name: true } },
        carModel: { select: { code: true, name: true, brand: true } },
        iteration: { select: { name: true } },
      },
      orderBy: [{ type: 'asc' }, { key: 'asc' }],
    });

    const rows = items.map(i => ({
      '编号': i.key,
      '类型': i.type,
      '标题': i.title,
      '状态': i.status,
      '优先级': i.priority,
      '严重度': i.severity || '',
      '负责人': i.assignee || '',
      '报告人': i.reporter,
      '模块': i.module || '',
      '标签': i.labels || '',
      '项目': i.project ? `${i.project.code} ${i.project.name}` : '',
      '客户': i.customer ? i.customer.name : '',
      '车型': i.carModel ? `${i.carModel.brand} ${i.carModel.name}` : '',
      '迭代': i.iteration?.name || '',
      '估分(SP)': i.estimate ?? '',
      '实际工时(h)': i.actualHours ?? '',
      '计划开始': i.planStart ? new Date(i.planStart).toISOString().slice(0, 10) : '',
      '计划结束': i.planEnd ? new Date(i.planEnd).toISOString().slice(0, 10) : '',
      '实际开始': i.actualStart ? new Date(i.actualStart).toISOString().slice(0, 10) : '',
      '实际结束': i.actualEnd ? new Date(i.actualEnd).toISOString().slice(0, 10) : '',
      '创建时间': new Date(i.createdAt).toISOString().slice(0, 19).replace('T', ' '),
      '描述': (i.description || '').slice(0, 500),
    }));

    const filename = `work-items-${new Date().toISOString().slice(0, 10)}`;
    sendFile(res, filename, format, rows);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * 导出项目
 */
exportRouter.get('/projects', async (req, res) => {
  try {
    const format = parseFormat(req.query);
    const items = await prisma.project.findMany({
      include: {
        customer: { select: { code: true, name: true } },
        carModel: { select: { code: true, name: true, brand: true } },
        _count: { select: { workItems: true } },
      },
      orderBy: { code: 'asc' },
    });

    const rows = items.map(p => ({
      '项目编号': p.code,
      '项目名称': p.name,
      '客户': p.customer ? `${p.customer.code} ${p.customer.name}` : '',
      '车型': p.carModel ? `${p.carModel.brand} ${p.carModel.name}` : '',
      '状态': p.status,
      '风险': p.risk,
      '进度(%)': p.progress,
      'PM': p.pmUserName || '',
      '计费方式': p.billingType,
      '合同额(元)': p.contractAmount,
      '合同额(万)': p.contractAmount ? (p.contractAmount / 10000).toFixed(2) : '',
      '预算工时': p.budgetHours,
      '已用工时': p.consumedHours,
      '工时使用率(%)': p.budgetHours ? ((p.consumedHours / p.budgetHours) * 100).toFixed(1) : '',
      '开始日期': new Date(p.startDate).toISOString().slice(0, 10),
      '结束日期': new Date(p.endDate).toISOString().slice(0, 10),
      '工作项数': p._count.workItems,
      '标签': p.tags,
      '描述': (p.description || '').slice(0, 500),
      '创建时间': new Date(p.createdAt).toISOString().slice(0, 19).replace('T', ' '),
    }));

    const filename = `projects-${new Date().toISOString().slice(0, 10)}`;
    sendFile(res, filename, format, rows);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * 导出客户
 */
exportRouter.get('/customers', async (req, res) => {
  try {
    const format = parseFormat(req.query);
    const items = await prisma.customer.findMany({
      include: {
        _count: { select: { contacts: true, projects: true } },
      },
      orderBy: { code: 'asc' },
    });

    const rows = items.map(c => ({
      '客户编号': c.code,
      '客户名称': c.name,
      '简称': c.shortName,
      '类型': c.type,
      '行业': c.industry,
      '主联系人': c.contact,
      '电话': c.phone,
      '邮箱': c.email,
      '地址': c.address,
      '状态': c.status,
      '联系人数量': c._count.contacts,
      '项目数量': c._count.projects,
      '描述': (c.description || '').slice(0, 500),
      '创建时间': new Date(c.createdAt).toISOString().slice(0, 19).replace('T', ' '),
    }));

    const filename = `customers-${new Date().toISOString().slice(0, 10)}`;
    sendFile(res, filename, format, rows);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * 导出车型
 */
exportRouter.get('/car-models', async (req, res) => {
  try {
    const format = parseFormat(req.query);
    const items = await prisma.carModel.findMany({
      include: {
        _count: { select: { projects: true, workItems: true } },
      },
      orderBy: { code: 'asc' },
    });

    const rows = items.map(m => ({
      '车型编号': m.code,
      '车型名称': m.name,
      '品牌': m.brand,
      '系列': m.series,
      '上市年份': m.launchYear,
      '细分市场': m.segment,
      '平台': m.platform,
      '状态': m.status,
      '关联项目数': m._count.projects,
      '工作项数': m._count.workItems,
      '描述': (m.description || '').slice(0, 500),
    }));

    const filename = `car-models-${new Date().toISOString().slice(0, 10)}`;
    sendFile(res, filename, format, rows);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * 导出风险预警（最近 30 天）
 */
exportRouter.get('/risks', async (_req, res) => {
  try {
    const format = parseFormat(_req.query);
    const since = new Date(Date.now() - 30 * 86400000);
    const items = await prisma.project.findMany({
      where: { status: { notIn: ['completed', 'cancelled'] } },
      include: {
        customer: { select: { name: true } },
        carModel: { select: { name: true } },
      },
      orderBy: [{ risk: 'desc' }, { contractAmount: 'desc' }],
    });

    const today = new Date();
    const rows = items.map(p => {
      const daysLeft = Math.ceil((new Date(p.endDate).getTime() - today.getTime()) / 86400000);
      const issues: string[] = [];
      if (p.risk === 'high') issues.push('高风险');
      if (daysLeft < 0) issues.push(`超期 ${-daysLeft} 天`);
      else if (daysLeft < 30 && p.progress < 50) issues.push(`剩余 ${daysLeft} 天但进度仅 ${p.progress}%`);
      if (p.budgetHours > 0 && p.consumedHours > p.budgetHours * 1.1) {
        issues.push(`工时超 ${((p.consumedHours / p.budgetHours) * 100).toFixed(0)}%`);
      }
      return {
        '项目编号': p.code,
        '项目名称': p.name,
        '客户': p.customer?.name,
        '车型': p.carModel?.name,
        'PM': p.pmUserName || '',
        '风险等级': p.risk,
        '进度(%)': p.progress,
        '状态': p.status,
        '剩余天数': daysLeft,
        '合同额(万)': p.contractAmount ? (p.contractAmount / 10000).toFixed(2) : '',
        '工时使用率(%)': p.budgetHours ? ((p.consumedHours / p.budgetHours) * 100).toFixed(1) : '',
        '风险点': issues.join('; ') || '无',
        '结束日期': new Date(p.endDate).toISOString().slice(0, 10),
      };
    }).filter(r => r['风险点'] !== '无');

    const filename = `risks-${new Date().toISOString().slice(0, 10)}`;
    sendFile(res, filename, format, rows);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});
