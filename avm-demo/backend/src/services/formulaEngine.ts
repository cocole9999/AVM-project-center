/**
 * 公式计算引擎 V2
 * 支持：数字 / 日期 / 字符串 / 类型转换 / 统计
 * 沙箱化 DSL
 */
import { prisma } from '../db';

const PRIORITY_NUM: Record<string, number> = { P0: 4, P1: 3, P2: 2, P3: 1 };
const DONE_STATUSES = ['已完成', '已验收', '已发布', '已关闭'];
const ACTIVE_STATUSES = ['待评审', '已规划', '开发中', '进行中', '测试中', '验收中', '修复中', '待开发', '待修复', '待领取', '待处理', '自测中'];

interface FieldDef {
  fn: (item: any) => any;
  type: 'number' | 'date' | 'string' | 'boolean';
  desc: string;
}

const FIELD_REGISTRY: Record<string, FieldDef> = {
  // 数字字段
  estimate: { fn: i => i.estimate ?? 0, type: 'number', desc: '估分' },
  actualHours: { fn: i => i.actualHours ?? 0, type: 'number', desc: '实际工时' },
  storyPoints: { fn: i => i.storyPoints ?? 0, type: 'number', desc: '故事点' },
  remaining: { fn: i => Math.max(0, (i.estimate ?? 0) - (i.actualHours ?? 0)), type: 'number', desc: '剩余工时' },
  progress: { fn: i => (i.estimate && i.estimate > 0 ? Math.min(1, (i.actualHours ?? 0) / i.estimate) : 0), type: 'number', desc: '完成度（0-1）' },
  priority: { fn: i => PRIORITY_NUM[i.priority] ?? 0, type: 'number', desc: '优先级数值（P0=4）' },
  overdue: { fn: i => (i.planEnd && !DONE_STATUSES.includes(i.status) && new Date(i.planEnd) < new Date() ? 1 : 0), type: 'number', desc: '是否超期（0/1）' },
  daysLeft: { fn: i => (i.planEnd ? Math.ceil((new Date(i.planEnd).getTime() - Date.now()) / 86400000) : 0), type: 'number', desc: '剩余天数' },
  totalDays: { fn: i => (i.planStart && i.planEnd ? Math.ceil((new Date(i.planEnd).getTime() - new Date(i.planStart).getTime()) / 86400000) + 1 : 0), type: 'number', desc: '总工期' },
  daysElapsed: { fn: i => (i.planStart ? Math.max(0, Math.ceil((Date.now() - new Date(i.planStart).getTime()) / 86400000)) : 0), type: 'number', desc: '已过天数' },
  isCompleted: { fn: i => (DONE_STATUSES.includes(i.status) ? 1 : 0), type: 'number', desc: '是否完成（0/1）' },
  isActive: { fn: i => (ACTIVE_STATUSES.includes(i.status) ? 1 : 0), type: 'number', desc: '是否进行中（0/1）' },
  commentCount: { fn: i => i._count?.comments ?? 0, type: 'number', desc: '评论数' },
  childCount: { fn: i => i._count?.children ?? 0, type: 'number', desc: '子项数' },
  childDoneCount: { fn: i => (i.children?.filter((c: any) => DONE_STATUSES.includes(c.status)).length ?? 0), type: 'number', desc: '已完成子项数' },
  childOverdueCount: { fn: i => (i.children?.filter((c: any) => c.planEnd && !DONE_STATUSES.includes(c.status) && new Date(c.planEnd) < new Date()).length ?? 0), type: 'number', desc: '超期子项数' },
  childProgress: { fn: i => {
    if (!i.children || i.children.length === 0) return 0;
    const done = i.children.filter((c: any) => DONE_STATUSES.includes(c.status)).length;
    return done / i.children.length;
  }, type: 'number', desc: '子项完成度' },
  // 字符串字段
  status: { fn: i => i.status || '', type: 'string', desc: '状态' },
  priorityName: { fn: i => i.priority || '', type: 'string', desc: '优先级名' },
  type: { fn: i => i.type || '', type: 'string', desc: '工作项类型' },
  assignee: { fn: i => i.assignee || '', type: 'string', desc: '负责人' },
  module: { fn: i => i.module || '', type: 'string', desc: '所属模块' },
  labels: { fn: i => i.labels || '', type: 'string', desc: '标签' },
  title: { fn: i => i.title || '', type: 'string', desc: '标题' },
  key: { fn: i => i.key || '', type: 'string', desc: '工作项 key' },
  // 日期字段
  planStart: { fn: i => i.planStart || null, type: 'date', desc: '计划开始' },
  planEnd: { fn: i => i.planEnd || null, type: 'date', desc: '计划结束' },
  actualStart: { fn: i => i.actualStart || null, type: 'date', desc: '实际开始' },
  actualEnd: { fn: i => i.actualEnd || null, type: 'date', desc: '实际结束' },
  createdAt: { fn: i => i.createdAt || null, type: 'date', desc: '创建时间' },
};

