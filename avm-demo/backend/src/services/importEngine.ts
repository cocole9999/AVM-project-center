/**
 * V1.17 数据导入执行器
 *
 * 资源：work_items | iterations | users | customers | car_models | projects | contacts | dependencies
 *
 * 每行数据 = 一条记录。映射 + 默认值 + 验证 + 错误收集。
 */
import { prisma } from '../db';
import crypto from 'crypto';

type ImportRow = Record<string, string>;
type ResourceHandler = (item: any) => Promise<void>;

// 通用字段别名 — 跨资源使用
export const FIELD_ALIASES: Record<string, string[]> = {
  type: ['type', '类型', '工作项类型', 'kind', '依赖类型'],
  status: ['status', '状态', '进度'],
  priority: ['priority', '优先级', '紧急程度'],
  assignee: ['assignee', '负责人', '经办人', '处理人', 'owner', 'owner'],
  reporter: ['reporter', '报告人', '创建人'],
  description: ['description', '描述', '说明', '备注'],
  estimate: ['estimate', '预估工时', '估计'],
  planStart: ['planStart', '计划开始', '开始日期', 'startDate', 'start_date'],
  planEnd: ['planEnd', '计划结束', '结束日期', 'endDate', 'end_date'],
  shortName: ['shortName', '简称', 'short_name'],
  contact: ['contact', '主联系人', '联系人'],
  phone: ['phone', '电话', '联系电话', 'mobile'],
  email: ['email', '邮箱', '邮件'],
  industry: ['industry', '行业'],
  address: ['address', '地址'],
};

// 资源特定别名 — 覆盖通用别名
// key 是资源类型, value 是 { dbField: [aliases] }
const RESOURCE_ALIASES: Record<string, Record<string, string[]>> = {
  customers: {
    name: ['name', '客户全称', '客户名称', '客户名字', '名称', '全称', '名字', 'title'],
    code: ['code', '客户编码', '客户代码', '客户编号', '编号'],
    shortName: ['shortName', '简称', '客户简称', 'short_name'],
  },
  car_models: {
    name: ['name', '车型名称', '车型名字', '名称', '全称', '名字', 'title'],
    code: ['code', '车型编码', '车型代码', '车型编号', '编号'],
    brand: ['brand', '品牌', '汽车品牌'],
    series: ['series', '系列', '车系'],
    launchYear: ['launchYear', '上市年份', '年份', 'year'],
    segment: ['segment', '细分市场', '级别', 'category'],
    platform: ['platform', '平台', '技术平台'],
  },
  projects: {
    name: ['name', '项目名称', '项目名字', '名称', '全称', 'title'],
    code: ['code', '项目编码', '项目代码', '项目编号', '编号'],
    customerCode: ['customerCode', '客户编码', '客户代码', '客户'],
    carModelCode: ['carModelCode', '车型编码', '车型代码', '车型'],
    billingType: ['billingType', '合同类型', '计费方式', '收费方式'],
    contractAmount: ['contractAmount', '合同金额', '合同金额(元)', '金额', '合同额'],
    budgetHours: ['budgetHours', '预算工时', '预算'],
    consumedHours: ['consumedHours', '已用工时', '已用'],
    progress: ['progress', '进度', '进度(0-100)'],
    risk: ['risk', '风险等级', '风险'],
  },
  work_items: {
    type: ['type', '类型', '工作项类型', 'kind'],
    title: ['title', '标题', '主题', '工作项标题', '任务标题', '需求标题', 'summary'],
    status: ['status', '状态', '进度'],
    priority: ['priority', '优先级', '紧急程度', '等级'],
    assignee: ['assignee', '负责人', '经办人', '处理人', 'owner'],
    reporter: ['reporter', '报告人', '创建人'],
  },
  contacts: {
    name: ['name', '姓名', '联系人姓名', '名字', '全称'],
    customerCode: ['customerCode', '客户编码', '客户', '所属客户'],
    role: ['role', '角色', '职务', '职位'],
    department: ['department', '部门'],
    feishuId: ['feishuId', '飞书ID', '飞书', 'feishu_id'],
    primary: ['primary', '是否主联系人', '主联系人'],
  },
  dependencies: {
    name: ['name', '依赖名称', '名称', '标题', 'title', '全称'],
    type: ['type', '类型', '依赖类型'],
    owner: ['owner', '负责人', '经办人', '处理人', 'assignee'],
    expectedDate: ['expectedDate', '预计日期', '预期', '日期', 'date'],
    blocker: ['blocker', '卡点', '阻塞原因'],
    workItemKey: ['workItemKey', '关联工作项', '工作项'],
    projectCode: ['projectCode', '关联项目', '项目'],
  },
  users: {
    username: ['username', '用户名', '账号', 'login'],
    displayName: ['displayName', '显示名', '姓名', '名字', 'realName', 'name'],
    password: ['password', '初始密码', '密码', 'pwd'],
    email: ['email', '邮箱', '邮件'],
    department: ['department', '部门'],
    role: ['role', '角色'],
  },
};

