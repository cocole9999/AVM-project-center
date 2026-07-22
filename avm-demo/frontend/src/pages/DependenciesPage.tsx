/**
 * V1.7.1 外部依赖管理
 * AVM 集成的命门：台架 / 实车 / 车模 / SDB / UE / UI / 标定
 * - 列出全部依赖，按类型/状态/项目过滤
 * - 创建/编辑/标记就绪/删除
 * - 超期依赖高亮 + 风险预警自动推送
 */
import { useEffect, useMemo, useState } from 'react';
import {
  Card, Table, Tag, Space, Button, Input, Select, Modal, Form, message, App, Tooltip,
  Statistic, Row, Col, Drawer, Popconfirm, Alert, Empty,
} from 'antd';
import {
  PlusOutlined, ReloadOutlined, EditOutlined, DeleteOutlined, ThunderboltOutlined,
  WarningOutlined, CheckCircleOutlined, ClockCircleOutlined, ToolOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { dependencyApi, projectApi, workItemApi } from '../api';
import type { Project, WorkItem } from '../types';

const TYPE_META: Record<string, { label: string; color: string; icon: string }> = {
  '台架': { label: '台架', color: 'geekblue', icon: '🛠️' },
  '实车': { label: '实车', color: 'red', icon: '🚗' },
  '车模': { label: '车模', color: 'orange', icon: '🎨' },
  'SDB': { label: 'SDB', color: 'purple', icon: '💾' },
  'UE': { label: 'UE', color: 'cyan', icon: '🧪' },
  'UI': { label: 'UI', color: 'magenta', icon: '🎨' },
  '标定': { label: '标定', color: 'green', icon: '🎯' },
  '其他': { label: '其他', color: 'default', icon: '📦' },
};

const STATUS_META: Record<string, { label: string; color: string }> = {
  pending: { label: '待准备', color: 'default' },
  preparing: { label: '准备中', color: 'processing' },
  ready: { label: '已就绪', color: 'success' },
  blocked: { label: '卡点', color: 'error' },
  cancelled: { label: '已取消', color: 'default' },
};

const TYPE_OPTIONS = Object.keys(TYPE_META).map(t => ({ value: t, label: TYPE_META[t].label }));
const STATUS_OPTIONS = Object.entries(STATUS_META).map(([k, v]) => ({ value: k, label: v.label }));

export function DependenciesPage() {
  const { message } = App.useApp();
  const [list, setList] = useState<any[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [filterType, setFilterType] = useState<string | undefined>();
  const [filterStatus, setFilterStatus] = useState<string | undefined>();
  const [filterProject, setFilterProject] = useState<string | undefined>();
  const [projects, setProjects] = useState<Project[]>([]);
  const [workItems, setWorkItems] = useState<WorkItem[]>([]);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form] = Form.useForm();
  const [aiFilling, setAiFilling] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const params: any = {};
      if (filterType) params.type = filterType;
      if (filterStatus) params.status = filterStatus;
      if (filterProject) params.projectCode = filterProject;
      const [l, s] = await Promise.all([dependencyApi.list(params), dependencyApi.stats()]);
      setList(l);
      setStats(s);
    } catch (e: any) {
      message.error('加载失败：' + e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [filterType, filterStatus, filterProject]);
  useEffect(() => {
    projectApi.list().then(setProjects).catch(() => {});
    workItemApi.list({}).then(setWorkItems).catch(() => {});
  }, []);

  const handleAdd = () => {
    setEditing(null);
    form.resetFields();
    form.setFieldsValue({ status: 'pending', type: '台架' });
    setDrawerOpen(true);
  };

  const handleEdit = (d: any) => {
    setEditing(d);
    form.setFieldsValue({
      ...d,
      expectedDate: d.expectedDate ? dayjs(d.expectedDate) : null,
      actualDate: d.actualDate ? dayjs(d.actualDate) : null,
    });
    setDrawerOpen(true);
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      const payload: any = {
        ...values,
        expectedDate: values.expectedDate?.toISOString() || null,
        actualDate: values.actualDate?.toISOString() || null,
      };
      // 把 workItemKey 转 workItemId（如果有）
      if (values.workItemKey) {
        const wi = workItems.find(w => w.key === values.workItemKey);
        if (wi) payload.workItemId = wi.id;
        delete payload.workItemKey;
      }
      if (values.projectCode) {
        const p = projects.find(p => p.code === values.projectCode);
        if (p) payload.projectId = p.id;
        delete payload.projectCode;
      }
      if (editing) {
        await dependencyApi.update(editing.id, payload);
        message.success('已更新');
      } else {
        await dependencyApi.create(payload);
        message.success('已创建');
      }
      setDrawerOpen(false);
      load();
    } catch (e: any) {
      if (e?.errorFields) return;
      message.error('保存失败：' + (e?.response?.data?.error || e.message));
    }
  };

  const handleDelete = async (id: string) => {
    await dependencyApi.remove(id);
    message.success('已删除');
    load();
  };

  const handleMarkReady = async (d: any) => {
    try {
      await dependencyApi.ready(d.id);
      message.success(`已标记「${d.name}」为已就绪`);
      load();
    } catch (e: any) {
      message.error('操作失败：' + e.message);
    }
  };

  const handleAiFill = async () => {
    try {
      const v = await form.validateFields(['name']);
      if (!v.name) { message.warning('请先输入依赖名称'); return; }
      setAiFilling(true);
      const r = await (await import('../api')).aiApi.aiFillForm('dependency', { name: v.name, type: v.type });
      if (r.filled) {
        form.setFieldsValue({
          type: r.filled.type || undefined,
          owner: r.filled.owner || undefined,
          expectedDate: r.filled.expectedDate ? dayjs(r.filled.expectedDate) : undefined,
          status: r.filled.status || 'pending',
          description: r.filled.description || undefined,
          projectCode: r.filled.projectCode || undefined,
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

  // 超期判断
  const isOverdue = (d: any) => {
    return d.expectedDate && new Date(d.expectedDate) < new Date() && d.status !== 'ready' && d.status !== 'cancelled';
  };
  const daysOverdue = (d: any) => {
    if (!d.expectedDate) return 0;
    return Math.ceil((Date.now() - new Date(d.expectedDate).getTime()) / 86400000);
  };

  // 按状态分组
  const grouped = useMemo(() => {
    const m: Record<string, any[]> = { blocked: [], preparing: [], pending: [], ready: [], cancelled: [] };
    for (const d of list) m[d.status]?.push(d);
    return m;
  }, [list]);

  return (
    <div>
      <Row gutter={[16, 16]}>
        <Col span={6}>
          <Card>
            <Statistic title="总依赖" value={stats?.total || 0} prefix={<ToolOutlined />} />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="已就绪"
              value={stats?.byStatus?.ready || 0}
              valueStyle={{ color: '#52c41a' }}
              prefix={<CheckCircleOutlined />}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="卡点"
              value={stats?.byStatus?.blocked || 0}
              valueStyle={{ color: '#ff4d4f' }}
              prefix={<WarningOutlined />}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="超期未就绪"
              value={stats?.overdue || 0}
              valueStyle={{ color: stats?.overdue > 0 ? '#ff4d4f' : undefined }}
              prefix={<ClockCircleOutlined />}
            />
          </Card>
        </Col>
      </Row>

      {stats?.overdue > 0 && (
        <Alert
          type="error"
          showIcon
          style={{ marginTop: 16 }}
          message={`有 ${stats.overdue} 个依赖已超期但未就绪`}
          description="这些依赖会阻塞关联工作项，建议立即跟进负责人或调整计划。"
        />
      )}

      <Card
        style={{ marginTop: 16 }}
        title="外部依赖清单（台架 / 实车 / 车模 / SDB / UE / UI / 标定）"
        extra={
          <Space>
            <Select placeholder="按类型筛选" allowClear style={{ width: 110 }} value={filterType} onChange={setFilterType} options={TYPE_OPTIONS} />
            <Select placeholder="按状态筛选" allowClear style={{ width: 110 }} value={filterStatus} onChange={setFilterStatus} options={STATUS_OPTIONS} />
            <Select
              placeholder="按项目筛选" allowClear showSearch style={{ width: 180 }}
              value={filterProject} onChange={setFilterProject}
              options={projects.map(p => ({ value: p.code, label: `${p.code} ${p.name}` }))}
            />
            <Button icon={<ReloadOutlined />} onClick={load}>刷新</Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>新建依赖</Button>
          </Space>
        }
      >
        {list.length === 0 ? (
          <Empty description="暂无依赖" />
        ) : (
          <Table
            rowKey="id"
            dataSource={list}
            loading={loading}
            pagination={{ pageSize: 20 }}
            columns={[
              {
                title: '类型', dataIndex: 'type', width: 100,
                render: (t: string) => <Tag color={TYPE_META[t]?.color}>{TYPE_META[t]?.icon} {t}</Tag>,
              },
              {
                title: '名称', dataIndex: 'name', width: 200,
                render: (v: string, r: any) => (
                  <Space direction="vertical" size={0}>
                    <span style={{ fontWeight: 500 }}>{v}</span>
                    {r.description && <span style={{ fontSize: 11, color: '#999' }}>{r.description}</span>}
                  </Space>
                ),
              },
              {
                title: '状态', dataIndex: 'status', width: 90,
                render: (s: string) => <Tag color={STATUS_META[s]?.color}>{STATUS_META[s]?.label}</Tag>,
              },
              { title: '负责人', dataIndex: 'owner', width: 100, render: (v: string) => v || <span style={{ color: '#ccc' }}>-</span> },
              {
                title: '到期日', dataIndex: 'expectedDate', width: 110,
                render: (v: string, r: any) => {
                  if (!v) return <span style={{ color: '#ccc' }}>-</span>;
                  const overdue = isOverdue(r);
                  return (
                    <Space size={4}>
                      <span style={{ color: overdue ? '#ff4d4f' : undefined, fontWeight: overdue ? 500 : undefined }}>
                        {dayjs(v).format('YYYY-MM-DD')}
                      </span>
                      {overdue && <Tag color="red">超 {daysOverdue(r)} 天</Tag>}
                    </Space>
                  );
                },
              },
              { title: '关联工作项', dataIndex: 'workItem', width: 130, render: (w: any) => w ? <Tag color="blue">{w.key}</Tag> : <span style={{ color: '#ccc' }}>-</span> },
              { title: '项目', dataIndex: 'project', width: 130, render: (p: any) => p ? <Tag color="geekblue">{p.code}</Tag> : <span style={{ color: '#ccc' }}>-</span> },
              {
                title: '卡点', dataIndex: 'blocker', width: 200,
                render: (v: string) => v ? <span style={{ color: '#ff4d4f' }}>{v}</span> : <span style={{ color: '#ccc' }}>-</span>,
              },
              {
                title: '操作', width: 200, fixed: 'right',
                render: (_: any, r: any) => (
                  <Space size={4}>
                    {r.status !== 'ready' && r.status !== 'cancelled' && (
                      <Button type="link" size="small" icon={<CheckCircleOutlined />} onClick={() => handleMarkReady(r)}>
                        标记就绪
                      </Button>
                    )}
                    <Button type="link" size="small" icon={<EditOutlined />} onClick={() => handleEdit(r)}>编辑</Button>
                    <Popconfirm title="确定删除？" onConfirm={() => handleDelete(r.id)}>
                      <Button type="link" size="small" danger icon={<DeleteOutlined />}>删除</Button>
                    </Popconfirm>
                  </Space>
                ),
              },
            ]}
          />
        )}
      </Card>

      <Drawer
        title={editing ? `编辑依赖：${editing.name}` : '新建外部依赖'}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        width={640}
        extra={
          <Space>
            <Button icon={<ThunderboltOutlined />} onClick={handleAiFill} loading={aiFilling}>AI 帮我填</Button>
            <Button onClick={() => setDrawerOpen(false)}>取消</Button>
            <Button type="primary" onClick={handleSubmit}>{editing ? '保存' : '创建'}</Button>
          </Space>
        }
      >
        <Form form={form} layout="vertical">
          <Form.Item name="type" label="依赖类型" rules={[{ required: true }]}>
            <Select options={TYPE_OPTIONS} placeholder="台架/实车/车模/SDB/UE/UI/标定" />
          </Form.Item>
          <Form.Item name="name" label="依赖名称" rules={[{ required: true, message: '请输入名称' }]}>
            <Input placeholder="如：吉利研究院 4 号台架" />
          </Form.Item>
          <Form.Item name="description" label="描述">
            <Input.TextArea rows={2} placeholder="补充说明（如型号、来源、规格等）" />
          </Form.Item>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="status" label="状态">
                <Select options={STATUS_OPTIONS} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="owner" label="负责人">
                <Input placeholder="如 张三（研发一组）" />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="expectedDate" label="预计就绪时间">
                <Input type="date" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="actualDate" label="实际就绪时间">
                <Input type="date" />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="blocker" label="卡点说明（状态=卡点 时必填）">
            <Input.TextArea rows={2} placeholder="如：客户工厂排期已满" />
          </Form.Item>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="projectCode" label="关联项目">
                <Select
                  allowClear showSearch
                  placeholder="选择项目"
                  options={projects.map(p => ({ value: p.code, label: `${p.code} ${p.name}` }))}
                />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="workItemKey" label="关联工作项">
                <Select
                  allowClear showSearch
                  placeholder="选择工作项"
                  options={workItems.map(w => ({ value: w.key, label: `${w.key} ${w.title}` }))}
                />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Drawer>
    </div>
  );
}