const FIELD_LIST = Object.entries(FIELD_REGISTRY).map(([key, v]) => ({
  key, type: v.type, desc: v.desc,
}));

// 数字函数
const NUMBER_FUNCTIONS: Record<string, (args: any[]) => number> = {
  SUM: args => args.reduce((a: number, b: any) => a + (Number(b) || 0), 0),
  AVG: args => args.length ? args.reduce((a: number, b: any) => a + (Number(b) || 0), 0) / args.length : 0,
  MAX: args => args.length ? Math.max(...args.map(Number)) : 0,
  MIN: args => args.length ? Math.min(...args.map(Number)) : 0,
  ROUND: args => Math.round(Number(args[0]) || 0),
  ROUND_UP: args => Math.ceil(Number(args[0]) || 0),
  ROUND_DOWN: args => Math.floor(Number(args[0]) || 0),
  ABS: args => Math.abs(Number(args[0]) || 0),
  // IF 改为 mixed（在 parser 中处理）
  IF: args => (args[0] ? 1 : 0),
  IFNULL: args => (args[0] == null || args[0] === '' ? (Number(args[1]) || 0) : (Number(args[0]) || 0)),
  CEIL: args => Math.ceil(Number(args[0]) || 0),
  FLOOR: args => Math.floor(Number(args[0]) || 0),
  // 数字转其他
  TO_NUMBER: args => Number(args[0]) || 0,
  // 日期函数
  TODAY: () => 0, // 占位，见 DATE 函数
  NOW: () => Date.now(),
  // 字符串长度
  LEN: args => String(args[0] ?? '').length,
  // 算术辅助
  POWER: args => Math.pow(Number(args[0]) || 0, Number(args[1]) || 0),
  SQRT: args => Math.sqrt(Number(args[0]) || 0),
  MOD: args => {
    const n = Number(args[1]) || 1;
    return (Number(args[0]) || 0) % n;
  },
  // 字符串转数字比较
  CONTAINS: args => String(args[0] ?? '').includes(String(args[1] ?? '')) ? 1 : 0,
  // 边界
  CLAMP: args => {
    const v = Number(args[0]) || 0, min = Number(args[1]) || 0, max = Number(args[2]) || 0;
    return Math.max(min, Math.min(max, v));
  },
  // 状态判定
  IS_DONE: args => DONE_STATUSES.includes(String(args[0])) ? 1 : 0,
  IS_OVERDUE: args => (args[0] && !DONE_STATUSES.includes(String(args[1] || '')) ? 1 : 0),
};

// 字符串函数
const STRING_FUNCTIONS: Record<string, (args: any[]) => string> = {
  CONCAT: args => args.map(a => String(a ?? '')).join(''),
  CONCAT_WS: args => {
    const sep = String(args[0] ?? '');
    return args.slice(1).map(a => String(a ?? '')).join(sep);
  },
  UPPER: args => String(args[0] ?? '').toUpperCase(),
  LOWER: args => String(args[0] ?? '').toLowerCase(),
  TRIM: args => String(args[0] ?? '').trim(),
  LEFT: args => String(args[0] ?? '').slice(0, Number(args[1]) || 0),
  RIGHT: args => {
    const s = String(args[0] ?? '');
    const n = Number(args[1]) || 0;
    return n <= 0 ? '' : s.slice(-n);
  },
  MID: args => {
    const s = String(args[0] ?? '');
    const start = (Number(args[1]) || 1) - 1;
    const len = Number(args[2]) || 0;
    return s.slice(start, start + len);
  },
  REPLACE: args => {
    const s = String(args[0] ?? '');
    const find = String(args[1] ?? '');
    const repl = String(args[2] ?? '');
    return s.split(find).join(repl);
  },
  REPT: args => String(args[0] ?? '').repeat(Number(args[1]) || 0),
  // 数字转字符串
  TEXT: args => String(args[0] ?? ''),
  // 条件
  IFS: args => {
    // IFS(cond1, val1, cond2, val2, ..., default)
    for (let i = 0; i < args.length - 1; i += 2) {
      if (args[i]) return String(args[i + 1] ?? '');
    }
    return String(args[args.length - 1] ?? '');
  },
};

