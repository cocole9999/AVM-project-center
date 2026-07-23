/**
 * 轻量级多租户中间件（Phase3）
 *
 * 从 req.user.tenantId 提取当前用户租户
 * - 无 tenantId → 跳过过滤（保持兼容，如 dev 模式）
 * - 有 tenantId → 注入 req.tenantId
 *
 * 用法：
 *   import { withTenant } from '../middleware/tenant';
 *   router.get('/', withTenant, async (req, res) => {
 *     const where: any = {};
 *     if (req.tenantId) where.tenantId = req.tenantId;
 *     ...
 *   });
 */
import { Request, Response, NextFunction } from 'express';

declare global {
  namespace Express {
    interface Request {
      tenantId?: string | null;
    }
  }
}

export function withTenant(req: Request, _res: Response, next: NextFunction) {
  const user = (req as any).user;
  req.tenantId = user?.tenantId || null;
  next();
}
