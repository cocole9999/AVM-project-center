/**
 * Auth Middleware (V1.11)
 *
 * 角色层级（从低到高）：
 * - member      = 0  普通成员（只读 + 自己负责的工作项可改）
 * - space_admin = 1  空间管理员（写操作：创建/更新/批量操作）
 * - tenant_admin = 2 租户管理员（最高：删除 + 角色管理 + 租户配置）
 *
 * 模式（通过 ENV 切换）：
 * - production: 严格模式（无 token = 401，权限不足 = 403）
 * - development/test: 宽松模式（无 token 视为 tenant_admin）
 *
 * 用法:
 *   import { requireAuth, requireRole } from '../middleware/auth';
 *   router.post('/xxx', requireAuth, requireRole('space_admin'), handler);
 *   router.delete('/xxx', requireAuth, requireRole('tenant_admin'), handler);
 *   router.get('/xxx', requireAuth, handler);  // 任何登录用户
 */
import { Request, Response, NextFunction } from 'express';
import { prisma } from '../db';

export type Role = 'member' | 'space_admin' | 'tenant_admin';
const ROLE_LEVEL: Record<Role, number> = {
  member: 0,
  space_admin: 1,
  tenant_admin: 2,
};

const IS_PRODUCTION = process.env.NODE_ENV === 'production';

// V1.11: 白名单（不鉴权）。这些是登录前必须能访问的入口
const PUBLIC_PATHS = [
  '/sso',              // SSO 登录入口
  '/users/login',      // 用户名/密码登录（拿 token）
  '/health',           // 健康检查（一般不走 /api 也能直接挂）
  '/llm-settings/health',  // LLM 设置健康检查
  '/tests/health',     // 测试健康
];

/** 判断当前请求路径是否在白名单内 */
function isPublicPath(req: any): boolean {
  // req.originalUrl 含 query string，req.path 不含；用 baseUrl + path 更稳
  const fullPath = (req.baseUrl || '') + (req.path || '');
  for (const p of PUBLIC_PATHS) {
    if (fullPath === p || fullPath.startsWith(p + '/') || fullPath.startsWith(p + '?')) {
      return true;
    }
  }
  return false;
}

export interface AuthedRequest extends Request {
  user?: {
    id: string;
    username: string;
    displayName: string;
    role: Role;
    department?: string | null;
  };
}

/** 解析 Authorization: Bearer xxx 头，返回 user，未带则按模式决定 */
export async function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  // V1.11: 白名单直接放行
  if (isPublicPath(req)) return next();

  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (token) {
    // V1.11: token 是 index 不是 unique, findUnique 只能用 id/username
    const user = await prisma.user.findFirst({ where: { token } });
    if (user && user.active) {
      // Phase2: 检查 token 过期
      if (user.tokenExpiresAt && new Date(user.tokenExpiresAt) < new Date()) {
        return res.status(401).json({ error: 'token 已过期，请重新登录' });
      }
      req.user = {
        id: user.id, username: user.username, displayName: user.displayName,
        role: (user.role as Role) || 'member', department: user.department,
      };
      return next();
    }
    return res.status(401).json({ error: '无效或过期的 token' });
  }

  // 无 token
  if (IS_PRODUCTION) {
    return res.status(401).json({ error: '需要登录' });
  }
  // 宽松模式: 给默认 tenant_admin 权限（开发/演示用）
  req.user = {
    id: 'dev-user', username: 'dev', displayName: '开发模式',
    role: 'tenant_admin', department: 'DEV',
  };
  next();
}

/** 工厂: 要求最低角色 */
export function requireRole(minRole: Role) {
  const needLevel = ROLE_LEVEL[minRole] ?? 0;
  return (req: AuthedRequest, res: Response, next: NextFunction) => {
    if (!req.user) return res.status(401).json({ error: '未鉴权' });
    const haveLevel = ROLE_LEVEL[req.user.role] ?? 0;
    if (haveLevel < needLevel) {
      return res.status(403).json({
        error: '权限不足',
        required: minRole,
        have: req.user.role,
      });
    }
    next();
  };
}

/** 辅助: GET 方法只要 read，写方法要 write (便利工厂) */
export function autoRole() {
  return (req: AuthedRequest, res: Response, next: NextFunction) => {
    if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return next();
    if (req.method === 'DELETE') return requireRole('tenant_admin')(req, res, next);
    return requireRole('space_admin')(req, res, next);
  };
}
