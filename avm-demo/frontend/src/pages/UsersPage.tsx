/**
 * V1.12.2 用户管理 UI
 *
 * - 列表所有用户
 * - admin 可改角色/启停/重置密码
 * - admin 可创建新用户
 * - 普通用户访问应被后端 403 拒绝
 */
import { useEffect, useMemo, useState } from 'react';
import {
  Card, Table, Tag, Button, Space, Modal, Form, Input, Select, Switch,
  App, Avatar, Tooltip, Statistic, Row, Col,
} from 'antd';
import {
  UserOutlined, PlusOutlined, ReloadOutlined, KeyOutlined,
  EditOutlined, LockOutlined, UnlockOutlined, TeamOutlined,
} from '@ant-design/icons';
import { userApi } from '../api';
import { useAuth } from '../AuthContext';

interface User {
  id: string;
  username: string;
  displayName: string;
  email?: string | null;
  department?: string | null;
  role: string;
  active: boolean;
  createdAt: string;
  lastLoginAt?: string | null;
}

const ROLE_LEVEL: Record<string, number> = { member: 0, space_admin: 1, tenant_admin: 2 };
const ROLE_COLOR: Record<string, string> = { tenant_admin: 'red', space_admin: 'orange', biz_admin: 'blue', member: 'default' };
const ROLE_LABEL: Record<string, string> = { tenant_admin: '租户管理员', space_admin: '空间管理员', biz_admin: '业务管理员', member: '成员' };

