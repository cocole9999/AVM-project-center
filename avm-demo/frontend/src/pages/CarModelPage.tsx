/**
 * V1.7 车型库管理页面
 * 吉利全系车型档案：银河 / 极氪 / 领克 / 博越 / 熊猫 / 星瑞 等
 */
import { useEffect, useMemo, useState } from 'react';
import {
  Card, Table, Tag, Space, Button, Input, Select, Modal, Form, message,
  Row, Col, Statistic, Avatar, Drawer, Empty, Popconfirm, Tooltip, Progress,
} from 'antd';
import {
  SearchOutlined, PlusOutlined, CarOutlined, EditOutlined, DeleteOutlined,
  ProjectOutlined, ReloadOutlined, CheckCircleOutlined, ClockCircleOutlined, ThunderboltOutlined,
} from '@ant-design/icons';
import { carModelApi, aiApi, type CarModel, type Project } from '../api';

const SEGMENT_COLOR: Record<string, string> = {
  '紧凑型 SUV': 'blue', '中型 SUV': 'cyan', '中大型 SUV': 'geekblue',
  '紧凑型轿车': 'green', '中型轿车': 'lime', '中大型车': 'gold',
  '猎装轿跑': 'magenta', 'MPV': 'purple', '微型车': 'orange',
};

