/**
 * V1.7 客户管理页面
 * AVM 集成项目的客户档案（吉利各车型项目组）
 * - 客户列表（搜索 + 按品牌/状态过滤）
 * - 客户详情：基本信息 + 联系人（UPL/PPM/测试/开发/AVM接口人） + 关联项目
 */
import { useEffect, useMemo, useState } from 'react';
import {
  Card, Table, Tag, Space, Button, Input, Select, Modal, Form, App, message,
  Tabs, Row, Col, Statistic, Avatar, Drawer, Empty, Tooltip, Badge, Popconfirm,
  Dropdown,
} from 'antd';
import {
  SearchOutlined, PlusOutlined, TeamOutlined, BankOutlined,
  EditOutlined, DeleteOutlined, PhoneOutlined, MailOutlined, UserOutlined,
  ProjectOutlined, DollarOutlined, CalendarOutlined, ReloadOutlined, ThunderboltOutlined,
  DownloadOutlined,
} from '@ant-design/icons';
import { customerApi, contactApi, aiApi, type Customer, type Contact } from '../api';
import { downloadBlob, getFilenameFromResponse } from '../utils/download';

const STATUS_COLOR: Record<string, string> = {
  active: 'green', inactive: 'default', archived: 'red',
};
const ROLE_COLOR: Record<string, string> = {
  UPL: 'red', PPM: 'blue', 测试: 'orange', 开发: 'purple', AVM接口人: 'cyan',
};
const STATUS_LABEL: Record<string, string> = {
  active: '活跃', inactive: '停用', archived: '归档',
};

