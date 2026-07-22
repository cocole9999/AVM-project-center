/**
 * 登录页
 * 调真实 userApi.login()，登录成功跳首页
 */
import { useState } from 'react';
import { Card, Form, Input, Button, Typography, Space, Alert, Tag, message } from 'antd';
import { UserOutlined, LockOutlined, LoginOutlined, ProjectOutlined } from '@ant-design/icons';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../AuthContext';

const { Title, Text } = Typography;

const DEMO_ACCOUNTS = [
  { user: 'admin', pwd: 'admin123', label: '租户管理员', color: 'gold' },
  { user: 'pm', pwd: 'pm123', label: '空间管理员', color: 'blue' },
  { user: 'zhangsan', pwd: '123456', label: '业务负责人', color: 'cyan' },
  { user: 'lisi', pwd: '123456', label: '成员', color: 'default' },
];

export function LoginPage() {
  const { login, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [error, setError] = useState<string | null>(null);
  const [form] = Form.useForm();

  const from = (location.state as any)?.from || '/workbench';

  const handleSubmit = async (values: { username: string; password: string }) => {
    setError(null);
    try {
      const user = await login(values.username, values.password);
      message.success(`欢迎回来，${user.displayName}`);
      navigate(from, { replace: true });
    } catch (e: any) {
      setError(e.response?.data?.error || e.message || '登录失败');
    }
  };

  const quickFill = (u: typeof DEMO_ACCOUNTS[0]) => {
    form.setFieldsValue({ username: u.user, password: u.pwd });
  };

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    }}>
      <Card
        style={{ width: 440, boxShadow: '0 10px 40px rgba(0,0,0,0.2)', borderRadius: 12 }}
        styles={{ body: { padding: 32 } }}
      >
        <Space direction="vertical" size="middle" style={{ width: '100%' }}>
          <div style={{ textAlign: 'center' }}>
            <ProjectOutlined style={{ fontSize: 48, color: '#1677ff' }} />
            <Title level={3} style={{ marginTop: 12, marginBottom: 4 }}>AVM 项目中心</Title>
            <Text type="secondary">飞书项目内部替代品 · 企业版</Text>
          </div>

          {error && <Alert type="error" showIcon message={error} />}

          <Form form={form} layout="vertical" onFinish={handleSubmit} size="large">
            <Form.Item
              name="username"
              rules={[{ required: true, message: '请输入用户名' }]}
            >
              <Input prefix={<UserOutlined />} placeholder="用户名" autoComplete="username" />
            </Form.Item>
            <Form.Item
              name="password"
              rules={[{ required: true, message: '请输入密码' }]}
            >
              <Input.Password prefix={<LockOutlined />} placeholder="密码" autoComplete="current-password" />
            </Form.Item>
            <Form.Item style={{ marginBottom: 0 }}>
              <Button
                type="primary"
                htmlType="submit"
                loading={loading}
                block
                icon={<LoginOutlined />}
                size="large"
              >
                登录
              </Button>
            </Form.Item>
          </Form>

          <div style={{ background: '#fafafa', padding: 12, borderRadius: 6 }}>
            <Text type="secondary" style={{ fontSize: 12 }}>演示账号（点击自动填充）</Text>
            <div style={{ marginTop: 8, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {DEMO_ACCOUNTS.map(a => (
                <Tag
                  key={a.user}
                  color={a.color}
                  style={{ cursor: 'pointer', userSelect: 'none' }}
                  onClick={() => quickFill(a)}
                >
                  {a.user} / {a.pwd} · {a.label}
                </Tag>
              ))}
            </div>
          </div>

          <div style={{ textAlign: 'center', fontSize: 12, color: '#999' }}>
            生产环境接入飞书 OAuth：<code>FEISHU_APP_ID</code> + <code>FEISHU_APP_SECRET</code>
          </div>
        </Space>
      </Card>
    </div>
  );
}