/**
 * 智能猜测字段映射 (CSV 列名 → 数据库字段)
 * @param csvColumns CSV 列名数组
 * @param resource 资源类型 (用于选择资源特定别名)
 */
export function autoMap(csvColumns: string[], resource?: string): { csvColumn: string; dbField: string }[] {
  const out: { csvColumn: string; dbField: string }[] = [];
  const usedFields = new Set<string>();
  // 合并资源特定 + 通用别名
  const aliasesByField: Record<string, string[]> = { ...FIELD_ALIASES };
  if (resource && RESOURCE_ALIASES[resource]) {
    for (const [field, aliases] of Object.entries(RESOURCE_ALIASES[resource])) {
      aliasesByField[field] = [...aliases, ...(aliasesByField[field] || []).filter(a => !aliases.includes(a))];
    }
  }
  for (const col of csvColumns) {
    const colLower = col.toLowerCase().trim();
    // 1) 精确匹配
    let matched: string | null = null;
    for (const [field, aliases] of Object.entries(aliasesByField)) {
      if (usedFields.has(field)) continue;
      for (const a of aliases) {
        if (a.toLowerCase() === colLower) { matched = field; break; }
      }
      if (matched) break;
    }
    // 2) 包含匹配: 收集所有候选, 按 alias 长度降序, 选最长
    if (!matched) {
      const candidates: { field: string; score: number }[] = [];
      for (const [field, aliases] of Object.entries(aliasesByField)) {
        if (usedFields.has(field)) continue;
        for (const a of aliases) {
          const aLower = a.toLowerCase();
          if (colLower.includes(aLower) || aLower.includes(colLower)) {
            const score = Math.max(colLower.length, aLower.length);
            candidates.push({ field, score });
            break;
          }
        }
      }
      if (candidates.length > 0) {
        candidates.sort((x, y) => y.score - x.score);
        matched = candidates[0].field;
      }
    }
    if (matched) {
      out.push({ csvColumn: col, dbField: matched });
      usedFields.add(matched);
    } else {
      out.push({ csvColumn: col, dbField: '' });
    }
  }
  return out;
}

/**
 * 资源字段列表 (用于前端下拉选择)
 */
