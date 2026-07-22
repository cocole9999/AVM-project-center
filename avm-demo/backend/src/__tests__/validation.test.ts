/**
 * Zod Schema 验证测试
 *
 * 测试目标：
 * - 创建/更新工作项的字段校验
 * - 创建项目的字段白名单 (mass assignment 防护)
 * - 用户登录验证
 * - 边界值测试
 */
import { describe, it, expect } from 'vitest';
import { createWorkItemSchema, updateWorkItemSchema, batchUpdateSchema, bulkStatusSchema, createRelationSchema } from '../schemas/workItem';
import { createProjectSchema, updateProjectSchema } from '../schemas/project';
import { loginSchema, createUserSchema } from '../schemas/user';

describe('WorkItem Schema', () => {
  describe('createWorkItemSchema', () => {
    it('应接受合法的创建工作项请求', () => {
      const result = createWorkItemSchema.safeParse({
        type: 'requirement',
        title: '测试需求',
        description: '描述内容',
        priority: 'P1',
        estimate: 8,
      });
      expect(result.success).toBe(true);
    });

    it('应拒绝空标题', () => {
      const result = createWorkItemSchema.safeParse({
        type: 'task',
        title: '',
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].path).toContain('title');
      }
    });

    it('应拒绝超过 200 字符的标题', () => {
      const result = createWorkItemSchema.safeParse({
        type: 'bug',
        title: 'a'.repeat(201),
      });
      expect(result.success).toBe(false);
    });

    it('应拒绝无效的工作项类型', () => {
      const result = createWorkItemSchema.safeParse({
        type: 'invalid_type',
        title: '测试',
      });
      expect(result.success).toBe(false);
    });

    it('estimate 为负数应拒绝', () => {
      const result = createWorkItemSchema.safeParse({
        type: 'task',
        title: '测试',
        estimate: -1,
      });
      expect(result.success).toBe(false);
    });

    it('应设置 priority 默认值为 P2', () => {
      const result = createWorkItemSchema.safeParse({
        type: 'task',
        title: '测试',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.priority).toBe('P2');
      }
    });

    it('应拒绝超过 10000 字符的描述', () => {
      const result = createWorkItemSchema.safeParse({
        type: 'task',
        title: '测试',
        description: 'x'.repeat(10001),
      });
      expect(result.success).toBe(false);
    });
  });

  describe('updateWorkItemSchema', () => {
    it('应接受部分更新（只传一个字段）', () => {
      const result = updateWorkItemSchema.safeParse({
        title: '新标题',
      });
      expect(result.success).toBe(true);
    });

    it('应接受空对象（所有字段可选）', () => {
      const result = updateWorkItemSchema.safeParse({});
      expect(result.success).toBe(true);
    });

    it('应拒绝无效的优先级', () => {
      const result = updateWorkItemSchema.safeParse({
        priority: 'P5',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('batchUpdateSchema', () => {
    it('应接受合法的批量更新', () => {
      const result = batchUpdateSchema.safeParse({
        ids: ['id1', 'id2'],
        changes: { status: '已完成' },
      });
      expect(result.success).toBe(true);
    });

    it('应拒绝空 ids', () => {
      const result = batchUpdateSchema.safeParse({
        ids: [],
        changes: { status: '已完成' },
      });
      expect(result.success).toBe(false);
    });

    it('应拒绝超过 200 个 id', () => {
      const result = batchUpdateSchema.safeParse({
        ids: new Array(201).fill('id'),
        changes: { status: '已完成' },
      });
      expect(result.success).toBe(false);
    });

    it('应拒绝空的 changes', () => {
      const result = batchUpdateSchema.safeParse({
        ids: ['id1'],
        changes: {},
      });
      expect(result.success).toBe(false);
    });
  });

  describe('bulkStatusSchema', () => {
    it('应接受合法的批量流转', () => {
      const result = bulkStatusSchema.safeParse({
        ids: ['id1', 'id2'],
        status: '进行中',
      });
      expect(result.success).toBe(true);
    });

    it('应拒绝空 status', () => {
      const result = bulkStatusSchema.safeParse({
        ids: ['id1'],
        status: '',
      });
      expect(result.success).toBe(false);
    });
  });
});

describe('Project Schema (Mass Assignment 防护)', () => {
  describe('createProjectSchema', () => {
    it('应接受合法数据', () => {
      const result = createProjectSchema.safeParse({
        code: 'PROJ-001',
        name: '测试项目',
        customerId: 'cust-1',
        carModelId: 'car-1',
        startDate: '2026-01-01',
        endDate: '2026-12-31',
      });
      expect(result.success).toBe(true);
    });

    it('应拒绝缺少必填字段', () => {
      const result = createProjectSchema.safeParse({
        name: '测试项目',
      });
      expect(result.success).toBe(false);
    });

    it('不应接受非白名单字段（mass assignment 防护）', () => {
      const result = createProjectSchema.safeParse({
        code: 'PROJ-001',
        name: '测试项目',
        customerId: 'cust-1',
        carModelId: 'car-1',
        startDate: '2026-01-01',
        endDate: '2026-12-31',
        // 以下字段不应被接受
        id: 'hacked-id',
        createdAt: '2020-01-01',
        createdBy: 'hacker',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        // 这些字段不应出现在解析后的数据中
        expect((result.data as any).id).toBeUndefined();
        expect((result.data as any).createdAt).toBeUndefined();
        expect((result.data as any).createdBy).toBeUndefined();
      }
    });

    it('应拒绝无效的 billingType', () => {
      const result = createProjectSchema.safeParse({
        code: 'PROJ-001',
        name: '测试',
        customerId: 'c1',
        carModelId: 'm1',
        startDate: '2026-01-01',
        endDate: '2026-12-31',
        billingType: 'INVALID',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('updateProjectSchema', () => {
    it('应只更新白名单内的字段', () => {
      const result = updateProjectSchema.safeParse({
        name: '新名称',
        progress: 50,
        // mass assignment 尝试
        id: 'should-not-pass',
        code: 'should-not-pass',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.id).toBeUndefined();
        expect(result.data.code).toBeUndefined();
        expect(result.data.name).toBe('新名称');
        expect(result.data.progress).toBe(50);
      }
    });
  });
});

describe('User Schema', () => {
  describe('loginSchema', () => {
    it('应拒绝空用户名', () => {
      const result = loginSchema.safeParse({ username: '', password: 'pwd' });
      expect(result.success).toBe(false);
    });

    it('应拒绝空密码', () => {
      const result = loginSchema.safeParse({ username: 'user', password: '' });
      expect(result.success).toBe(false);
    });

    it('应接受合法登录', () => {
      const result = loginSchema.safeParse({ username: 'admin', password: 'admin123' });
      expect(result.success).toBe(true);
    });
  });

  describe('createUserSchema', () => {
    it('用户名少于 2 字符应拒绝', () => {
      const result = createUserSchema.safeParse({
        username: 'a',
        displayName: '测试',
        password: '123456',
      });
      expect(result.success).toBe(false);
    });

    it('密码少于 6 字符应拒绝', () => {
      const result = createUserSchema.safeParse({
        username: 'testuser',
        displayName: '测试',
        password: '12345',
      });
      expect(result.success).toBe(false);
    });

    it('用户名含特殊字符应拒绝', () => {
      const result = createUserSchema.safeParse({
        username: 'test@user!',
        displayName: '测试',
        password: '123456',
      });
      expect(result.success).toBe(false);
    });
  });
});