export function CustomerPage() {
  const [list, setList] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState('');
  const [statusFilter, setStatusFilter] = useState<string | undefined>();
  const [typeFilter, setTypeFilter] = useState<string | undefined>();
  const [editing, setEditing] = useState<Customer | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [form] = Form.useForm();
  const [stats, setStats] = useState<any>(null);
  const [activeTab, setActiveTab] = useState('info');
  const [aiFilling, setAiFilling] = useState(false);
  const [exporting, setExporting] = useState(false);

  const handleExport = async (format: 'xlsx' | 'csv') => {
    setExporting(true);
    try {
      const blob = await aiApi.exportCustomers({ format });
      const filename = getFilenameFromResponse((blob as any)?.headers, `customers-${new Date().toISOString().slice(0,10)}.${format}`);
      downloadBlob(blob as Blob, filename);
    } catch (e: any) {
      message.error('导出失败：' + e.message);
    } finally {
      setExporting(false);
    }
  };

  const handleAiFillCustomer = async () => {
    try {
      const v = await form.validateFields(['name']);
      if (!v.name) {
        message.warning('请先输入客户名称');
        return;
      }
      setAiFilling(true);
      const r = await aiApi.aiFillForm('customer', { name: v.name });
      if (r.filled) {
        form.setFieldsValue({
          shortName: r.filled.shortName || undefined,
          type: r.filled.type || 'internal',
          industry: r.filled.industry || undefined,
          contact: r.filled.contact || undefined,
          phone: r.filled.phone || undefined,
          email: r.filled.email || undefined,
          address: r.filled.address || undefined,
          description: r.filled.description || undefined,
        });
        message.success(r.reasoning || 'AI 已补全字段');
      }
    } catch (e: any) {
      if (e.errorFields) return;
      message.error('AI 填充失败：' + e.message);
    } finally {
      setAiFilling(false);
    }
  };

  const load = async () => {
    setLoading(true);
    try {
      const params: any = {};
      if (q) params.q = q;
      if (statusFilter) params.status = statusFilter;
      if (typeFilter) params.type = typeFilter;
      const [r, s] = await Promise.all([
        customerApi.list(params),
        customerApi.stats().catch(() => null),
      ]);
      setList(r);
      if (s) setStats(s);
    } catch (e) {
      message.error('加载客户失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [q, statusFilter, typeFilter]);

  const handleCreate = () => {
    setEditing(null);
    form.resetFields();
    form.setFieldsValue({ type: 'internal', status: 'active' });
    setDrawerOpen(true);
    setActiveTab('info');
  };

  const handleEdit = (c: Customer) => {
    setEditing(c);
    form.setFieldsValue(c);
    setDrawerOpen(true);
    setActiveTab('info');
  };

  const handleDelete = async (id: string) => {
    try {
      await customerApi.remove(id);
      message.success('已删除');
      load();
    } catch (e: any) {
      message.error('删除失败：' + (e?.response?.data?.error || e.message));
    }
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      if (editing) {
        await customerApi.update(editing.id, values);
        message.success('已更新');
      } else {
        await customerApi.create(values);
        message.success('已创建');
      }
      setDrawerOpen(false);
      load();
    } catch (e: any) {
      if (e?.errorFields) return;
      message.error('保存失败：' + (e?.response?.data?.error || e.message));
    }
  };

  // 过滤后统计
  const totalProjects = useMemo(() => list.reduce((s, c) => s + (c._count?.projects || 0), 0), [list]);
  const totalContacts = useMemo(() => list.reduce((s, c) => s + (c._count?.contacts || 0), 0), [list]);
  const totalContract = useMemo(() => list.reduce((s, c) =>
    s + (c.projects || []).reduce((s2: number, p: any) => s2 + (p.contractAmount || 0), 0), 0), [list]);

  const columns = [
    {
      title: '客户名称',
      dataIndex: 'name',
      key: 'name',
      width: 280,
      render: (v: string, r: Customer) => (
        <Space>
          <Avatar style={{ background: r.type === 'internal' ? '#1890ff' : '#52c41a' }} icon={<BankOutlined />} size="small" />
          <div>
            <div style={{ fontWeight: 500 }}>{v}</div>
            <div style={{ fontSize: 11, color: '#999' }}>{r.code} · {r.shortName}</div>
          </div>
        </Space>
      ),
    },
    {
      title: '类型',
      dataIndex: 'type',
      key: 'type',
      width: 100,
      render: (v: string) => <Tag color={v === 'internal' ? 'blue' : 'green'}>{v === 'internal' ? '内部' : '外部'}</Tag>,
    },
    {
      title: '主联系人',
      dataIndex: 'contact',
      key: 'contact',
      width: 160,
      render: (v: string) => v || '-',
    },
    {
      title: '联系信息',
      key: 'contactInfo',
      width: 220,
      render: (_: any, r: Customer) => (
        <Space direction="vertical" size={0} style={{ fontSize: 12 }}>
          {r.phone && <span><PhoneOutlined /> {r.phone}</span>}
          {r.email && <span style={{ color: '#999' }}><MailOutlined /> {r.email}</span>}
        </Space>
      ),
    },
    {
      title: '项目数',
      key: 'projects',
      width: 90,
      render: (_: any, r: Customer) => (
        <Tooltip title={`已关联 ${r._count?.projects || 0} 个 AVM 集成项目`}>
          <Badge count={r._count?.projects || 0} showZero color="#1890ff" />
        </Tooltip>
      ),
    },
    {
      title: '联系人数',
      key: 'contacts',
      width: 100,
      render: (_: any, r: Customer) => (
        <Tooltip title={`UPL/PPM/测试/开发/AVM接口人 共 ${r._count?.contacts || 0} 人`}>
          <Tag icon={<TeamOutlined />} color="cyan">{r._count?.contacts || 0} 人</Tag>
        </Tooltip>
      ),
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 90,
      render: (v: string) => <Tag color={STATUS_COLOR[v]}>{STATUS_LABEL[v] || v}</Tag>,
    },
    {
      title: '操作',
      key: 'actions',
      width: 140,
      fixed: 'right' as const,
      render: (_: any, r: Customer) => (
        <Space size="small">
          <Button type="link" size="small" icon={<EditOutlined />} onClick={() => handleEdit(r)}>编辑</Button>
          <Popconfirm
            title="确定删除该客户？"
            description="关联的联系人/项目不受影响"
            onConfirm={() => handleDelete(r.id)}
          >
            <Button type="link" size="small" danger icon={<DeleteOutlined />}>删除</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      {/* 顶部统计 */}
      <Row gutter={12} style={{ marginBottom: 12 }}>
        <Col span={5}>
          <Card size="small" style={{ borderRadius: 8 }}>
            <Statistic title="客户总数" value={list.length} prefix={<BankOutlined />} />
          </Card>
        </Col>
        <Col span={5}>
          <Card size="small" style={{ borderRadius: 8 }}>
            <Statistic title="活跃客户" value={list.filter(c => c.status === 'active').length} valueStyle={{ color: '#52c41a' }} />
          </Card>
        </Col>
        <Col span={5}>
          <Card size="small" style={{ borderRadius: 8 }}>
            <Statistic title="关联项目" value={totalProjects} prefix={<ProjectOutlined />} valueStyle={{ color: '#1890ff' }} />
          </Card>
        </Col>
        <Col span={5}>
          <Card size="small" style={{ borderRadius: 8 }}>
            <Statistic
              title="合同总额（万元）"
              value={(totalContract / 10000).toFixed(0)}
              prefix={<DollarOutlined />}
              valueStyle={{ color: '#fa8c16' }}
            />
          </Card>
        </Col>
        <Col span={4}>
          <Card size="small" style={{ borderRadius: 8 }}>
            <Statistic title="联系人" value={totalContacts} prefix={<TeamOutlined />} />
          </Card>
        </Col>
      </Row>

      {/* 过滤栏 */}
      <Card size="small" style={{ marginBottom: 12, borderRadius: 8 }}>
        <Space wrap>
          <Input
            placeholder="搜索客户名称/编号/联系人"
            allowClear
            value={q}
            onChange={e => setQ(e.target.value)}
            style={{ width: 240 }}
            prefix={<SearchOutlined />}
          />
          <Select
            placeholder="客户类型"
            allowClear
            value={typeFilter}
            onChange={setTypeFilter}
            style={{ width: 130 }}
            options={[
              { value: 'internal', label: '内部' },
              { value: 'external', label: '外部' },
            ]}
          />
          <Select
            placeholder="状态"
            allowClear
            value={statusFilter}
            onChange={setStatusFilter}
            style={{ width: 110 }}
            options={[
              { value: 'active', label: '活跃' },
              { value: 'inactive', label: '停用' },
              { value: 'archived', label: '归档' },
            ]}
          />
          <Button icon={<ReloadOutlined />} onClick={load}>刷新</Button>
          <Dropdown
            menu={{
              items: [
                { key: 'xlsx', label: '导出 Excel (.xlsx)', onClick: () => handleExport('xlsx') },
                { key: 'csv', label: '导出 CSV (.csv)', onClick: () => handleExport('csv') },
              ],
            }}
          >
            <Button icon={<DownloadOutlined />} loading={exporting}>导出</Button>
          </Dropdown>
          <Button type="primary" icon={<PlusOutlined />} onClick={handleCreate}>
            新建客户
          </Button>
        </Space>
      </Card>

      {/* 客户列表 */}
      <Card style={{ borderRadius: 8 }}>
        <Table
          rowKey="id"
          columns={columns}
          dataSource={list}
          loading={loading}
          pagination={{ pageSize: 20, showSizeChanger: true }}
          scroll={{ x: 1200 }}
        />
      </Card>

      {/* 编辑/创建 Drawer */}
      <Drawer
        title={editing ? `编辑客户：${editing.name}` : '新建客户'}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        forceRender
        width={720}
        extra={
          <Space>
            <Button icon={<ThunderboltOutlined />} onClick={handleAiFillCustomer} loading={aiFilling}>
              AI 帮我填
            </Button>
            <Button onClick={() => setDrawerOpen(false)}>取消</Button>
            <Button type="primary" onClick={handleSubmit}>保存</Button>
          </Space>
        }
      >
        {editing && (
          <CustomerDetail customer={editing} activeTab={activeTab} setActiveTab={setActiveTab} />
        )}
        {!editing && (
          <Form form={form} layout="vertical">
            <Form.Item name="code" label="客户编号" rules={[{ required: true }]}>
              <Input placeholder="如 GEELY-GALAXY-L7" />
            </Form.Item>
            <Form.Item name="name" label="客户名称" rules={[{ required: true }]}>
              <Input placeholder="如 吉利银河 L7 项目组" />
            </Form.Item>
            <Form.Item name="shortName" label="简称">
              <Input placeholder="如 银河L7" />
            </Form.Item>
            <Row gutter={12}>
              <Col span={12}>
                <Form.Item name="type" label="客户类型">
                  <Select options={[
                    { value: 'internal', label: '内部（吉利内部项目组）' },
                    { value: 'external', label: '外部（预留）' },
                  ]} />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item name="status" label="状态">
                  <Select options={[
                    { value: 'active', label: '活跃' },
                    { value: 'inactive', label: '停用' },
                    { value: 'archived', label: '归档' },
                  ]} />
                </Form.Item>
              </Col>
            </Row>
            <Row gutter={12}>
              <Col span={12}>
                <Form.Item name="contact" label="主联系人">
                  <Input placeholder="如 陈工（UPL）" />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item name="phone" label="联系电话">
                  <Input placeholder="如 18800001001" />
                </Form.Item>
              </Col>
            </Row>
            <Form.Item name="email" label="邮箱">
              <Input placeholder="如 chen.gong@geely-galaxy-l7.demo" />
            </Form.Item>
            <Form.Item name="address" label="地址">
              <Input placeholder="如 杭州吉利研究院" />
            </Form.Item>
            <Form.Item name="description" label="描述">
              <Input.TextArea rows={3} placeholder="客户背景、合作范围等" />
            </Form.Item>
          </Form>
        )}
      </Drawer>
    </div>
  );
}

// 客户详情：基本信息 + 联系人 + 关联项目
function CustomerDetail({ customer, activeTab, setActiveTab }: { customer: Customer; activeTab: string; setActiveTab: (s: string) => void }) {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(false);
  // 详情视图用独立 form 实例（避免 useForm 未连接的警告）
  const [viewForm] = Form.useForm();

  const loadContacts = async () => {
    setLoading(true);
    try {
      setContacts(await contactApi.list({ customerId: customer.id }));
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'contacts') loadContacts();
  }, [activeTab]);

  return (
    <Tabs activeKey={activeTab} onChange={setActiveTab} items={[
      {
        key: 'info',
        label: '基本信息',
        children: (
          <Form form={viewForm} layout="vertical" initialValues={customer} disabled>
            <Form.Item name="code" label="客户编号"><Input /></Form.Item>
            <Form.Item name="name" label="客户名称"><Input /></Form.Item>
            <Form.Item name="shortName" label="简称"><Input /></Form.Item>
            <Row gutter={12}>
              <Col span={12}>
                <Form.Item name="type" label="客户类型">
                  <Select options={[
                    { value: 'internal', label: '内部' },
                    { value: 'external', label: '外部' },
                  ]} />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item name="status" label="状态">
                  <Select options={[
                    { value: 'active', label: '活跃' },
                    { value: 'inactive', label: '停用' },
                    { value: 'archived', label: '归档' },
                  ]} />
                </Form.Item>
              </Col>
            </Row>
            <Row gutter={12}>
              <Col span={12}>
                <Form.Item name="contact" label="主联系人"><Input /></Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item name="phone" label="联系电话"><Input /></Form.Item>
              </Col>
            </Row>
            <Form.Item name="email" label="邮箱"><Input /></Form.Item>
            <Form.Item name="address" label="地址"><Input /></Form.Item>
            <Form.Item name="description" label="描述"><Input.TextArea rows={3} /></Form.Item>
          </Form>
        ),
      },
      {
        key: 'contacts',
        label: `联系人（${customer._count?.contacts || 0}）`,
        children: (
          <ContactList customerId={customer.id} contacts={contacts} loading={loading} reload={loadContacts} />
        ),
      },
      {
        key: 'projects',
        label: `关联项目（${customer._count?.projects || 0}）`,
        children: (
          <div>
            {(customer.projects || []).length === 0 ? (
              <Empty description="暂无关联项目" />
            ) : (
              <Space direction="vertical" style={{ width: '100%' }} size={8}>
                {(customer.projects || []).map((p: any) => (
                  <Card key={p.id} size="small" style={{ borderRadius: 6 }}>
                    <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                      <div>
                        <div style={{ fontWeight: 500 }}>{p.name}</div>
                        <div style={{ fontSize: 12, color: '#999', marginTop: 4 }}>
                          {p.code} · 车型 {p.carModel?.name} · 合同 ¥{(p.contractAmount / 10000).toFixed(1)}万
                        </div>
                      </div>
                      <Space>
                        <Tag color={p.status === 'active' ? 'green' : p.status === 'completed' ? 'blue' : 'orange'}>
                          {p.status === 'active' ? '进行中' : p.status === 'completed' ? '已完成' : p.status === 'planning' ? '规划中' : p.status}
                        </Tag>
                        <Tag color="cyan">进度 {p.progress}%</Tag>
                      </Space>
                    </Space>
                  </Card>
                ))}
              </Space>
            )}
          </div>
        ),
      },
    ]} />
  );
}

// 联系人列表
function ContactList({ customerId, contacts, loading, reload }: { customerId: string; contacts: Contact[]; loading: boolean; reload: () => void }) {
  const { message: msgApi } = App.useApp();
  const [editing, setEditing] = useState<Contact | null>(null);
  const [open, setOpen] = useState(false);
  const [form] = Form.useForm();
  const [aiFillingContact, setAiFillingContact] = useState(false);

  const handleAiFillContact = async () => {
    try {
      const v = await form.validateFields(['name']);
      if (!v.name) { msgApi.warning('请先输入联系人姓名'); return; }
      setAiFillingContact(true);
      // 查找客户 code（从父组件传过来；这里通过 customerId 查不到 code，简化处理）
      const r = await aiApi.aiFillForm('contact', { name: v.name, role: v.role, customerCode: customerId });
      if (r.filled) {
        form.setFieldsValue({
          role: r.filled.role || undefined,
          department: r.filled.department || undefined,
          phone: r.filled.phone || undefined,
          email: r.filled.email || undefined,
          feishuId: r.filled.feishuId || undefined,
          primary: r.filled.primary || false,
        });
        msgApi.success(r.reasoning || 'AI 已补全字段');
      }
    } catch (e: any) {
      if (e.errorFields) return;
      msgApi.error('AI 填充失败：' + e.message);
    } finally {
      setAiFillingContact(false);
    }
  };

  const handleAdd = () => {
    setEditing(null);
    form.resetFields();
    form.setFieldsValue({ customerId, role: 'UPL' });
    setOpen(true);
  };

  const handleEdit = (c: Contact) => {
    setEditing(c);
    form.setFieldsValue(c);
    setOpen(true);
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      if (editing) {
        await contactApi.update(editing.id, values);
        message.success('已更新');
      } else {
        await contactApi.create({ ...values, customerId });
        message.success('已添加');
      }
      setOpen(false);
      reload();
    } catch (e: any) {
      if (e?.errorFields) return;
      message.error('保存失败：' + (e?.response?.data?.error || e.message));
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await contactApi.remove(id);
      message.success('已删除');
      reload();
    } catch (e: any) {
      message.error('删除失败');
    }
  };

  return (
    <div>
      <Button type="primary" size="small" icon={<PlusOutlined />} onClick={handleAdd} style={{ marginBottom: 12 }}>
        添加联系人
      </Button>
      <Table
        rowKey="id"
        size="small"
        loading={loading}
        dataSource={contacts}
        pagination={false}
        columns={[
          {
            title: '姓名', dataIndex: 'name', key: 'name',
            render: (v: string, r: Contact) => (
              <Space>
                <Avatar size="small" style={{ background: r.primary ? '#1890ff' : '#999' }}>{v[0]}</Avatar>
                {v} {r.primary && <Tag color="red" style={{ marginLeft: 4 }}>主联系人</Tag>}
              </Space>
            ),
          },
          { title: '角色', dataIndex: 'role', key: 'role', render: (v: string) => <Tag color={ROLE_COLOR[v]}>{v}</Tag> },
          { title: '部门', dataIndex: 'department', key: 'department' },
          { title: '电话', dataIndex: 'phone', key: 'phone' },
          { title: '邮箱', dataIndex: 'email', key: 'email' },
          { title: '备注', dataIndex: 'note', key: 'note' },
          {
            title: '操作', key: 'actions', width: 140,
            render: (_: any, r: Contact) => (
              <Space size="small">
                <Button type="link" size="small" icon={<EditOutlined />} onClick={() => handleEdit(r)}>编辑</Button>
                <Popconfirm title="确定删除？" onConfirm={() => handleDelete(r.id)}>
                  <Button type="link" size="small" danger icon={<DeleteOutlined />}>删除</Button>
                </Popconfirm>
              </Space>
            ),
          },
        ]}
      />
      <Modal
        title={editing ? '编辑联系人' : '添加联系人'}
        open={open}
        onCancel={() => setOpen(false)}
        forceRender
        onOk={handleSubmit}
        okText="保存"
        cancelText="取消"
        width={520}
        footer={
          <Space>
            <Button icon={<ThunderboltOutlined />} onClick={handleAiFillContact} loading={aiFillingContact}>
              AI 帮我填
            </Button>
            <Button onClick={() => setOpen(false)}>取消</Button>
            <Button type="primary" onClick={handleSubmit}>保存</Button>
          </Space>
        }
      >
        <Form form={form} layout="vertical">
          <Form.Item name="name" label="姓名" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="role" label="角色" rules={[{ required: true }]}>
            <Select options={[
              { value: 'UPL', label: 'UPL（客户车型项目负责人）' },
              { value: 'PPM', label: 'PPM（客户产品经理）' },
              { value: '测试', label: '测试（客户测试工程师）' },
              { value: '开发', label: '开发（客户开发工程师）' },
              { value: 'AVM接口人', label: 'AVM接口人（客户侧 AVM 对接窗口）' },
            ]} />
          </Form.Item>
          <Form.Item name="department" label="部门"><Input placeholder="如 银河L7 项目组" /></Form.Item>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="phone" label="电话"><Input /></Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="email" label="邮箱"><Input /></Form.Item>
            </Col>
          </Row>
          <Form.Item name="feishuId" label="飞书 ID"><Input /></Form.Item>
          <Form.Item name="note" label="备注"><Input.TextArea rows={2} /></Form.Item>
          <Form.Item name="primary" label="主联系人" valuePropName="checked">
            <Select options={[{ value: true, label: '是' }, { value: false, label: '否' }]} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
