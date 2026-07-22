/**
 * V1.17 数据导入路由
 *
 * 5 步向导 API:
 *   GET    /api/imports/resources               列出可导入的资源类型 + 字段
 *   GET    /api/imports/template/:resource    下载 CSV 模板
 *   POST   /api/imports/preview               解析文件 + 智能字段映射
 *   POST   /api/imports/execute                执行批量创建
 *   GET    /api/imports/jobs                  列出历史任务
 *   GET    /api/imports/jobs/:id              任务进度
 *   DELETE /api/imports/jobs/:id              删除任务
 */
import { Router } from 'express';
import { prisma } from '../db';
import { processImport, RESOURCE_FIELDS, autoMap, generateTemplate, FIELD_ALIASES } from '../services/importEngine';
import { requireAuth, requireRole, autoRole } from '../middleware/auth';
import { recordAudit, actorFromReq } from '../utils/audit';
import multer from 'multer';
import * as XLSX from 'xlsx';

export const importRouter = Router();

importRouter.use(requireAuth);

// multer 内存模式 (不上传文件到磁盘)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB
});

/** 列出可导入的资源 + 字段 */
importRouter.get('/resources', (req, res) => {
  const resources = Object.entries(RESOURCE_FIELDS).map(([key, fields]) => ({
    key,
    label: RESOURCE_LABEL[key] || key,
    fields: fields.map(f => ({ value: f.value, label: f.label, required: !!f.required, hint: f.hint })),
  }));
  res.json({ resources, aliases: FIELD_ALIASES });
});

const RESOURCE_LABEL: Record<string, string> = {
  customers: '客户',
  car_models: '车型',
  projects: '项目',
  work_items: '工作项',
  contacts: '联系人',
  dependencies: '外部依赖',
  users: '用户',
  iterations: '迭代',
};

/** 下载 CSV 模板 */
importRouter.get('/template/:resource', (req, res) => {
  try {
    const csv = generateTemplate(req.params.resource);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${req.params.resource}_template.csv"`);
    // 加 BOM 让 Excel 正确识别 UTF-8
    res.write('\uFEFF');
    res.end(csv);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

/**
 * 解析文件 + 智能字段映射
 * 接收 multipart/form-data (file 字段) 或 JSON { csvText, resource }
 * 返回: { columns, rows, mapping, total, resource }
 */
importRouter.post('/preview', upload.single('file'), async (req: any, res) => {
  try {
    const resource = req.body?.resource || req.query?.resource as string;
    if (!resource) return res.status(400).json({ error: 'resource required' });
    if (!RESOURCE_FIELDS[resource]) return res.status(400).json({ error: `unknown resource: ${resource}` });

    let rows: any[] = [];
    let columns: string[] = [];

    // multipart 上传
    if (req.file) {
      const buf = req.file.buffer;
      const fname = (req.file.originalname || '').toLowerCase();
      if (fname.endsWith('.csv') || req.file.mimetype === 'text/csv') {
        const text = buf.toString('utf-8').replace(/^\uFEFF/, '');
        rows = parseCSV(text);
      } else {
        // xlsx / xls 用 xlsx 库解析
        const wb = XLSX.read(buf, { type: 'buffer' });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
      }
    } else if (req.body?.csvText) {
      // JSON 模式 (前端 parse 后传)
      rows = parseCSV(req.body.csvText);
    } else {
      return res.status(400).json({ error: 'file 或 csvText 必填' });
    }

    if (rows.length === 0) {
      return res.json({ columns: [], rows: [], mapping: [], total: 0, resource });
    }
    columns = Object.keys(rows[0]);
    const mapping = autoMap(columns, resource);
    res.json({
      columns,
      rows: rows.slice(0, 50),   // 预览前 50 行
      total: rows.length,
      mapping,
      resource,
      fileName: req.file?.originalname || 'pasted.csv',
    });
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

/**
 * 执行批量导入
 * body: { resource, mapping, data, name?, fileName? }
 *   - data: 完整行数据 (前端拿到 preview 后可编辑)
 *   - mapping: [{ csvColumn, dbField }]  (与 preview 一致)
 */
importRouter.post('/execute', async (req, res) => {
  try {
    const { resource, mapping, data, name, fileName, defaults } = req.body;
    if (!resource || !Array.isArray(data)) {
      return res.status(400).json({ error: 'resource 和 data 必填' });
    }
    if (!RESOURCE_FIELDS[resource]) return res.status(400).json({ error: `unknown resource: ${resource}` });
    if (data.length === 0) return res.status(400).json({ error: 'data 为空' });
    if (data.length > 10000) return res.status(400).json({ error: '单次最多 10000 行, 请分批导入' });

    // 创建 job
    const job = await prisma.importJob.create({
      data: {
        spaceId: req.body.spaceId || null,
        name: name || `${RESOURCE_LABEL[resource]}导入 ${new Date().toLocaleString('zh-CN')}`,
        resource,
        fileName: fileName || 'inline.csv',
        mapping: typeof mapping === 'string' ? mapping : JSON.stringify(mapping || []),
        defaults: typeof defaults === 'string' ? defaults : JSON.stringify(defaults || {}),
        createdBy: actorFromReq(req)?.username || 'system',
        status: 'pending',
        total: data.length,
      },
    });
    recordAudit('import', job.id, 'import', null, { method: 'POST', summary: `导入任务 ${job.name} (${data.length} 行)` }, actorFromReq(req));

    // 同步执行 (V1.x 演示版; 生产可放队列)
    const result = await processImport(job.id, data, { resource, mapping });
    res.status(201).json({ job, result });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

/** 列出导入任务 */
importRouter.get('/jobs', async (req, res) => {
  try {
    const { spaceId, status, limit = '20' } = req.query as Record<string, string | undefined>;
    const where: any = {};
    if (spaceId) where.spaceId = spaceId;
    if (status) where.status = status;
    const list = await prisma.importJob.findMany({
      where, orderBy: { createdAt: 'desc' },
      take: Math.min(Number(limit) || 20, 100),
    });
    res.json(list);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

importRouter.get('/jobs/:id', async (req, res) => {
  const job = await prisma.importJob.findUnique({ where: { id: req.params.id } });
  if (!job) return res.status(404).json({ error: 'Not found' });
  res.json(job);
});

importRouter.delete('/jobs/:id', requireRole && (requireRole as any)('space_admin', 'tenant_admin') || autoRole(), async (req, res) => {
  try {
    await prisma.importJob.delete({ where: { id: req.params.id } });
    res.status(204).end();
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

/** 兼容旧 parse-csv */
importRouter.post('/parse-csv', (req, res) => {
  try {
    const { csv } = req.body;
    if (!csv) return res.status(400).json({ error: 'csv required' });
    const rows = parseCSV(csv);
    res.json({ rows: rows.slice(0, 100), total: rows.length, columns: rows[0] ? Object.keys(rows[0]) : [] });
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

function parseCSV(csv: string): any[] {
  const lines = csv.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return [];
  const headers = parseCSVLine(lines[0]);
  return lines.slice(1).map(line => {
    const values = parseCSVLine(line);
    const row: any = {};
    headers.forEach((h, i) => row[h.trim()] = (values[i] || '').trim());
    return row;
  });
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (inQuote && line[i + 1] === '"') { current += '"'; i++; }
      else inQuote = !inQuote;
    } else if (c === ',' && !inQuote) {
      result.push(current);
      current = '';
    } else {
      current += c;
    }
  }
  result.push(current);
  return result;
}
