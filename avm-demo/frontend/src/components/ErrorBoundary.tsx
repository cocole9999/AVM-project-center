/**
 * 全局 ErrorBoundary - 捕获 React 渲染错误并显示
 * 解决"页面空白但控制台才有错"的问题
 */
import React from 'react';
import { Result, Button, Collapse } from 'antd';

interface State {
  error: Error | null;
  info: React.ErrorInfo | null;
}

interface Props {
  children: React.ReactNode;
}

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null, info: null };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    this.setState({ error, info });
    // 也输出到 console
    console.error('[ErrorBoundary]', error, info);
  }

  reset = () => {
    this.setState({ error: null, info: null });
  };

  render() {
    if (this.state.error) {
      return (
        <Result
          status="error"
          title="页面渲染出错"
          subTitle={this.state.error.message || '未知错误'}
          extra={[
            <Button key="back" onClick={() => window.history.back()}>返回</Button>,
            <Button key="reload" type="primary" onClick={() => window.location.reload()}>刷新页面</Button>,
            <Button key="reset" onClick={this.reset}>重试</Button>,
          ]}
        >
          <Collapse
            items={[{
              key: 'stack',
              label: '查看错误详情（开发模式）',
              children: (
                <pre style={{ fontSize: 12, whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: 400, overflow: 'auto' }}>
                  {this.state.error.stack}
                  {'\n\n--- Component Stack ---\n'}
                  {this.state.info?.componentStack || '(无)'}
                </pre>
              ),
            }]}
          />
        </Result>
      );
    }
    return this.props.children;
  }
}
