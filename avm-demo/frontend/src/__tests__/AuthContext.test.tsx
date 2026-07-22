/**
 * AuthContext 测试
 *
 * 测试目标：
 * - 默认未登录状态
 * - login() 成功后更新 user 和 token
 * - localStorage 持久化
 * - logout() 清除状态
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { AuthProvider, useAuth } from '../AuthContext';

// Mock api module
vi.mock('../api', () => ({
  userApi: {
    login: vi.fn(),
  },
}));

import { userApi } from '../api';

// localStorage 模拟
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => { store[key] = value; },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { store = {}; },
  };
})();
Object.defineProperty(window, 'localStorage', { value: localStorageMock });

// 辅助组件：在测试中读取 AuthContext 的状态
function TestConsumer() {
  const auth = useAuth();
  return (
    <div>
      <div data-testid="loading">{String(auth.loading)}</div>
      <div data-testid="user">{auth.user ? auth.user.username : 'null'}</div>
      <div data-testid="token">{auth.token || 'null'}</div>
      <button data-testid="login-btn" onClick={() => auth.login('admin', 'admin123')}>Login</button>
      <button data-testid="logout-btn" onClick={() => auth.logout()}>Logout</button>
    </div>
  );
}

describe('AuthContext', () => {
  beforeEach(() => {
    localStorageMock.clear();
    vi.clearAllMocks();
  });

  it('初始状态应为未登录', () => {
    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>
    );

    expect(screen.getByTestId('user').textContent).toBe('null');
    expect(screen.getByTestId('token').textContent).toBe('null');
    expect(screen.getByTestId('loading').textContent).toBe('false');
  });

  it('login 成功后应更新 user 和 token', async () => {
    const mockUser = { id: '1', username: 'admin', displayName: '管理员', role: 'tenant_admin' };
    (userApi.login as any).mockResolvedValue({ user: mockUser, token: 'test-token' });

    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>
    );

    // 触发登录
    screen.getByTestId('login-btn').click();

    await waitFor(() => {
      expect(screen.getByTestId('user').textContent).toBe('admin');
      expect(screen.getByTestId('token').textContent).toBe('test-token');
    });
  });

  it('login 应持久化到 localStorage', async () => {
    const mockUser = { id: '1', username: 'admin', displayName: '管理员', role: 'tenant_admin' };
    (userApi.login as any).mockResolvedValue({ user: mockUser, token: 'test-token' });

    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>
    );

    screen.getByTestId('login-btn').click();

    await waitFor(() => {
      const stored = JSON.parse(localStorage.getItem('avm-auth')!);
      expect(stored.user.username).toBe('admin');
      expect(stored.token).toBe('test-token');
    });
  });

  it('logout 应清除状态和 localStorage', async () => {
    // 先登录
    localStorage.setItem('avm-auth', JSON.stringify({
      user: { id: '1', username: 'admin', displayName: '管理员', role: 'tenant_admin' },
      token: 'test-token',
    }));

    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>
    );

    // 确认已恢复登录状态
    expect(screen.getByTestId('user').textContent).toBe('admin');

    // 登出
    screen.getByTestId('logout-btn').click();

    await waitFor(() => {
      expect(screen.getByTestId('user').textContent).toBe('null');
      expect(screen.getByTestId('token').textContent).toBe('null');
      expect(localStorage.getItem('avm-auth')).toBeNull();
    });
  });
});
