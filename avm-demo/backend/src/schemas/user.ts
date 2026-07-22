/**
 * 用户 (User) Zod Schema
 */
import { z } from 'zod';

const ROLES = ['member', 'biz_admin', 'space_admin', 'tenant_admin', 'visitor'] as const;

/** 创建用户 */
export const createUserSchema = z.object({
  username: z.string().min(2, '用户名至少 2 个字符').max(50).regex(/^[a-zA-Z0-9_]+$/, '用户名只能包含字母、数字和下划线'),
  displayName: z.string().min(1, '显示名称不能为空').max(100),
  password: z.string().min(6, '密码至少 6 个字符').max(128),
  email: z.string().email('无效的邮箱格式').nullable().optional(),
  department: z.string().max(100).nullable().optional(),
  role: z.enum(ROLES).default('member'),
  active: z.boolean().default(true),
});

/** 更新用户 */
export const updateUserSchema = z.object({
  displayName: z.string().min(1).max(100).optional(),
  email: z.string().email().nullable().optional(),
  password: z.string().min(6).max(128).optional(),
  department: z.string().max(100).nullable().optional(),
  role: z.enum(ROLES).optional(),
  active: z.boolean().optional(),
});

/** 登录 */
export const loginSchema = z.object({
  username: z.string().min(1, '用户名不能为空'),
  password: z.string().min(1, '密码不能为空'),
});