// 日期函数
const DATE_FUNCTIONS: Record<string, (args: any[]) => number | string> = {
  DAYS: args => {
    const d1 = args[0] instanceof Date ? args[0].getTime() : new Date(args[0]).getTime();
    const d2 = args[1] instanceof Date ? args[1].getTime() : new Date(args[1]).getTime();
    if (isNaN(d1) || isNaN(d2)) return 0;
    return Math.ceil((d2 - d1) / 86400000);
  },
  WORK_DAYS: args => {
    const d1 = args[0] instanceof Date ? args[0] : new Date(args[0]);
    const d2 = args[1] instanceof Date ? args[1] : new Date(args[1]);
    if (isNaN(d1.getTime()) || isNaN(d2.getTime())) return 0;
    let count = 0;
    const cur = new Date(d1);
    while (cur <= d2) {
      const dow = cur.getDay();
      if (dow !== 0 && dow !== 6) count++;
      cur.setDate(cur.getDate() + 1);
    }
    return count;
  },
  HOUR: args => {
    const d = args[0] instanceof Date ? args[0] : new Date(args[0]);
    return isNaN(d.getTime()) ? 0 : d.getHours();
  },
  DAY: args => {
    const d = args[0] instanceof Date ? args[0] : new Date(args[0]);
    return isNaN(d.getTime()) ? 0 : d.getDate();
  },
  MONTH: args => {
    const d = args[0] instanceof Date ? args[0] : new Date(args[0]);
    return isNaN(d.getTime()) ? 0 : d.getMonth() + 1;
  },
  YEAR: args => {
    const d = args[0] instanceof Date ? args[0] : new Date(args[0]);
    return isNaN(d.getTime()) ? 0 : d.getFullYear();
  },
  WEEKDAY: args => {
    const d = args[0] instanceof Date ? args[0] : new Date(args[0]);
    return isNaN(d.getTime()) ? 0 : d.getDay();
  },
  TODAY: () => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  },
  DATE_DIFF: args => {
    // DATE_DIFF(d1, d2, unit) - unit: 'day' | 'hour' | 'minute' | 'week'
    const d1 = args[0] instanceof Date ? args[0] : new Date(args[0]);
    const d2 = args[1] instanceof Date ? args[1] : new Date(args[1]);
    if (isNaN(d1.getTime()) || isNaN(d2.getTime())) return 0;
    const diff = d2.getTime() - d1.getTime();
    const unit = String(args[2] || 'day').toLowerCase();
    if (unit === 'hour') return Math.floor(diff / 3600000);
    if (unit === 'minute') return Math.floor(diff / 60000);
    if (unit === 'week') return Math.floor(diff / (86400000 * 7));
    return Math.floor(diff / 86400000);
  },
  // 把毫秒数转成 ISO 字符串（用于显示）
  DATE_FORMAT: args => {
    const d = args[0] instanceof Date ? args[0] : new Date(args[0]);
    if (isNaN(d.getTime())) return '';
    return d.toISOString().slice(0, 10);
  },
};

const ALL_FUNCTIONS = {
  ...Object.keys(NUMBER_FUNCTIONS).reduce((acc, k) => ({ ...acc, [k]: 'number' }), {} as any),
  ...Object.keys(STRING_FUNCTIONS).reduce((acc, k) => ({ ...acc, [k]: 'string' }), {} as any),
  ...Object.keys(DATE_FUNCTIONS).reduce((acc, k) => ({ ...acc, [k]: 'date' }), {} as any),
};

// ============== Tokenizer ==============
type Token = { type: 'num' | 'str' | 'ident' | 'op' | 'lparen' | 'rparen' | 'comma'; value: any };