export const RESOURCE_FIELDS: Record<string, { value: string; label: string; required?: boolean; hint?: string }[]> = {
  customers: [
    { value: 'name', label: '客户全称', required: true, hint: '如 吉利银河 L7 项目组' },
    { value: 'code', label: '客户编码', required: true, hint: '唯一, 如 GEELY-GALAXY-L7' },
    { value: 'shortName', label: '简称' },
    { value: 'type', label: '类型', hint: 'internal/external' },
    { value: 'industry', label: '行业' },
    { value: 'contact', label: '主联系人' },
    { value: 'phone', label: '电话' },
    { value: 'email', label: '邮箱' },
    { value: 'address', label: '地址' },
    { value: 'description', label: '描述' },
  ],
  car_models: [
    { value: 'name', label: '车型名称', required: true },
    { value: 'code', label: '车型编码', required: true, hint: '唯一' },
    { value: 'brand', label: '品牌', required: true, hint: '吉利银河/极氪/领克/博越/熊猫mini' },
    { value: 'series', label: '系列' },
    { value: 'launchYear', label: '上市年份' },
    { value: 'segment', label: '细分市场', hint: 'SUV/轿车/MPV' },
    { value: 'platform', label: '平台', hint: 'SEA/CMA/SPA' },
    { value: 'description', label: '描述' },
  ],
  projects: [
    { value: 'name', label: '项目名称', required: true },
    { value: 'code', label: '项目编码', required: true, hint: '唯一, 如 AVM-GALAXY-L7-2026' },
    { value: 'customerCode', label: '客户编码', required: true, hint: '对应客户的 code' },
    { value: 'carModelCode', label: '车型编码', required: true, hint: '对应车型的 code' },
    { value: 'status', label: '状态', hint: 'planning/in_progress/completed/on_hold' },
    { value: 'billingType', label: '合同类型', hint: 'ODC/ODM/FIXED' },
    { value: 'contractAmount', label: '合同金额 (元)' },
    { value: 'budgetHours', label: '预算工时' },
    { value: 'consumedHours', label: '已用工时' },
    { value: 'progress', label: '进度 (0-100)' },
    { value: 'risk', label: '风险等级', hint: 'low/medium/high' },
    { value: 'startDate', label: '开始日期', hint: 'YYYY-MM-DD' },
    { value: 'endDate', label: '结束日期' },
    { value: 'description', label: '描述' },
  ],
  work_items: [
    { value: 'type', label: '类型', required: true, hint: 'requirement/task/bug/release' },
    { value: 'title', label: '标题', required: true },
    { value: 'status', label: '状态' },
    { value: 'priority', label: '优先级', hint: 'P0/P1/P2/P3' },
    { value: 'assignee', label: '负责人' },
    { value: 'reporter', label: '报告人' },
    { value: 'description', label: '描述' },
    { value: 'estimate', label: '预估工时' },
    { value: 'planStart', label: '计划开始' },
    { value: 'planEnd', label: '计划结束' },
    { value: 'projectCode', label: '关联项目编码' },
  ],
  contacts: [
    { value: 'name', label: '姓名', required: true },
    { value: 'customerCode', label: '客户编码', required: true },
    { value: 'role', label: '角色', hint: 'UPL/PPM/测试/开发/AVM接口人' },
    { value: 'department', label: '部门' },
    { value: 'phone', label: '电话' },
    { value: 'email', label: '邮箱' },
    { value: 'feishuId', label: '飞书 ID' },
    { value: 'primary', label: '是否主联系人' },
  ],
  dependencies: [
    { value: 'name', label: '依赖名称', required: true },
    { value: 'type', label: '类型', required: true, hint: '台架/实车/车模/SDB/UE/UI/标定/其他' },
    { value: 'status', label: '状态', hint: 'pending/preparing/ready/blocked/cancelled' },
    { value: 'owner', label: '负责人' },
    { value: 'expectedDate', label: '预计日期' },
    { value: 'blocker', label: '卡点' },
    { value: 'workItemKey', label: '关联工作项' },
    { value: 'projectCode', label: '关联项目' },
    { value: 'description', label: '描述' },
  ],
  users: [
    { value: 'username', label: '用户名', required: true },
    { value: 'displayName', label: '显示名', required: true },
    { value: 'password', label: '初始密码', required: true, hint: '至少 6 位' },
    { value: 'email', label: '邮箱' },
    { value: 'department', label: '部门' },
    { value: 'role', label: '角色', hint: 'member/space_admin/tenant_admin' },
  ],
};

/**
 * CSV 模板生成
 */
export function generateTemplate(resource: string): string {
  const fields = RESOURCE_FIELDS[resource];
  if (!fields) throw new Error(`unknown resource: ${resource}`);
  const header = fields.map(f => f.label).join(',');
  // 一行示例
  const sample: Record<string, string> = {
    customers: '吉利银河 L7 项目组,GEELY-GALAXY-L7,银河L7,internal,汽车主机厂,张三,13800001111,zs@example.com,杭州,AVM 集成',
    car_models: '银河 L7,GEELY-GALAXY-L7-CARMODEL,吉利银河,Galaxy,2026,SUV,SEA,新车上市',
    projects: '银河 L7 AVM 集成,AVM-GALAXY-L7-2026,GEELY-GALAXY-L7,GEELY-GALAXY-L7-CARMODEL,planning,ODC,5000000,2000,500,0,low,2026-01-01,2026-12-31,首版 AVM 集成',
    work_items: 'requirement,实现 AVM 透明底盘功能,,P1,张三,系统管理员,首版 2.5 透明底盘,80,2026-08-01,2026-09-30,AVM-GALAXY-L7-2026',
    contacts: '李四,GEELY-GALAXY-L7,UPL,AVM 中台,13800002222,lisi@example.com,lisi123,true',
    dependencies: '银河 L7 透明底盘台架,台架,preparing,王五,2026-08-30,,TASK-1,AVM-GALAXY-L7-2026,4 颗广角 camera 标定',
    users: 'newuser,新同事,init123,new@example.com,研发三组,member',
  };
  return header + '\n' + (sample[resource] || fields.map(() => '').join(',')) + '\n';
}