export function UsersPage() {
  const { user: me } = useAuth();
  const { message, modal } = App.useApp();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [keyword, setKeyword] = useState('');
  const [editing, setEditing] = useState<User | null>(null);
  const [editForm] = Form.useForm();
  const [creating, setCreating] = useState(false);
  const [createForm] = Form.useForm();
  const [resetPwd, setResetPwd] = useState<User | null>(null);
  const [pwdForm] = Form.useForm();

  const isAdmin = me?.role === 'tenant_admin';

  const load = async () => {
    setLoading(true);
    try {
      const list = await userApi.list();
      setUsers(list);
    } catch (e: any) {
      message.error('加载失败：' + e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    if (!keyword.trim()) return users;
    const k = keyword.toLowerCase();
    return users.filter(u =>
      u.username.toLowerCase().includes(k) ||
      u.displayName.toLowerCase().includes(k) ||
      (u.department || '').toLowerCase().includes(k)
    );
  }, [users, keyword]);

  const stats = useMemo(() => {
    const byRole: Record<string, number> = {};
    users.forEach(u => { byRole[u.role] = (byRole[u.role] || 0) + 1; });
    return {
      total: users.length,
      active: users.filter(u => u.active).length,
      inactive: users.filter(u => !u.active).length,
      byRole,
    };
  }, [users]);

  // 改角色
  const saveRole = async () => {
    if (!editing) return;
    try {
      const values = await editForm.validateFields();
      await userApi.update(editing.id, { role: values.role, department: values.department });
      message.success(`✓ ${editing.displayName} 角色已更新为 ${ROLE_LABEL[values.role] || values.role}`);
      setEditing(null);
      load();
    } catch (e: any) {
      if (e.errorFields) return;
      message.error('保存失败：' + e.message);
    }
  };

  // 启停
  const toggleActive = async (u: User) => {
    if (u.id === me?.id) {
      message.warning('不能停用自己');
      return;
    }
    const action = u.active ? '停用' : '启用';
    modal.confirm({
      title: `${action}用户 ${u.displayName}?`,
      content: u.active ? '停用后该用户将无法登录' : '启用后该用户可正常登录',
      onOk: async () => {
        try {
          await userApi.update(u.id, { active: !u.active });
          message.success(`✓ ${u.displayName} 已${action}`);
          load();
        } catch (e: any) {
          message.error('操作失败：' + e.message);
        }
      },
    });
  };

  // 创建
  const submitCreate = async () => {
    try {
      const values = await createForm.validateFields();
      await userApi.create(values);
      message.success(`✓ 用户 ${values.displayName} 创建成功`);
      setCreating(false);
      createForm.resetFields();
      load();
    } catch (e: any) {
      if (e.errorFields) return;
      message.error('创建失败：' + e.message);
    }
  };

  // 重置密码
  const submitResetPwd = async () => {
    if (!resetPwd) return;
    try {
      const values = await pwdForm.validateFields();
      await userApi.update(resetPwd.id, { password: values.password });
      message.success(`✓ ${resetPwd.displayName} 密码已重置`);
      setResetPwd(null);
      pwdForm.resetFields();
    } catch (e: any) {
      if (e.errorFields) return;
      message.error('重置失败：' + e.message);
    }
  };

  if (!isAdmin) {
    return (
      <Card>
        <div style={{ textAlign: 'center', padding: 60 }}>
          <LockOutlined style={{ fontSize: 48, color: '#ccc' }} />
          <div style={{ marginTop: 16, fontSize: 16, color: '#999' }}>
            用户管理仅限租户管理员（tenant_admin）访问
          </div>
          <div style={{ marginTop: 8, fontSize: 13, color: '#bbb' }}>
            当前角色: {ROLE_LABEL[me?.role || 'member'] || me?.role}
          </div>
        </div>
      </Card>
    );
  }

  return (
    <div>
      {/* 顶部统计 */}
      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col span={6}><Card><Statistic title="用户总数" value={stats.total} prefix={<TeamOutlined />} /></Card></Col>
        <Col span={6}><Card><Statistic title="活跃" value={stats.active} valueStyle={{ color: '#52c41a' }} /></Card></Col>
        <Col span={6}><Card><Statistic title="已停用" value={stats.inactive} valueStyle={{ color: stats.inactive > 0 ? '#fa8c16' : '#999' }} /></Card></Col>
        <Col span={6}>
          <Card>
            <div style={{ fontSize: 13, color: '#666', marginBottom: 8 }}>角色分布</div>
            <Space wrap>
              {Object.entries(stats.byRole).map(([r, c]) => (
                <Tag key={r} color={ROLE_COLOR[r] || 'default'}>{ROLE_LABEL[r] || r} × {c}</Tag>
              ))}
            </Space>
          </Card>
        </Col>
      </Row>

      <Card
        title={<Space><UserOutlined /><span>用户管理</span></Space>}
        extra={
          <Space>
            <Input.Search
              placeholder="搜索用户名 / 姓名 / 部门"
              allowClear
              style={{ width: 260 }}
              onSearch={setKeyword}
            />
            <Button icon={<ReloadOutlined />} onClick={load} loading={loading}>刷新</Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreating(true)}>新建用户</Button>
          </Space>
        }
      >
        <Table
          rowKey="id"
          loading={loading}
          dataSource={filtered}
          pagination={{ pageSize: 20, showSizeChanger: true, showTotal: (t) => `共 ${t} 人` }}
          columns={[
            {
              title: '用户', dataIndex: 'displayName', width: 220,
              render: (n, r) => (
                <Space>
                  <Avatar size="small" style={{ background: r.active ? '#1677ff' : '#bfbfbf' }}>{n?.[0] || '?'}</Avatar>
                  <div>
                    <div style={{ fontWeight: 500 }}>{n}</div>
                    <div style={{ fontSize: 11, color: '#999' }}>@{r.username}</div>
                  </div>
                </Space>
              ),
            },
            {
              title: '角色', dataIndex: 'role', width: 140,
              render: (r) => <Tag color={ROLE_COLOR[r] || 'default'}>{ROLE_LABEL[r] || r}</Tag>,
            },
            { title: '部门', dataIndex: 'department', width: 140, render: (d) => d || <span style={{ color: '#ccc' }}>-</span> },
            { title: '邮箱', dataIndex: 'email', width: 200, render: (e) => e || <span style={{ color: '#ccc' }}>-</span> },
            {
              title: '状态', dataIndex: 'active', width: 100,
              render: (a, r) => (
                <Tooltip title={a ? '点击停用' : '点击启用'}>
                  <Switch
                    size="small"
                    checked={a}
                    disabled={r.id === me?.id}
                    onChange={() => toggleActive(r)}
                    checkedChildren="启用"
                    unCheckedChildren="停用"
                  />
                </Tooltip>
              ),
            },
            {
              title: '最后登录', dataIndex: 'lastLoginAt', width: 160,
              render: (t) => t ? new Date(t).toLocaleString('zh-CN') : <span style={{ color: '#ccc' }}>从未</span>,
            },
            {
              title: '操作', width: 200, fixed: 'right',
              render: (_, r) => (
                <Space size="small">
                  <Button size="small" icon={<EditOutlined />} onClick={() => {
                    setEditing(r);
                    editForm.setFieldsValue({ role: r.role, department: r.department || '' });
                  }}>改角色</Button>
                  <Button size="small" icon={<KeyOutlined />} onClick={() => {
                    setResetPwd(r);
                    pwdForm.resetFields();
                  }}>重置密码</Button>
                </Space>
              ),
            },
          ]}
        />
      </Card>

      {/* 改角色 Modal */}
      <Modal
        title={editing ? `修改角色 - ${editing.displayName}` : ''}
        open={!!editing}
        onCancel={() => setEditing(null)}
        onOk={saveRole}
        okText="保存"
        cancelText="取消"
        destroyOnClose
      >
        <Form form={editForm} layout="vertical">
          <Form.Item name="role" label="角色" rules={[{ required: true }]}>
            <Select
              options={Object.entries(ROLE_LABEL).map(([k, v]) => ({ value: k, label: `${v} (level ${ROLE_LEVEL[k] || 0})` }))}
            />
          </Form.Item>
          <Form.Item name="department" label="部门">
            <Input placeholder="如：AVM 中台 / 研发一组" />
          </Form.Item>
          <div style={{ background: '#fffbe6', padding: 8, borderRadius: 4, fontSize: 12, color: '#666' }}>
            💡 角色权限：
            <br />· <b>成员 (member)</b>：只读 + 自己负责的可改
            <br />· <b>业务管理员 (biz_admin)</b>：业务数据可改
            <br />· <b>空间管理员 (space_admin)</b>：空间内可创建/更新
            <br />· <b>租户管理员 (tenant_admin)</b>：全部权限 + 角色管理
          </div>
        </Form>
      </Modal>

      {/* 新建用户 Modal */}
      <Modal
        title="新建用户"
        open={creating}
        onCancel={() => setCreating(false)}
        onOk={submitCreate}
        okText="创建"
        cancelText="取消"
        destroyOnClose
      >
        <Form form={createForm} layout="vertical">
          <Form.Item name="username" label="用户名" rules={[{ required: true, min: 3, max: 20, pattern: /^[a-zA-Z0-9_]+$/, message: '3-20 位字母/数字/下划线' }]}>
            <Input placeholder="如 zhangsan" />
          </Form.Item>
          <Form.Item name="displayName" label="显示名" rules={[{ required: true, max: 30 }]}>
            <Input placeholder="如 张三" />
          </Form.Item>
          <Form.Item name="password" label="初始密码" rules={[{ required: true, min: 6, message: '至少 6 位' }]}>
            <Input.Password placeholder="至少 6 位" />
          </Form.Item>
          <Form.Item name="email" label="邮箱">
            <Input placeholder="可选" />
          </Form.Item>
          <Form.Item name="department" label="部门">
            <Input placeholder="如：研发一组" />
          </Form.Item>
          <Form.Item name="role" label="角色" initialValue="member" rules={[{ required: true }]}>
            <Select
              options={Object.entries(ROLE_LABEL).map(([k, v]) => ({ value: k, label: v }))}
            />
          </Form.Item>
        </Form>
      </Modal>

      {/* 重置密码 Modal */}
      <Modal
        title={resetPwd ? `重置密码 - ${resetPwd.displayName}` : ''}
        open={!!resetPwd}
        onCancel={() => setResetPwd(null)}
        onOk={submitResetPwd}
        okText="重置"
        cancelText="取消"
        destroyOnClose
      >
        <Form form={pwdForm} layout="vertical">
          <Form.Item name="password" label="新密码" rules={[{ required: true, min: 6, message: '至少 6 位' }]}>
            <Input.Password placeholder="至少 6 位" />
          </Form.Item>
          <Form.Item name="confirm" label="确认密码" dependencies={['password']} rules={[
            { required: true, message: '请再次输入' },
            ({ getFieldValue }) => ({
              validator(_, value) {
                if (!value || getFieldValue('password') === value) return Promise.resolve();
                return Promise.reject(new Error('两次输入不一致'));
              },
            }),
          ]}>
            <Input.Password placeholder="再次输入" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