function tokenize(formula: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < formula.length) {
    const c = formula[i];
    if (/\s/.test(c)) { i++; continue; }
    if (/[0-9.]/.test(c)) {
      let j = i;
      while (j < formula.length && /[0-9.]/.test(formula[j])) j++;
      tokens.push({ type: 'num', value: Number(formula.slice(i, j)) });
      i = j;
    } else if (c === '"' || c === "'") {
      let j = i + 1;
      while (j < formula.length && formula[j] !== c) j++;
      tokens.push({ type: 'str', value: formula.slice(i + 1, j) });
      i = j + 1;
    } else if (/[a-zA-Z_]/.test(c)) {
      let j = i;
      while (j < formula.length && /[a-zA-Z0-9_.]/.test(formula[j])) j++;
      tokens.push({ type: 'ident', value: formula.slice(i, j) });
      i = j;
    } else if (c === '(') {
      tokens.push({ type: 'lparen', value: c });
      i++;
    } else if (c === ')') {
      tokens.push({ type: 'rparen', value: c });
      i++;
    } else if (c === ',') {
      tokens.push({ type: 'comma', value: c });
      i++;
    } else if (['+', '-', '*', '/', '%', '=', '<', '>', '!'].includes(c)) {
      // 处理双字符比较运算符：==, !=, >=, <=
      if ((c === '=' || c === '!' || c === '<' || c === '>') && i + 1 < formula.length) {
        const next = formula[i + 1];
        if (next === '=' || (c === '<' && next === '=') || (c === '>' && next === '=') || (c === '!' && next === '=')) {
          tokens.push({ type: 'op', value: c + next });
          i += 2;
          continue;
        }
      }
      tokens.push({ type: 'op', value: c });
      i++;
    } else {
      // 跳过不支持字符
      i++;
    }
  }
  return tokens;
}

// ============== Parser ==============
class FormulaParser {
  pos = 0;

  constructor(public tokens: Token[], public ctx: any) {}

  peek(): Token | undefined { return this.tokens[this.pos]; }
  consume(): Token { return this.tokens[this.pos++]; }

  // 主入口 - 返回任意类型
  parse(): any {
    return this.parseExpr();
  }

  parseExpr(): any {
    let left = this.parseTerm();
    while (['+', '-', '=', '!=', '>', '<', '>=', '<='].includes(this.peek()?.value as string)) {
      const op = this.consume().value;
      const right = this.parseTerm();
      switch (op) {
        case '+': left = this.add(left, right); break;
        case '-': left = this.sub(left, right); break;
        case '=': left = (left == right) ? 1 : 0; break;
        case '!=': left = (left != right) ? 1 : 0; break;
        case '>': left = Number(left) > Number(right) ? 1 : 0; break;
        case '<': left = Number(left) < Number(right) ? 1 : 0; break;
        case '>=': left = Number(left) >= Number(right) ? 1 : 0; break;
        case '<=': left = Number(left) <= Number(right) ? 1 : 0; break;
      }
    }
    return left;
  }

  parseTerm(): any {
    let left = this.parseFactor();
    while (['*', '/', '%'].includes(this.peek()?.value as string)) {
      const op = this.consume().value;
      const right = this.parseFactor();
      if (op === '*') left = Number(left) * Number(right);
      else if (op === '/') left = Number(right) === 0 ? 0 : Number(left) / Number(right);
      else left = Number(right) === 0 ? 0 : Number(left) % Number(right);
    }
    return left;
  }

  parseFactor(): any {
    const t = this.peek();
    if (!t) return 0;
    if (t.type === 'lparen') {
      this.consume();
      const v = this.parseExpr();
      if (this.peek()?.type === 'rparen') this.consume();
      return v;
    }
    if (t.type === 'op' && t.value === '-') {
      this.consume();
      return -this.parseFactor();
    }
    if (t.type === 'num') return this.consume().value;
    if (t.type === 'str') return this.consume().value;
    if (t.type === 'ident') return this.parseFunctionOrField();
    return 0;
  }

  parseFunctionOrField(): any {
    const name = this.consume().value;
    if (this.peek()?.type === 'lparen') {
      this.consume();
      const args: any[] = [];
      if (this.peek()?.type !== 'rparen') {
        args.push(this.parseExpr());
        while (this.peek()?.type === 'comma') {
          this.consume();
          args.push(this.parseExpr());
        }
      }
      if (this.peek()?.type === 'rparen') this.consume();
      return this.callFunction(name, args);
    }
    return this.resolveField(name);
  }

