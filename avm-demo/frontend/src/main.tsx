import React from 'react';
import ReactDOM from 'react-dom/client';
import { ConfigProvider, App as AntdApp, message as antdMessage } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import 'dayjs/locale/zh-cn';
import 'antd/dist/reset.css';
import Root from './Root';
import { AuthProvider } from './AuthContext';
import { ErrorBoundary } from './components/ErrorBoundary';

// 把 antd 的静态 message.xxx() 重定向到 <App> 提供的 dynamic instance，
// 消除 "Static function can not consume context like dynamic theme" 警告。
// 不改业务代码（24 个文件 / 143 处 message 调用），仅在启动时 hook 一次。
let _msgInstance: any = null;
(['success', 'error', 'warning', 'info', 'loading'] as const).forEach(k => {
  const orig = (antdMessage as any)[k]?.bind(antdMessage);
  (antdMessage as any)[k] = (...args: any[]) => {
    if (_msgInstance) return _msgInstance[k](...args);
    return orig?.(...args);
  };
});

function MessageBridge() {
  const { message } = AntdApp.useApp();
  React.useEffect(() => { _msgInstance = message; }, [message]);
  return null;
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <ConfigProvider
    locale={zhCN}
    theme={{
      token: {
        colorPrimary: '#1677ff',
        borderRadius: 6,
        fontSize: 14,
      },
    }}
  >
    <AntdApp>
      <MessageBridge />
      <ErrorBoundary>
        <AuthProvider>
          <Root />
        </AuthProvider>
      </ErrorBoundary>
    </AntdApp>
  </ConfigProvider>
);