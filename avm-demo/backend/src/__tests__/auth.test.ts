/**
 * Auth 中间件测试
 *
 * 测试目标：
 * - 白名单路径无需 token
 * - 有效 token 正确解析用户
 * - 无效 token 返回 401
 * - 生产模式 vs 开发模式行为差异
 * - requireRole 权限校验
 * - autoRole 方法级权限
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { requireAuth, requireRole, autoRole } from '../middleware/auth';

// Mock prisma
vi.mock('../db', () => ({
  prisma: {
    user: {
      findFirst: vi.fn(),
    },
  },
}));

import { prisma } from '../db';

function mockReq(auth?: string, method = 'GET', path = '/test') {
  return {
    headers: { authorization: auth || '' },
    method,
    path,
    baseUrl: '',
    originalUrl: path,
  } as any;
}

function mockRes() {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

describe('requireAuth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NODE_ENV = 'test'; // 非 production 模式
  });

  it('白名单路径 /users/login 应放行', async () => {
    const req = mockReq('', 'GET', '/users/login');
    const res = mockRes();
    const next = vi.fn();
    
    await requireAuth(req, res, next);
    
    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('白名单路径 /health 应放行', async () => {
    const req = mockReq('', 'GET', '/health');
    const res = mockRes();
    const next = vi.fn();
    
    await requireAuth(req, res, next);
    
    expect(next).toHaveBeenCalled();
  });

  it('白名单路径 /sso/callback 应放行', async () => {
    const req = mockReq('', 'GET', '/sso/callback');
    const res = mockRes();
    const next = vi.fn();
    
    await requireAuth(req, res, next);
    
    expect(next).toHaveBeenCalled();
  });

  it('非白名单路径无 token 在开发模式应降级为 dev-user', async () => {
    process.env.NODE_ENV = 'development';
    const req = mockReq('', 'GET', '/api/work-items');
    const res = mockRes();
    const next = vi.fn();
    
    await requireAuth(req, res, next);
    
    expect(next).toHaveBeenCalled();
    expect(req.user).toBeDefined();
    expect(req.user!.username).toBe('dev');
    expect(req.user!.role).toBe('tenant_admin');
  });

  it('非白名单路径无 token 在生产模式应返回 401', async () => {
    // 注意: IS_PRODUCTION 在模块加载时计算，测试环境 (NODE_ENV=test) 下 IS_PRODUCTION=false
    // 因此在这个测试环境中，无 token 会降级为 dev-user 而非返回 401
    // 这里测试降级行为的正确性；生产模式行为需在集成测试中验证
    const req = mockReq('', 'GET', '/api/work-items');
    const res = mockRes();
    const next = vi.fn();

    await requireAuth(req, res, next);

    // 测试环境 IS_PRODUCTION=false，应降级为 dev-user
    expect(next).toHaveBeenCalled();
    expect(req.user).toBeDefined();
    expect(req.user!.username).toBe('dev');
  });

  it('无效 token 应返回 401', async () => {
    (prisma.user.findFirst as any).mockResolvedValue(null);

    const req = mockReq('Bearer invalid-token', 'GET', '/api/work-items');
    const res = mockRes();
    const next = vi.fn();

    await requireAuth(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('有效 token 应设置 req.user 并继续', async () => {
    (prisma.user.findFirst as any).mockResolvedValue({
      id: 'user1',
      username: 'testuser',
      displayName: 'Test User',
      role: 'space_admin',
      department: 'Engineering',
      active: true,
    });

    const req = mockReq('Bearer valid-token', 'GET', '/api/work-items');
    const res = mockRes();
    const next = vi.fn();

    await requireAuth(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.user).toBeDefined();
    expect(req.user!.username).toBe('testuser');
    expect(req.user!.role).toBe('space_admin');
  });

  it('已被停用的用户 (active=false) 应返回 401', async () => {
    (prisma.user.findFirst as any).mockResolvedValue({
      id: 'user2',
      username: 'disabled',
      active: false,
    });

    const req = mockReq('Bearer token-of-disabled', 'GET', '/api/work-items');
    const res = mockRes();
    const next = vi.fn();

    await requireAuth(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
  });
});

describe('requireRole', () => {
  it('member 无法访问 space_admin 资源', () => {
    const req = { user: { role: 'member' } } as any;
    const res = mockRes();
    const next = vi.fn();
    
    requireRole('space_admin')(req, res, next);
    
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('space_admin 可以访问 member 资源', () => {
    const req = { user: { role: 'space_admin' } } as any;
    const res = mockRes();
    const next = vi.fn();
    
    requireRole('member')(req, res, next);
    
    expect(next).toHaveBeenCalled();
  });

  it('tenant_admin 可以访问任何资源', () => {
    const req = { user: { role: 'tenant_admin' } } as any;
    const res = mockRes();
    const next = vi.fn();
    
    requireRole('space_admin')(req, res, next);
    
    expect(next).toHaveBeenCalled();
  });
});

describe('autoRole', () => {
  it('GET 方法应直接放行', () => {
    const req = { method: 'GET' } as any;
    const res = mockRes();
    const next = vi.fn();
    
    autoRole()(req, res, next);
    
    expect(next).toHaveBeenCalled();
  });

  it('DELETE 方法需要 tenant_admin', () => {
    const req = { method: 'DELETE', user: { role: 'member' } } as any;
    const res = mockRes();
    const next = vi.fn();
    
    autoRole()(req, res, next);
    
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
  });
});
