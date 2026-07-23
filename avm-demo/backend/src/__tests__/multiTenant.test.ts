/**
 * 多租户隔离测试
 *
 * 测试目标：
 * - withTenant 中间件正确注入 tenantId
 * - 无 tenantId 时跳过过滤
 * - 用户请求中携带 tenantId 时正确过滤
 */
import { describe, it, expect, vi } from 'vitest';
import { withTenant } from '../middleware/tenant';

function mockReq(tenantId?: string | null) {
  return {
    user: tenantId ? { tenantId } : { },
  } as any;
}

function mockRes() {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

describe('withTenant 中间件', () => {
  it('用户有 tenantId 应注入 req.tenantId', () => {
    const req = mockReq('tenant-001');
    const res = mockRes();
    const next = vi.fn();

    withTenant(req, res, next);

    expect(req.tenantId).toBe('tenant-001');
    expect(next).toHaveBeenCalled();
  });

  it('用户无 tenantId 应设 req.tenantId 为 null', () => {
    const req = mockReq();
    const res = mockRes();
    const next = vi.fn();

    withTenant(req, res, next);

    expect(req.tenantId).toBeNull();
    expect(next).toHaveBeenCalled();
  });

  it('用户 tenantId 为 null 应设 req.tenantId 为 null', () => {
    const req = mockReq(null);
    const res = mockRes();
    const next = vi.fn();

    withTenant(req, res, next);

    expect(req.tenantId).toBeNull();
    expect(next).toHaveBeenCalled();
  });

  it('无 user 对象应设 req.tenantId 为 null', () => {
    const req = {} as any;
    const res = mockRes();
    const next = vi.fn();

    withTenant(req, res, next);

    expect(req.tenantId).toBeNull();
    expect(next).toHaveBeenCalled();
  });
});
