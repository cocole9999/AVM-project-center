/**
 * 通用 Zod Schema 定义
 */
import { z } from 'zod';

/** 日期字符串或 null */
export const dateField = z.string().datetime({ offset: true }).or(z.string().date()).nullable().optional();

/** 非负整数 */
export const positiveInt = z.number().int().min(0).optional();

/** 非负浮点数 (带上限) */
export const positiveFloat = z.number().min(0).max(100000).optional();

/** 分页查询 */
export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

/** ID 参数 */
export const idParamSchema = z.object({
  id: z.string().min(1, 'ID 不能为空'),
});
