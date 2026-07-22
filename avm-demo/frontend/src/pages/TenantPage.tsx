/**
 * 企业管理页面
 * - 租户 CRUD
 * - SSO 配置（飞书）
 * - 登录日志
 */
import { useEffect, useState } from 'react';
import {
  Card, Table, Tag, Space, Button, Modal, Form, Input, Select, Switch, message, Tabs,
  Empty, Alert, Drawer, Statistic, Row, Col, Popconfirm, Tooltip, Input as AntInput,
} from 'antd';
import {
  BankOutlined, PlusOutlined, EditOutlined, DeleteOutlined, KeyOutlined,
  SafetyCertificateOutlined, HistoryOutlined, LinkOutlined, RocketOutlined,
  CheckCircleOutlined, CloseCircleOutlined,
} from '@ant-design/icons';
import { ssoApi } from '../api';

const PLAN_LABEL: Record<string, { label: string; color: string }> = {
  standard: { label: '标准版', color: 'blue' },
  pro: { label: '专业版', color: 'purple' },
  enterprise: { label: '企业版', color: 'gold' },
};

const PROVIDER_LABEL: Record<string, { label: string; icon: string; color: string }> = {
  feishu: { label: '飞书', icon: '🚀', color: 'blue' },
  dingtalk: { label: '钉钉', icon: '📞', color: 'cyan' },
  wechatwork: { label: '企业微信', icon: '💬', color: 'green' },
};

