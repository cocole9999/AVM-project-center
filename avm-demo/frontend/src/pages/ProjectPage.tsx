/**
 * V1.7 AVM 集成项目管理页面
 * 一个项目 = 一个 AVM 集成项目（绑定 1 个客户 + 1 个车型）
 * - 项目列表（搜索 + 客户/车型/状态/计费方式/风险过滤）
 * - 项目详情：基本信息 + 工时/合同 + 风险 + 关联工作项
 * - 合同类型：ODC / ODM / Fixed（固定价）
 */
import { useEffect, useMemo, useState } from 'react';
import {
  Card, Table, Tag, Space, Button, Input, Select, Modal, Form, message,
  Row, Col, Statistic, Avatar, Drawer, Empty, Popconfirm, Tooltip, Progress,
  DatePicker, InputNumber, Dropdown,
} from 'antd';
import {
  SearchOutlined, PlusOutlined, ProjectOutlined, EditOutlined, DeleteOutlined,
  ReloadOutlined, DollarOutlined, ClockCircleOutlined, WarningOutlined,
  BankOutlined, CarOutlined, CheckCircleOutlined, ThunderboltOutlined,
  FundViewOutlined, DownloadOutlined,
} from '@ant-design/icons';
import { projectApi, customerApi, carModelApi, aiApi, type Project, type Customer, type CarModel } from '../api';
import { downloadBlob, getFilenameFromResponse } from '../utils/download';
import dayjs from 'dayjs';

const STATUS_COLOR: Record<string, string> = {
  active: 'green', planning: 'blue', on_hold: 'orange', completed: 'purple', archived: 'default',
};
const STATUS_LABEL: Record<string, string> = {
  active: '进行中', planning: '规划中', on_hold: '挂起', completed: '已完成', archived: '已归档',
};
const BILLING_COLOR: Record<string, string> = {
  ODC: 'cyan', ODM: 'magenta', Fixed: 'gold',
};
const RISK_COLOR: Record<string, string> = {
  low: 'green', medium: 'orange', high: 'red',
};
const RISK_LABEL: Record<string, string> = {
  low: '低风险', medium: '中风险', high: '高风险',
};