  callFunction(name: string, args: any[]): any {
    const upper = name.toUpperCase();
    // IF / IFS 是 mixed 类型 - 根据条件真假返回对应参数（保留类型）
    if (upper === 'IF') {
      const cond = args[0];
      const truthy = cond && cond !== 0 && cond !== '0' && cond !== false && cond !== '';
      return truthy ? args[1] : args[2];
    }
    if (STRING_FUNCTIONS[upper] && upper === 'IFS') return STRING_FUNCTIONS[upper](args);
    if (NUMBER_FUNCTIONS[upper]) return NUMBER_FUNCTIONS[upper](args);
    if (STRING_FUNCTIONS[upper]) return STRING_FUNCTIONS[upper](args);
    if (DATE_FUNCTIONS[upper]) return DATE_FUNCTIONS[upper](args);
    return 0;
  }

  resolveField(name: string): any {
    const def = FIELD_REGISTRY[name];
    if (!def) return 0;
    return def.fn(this.ctx);
  }

  add(a: any, b: any): any {
    if (typeof a === 'string' || typeof b === 'string') return String(a ?? '') + String(b ?? '');
    return (Number(a) || 0) + (Number(b) || 0);
  }

  sub(a: any, b: any): number {
    return (Number(a) || 0) - (Number(b) || 0);
  }
}

// ============== 公开 API ==============
export function evaluateFormula(formula: string, ctx: any): any {
  if (!formula || !formula.trim()) return 0;
  try {
    const tokens = tokenize(formula);
    const parser = new FormulaParser(tokens, ctx);
    return parser.parse();
  } catch (e: any) {
    console.error('Formula eval error:', formula, e?.message || e);
    return 0;
  }
}

export async function computeFormulaField(formulaFieldId: string): Promise<Record<string, any>> {
  const field = await prisma.formulaField.findUnique({ where: { id: formulaFieldId } });
  if (!field) throw new Error('Formula field not found');

  const items = await prisma.workItem.findMany({
    where: { type: field.workType, ...(field.spaceId ? { spaceId: field.spaceId } : {}) },
    include: { _count: { select: { comments: true, children: true } }, children: { select: { status: true, planEnd: true } } },
  });

  const values: Record<string, any> = {};
  for (const item of items) {
    values[item.id] = evaluateFormula(field.formula, item);
  }
  await prisma.formulaField.update({
    where: { id: formulaFieldId },
    data: { cachedValues: JSON.stringify(values) },
  });
  return values;
}

export async function computeItemFormulas(workItemId: string): Promise<Record<string, any>> {
  const item = await prisma.workItem.findUnique({
    where: { id: workItemId },
    include: {
      _count: { select: { comments: true, children: true } },
      children: { select: { status: true, planEnd: true, actualEnd: true } },
    },
  });
  if (!item) return {};
  const fields = await prisma.formulaField.findMany({
    where: { workType: item.type, enabled: true, OR: [{ spaceId: item.spaceId }, { spaceId: null }] },
  });
  const result: Record<string, any> = {};
  for (const f of fields) {
    result[f.fieldKey] = evaluateFormula(f.formula, item);
  }
  return result;
}

export function formatFormulaValue(value: any, format: string, outputType: string): any {
  if (value == null) return null;
  if (outputType === 'percent') {
    const v = Number(value);
    if (isNaN(v)) return null;
    if (v > 1) return `${v.toFixed(0)}%`;
    return `${(v * 100).toFixed(0)}%`;
  }
  if (outputType === 'date') {
    if (value instanceof Date) return value.toISOString().slice(0, 10);
    if (typeof value === 'number') return new Date(value).toISOString().slice(0, 10);
    return String(value);
  }
  if (outputType === 'text') return String(value);
  if (typeof value === 'number') {
    if (format === '0.0') return Math.round(value * 10) / 10;
    if (format === '0.00') return Math.round(value * 100) / 100;
    if (format === '0') return Math.round(value);
    return value;
  }
  return value;
}

// 元信息
export function getFormulaMeta() {
  return {
    fields: FIELD_LIST,
    numberFunctions: Object.keys(NUMBER_FUNCTIONS),
    stringFunctions: Object.keys(STRING_FUNCTIONS),
    dateFunctions: Object.keys(DATE_FUNCTIONS),
  };
}
