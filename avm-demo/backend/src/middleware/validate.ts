/**
 * Zod 请求验证中间件
 *
 * 用法:
 *   import { z } from 'zod';
 *   import { validate } from '../middleware/validate';
 *
 *   const createSchema = z.object({ title: z.string().min(1), type: z.enum([...]) });
 *   router.post('/', validate(createSchema), handler);
 *
 * 支持 validate(schema) 验证 req.body
 * 支持 validateQuery(schema) 验证 req.query
 * 支持 validateParams(schema) 验证 req.params
 */
import { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError } from 'zod';

type ValidationTarget = 'body' | 'query' | 'params';

function createValidator(target: ValidationTarget) {
  return (schema: ZodSchema) => {
    return (req: Request, res: Response, next: NextFunction) => {
      const result = schema.safeParse(req[target]);
      if (result.success) {
        // 用解析后的值替换原始数据 (去除多余字段，应用默认值)
        req[target] = result.data;
        return next();
      }
      const error = result.error as ZodError;
      const details = error.issues.map(e => ({
        field: e.path.join('.'),
        message: e.message,
        code: e.code,
      }));
      return res.status(400).json({
        error: '请求参数校验失败',
        details,
      });
    };
  };
}

/** 验证 req.body */
export const validate = createValidator('body');
/** 验证 req.query */
export const validateQuery = createValidator('query');
/** 验证 req.params */
export const validateParams = createValidator('params');

/**
 * 包装异步路由处理函数，统一捕获未处理的 Promise rejection
 * 用法: router.get('/path', asyncHandler(handler))
 */
export function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<any>) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
