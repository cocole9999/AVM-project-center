/**
 * 项目 (Project) Zod Schema
 *
 * 修复 mass assignment 漏洞：只允许客户端设置白名单内的字段
 */
import { z } from 'zod';

const BILLING_TYPES = ['ODC', 'FIXED', 'ODM', 'TIME_MATERIAL'] as const;
const PROJECT_STATUSES = ['planning', 'active', 'completed', 'onhold', 'cancelled'] as const;
const RISK_LEVELS = ['low', 'medium', 'high'] as const;

/** 创建项目 */
export const createProjectSchema = z.object({
  code: z.string().min(1, '项目编号不能为空').max(50),
  name: z.string().min(1, '项目名称不能为空').max(200),
  description: z.string().max(5000).default(''),
  customerId: z.string().min(1, '客户 ID 不能为空'),
  carModelId: z.string().min(1, '车型 ID 不能为空'),
  pmUserId: z.string().nullable().optional(),
  pmUserName: z.string().nullable().optional(),
  startDate: z.string().datetime({ offset: true }).or(z.string().date()),
  endDate: z.string().datetime({ offset: true }).or(z.string().date()),
  status: z.enum(PROJECT_STATUSES).default('planning'),
  billingType: z.enum(BILLING_TYPES).default('ODC'),
  contractAmount: z.number().min(0).default(0),
  budgetHours: z.number().min(0).default(0),
  consumedHours: z.number().min(0).default(0),
  risk: z.enum(RISK_LEVELS).default('low'),
  progress: z.number().int().min(0).max(100).default(0),
  tags: z.string().default(''),
});

/** 更新项目 (全部可选) */
export const updateProjectSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(5000).optional(),
  customerId: z.string().min(1).optional(),
  carModelId: z.string().min(1).optional(),
  pmUserId: z.string().nullable().optional(),
  pmUserName: z.string().nullable().optional(),
  startDate: z.string().datetime({ offset: true }).or(z.string().date()).optional(),
  endDate: z.string().datetime({ offset: true }).or(z.string().date()).optional(),
  status: z.enum(PROJECT_STATUSES).optional(),
  billingType: z.enum(BILLING_TYPES).optional(),
  contractAmount: z.number().min(0).optional(),
  budgetHours: z.number().min(0).optional(),
  consumedHours: z.number().min(0).optional(),
  risk: z.enum(RISK_LEVELS).optional(),
  progress: z.number().int().min(0).max(100).optional(),
  tags: z.string().optional(),
});