const handlers: Record<string, ResourceHandler> = {
  customers: async (item) => {
    if (!item.name || !item.code) throw new Error('name 和 code 必填');
    const exist = await prisma.customer.findUnique({ where: { code: item.code } });
    if (exist) throw new Error(`客户编码 ${item.code} 已存在`);
    await prisma.customer.create({ data: item });
  },
  car_models: async (item) => {
    if (!item.name || !item.code || !item.brand) throw new Error('name/code/brand 必填');
    const exist = await prisma.carModel.findUnique({ where: { code: item.code } });
    if (exist) throw new Error(`车型编码 ${item.code} 已存在`);
    if (item.launchYear !== undefined && item.launchYear !== '') {
      const y = parseInt(String(item.launchYear), 10);
      if (!isNaN(y)) item.launchYear = y;
      else delete item.launchYear;
    }
    await prisma.carModel.create({ data: item });
  },
  projects: async (item) => {
    if (!item.name || !item.code) throw new Error('name 和 code 必填');
    if (!item.customerCode || !item.carModelCode) throw new Error('customerCode 和 carModelCode 必填');
    // 解析 customerCode → customerId
    const c = await prisma.customer.findUnique({ where: { code: item.customerCode } });
    if (!c) throw new Error(`客户编码 ${item.customerCode} 不存在`);
    const m = await prisma.carModel.findUnique({ where: { code: item.carModelCode } });
    if (!m) throw new Error(`车型编码 ${item.carModelCode} 不存在`);
    item.customerId = c.id;
    item.carModelId = m.id;
    delete item.customerCode;
    delete item.carModelCode;
    if (!item.status) item.status = 'planning';
    if (!item.billingType) item.billingType = 'ODC';
    if (!item.risk) item.risk = 'low';
    if (!item.progress) item.progress = 0;
    for (const f of ['contractAmount', 'budgetHours', 'consumedHours']) {
      if (item[f] !== undefined) item[f] = Number(item[f]) || 0;
    }
    for (const f of ['startDate', 'endDate']) {
      if (item[f]) {
        const d = new Date(item[f]);
        if (!isNaN(d.getTime())) item[f] = d;
        else throw new Error(`${f} 格式错误: ${item[f]}`);
      } else {
        throw new Error(`${f} 必填`);
      }
    }
    // 必填
    if (!item.startDate || !item.endDate) throw new Error('startDate / endDate 必填');
    const exist = await prisma.project.findUnique({ where: { code: item.code } });
    if (exist) throw new Error(`项目编码 ${item.code} 已存在`);
    await prisma.project.create({ data: item });
  },
  work_items: async (item) => {
    if (!item.type || !item.title) throw new Error('type 和 title 必填');
    const validTypes = ['requirement', 'task', 'bug', 'release'];
    if (!validTypes.includes(item.type)) throw new Error(`type 必须是 ${validTypes.join('/')}`);
    const count = await prisma.workItem.count({ where: { type: item.type } });
    const prefix = { requirement: 'REQ', task: 'TASK', bug: 'BUG', release: 'REL' }[item.type];
    // 解析 projectCode → projectId
    if (item.projectCode) {
      const p = await prisma.project.findUnique({ where: { code: item.projectCode } });
      if (p) item.projectId = p.id;
      delete item.projectCode;
    }
    for (const f of ['planStart', 'planEnd', 'actualStart', 'actualEnd']) {
      if (item[f]) {
        const d = new Date(item[f]);
        if (!isNaN(d.getTime())) item[f] = d;
        else delete item[f];
      }
    }
    for (const f of ['estimate', 'actualHours', 'storyPoints']) {
      if (item[f] !== undefined && item[f] !== '') item[f] = Number(item[f]);
    }
    item.key = item.key || `${prefix}-${count + 1}`;
    if (!item.status) item.status = '待领取';
    if (!item.priority) item.priority = 'P2';
    if (!item.reporter) item.reporter = '系统';
    await prisma.workItem.create({ data: item });
  },
  contacts: async (item) => {
    if (!item.name || !item.customerCode) throw new Error('name 和 customerCode 必填');
    const c = await prisma.customer.findUnique({ where: { code: item.customerCode } });
    if (!c) throw new Error(`客户编码 ${item.customerCode} 不存在`);
    item.customerId = c.id;
    delete item.customerCode;
    if (item.primary !== undefined) item.primary = ['true', '1', 'yes', '是'].includes(String(item.primary).toLowerCase());
    await prisma.contact.create({ data: item });
  },
  dependencies: async (item) => {
    if (!item.name || !item.type) throw new Error('name 和 type 必填');
    const validTypes = ['台架', '实车', '车模', 'SDB', 'UE', 'UI', '标定', '其他'];
    if (!validTypes.includes(item.type)) throw new Error(`type 必须是 ${validTypes.join('/')}`);
    // 别名把 负责人 映射到 assignee, 但 schema 字段是 owner
    if (item.assignee && !item.owner) item.owner = item.assignee;
    delete item.assignee;
    if (item.workItemKey) {
      const w = await prisma.workItem.findUnique({ where: { key: item.workItemKey } });
      if (w) item.workItemId = w.id;
      delete item.workItemKey;
    }
    if (item.projectCode) {
      const p = await prisma.project.findUnique({ where: { code: item.projectCode } });
      if (p) item.projectId = p.id;
      delete item.projectCode;
    }
    if (item.expectedDate) {
      const d = new Date(item.expectedDate);
      if (!isNaN(d.getTime())) item.expectedDate = d;
      else delete item.expectedDate;
    }
    if (!item.status) item.status = 'pending';
    await prisma.externalDependency.create({ data: item });
  },
  users: async (item) => {
    if (!item.username || !item.displayName || !item.password) throw new Error('username/displayName/password 必填');
    if (String(item.password).length < 6) throw new Error('password 至少 6 位');
    item.password = crypto.createHash('sha256').update(item.password + 'avm-salt').digest('hex');
    item.role = item.role || 'member';
    item.active = true;
    await prisma.user.create({ data: item });
  },
  iterations: async (item) => {
    if (!item.name || !item.startDate || !item.endDate) throw new Error('name/startDate/endDate 必填');
    item.startDate = new Date(item.startDate);
    item.endDate = new Date(item.endDate);
    await prisma.iteration.create({ data: item });
  },
};

