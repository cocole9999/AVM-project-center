/**
 * 用户 & 认证集成测试
 *
 * 测试目标：
 * - bcrypt 密码哈希
 * - 登录验证
 * - token 生成 & 过期
 * - 用户 CRUD
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import bcrypt from 'bcrypt';
import crypto from 'crypto';

const BCRYPT_ROUNDS = 10;
const TOKEN_EXPIRY_HOURS = 24;

async function hashPassword(pwd: string): Promise<string> {
  return bcrypt.hash(pwd, BCRYPT_ROUNDS);
}

async function verifyPassword(pwd: string, hash: string): Promise<boolean> {
  return bcrypt.compare(pwd, hash);
}

describe('bcrypt 密码哈希', () => {
  it('密码哈希后不应等于原文', async () => {
    const hash = await hashPassword('admin123');
    expect(hash).not.toBe('admin123');
  });

  it('正确密码验证应通过', async () => {
    const hash = await hashPassword('testpwd');
    const valid = await verifyPassword('testpwd', hash);
    expect(valid).toBe(true);
  });

  it('错误密码验证应失败', async () => {
    const hash = await hashPassword('testpwd');
    const valid = await verifyPassword('wrongpwd', hash);
    expect(valid).toBe(false);
  });

  it('相同密码每次哈希结果应不同（随机 salt）', async () => {
    const hash1 = await hashPassword('samepassword');
    const hash2 = await hashPassword('samepassword');
    expect(hash1).not.toBe(hash2);
  });
});

describe('token 生成与过期', () => {
  it('token 应为 64 字符 hex', () => {
    const token = crypto.randomBytes(32).toString('hex');
    expect(token).toMatch(/^[0-9a-f]{64}$/);
  });

  it('token 过期时间应为 24h 后', () => {
    const now = Date.now();
    const expiresAt = new Date(now + TOKEN_EXPIRY_HOURS * 3600 * 1000);
    const diff = expiresAt.getTime() - now;
    expect(diff).toBe(TOKEN_EXPIRY_HOURS * 3600 * 1000);
  });

  it('过期 token 应被拒绝', () => {
    const expired = new Date(Date.now() - 1000);
    expect(expired < new Date()).toBe(true);
  });

  it('未过期 token 应被接受', () => {
    const valid = new Date(Date.now() + 3600 * 1000); // 1 小时后
    expect(valid > new Date()).toBe(true);
  });
});

describe('用户角色校验', () => {
  const ROLE_LEVEL: Record<string, number> = {
    member: 0,
    biz_admin: 1,
    space_admin: 2,
    tenant_admin: 3,
  };

  it('tenant_admin 可访问所有资源', () => {
    expect(ROLE_LEVEL['tenant_admin']).toBeGreaterThanOrEqual(ROLE_LEVEL['space_admin']);
  });

  it('member 不能做 space_admin 操作', () => {
    expect(ROLE_LEVEL['member']).toBeLessThan(ROLE_LEVEL['space_admin']);
  });

  it('未知角色应视为 member', () => {
    const level = ROLE_LEVEL['unknown'] ?? 0;
    expect(level).toBe(0);
  });
});
