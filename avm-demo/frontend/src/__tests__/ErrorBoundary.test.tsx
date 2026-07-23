/**
 * ErrorBoundary 测试
 *
 * 测试目标：
 * - 正常渲染 children
 * - 捕获错误显示降级 UI
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ErrorBoundary } from '../components/ErrorBoundary';

// 模拟 console.error 避免测试输出被污染
const originalError = console.error;
beforeAll(() => {
  console.error = vi.fn();
});
afterAll(() => {
  console.error = originalError;
});

describe('ErrorBoundary', () => {
  it('无错误时应渲染 children', () => {
    render(
      <ErrorBoundary>
        <div>正常内容</div>
      </ErrorBoundary>
    );
    expect(screen.getByText('正常内容')).toBeDefined();
  });

  it('发生错误时应显示降级 UI', () => {
    // 渲染一个会抛出的组件
    const ThrowComponent = () => {
      throw new Error('测试错误');
    };

    render(
      <ErrorBoundary>
        <ThrowComponent />
      </ErrorBoundary>
    );

    expect(screen.getByText('页面渲染出错')).toBeDefined();
    expect(screen.getByText('测试错误')).toBeDefined();
  });

  it('降级 UI 应包含错误标题和重试元素', () => {
    const ThrowComponent = () => {
      throw new Error('错误');
    };

    render(
      <ErrorBoundary>
        <ThrowComponent />
      </ErrorBoundary>
    );

    // 验证错误标题存在
    expect(screen.getByText('页面渲染出错')).toBeDefined();
    // 验证错误消息显示
    expect(screen.getByText('错误')).toBeDefined();
    // 验证开发模式错误详情可展开
    expect(screen.getByText('查看错误详情（开发模式）')).toBeDefined();
  });
});