/**
 * 实际执行导入 (V1.17: 全资源支持 + 进度回调)
 */
export async function processImport(jobId: string, data: ImportRow[], opts: { mapping?: any[]; resource?: string } = {}): Promise<{
  total: number; succeeded: number; failed: number; errors: any[];
}> {
  const job = await prisma.importJob.findUnique({ where: { id: jobId } });
  if (!job) throw new Error('Job not found');

  // 用 opts 的 mapping/resource 覆盖 (允许 V1.17 直接传不写 db)
  const resource = opts.resource || job.resource;
  const mapping: { csvColumn: string; dbField: string }[] = opts.mapping || JSON.parse(job.mapping || '[]');
  const defaults = JSON.parse(job.defaults || '{}');

  await prisma.importJob.update({
    where: { id: jobId },
    data: { status: 'processing', total: data.length, processed: 0, succeeded: 0, failed: 0, errors: '[]' },
  });

  const errors: any[] = [];
  let succeeded = 0;
  let failed = 0;
  const handler = handlers[resource];
  if (!handler) {
    throw new Error(`unsupported resource: ${resource}`);
  }

  for (let i = 0; i < data.length; i++) {
    const row = data[i];
    try {
      const item: any = { ...defaults };
      for (const m of mapping) {
        if (m.dbField && row[m.csvColumn] !== undefined && row[m.csvColumn] !== '') {
          item[m.dbField] = row[m.csvColumn];
        }
      }
      await handler(item);
      succeeded++;
    } catch (e: any) {
      failed++;
      errors.push({ row: i, data: row, error: e.message });
    }
    if (i % 10 === 0 || i === data.length - 1) {
      await prisma.importJob.update({
        where: { id: jobId },
        data: { processed: i + 1, succeeded, failed, errors: JSON.stringify(errors.slice(-20)) },
      });
    }
  }

  await prisma.importJob.update({
    where: { id: jobId },
    data: { status: 'done', succeeded, failed, errors: JSON.stringify(errors), finishedAt: new Date() },
  });

  return { total: data.length, succeeded, failed, errors };
}