export function TenantPage() {
  const [tenants, setTenants] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form] = Form.useForm();
  const [drawerTenant, setDrawerTenant] = useState<any>(null);
  const [drawerSettings, setDrawerSettings] = useState<any[]>([]);
  const [drawerStats, setDrawerStats] = useState<any>(null);
  const [drawerLogs, setDrawerLogs] = useState<any[]>([]);
  const [settingForm] = Form.useForm();
  const [editingProvider, setEditingProvider] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const list = await ssoApi.listTenants();
      setTenants(list);
    } catch (e: any) { message.error(e.message); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const openCreate = () => {
    setEditing(null);
    form.resetFields();
    setModalOpen(true);
  };

  const openEdit = (t: any) => {
    setEditing(t);
    form.setFieldsValue(t);
    setModalOpen(true);
  };

  const submit = async () => {
    try {
      const v = await form.validateFields();
      if (editing) {
        await ssoApi.updateTenant(editing.id, v);
        message.success('已更新');
      } else {
        await ssoApi.createTenant(v);
        message.success('已创建');
      }
      setModalOpen(false);
      load();
    } catch (e: any) { message.error(e.message); }
  };

  const remove = async (id: string) => {
    try { await ssoApi.deleteTenant(id); message.success('已删除'); load(); }
    catch (e: any) { message.error(e.message); }
  };

  const openDrawer = async (t: any) => {
    setDrawerTenant(t);
    setEditingProvider(null);
    settingForm.resetFields();
    try {
      const [settings, stats, logs] = await Promise.all([
        ssoApi.getSettings(t.id),
        ssoApi.tenantStats(t.id),
        ssoApi.logs({ tenantId: t.id, limit: 20 }),
      ]);
      setDrawerSettings(settings);
      setDrawerStats(stats);
      setDrawerLogs(logs);
    } catch (e: any) { message.error(e.message); }
  };

  const upsertSetting = async (provider: string) => {
    try {
      const v = await settingForm.validateFields();
      await ssoApi.upsertSetting(drawerTenant.id, provider, v);
      message.success(`${PROVIDER_LABEL[provider].label} 配置已保存`);
      setEditingProvider(null);
      const settings = await ssoApi.getSettings(drawerTenant.id);
      setDrawerSettings(settings);
    } catch (e: any) { message.error(e.message); }
  };

  const tryFeishuLogin = async () => {
    try {
      const r = await ssoApi.feishuLoginUrl(drawerTenant.id);
      Modal.info({
        title: '飞书 OAuth 授权地址',
        width: 600,
        content: (
          <div>
            <p>请把下面地址发给用户，或嵌入"飞书登录"按钮：</p>
            <Input.TextArea rows={3} value={r.authUrl} readOnly />
            <p style={{ marginTop: 12, color: '#999', fontSize: 12 }}>
              state: {r.state}<br />
              生产环境需在飞书开放平台配置回调地址：{drawerTenant.code ? `${drawerTenant.code}.` : ''}...
            </p>
          </div>
        ),
      });
    } catch (e: any) { message.error(e.message); }
  };

  const demoLogin = async () => {
    try {
      const r = await ssoApi.demoLogin('feishu', {
        tenantId: drawerTenant.id,
        openId: `ou_demo_${Date.now().toString(36)}`,
        userName: `演示用户 ${Math.floor(Math.random() * 1000)}`,
      });
      message.success(`登录成功，token: ${r.token.slice(0, 16)}...`);
      const logs = await ssoApi.logs({ tenantId: drawerTenant.id, limit: 20 });
      setDrawerLogs(logs);
    } catch (e: any) { message.error(e.message); }
  };

  return (
    <div>
      <Card
        title={
          <Space>
            <BankOutlined />
            <span>企业管理（企业版）</span>
            <Tag color="gold">V1.6</Tag>
          </Space>
        }
        extra={
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
            新建企业
          </Button>
        }
        style={{ borderRadius: 8 }}
      >
        <Alert
          type="info" showIcon style={{ marginBottom: 12 }}
          message="企业版功能：多租户隔离 + 飞书/钉钉/企微 SSO 登录"
          description={
            <div>
              点击企业行进入详情，可生成飞书 OAuth 授权地址，或快速试登录生成 token。
              生产环境需在 SSO 设置里填入飞书开放平台的 App ID / App Secret。
            </div>
          }
        />
        <Table
          rowKey="id" loading={loading} dataSource={tenants} pagination={{ pageSize: 10 }}
          columns={[
            { title: '企业代码', dataIndex: 'code', width: 120, render: v => <code>{v}</code> },
            { title: '企业名称', dataIndex: 'name', render: (v, r) => <a onClick={() => openDrawer(r)}>{v}</a> },
            { title: '简称', dataIndex: 'shortName', width: 120 },
            {
              title: '套餐', dataIndex: 'plan', width: 100,
              render: v => { const p = PLAN_LABEL[v] || { label: v, color: 'default' }; return <Tag color={p.color}>{p.label}</Tag>; },
            },
            { title: '用户数', render: (_v, r) => `${r.maxUsers} 人` , width: 100 },
            {
              title: '状态', dataIndex: 'status', width: 90,
              render: v => v === 'active' ? <Tag color="success">正常</Tag> : <Tag color="error">停用</Tag>,
            },
            {
              title: '创建', dataIndex: 'createdAt', width: 160,
              render: v => new Date(v).toLocaleDateString('zh-CN'),
            },
            {
              title: '操作', width: 180, fixed: 'right',
              render: (_v, r) => (
                <Space>
                  <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(r)}>编辑</Button>
                  <Popconfirm title="确定删除？" onConfirm={() => remove(r.id)}>
                    <Button size="small" icon={<DeleteOutlined />} danger>删除</Button>
                  </Popconfirm>
                </Space>
              ),
            },
          ]}
        />
      </Card>

      <Modal
        open={modalOpen} title={editing ? '编辑企业' : '新建企业'}
        onCancel={() => setModalOpen(false)} onOk={submit} width={560}
        destroyOnClose
      >
        <Form form={form} layout="vertical" preserve={false}>
          <Form.Item name="code" label="企业代码" rules={[{ required: true, message: '请输入代码' }]}>
            <Input placeholder="acme / tencent 等短代码" />
          </Form.Item>
          <Form.Item name="name" label="企业名称" rules={[{ required: true }]}>
            <Input placeholder="Acme Corp" />
          </Form.Item>
          <Form.Item name="shortName" label="简称">
            <Input placeholder="Acme" />
          </Form.Item>
          <Form.Item name="plan" label="套餐" initialValue="standard">
            <Select options={[
              { value: 'standard', label: '标准版' },
              { value: 'pro', label: '专业版' },
              { value: 'enterprise', label: '企业版' },
            ]} />
          </Form.Item>
          <Form.Item name="maxUsers" label="许可用户数" initialValue={100}>
            <AntInput type="number" min={1} />
          </Form.Item>
          <Form.Item name="contact" label="联系人">
            <Input />
          </Form.Item>
          <Form.Item name="phone" label="联系电话">
            <Input />
          </Form.Item>
        </Form>
      </Modal>

      <Drawer
        open={!!drawerTenant} onClose={() => setDrawerTenant(null)}
        width={720} destroyOnClose
        title={
          drawerTenant && (
            <Space>
              <BankOutlined />
              <span>{drawerTenant.name}</span>
              <Tag color="blue">{drawerTenant.code}</Tag>
            </Space>
          )
        }
      >
        {drawerTenant && drawerStats && (
          <Tabs defaultActiveKey="overview" items={[
            {
              key: 'overview', label: <span><BankOutlined /> 概览</span>,
              children: (
                <div>
                  <Row gutter={12}>
                    <Col span={8}>
                      <Card><Statistic title="用户数" value={drawerStats.userCount} suffix={`/ ${drawerTenant.maxUsers}`} /></Card>
                    </Col>
                    <Col span={8}>
                      <Card><Statistic title="SSO 登录次数" value={drawerStats.ssoLogCount} /></Card>
                    </Col>
                    <Col span={8}>
                      <Card><Statistic title="已配置 SSO" value={drawerStats.ssoSettings?.length || 0} /></Card>
                    </Col>
                  </Row>
                  <Card style={{ marginTop: 12 }} title="基本信息">
                    <Form layout="vertical" initialValues={drawerTenant} onFinish={async v => {
                      await ssoApi.updateTenant(drawerTenant.id, v);
                      message.success('已更新');
                    }}>
                      <Row gutter={12}>
                        <Col span={12}><Form.Item name="name" label="名称"><Input /></Form.Item></Col>
                        <Col span={12}><Form.Item name="shortName" label="简称"><Input /></Form.Item></Col>
                      </Row>
                      <Row gutter={12}>
                        <Col span={12}><Form.Item name="contact" label="联系人"><Input /></Form.Item></Col>
                        <Col span={12}><Form.Item name="phone" label="电话"><Input /></Form.Item></Col>
                      </Row>
                      <Button type="primary" htmlType="submit">保存</Button>
                    </Form>
                  </Card>
                </div>
              ),
            },
            {
              key: 'sso', label: <span><KeyOutlined /> SSO 配置</span>,
              children: (
                <div>
                  <Space style={{ marginBottom: 12 }}>
                    <Button type="primary" icon={<RocketOutlined />} onClick={tryFeishuLogin}>
                      生成飞书登录地址
                    </Button>
                    <Button icon={<SafetyCertificateOutlined />} onClick={demoLogin}>
                      模拟飞书登录
                    </Button>
                  </Space>
                  <div style={{ marginBottom: 12, color: '#666', fontSize: 12 }}>
                    模拟登录会用随机的 openId 在本租户下创建/匹配用户，写入登录日志。
                  </div>

                  {(['feishu', 'dingtalk', 'wechatwork'] as const).map(provider => {
                    const setting = drawerSettings.find((s: any) => s.provider === provider);
                    const p = PROVIDER_LABEL[provider];
                    const isEditing = editingProvider === provider;
                    return (
                      <Card
                        key={provider}
                        size="small"
                        style={{ marginBottom: 12, borderRadius: 6 }}
                        title={
                          <Space>
                            <span style={{ fontSize: 16 }}>{p.icon}</span>
                            <span>{p.label}</span>
                            {setting?.enabled ? <Tag color="success">已启用</Tag> : <Tag>未启用</Tag>}
                          </Space>
                        }
                        extra={
                          <Space>
                            {setting && !isEditing && (
                              <Button size="small" icon={<EditOutlined />} onClick={() => {
                                setEditingProvider(provider);
                                settingForm.setFieldsValue({
                                  enabled: setting.enabled, appId: setting.appId,
                                  appSecret: '', redirectUri: setting.redirectUri,
                                  corpId: setting.corpId, agentId: setting.agentId,
                                });
                              }}>编辑</Button>
                            )}
                            {isEditing && (
                              <>
                                <Button size="small" onClick={() => setEditingProvider(null)}>取消</Button>
                                <Button size="small" type="primary" onClick={() => upsertSetting(provider)}>保存</Button>
                              </>
                            )}
                          </Space>
                        }
                      >
                        {isEditing ? (
                          <Form form={settingForm} layout="vertical">
                            <Form.Item name="enabled" label="启用" valuePropName="checked">
                              <Switch />
                            </Form.Item>
                            <Row gutter={12}>
                              <Col span={12}><Form.Item name="appId" label="App ID"><Input placeholder="cli_xxx" /></Form.Item></Col>
                              <Col span={12}><Form.Item name="appSecret" label="App Secret"><Input.Password placeholder="留空则保留原值" /></Form.Item></Col>
                            </Row>
                            <Form.Item name="redirectUri" label="回调地址">
                              <Input placeholder="http://localhost:5173/sso/feishu/callback" />
                            </Form.Item>
                            {provider === 'wechatwork' && (
                              <Row gutter={12}>
                                <Col span={12}><Form.Item name="corpId" label="Corp ID"><Input /></Form.Item></Col>
                                <Col span={12}><Form.Item name="agentId" label="Agent ID"><Input /></Form.Item></Col>
                              </Row>
                            )}
                          </Form>
                        ) : setting ? (
                          <Form layout="vertical" size="small">
                            <Row gutter={12}>
                              <Col span={12}><Form.Item label="App ID"><Input value={setting.appId} disabled /></Form.Item></Col>
                              <Col span={12}><Form.Item label="App Secret"><Input value={setting.appSecret} disabled /></Form.Item></Col>
                            </Row>
                            <Form.Item label="回调地址"><Input value={setting.redirectUri} disabled /></Form.Item>
                          </Form>
                        ) : (
                          <Button type="dashed" block icon={<PlusOutlined />} onClick={() => {
                            setEditingProvider(provider);
                            settingForm.setFieldsValue({ enabled: true, redirectUri: `http://localhost:5173/sso/${provider}/callback` });
                          }}>
                            配置 {p.label} SSO
                          </Button>
                        )}
                      </Card>
                    );
                  })}
                </div>
              ),
            },
            {
              key: 'logs', label: <span><HistoryOutlined /> 登录日志</span>,
              children: drawerLogs.length === 0 ? <Empty description="暂无登录日志" /> : (
                <Table
                  rowKey="id" size="small" dataSource={drawerLogs} pagination={{ pageSize: 10 }}
                  columns={[
                    { title: '时间', dataIndex: 'createdAt', width: 160, render: v => new Date(v).toLocaleString('zh-CN') },
                    { title: '用户', dataIndex: 'userName' },
                    { title: 'Provider', dataIndex: 'provider' },
                    {
                      title: '结果', dataIndex: 'success', width: 80,
                      render: v => v ? <Tag color="success" icon={<CheckCircleOutlined />}>成功</Tag>
                                          : <Tag color="error" icon={<CloseCircleOutlined />}>失败</Tag>,
                    },
                    { title: 'IP', dataIndex: 'ip', width: 120 },
                    { title: '错误', dataIndex: 'errorMsg', render: v => v || '-' },
                  ]}
                />
              ),
            },
          ]} />
        )}
      </Drawer>
    </div>
  );
}
