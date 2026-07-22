/**
 * 工作项 (WorkItem) Zod Schema
 */
import { z } from 'zod';
import { TYPE_OPTIONS, PRIORITY_OPTIONS, SEVERITY_OPTIONS, RELATION_TYPES } from '../constants';

export const WORK_ITEM_TYPES = TYPE_OPTIONS as readonly string[];
export const PRIORITIES = PRIORITY_OPTIONS as readonly string[];
export const SEVERITIES = SEVERITY_OPTIONS as readonly string[];
export const RELATION_TYPES_LIST = RELATION_TYPES as readonly string[];

/** 创建工作项 */
export const createWorkItemSchema = z.object({
  type: z.string().refine(v => WORK_ITEM_TYPES.includes(v), { message: `无效的工作项类型，可选: ${WORK_ITEM_TYPES.join(', ')}` }),
  title: z.string().min(1, '标题不能为空').max(200, '标题长度不能超过 200 个字符'),
  description: z.string().max(10000, '描述长度不能超过 10000 个字符').default(''),
  priority: z.string().refine(v => PRIORITIES.includes(v), { message: `无效优先级，可选: ${PRIORITIES.join(', ')}` }).default('P2'),
  severity: z.string().refine(v => !v || SEVERITIES.includes(v), { message: `无效严重程度，可选: ${SEVERITIES.join(', ')}` }).nullable().optional(),
  assignee: z.string().nullable().optional(),
  reporter: z.string().optional(),
  module: z.string().nullable().optional(),
  labels: z.string().default(''),
  iterationId: z.string().nullable().optional(),
  estimate: z.number().min(0).max(10000).nullable().optional(),
  planStart: z.string().datetime().nullable().optional(),
  planEnd: z.string().datetime().nullable().optional(),
  parentId: z.string().nullable().optional(),
  // V1.7 关联
  projectId: z.string().nullable().optional(),
  carModelId: z.string().nullable().optional(),
  customerId: z.string().nullable().optional(),
});

/** 更新工作项 (全部可选) */
export const updateWorkItemSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(10000).optional(),
  status: z.string().optional(),
  priority: z.string().refine(v => !v || PRIORITIES.includes(v), { message: `无效优先级` }).optional(),
  severity: z.string().refine(v => !v || SEVERITIES.includes(v), { message: `无效严重程度` }).nullable().optional(),
  assignee: z.string().nullable().optional(),
  reporter: z.string().optional(),
  module: z.string().nullable().optional(),
  labels: z.string().optional(),
  iterationId: z.string().nullable().optional(),
  estimate: z.number().min(0).max(10000).nullable().optional(),
  actualHours: z.number().min(0).max(10000).nullable().optional(),
  planStart: z.string().datetime().nullable().optional(),
  planEnd: z.string().datetime().nullable().optional(),
  actualStart: z.string().datetime().nullable().optional(),
  actualEnd: z.string().datetime().nullable().optional(),
  parentId: z.string().nullable().optional(),
  projectId: z.string().nullable().optional(),
  carModelId: z.string().nullable().optional(),
  customerId: z.string().nullable().optional(),
});

/** 批量更新 */
export const batchUpdateSchema = z.object({
  ids: z.array(z.string()).min(1, 'ids 不能为空').max(200, '单次最多更新 200 条'),
  changes: z.object({
    status: z.string().optional(),
    priority: z.string().refine(v => !v || PRIORITIES.includes(v)).optional(),
    assignee: z.string().nullable().optional(),
    iterationId: z.string().nullable().optional(),
    module: z.string().nullable().optional(),
    reporter: z.string().optional(),
    type: z.string().refine(v => !v || WORK_ITEM_TYPES.includes(v)).optional(),
  }).refine(obj => Object.keys(obj).length > 0, { message: '至少需要一个变更字段' }),
});

/** 批量流转 */
export const bulkStatusSchema = z.object({
  ids: z.array(z.string()).min(1, 'ids 不能为空'),
  status: z.string().min(1, 'status 不能为空'),
  actor: z.string().optional(),
});

/** 创建关联 */
export const createRelationSchema = z.object({
  toId: z.string().min(1, 'toId 不能为空'),
  relationType: z.string().refine(v => RELATION_TYPES_LIST.includes(v), { message: `无效的关联类型，可选: ${RELATION_TYPES_LIST.join(', ')}` }),
});

/** 工作项查询参数 */
export const queryWorkItemSchema = z.object({
  type: z.string().optional(),
  status: z.string().optional(),
  priority: z.string().optional(),
  assignee: z.string().optional(),
  iterationId: z.string().optional(),
  q: z.string().optional(),
  parentId: z.string().optional(),
  module: z.string().optional(),
  projectCode: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  includeUnscheduled: z.string().optional(),
  depth: z.coerce.number().int().min(1).max(6).default(3).optional(),
});
