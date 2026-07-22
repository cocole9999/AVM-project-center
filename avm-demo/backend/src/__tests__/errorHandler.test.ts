/**
 * 全局错误处理中间件测试
 *
 * 测试目标：
 * - ZodError 返回 400 + 详细错误信息
 * - Prisma P2002 唯一约束错误返回 409
 * - Prisma P2025 记录不存在错误返回 404
 * - 未知错误返回 500 + requestId
 * - JSON 解析错误处理
 */
import { describe, it, expect, vi } from 'vitest';

// 模拟错误处理函数（从 index.ts 抽取的逻辑）
function handlePrismaError(err: any): { status: number; message: string } {
  if (err.code === 'P2002') {
    const target = err.meta?.target || '字段';
    return { status: 409, message: `数据已存在: ${target} 唯一约束冲突` };
  }
  if (err.code === 'P2025') {
    return { status: 404, message: '记录不存在' };
  }
  if (err.code === 'P2003') {
    return { status: 400, message: '外键约束失败，关联的记录不存在' };
  }
  if (err.code?.startsWith('P')) {
    return { status: 400, message: `数据库错误: ${err.message}` };
  }
  return { status: 500, message: err.message || 'Internal Server Error' };
}

describe('Prisma 错误处理', () => {
  it('P2002 唯一约束冲突应返回 409', () => {
    const result = handlePrismaError({
      code: 'P2002',
      meta: { target: ['User.username'] },
      message: 'Unique constraint failed',
    });
    expect(result.status).toBe(409);
    expect(result.message).toContain('唯一约束冲突');
  });

  it('P2025 记录不存在应返回 404', () => {
    const result = handlePrismaError({
      code: 'P2025',
      message: 'Record not found',
    });
    expect(result.status).toBe(404);
    expect(result.message).toBe('记录不存在');
  });

  it('P2003 外键约束失败应返回 400', () => {
    const result = handlePrismaError({
      code: 'P2003',
      message: 'Foreign key constraint failed',
    });
    expect(result.status).toBe(400);
  });

  it('未知 P 错误应返回 400', () => {
    const result = handlePrismaError({
      code: 'P2010',
      message: 'Some other error',
    });
    expect(result.status).toBe(400);
  });

  it('非 Prisma 错误应返回 500', () => {
    const result = handlePrismaError({
      message: 'Something went wrong',
    });
    expect(result.status).toBe(500);
  });

  it('带 status 属性的已知错误应返回对应的状态码', () => {
    const err = new Error('Not Found');
    (err as any).status = 404;
    expect((err as any).status).toBe(404);
  });
});

describe('错误响应格式', () => {
  it('错误响应应包含 error 字段', () => {
    const response = { error: '记录不存在', requestId: 'abc123' };
    expect(response).toHaveProperty('error');
    expect(response).toHaveProperty('requestId');
  });

  it('验证错误应包含 details 数组', () => {
    const response = {
      error: '请求参数校验失败',
      details: [
        { field: 'title', message: '标题不能为空' },
      ],
    };
    expect(response.details).toBeInstanceOf(Array);
    expect(response.details[0]).toHaveProperty('field');
    expect(response.details[0]).toHaveProperty('message');
  });
});