export function ProjectPage() {
  const [list, setList] = useState<Project[]>([]);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState('');
  const [statusFilter, setStatusFilter] = useState<string | undefined>();
  const [billingFilter, setBillingFilter] = useState<string | undefined>();
  const [riskFilter, setRiskFilter] = useState<string | undefined>();
  const [customerFilter, setCustomerFilter] = useState<string | undefined>();
  const [editing, setEditing] = useState<Project | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [form] = Form.useForm();
  const [aiFilling, setAiFilling] = useState(false);
  const [exporting, setExporting] = useState(false);

  const handleExport = async (format: 'xlsx' | 'csv') => {
    setExporting(true);
    try {
      const blob = await aiApi.exportProjects({ format });
      const filename = getFilenameFromResponse((blob as any)?.headers, `projects-${new Date().toISOString().slice(0,10)}.${format}`);
      downloadBlob(blob as Blob, filename);
    } catch (e: any) {
      message.error('导出失败：' + e.message);
    } finally {
      setExporting(false);
    }
  };

  const handleAiFill = async () => {
    try {
      const v = await form.validateFields(['name']);
      if (!v.name) {
        message.warning('请先输入项目名称');
        return;
      }
      setAiFilling(true);
      const r = await aiApi.aiFillForm('project', {
        name: v.name,
        customerCode: v.customerCode,
        carModelCode: v.carModelCode,
      });
      if (r.filled) {
        form.setFieldsValue({
          description: r.filled.description || undefined,
          startDate: r.filled.startDate ? dayjs(r.filled.startDate) : undefined,
          endDate: r.filled.endDate ? dayjs(r.filled.endDate) : undefined,
          status: r.filled.status || 'planning',
          billingType: r.filled.billingType || 'ODC',
          contractAmount: r.filled.contractAmount || undefined,
          risk: r.filled.risk || 'medium',
          pmUserName: r.filled.pmUserName || undefined,
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
  const [stats, setStats] = useState<any>(null);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [carModels, setCarModels] = useState<CarModel[]>([]);

  const load = async () => {
    setLoading(true);
    try {
      const params: any = {};
      if (q) params.q = q;
      if (statusFilter) params.status = statusFilter;
      if (billingFilter) params.billingType = billingFilter;
      if (riskFilter) params.risk = riskFilter;
      if (customerFilter) params.customerId = customerFilter;
      const [r, s] = await Promise.all([
        projectApi.list(params),
        projectApi.stats().catch(() => null),
      ]);
      setList(r);
      if (s) setStats(s);
    } catch (e) {
      message.error('加载项目失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    customerApi.list().then(setCustomers).catch(() => {});
    carModelApi.list().then(setCarModels).catch(() => {});
  }, []);

  useEffect(() => { load(); }, [q, statusFilter, billingFilter, riskFilter, customerFilter]);

  const handleCreate = () => {
    setEditing(null);
    form.resetFields();
    form.setFieldsValue({
      status: 'planning',
      billingType: 'ODC',
      risk: 'low',
      progress: 0,
      startDate: dayjs(),
      endDate: dayjs().add(90, 'day'),
      budgetHours: 1000,
      contractAmount: 1000000,
    });
    setDrawerOpen(true);
  };

  const handleEdit = (p: Project) => {
    setEditing(p);
    form.setFieldsValue({
      ...p,
      startDate: dayjs(p.startDate),
      endDate: dayjs(p.endDate),
    });
    setDrawerOpen(true);
  };

  const handleDelete = async (id: string) => {
    try {
      await projectApi.remove(id);
      message.success('已删除');
      load();
    } catch (e: any) {
      message.error('删除失败：' + (e?.response?.data?.error || e.message));
    }
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      const payload = {
        ...values,
        startDate: values.startDate.toISOString(),
        endDate: values.endDate.toISOString(),
      };
      if (editing) {
        await projectApi.update(editing.id, payload);
        message.success('已更新');
      } else {
        await projectApi.create(payload);
        message.success('已创建');
      }
      setDrawerOpen(false);
      load();
    } catch (e: any) {
      if (e?.errorFields) return;
      message.error('保存失败：' + (e?.response?.data?.error || e.message));
    }
  };

  const columns = [
    {
      title: '项目',
      dataIndex: 'name',
      key: 'name',
      width: 280,
      render: (v: string, r: Project) => (
        <Space>
          <Avatar style={{ background: r.status === 'active' ? '#52c41a' : '#1890ff' }} icon={<ProjectOutlined />} size="small" />
          <div>
            <div style={{ fontWeight: 500 }}>{v}</div>
            <div style={{ fontSize: 11, color: '#999' }}>{r.code}</div>
          </div>
        </Space>
      ),
    },
    {
      title: '客户',
      dataIndex: 'customer',
      key: 'customer',
      width: 160,
      render: (v: any) => v ? <span><BankOutlined /> {v.shortName || v.name}</span> : '-',
    },
    {
      title: '车型',
      dataIndex: 'carModel',
      key: 'carModel',
      width: 130,
      render: (v: any) => v ? <span><CarOutlined /> {v.name}</span> : '-',
    },
    {
      title: '计费',
      dataIndex: 'billingType',
      key: 'billingType',
      width: 90,
      render: (v: string) => <Tag color={BILLING_COLOR[v]}>{v}</Tag>,
    },
    {
      title: '合同（万）',
      dataIndex: 'contractAmount',
      key: 'contractAmount',
      width: 110,
      render: (v: number) => <span style={{ fontWeight: 500 }}>{(v / 10000).toFixed(1)}</span>,
    },
    {
      title: '进度',
      dataIndex: 'progress',
      key: 'progress',
      width: 160,
      render: (v: number, r: Project) => (
        <div>
          <Progress
            percent={v}
            size="small"
            strokeColor={v >= 80 ? '#52c41a' : v >= 40 ? '#1890ff' : '#fa8c16'}
            showInfo
          />
          <div style={{ fontSize: 11, color: '#999' }}>
            预算 {r.budgetHours}h / 已用 {r.consumedHours}h
          </div>
        </div>
      ),
    },
    {
      title: '风险',
      dataIndex: 'risk',
      key: 'risk',
      width: 90,
      render: (v: string) => <Tag color={RISK_COLOR[v]}>{RISK_LABEL[v]}</Tag>,
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 90,
      render: (v: string) => <Tag color={STATUS_COLOR[v]}>{STATUS_LABEL[v]}</Tag>,
    },
    {
      title: '工作项',
      key: 'workItems',
      width: 90,
      render: (_: any, r: Project) => (
        <Tag color="cyan">{r._count?.workItems || 0}</Tag>
      ),
    },
    {
      title: '操作',
      key: 'actions',
      width: 140,
      fixed: 'right' as const,
      render: (_: any, r: Project) => (
        <Space size="small">
          <Button type="link" size="small" icon={<EditOutlined />} onClick={() => handleEdit(r)}>编辑</Button>
          <Popconfirm title="确定删除该项目？" onConfirm={() => handleDelete(r.id)}>
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
        <Col span={4}>
          <Card size="small" style={{ borderRadius: 8 }}>
            <Statistic title="项目总数" value={list.length} prefix={<ProjectOutlined />} />
          </Card>
        </Col>
        <Col span={4}>
          <Card size="small" style={{ borderRadius: 8 }}>
            <Statistic
              title="合同总额（万）"
              value={((stats?.totalContract || 0) / 10000).toFixed(0)}
              prefix={<DollarOutlined />}
              valueStyle={{ color: '#fa8c16' }}
            />
          </Card>
        </Col>
        <Col span={4}>
          <Card size="small" style={{ borderRadius: 8 }}>
            <Statistic
              title="预算工时（h）"
              value={stats?.totalBudget || 0}
              prefix={<ClockCircleOutlined />}
            />
          </Card>
        </Col>
        <Col span={4}>
          <Card size="small" style={{ borderRadius: 8 }}>
            <Statistic
              title="已用工时（h）"
              value={stats?.totalConsumed || 0}
              valueStyle={{ color: stats?.utilizationRate > 80 ? '#ff4d4f' : '#1890ff' }}
            />
          </Card>
        </Col>
        <Col span={4}>
          <Card size="small" style={{ borderRadius: 8 }}>
            <Statistic
              title="团队利用率"
              value={stats?.utilizationRate || 0}
              suffix="%"
              valueStyle={{ color: (stats?.utilizationRate || 0) > 80 ? '#ff4d4f' : '#52c41a' }}
            />
          </Card>
        </Col>
        <Col span={4}>
          <Card size="small" style={{ borderRadius: 8 }}>
            <Statistic
              title="高风险项目"
              value={list.filter(p => p.risk === 'high').length}
              prefix={<WarningOutlined />}
              valueStyle={{ color: '#ff4d4f' }}
            />
          </Card>
        </Col>
      </Row>

      {/* 过滤栏 */}
      <Card size="small" style={{ marginBottom: 12, borderRadius: 8 }}>
        <Space wrap>
          <Input
            placeholder="搜索项目名称/编号/描述"
            allowClear
            value={q}
            onChange={e => setQ(e.target.value)}
            style={{ width: 240 }}
            prefix={<SearchOutlined />}
          />
          <Select
            placeholder="客户（内部项目组）"
            allowClear
            value={customerFilter}
            onChange={setCustomerFilter}
            style={{ width: 200 }}
            options={customers.map(c => ({ value: c.id, label: c.shortName || c.name }))}
            showSearch
            optionFilterProp="label"
          />
          <Select
            placeholder="计费方式"
            allowClear
            value={billingFilter}
            onChange={setBillingFilter}
            style={{ width: 110 }}
            options={[
              { value: 'ODC', label: 'ODC' },
              { value: 'ODM', label: 'ODM' },
              { value: 'Fixed', label: '固定价' },
            ]}
          />
          <Select
            placeholder="风险"
            allowClear
            value={riskFilter}
            onChange={setRiskFilter}
            style={{ width: 110 }}
            options={[
              { value: 'low', label: '低' },
              { value: 'medium', label: '中' },
              { value: 'high', label: '高' },
            ]}
          />
          <Select
            placeholder="状态"
            allowClear
            value={statusFilter}
            onChange={setStatusFilter}
            style={{ width: 110 }}
            options={[
              { value: 'planning', label: '规划中' },
              { value: 'active', label: '进行中' },
              { value: 'on_hold', label: '挂起' },
              { value: 'completed', label: '已完成' },
              { value: 'archived', label: '已归档' },
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
            新建项目
          </Button>
        </Space>
      </Card>

      <Card style={{ borderRadius: 8 }}>
        <Table
          rowKey="id"
          columns={columns}
          dataSource={list}
          loading={loading}
          pagination={{ pageSize: 20, showSizeChanger: true }}
          scroll={{ x: 1400 }}
        />
      </Card>

      <Drawer
        title={editing ? `编辑项目：${editing.name}` : '新建 AVM 集成项目'}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        width={760}
        extra={
          <Space>
            <Button icon={<ThunderboltOutlined />} onClick={handleAiFill} loading={aiFilling}>
              AI 帮我填
            </Button>
            <Button onClick={() => setDrawerOpen(false)}>取消</Button>
            <Button type="primary" onClick={handleSubmit}>保存</Button>
          </Space>
        }
      >
        <Form form={form} layout="vertical">
          <Form.Item name="code" label="项目编号" rules={[{ required: true }]}>
            <Input placeholder="如 AVM-GALAXY-L7-2026" />
          </Form.Item>
          <Form.Item name="name" label="项目名称" rules={[{ required: true }]}>
            <Input placeholder="如 银河 L7 AVM 2.5 集成项目" />
          </Form.Item>
          <Form.Item name="description" label="项目描述">
            <Input.TextArea rows={2} placeholder="项目背景、范围、关键风险等" />
          </Form.Item>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="customerId" label="客户（内部项目组）" rules={[{ required: true }]}>
                <Select
                  options={customers.map(c => ({ value: c.id, label: c.name }))}
                  showSearch
                  optionFilterProp="label"
                  placeholder="选择客户"
                />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="carModelId" label="车型" rules={[{ required: true }]}>
                <Select
                  options={carModels.map(m => ({ value: m.id, label: `${m.brand} ${m.name}` }))}
                  showSearch
                  optionFilterProp="label"
                  placeholder="选择车型"
                />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={12}>
            <Col span={8}>
              <Form.Item name="startDate" label="开始日期" rules={[{ required: true }]}>
                <DatePicker style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="endDate" label="结束日期" rules={[{ required: true }]}>
                <DatePicker style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="status" label="状态">
                <Select options={[
                  { value: 'planning', label: '规划中' },
                  { value: 'active', label: '进行中' },
                  { value: 'on_hold', label: '挂起' },
                  { value: 'completed', label: '已完成' },
                  { value: 'archived', label: '已归档' },
                ]} />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={12}>
            <Col span={8}>
              <Form.Item name="billingType" label="计费方式">
                <Select options={[
                  { value: 'ODC', label: 'ODC（人天计费）' },
                  { value: 'ODM', label: 'ODM（包干）' },
                  { value: 'Fixed', label: '固定价' },
                ]} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="contractAmount" label="合同金额（元）">
                <InputNumber
                  style={{ width: '100%' }}
                  formatter={v => `¥ ${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                  parser={(v: any) => v!.replace(/¥\s?|,|(undefined)/g, '')}
                />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="risk" label="风险等级">
                <Select options={[
                  { value: 'low', label: '低风险' },
                  { value: 'medium', label: '中风险' },
                  { value: 'high', label: '高风险' },
                ]} />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="budgetHours" label="预算工时（人时）">
                <InputNumber style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="consumedHours" label="已用工时（人时）">
                <InputNumber style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="pmUserId" label="PM 用户 ID">
                <Input placeholder="如 pm" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="pmUserName" label="PM 姓名">
                <Input placeholder="如 AVM 项目经理" />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="progress" label="进度（0-100）">
            <InputNumber min={0} max={100} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="tags" label="标签">
            <Input placeholder="如 银河系列,ODC,主力车型（用逗号分隔）" />
          </Form.Item>
        </Form>
      </Drawer>
    </div>
  );
}