export function CarModelPage() {
  const [list, setList] = useState<CarModel[]>([]);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState('');
  const [brandFilter, setBrandFilter] = useState<string | undefined>();
  const [statusFilter, setStatusFilter] = useState<string | undefined>();
  const [editing, setEditing] = useState<CarModel | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [form] = Form.useForm();
  const [byBrand, setByBrand] = useState<any>(null);
  const [aiFilling, setAiFilling] = useState(false);

  const handleAiFill = async () => {
    try {
      const v = await form.validateFields(['name']);
      if (!v.name) {
        message.warning('请先输入车型名称');
        return;
      }
      setAiFilling(true);
      const r = await aiApi.aiFillForm('car_model', { name: v.name, brand: v.brand });
      if (r.filled) {
        form.setFieldsValue({
          brand: r.filled.brand || undefined,
          series: r.filled.series || undefined,
          launchYear: r.filled.launchYear || undefined,
          segment: r.filled.segment || undefined,
          platform: r.filled.platform || undefined,
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
      if (brandFilter) params.brand = brandFilter;
      if (statusFilter) params.status = statusFilter;
      const [r, b] = await Promise.all([
        carModelApi.list(params),
        carModelApi.byBrand().catch(() => null),
      ]);
      setList(r);
      if (b) setByBrand(b);
    } catch (e) {
      message.error('加载车型失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [q, brandFilter, statusFilter]);

  const brandOptions = useMemo(() => {
    const set = new Set<string>();
    list.forEach(m => set.add(m.brand));
    return Array.from(set).map(b => ({ value: b, label: b }));
  }, [list]);

  const handleCreate = () => {
    setEditing(null);
    form.resetFields();
    form.setFieldsValue({ status: 'active', launchYear: new Date().getFullYear() });
    setDrawerOpen(true);
  };

  const handleEdit = (m: CarModel) => {
    setEditing(m);
    form.setFieldsValue(m);
    setDrawerOpen(true);
  };

  const handleDelete = async (id: string) => {
    try {
      await carModelApi.remove(id);
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
        await carModelApi.update(editing.id, values);
        message.success('已更新');
      } else {
        await carModelApi.create(values);
        message.success('已创建');
      }
      setDrawerOpen(false);
      load();
    } catch (e: any) {
      if (e?.errorFields) return;
      message.error('保存失败：' + (e?.response?.data?.error || e.message));
    }
  };

  const totalProjects = useMemo(() => list.reduce((s, m) => s + (m._count?.projects || 0), 0), [list]);
  const totalWorkItems = useMemo(() => list.reduce((s, m) => s + (m._count?.workItems || 0), 0), [list]);

  const columns = [
    {
      title: '车型',
      dataIndex: 'name',
      key: 'name',
      width: 220,
      render: (v: string, r: CarModel) => (
        <Space>
          <Avatar style={{ background: '#722ed1' }} icon={<CarOutlined />} size="small" />
          <div>
            <div style={{ fontWeight: 500 }}>{v}</div>
            <div style={{ fontSize: 11, color: '#999' }}>{r.code} · {r.series || '-'}</div>
          </div>
        </Space>
      ),
    },
    {
      title: '品牌',
      dataIndex: 'brand',
      key: 'brand',
      width: 110,
      render: (v: string) => <Tag color="geekblue">{v}</Tag>,
    },
    {
      title: '细分市场',
      dataIndex: 'segment',
      key: 'segment',
      width: 130,
      render: (v: string) => v ? <Tag color={SEGMENT_COLOR[v] || 'default'}>{v}</Tag> : '-',
    },
    {
      title: '上市年份',
      dataIndex: 'launchYear',
      key: 'launchYear',
      width: 100,
      render: (v: number) => v || '-',
    },
    {
      title: '平台',
      dataIndex: 'platform',
      key: 'platform',
      width: 110,
      render: (v: string) => v ? <Tag>{v}</Tag> : '-',
    },
    {
      title: '关联项目',
      key: 'projects',
      width: 110,
      render: (_: any, r: CarModel) => (
        <Tooltip title={`${r._count?.projects || 0} 个 AVM 集成项目`}>
          <Tag icon={<ProjectOutlined />} color="blue">{r._count?.projects || 0}</Tag>
        </Tooltip>
      ),
    },
    {
      title: '工作项',
      key: 'workItems',
      width: 100,
      render: (_: any, r: CarModel) => (
        <Tooltip title={`${r._count?.workItems || 0} 个工作项`}>
          <Tag>{r._count?.workItems || 0}</Tag>
        </Tooltip>
      ),
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 90,
      render: (v: string) => <Tag color={v === 'active' ? 'green' : 'default'}>{v === 'active' ? '在售' : v === 'archived' ? '停售' : v}</Tag>,
    },
    {
      title: '操作',
      key: 'actions',
      width: 140,
      fixed: 'right' as const,
      render: (_: any, r: CarModel) => (
        <Space size="small">
          <Button type="link" size="small" icon={<EditOutlined />} onClick={() => handleEdit(r)}>编辑</Button>
          <Popconfirm title="确定删除该车型？" onConfirm={() => handleDelete(r.id)}>
            <Button type="link" size="small" danger icon={<DeleteOutlined />}>删除</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      {/* 顶部统计 + 品牌分布 */}
      <Row gutter={12} style={{ marginBottom: 12 }}>
        <Col span={5}>
          <Card size="small" style={{ borderRadius: 8 }}>
            <Statistic title="车型总数" value={list.length} prefix={<CarOutlined />} />
          </Card>
        </Col>
        <Col span={5}>
          <Card size="small" style={{ borderRadius: 8 }}>
            <Statistic title="覆盖品牌" value={Object.keys(byBrand?.byBrand || {}).length || brandOptions.length} valueStyle={{ color: '#722ed1' }} />
          </Card>
        </Col>
        <Col span={5}>
          <Card size="small" style={{ borderRadius: 8 }}>
            <Statistic title="关联项目" value={totalProjects} prefix={<ProjectOutlined />} valueStyle={{ color: '#1890ff' }} />
          </Card>
        </Col>
        <Col span={5}>
          <Card size="small" style={{ borderRadius: 8 }}>
            <Statistic title="工作项" value={totalWorkItems} valueStyle={{ color: '#52c41a' }} />
          </Card>
        </Col>
        <Col span={4}>
          <Card size="small" style={{ borderRadius: 8 }}>
            <Statistic title="在售车型" value={list.filter(m => m.status === 'active').length} valueStyle={{ color: '#fa8c16' }} />
          </Card>
        </Col>
      </Row>

      {/* 品牌分布条 */}
      {byBrand && Object.keys(byBrand.byBrand).length > 0 && (
        <Card size="small" style={{ marginBottom: 12, borderRadius: 8 }} title="品牌分布">
          <Space wrap>
            {Object.entries(byBrand.byBrand).map(([brand, count]) => (
              <Tag key={brand} color="geekblue" style={{ padding: '4px 10px', fontSize: 13 }}>
                {brand} <strong style={{ marginLeft: 4 }}>{count as number}</strong> 款
              </Tag>
            ))}
          </Space>
        </Card>
      )}

      {/* 过滤栏 */}
      <Card size="small" style={{ marginBottom: 12, borderRadius: 8 }}>
        <Space wrap>
          <Input
            placeholder="搜索车型名称/编号/平台"
            allowClear
            value={q}
            onChange={e => setQ(e.target.value)}
            style={{ width: 240 }}
            prefix={<SearchOutlined />}
          />
          <Select
            placeholder="品牌"
            allowClear
            value={brandFilter}
            onChange={setBrandFilter}
            style={{ width: 140 }}
            options={brandOptions}
          />
          <Select
            placeholder="状态"
            allowClear
            value={statusFilter}
            onChange={setStatusFilter}
            style={{ width: 110 }}
            options={[
              { value: 'active', label: '在售' },
              { value: 'inactive', label: '停售' },
              { value: 'archived', label: '归档' },
            ]}
          />
          <Button icon={<ReloadOutlined />} onClick={load}>刷新</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={handleCreate}>
            新建车型
          </Button>
        </Space>
      </Card>

      <Card style={{ borderRadius: 8 }}>
        <Table
          rowKey="id"
          columns={columns}
          dataSource={list}
          loading={loading}
          pagination={{ pageSize: 20 }}
          scroll={{ x: 1100 }}
        />
      </Card>

      <Drawer
        title={editing ? `编辑车型：${editing.name}` : '新建车型'}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        width={560}
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
          <Form.Item name="code" label="车型编号" rules={[{ required: true }]}>
            <Input placeholder="如 GALAXY-L7" />
          </Form.Item>
          <Form.Item name="name" label="车型名称" rules={[{ required: true }]}>
            <Input placeholder="如 银河L7" />
          </Form.Item>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="brand" label="品牌" rules={[{ required: true }]}>
                <Input placeholder="如 吉利银河" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="series" label="系列">
                <Input placeholder="如 L系列" />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="segment" label="细分市场">
                <Select allowClear options={[
                  { value: '紧凑型 SUV', label: '紧凑型 SUV' },
                  { value: '中型 SUV', label: '中型 SUV' },
                  { value: '中大型 SUV', label: '中大型 SUV' },
                  { value: '紧凑型轿车', label: '紧凑型轿车' },
                  { value: '中型轿车', label: '中型轿车' },
                  { value: '中大型车', label: '中大型车' },
                  { value: '猎装轿跑', label: '猎装轿跑' },
                  { value: 'MPV', label: 'MPV' },
                  { value: '微型车', label: '微型车' },
                ]} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="launchYear" label="上市年份">
                <Input type="number" placeholder="如 2023" />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="platform" label="平台">
                <Input placeholder="如 GEEA 2.0 / SEA 浩瀚 / CMA" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="status" label="状态">
                <Select options={[
                  { value: 'active', label: '在售' },
                  { value: 'inactive', label: '停售' },
                  { value: 'archived', label: '归档' },
                ]} />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="description" label="描述">
            <Input.TextArea rows={3} placeholder="AVM 集成相关信息" />
          </Form.Item>
        </Form>
      </Drawer>
    </div>
  );
}
