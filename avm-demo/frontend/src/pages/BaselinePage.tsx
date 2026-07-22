/**
 * 基线管理
 * 计划快照 + 计划 vs 实际对比
 */
import { useEffect, useState } from 'react';
import { Card, Table, Button, Modal, Form, Input, Select, Space, Tag, Empty, Spin, message, Popconfirm, Tabs, Statistic, Row, Col, Alert } from 'antd';
import { PlusOutlined, CameraOutlined, SwapOutlined, ReloadOutlined, DeleteOutlined, EyeOutlined, DiffOutlined } from '@ant-design/icons';
import { baselineApi, type Baseline } from '../api';
import dayjs from 'dayjs';

export function BaselinePage() {
  const [list, setList] = useState<Baseline[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [compareData, setCompareData] = useState<any>(null);
  const [comparing, setComparing] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      setList(await baselineApi.list());
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const handleCreate = async (values: any) => {
    try {
      await baselineApi.create(values);
      message.success('基线已创建');
      setModalOpen(false);
      load();
    } catch (e: any) { message.error(e.message); }
  };

  const handleCompare = async (b: Baseline) => {
    setComparing(true);
    try {
      const r = await baselineApi.compare(b.id);
      setCompareData(r);
    } catch (e: any) { message.error(e.message); }
    finally { setComparing(false); }
  };

  return (
    <div>
      <Card
        title={
          <Space>
            <CameraOutlined />
            <span>基线管理（计划快照与对比）</span>
          </Space>
        }
        extra={
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalOpen(true)}>
            创建基线
          </Button>
        }
        style={{ borderRadius: 8 }}
      >
        <p style={{ color: '#666' }}>
          基线是工作项的"时间快照"，用于对比当前状态与历史计划的偏差。基线创建后不能修改。
        </p>
        <Table
          dataSource={list}
          rowKey="id"
          loading={loading}
          pagination={false}
          columns={[
            { title: '名称', dataIndex: 'name', width: 240 },
            { title: '类型', dataIndex: 'baselineType', width: 100, render: t => <Tag color="blue">{t}</Tag> },
            { title: '所属迭代', dataIndex: 'iterationName', width: 180, render: n => n || <span style={{ color: '#999' }}>全空间</span> },
            { title: '工作项数', dataIndex: 'itemCount', width: 100, render: c => <b>{c}</b> },
            { title: '总估分', dataIndex: 'totalEstimate', width: 100, render: v => `${v} 点` },
            { title: '创建人', dataIndex: 'createdBy', width: 100 },
            { title: '创建时间', dataIndex: 'createdAt', width: 170, render: t => new Date(t).toLocaleString('zh-CN') },
            { title: '操作', width: 200, render: (_, b) => (
              <Space>
                <Button type="link" size="small" icon={<DiffOutlined />} onClick={() => handleCompare(b)}>对比</Button>
                <Popconfirm title="确定删除此基线？" onConfirm={async () => {
                  await baselineApi.remove(b.id);
                  message.success('已删除');
                  load();
                }}>
                  <Button type="link" size="small" danger icon={<DeleteOutlined />}>删除</Button>
                </Popconfirm>
              </Space>
            ) },
          ]}
        />
      </Card>

      {/* 创建基线 */}
      <Modal title="创建基线" open={modalOpen} onCancel={() => setModalOpen(false)} onOk={() => {
        const form = (document.getElementById('baseline-form') as any)?._form;
        if (form) form.submit();
      }} okText="创建" width={500}>
        <BaselineForm onSubmit={handleCreate} formId="baseline-form" />
      </Modal>

      {/* 对比结果 */}
      <Modal
        title={compareData ? `对比：${compareData.baseline.name}` : ''}
        open={!!compareData}
        onCancel={() => setCompareData(null)}
        footer={null}
        width={900}
      >
        {comparing ? <Spin /> : compareData && <BaselineCompareView data={compareData} />}
      </Modal>
    </div>
  );
}

function BaselineForm({ onSubmit, formId }: { onSubmit: (v: any) => void; formId: string }) {
  const [form] = Form.useForm();
  useEffect(() => {
    const el: any = document.getElementById(formId);
    if (el) el._form = form;
    return () => { if (el) el._form = null; };
  }, [form, formId]);

  return (
    <Form form={form} layout="vertical" onFinish={onSubmit}>
      <Form.Item name="name" label="基线名称" rules={[{ required: true }]}>
        <Input placeholder="如：V1.0 Sprint 1 基线" />
      </Form.Item>
      <Form.Item name="baselineType" label="类型" rules={[{ required: true }]}>
        <Select options={[
          { value: 'iteration', label: '迭代基线' },
          { value: 'release', label: '版本基线' },
          { value: 'ad-hoc', label: '临时基线' },
        ]} defaultValue="iteration" />
      </Form.Item>
      <Form.Item name="description" label="描述">
        <Input.TextArea rows={2} />
      </Form.Item>
      <Form.Item name="createdBy" label="创建人">
        <Input placeholder="如：pm" defaultValue="pm" />
      </Form.Item>
    </Form>
  );
}

function BaselineCompareView({ data }: { data: any }) {
  const { baseline, changes, stats } = data;
  return (
    <div>
      {/* 顶部统计 */}
      <Row gutter={12} style={{ marginBottom: 12 }}>
        <Col span={5}><Card size="small"><Statistic title="基线工作项" value={stats.totalItems} /></Card></Col>
        <Col span={5}><Card size="small"><Statistic title="变化项" value={stats.changed} valueStyle={{ color: '#faad14' }} /></Card></Col>
        <Col span={5}><Card size="small"><Statistic title="超期" value={stats.delayed} valueStyle={{ color: '#ff4d4f' }} /></Card></Col>
        <Col span={5}><Card size="small"><Statistic title="已完成" value={stats.ahead} valueStyle={{ color: '#52c41a' }} /></Card></Col>
        <Col span={4}><Card size="small"><Statistic title="健康分" value={stats.healthScore} valueStyle={{ color: stats.healthScore >= 80 ? '#52c41a' : stats.healthScore >= 60 ? '#faad14' : '#ff4d4f' }} suffix="/100" /></Card></Col>
      </Row>

      <Alert
        type={stats.healthScore >= 80 ? 'success' : stats.healthScore >= 60 ? 'warning' : 'error'}
        showIcon
        style={{ marginBottom: 12 }}
        message={`基线创建于 ${new Date(baseline.createdAt).toLocaleString('zh-CN')}，共记录 ${stats.totalItems} 个工作项`}
      />

      <Tabs items={[
        {
          key: 'delayed', label: <span><span style={{ color: '#ff4d4f' }}>超期 ({changes.delayed.length})</span></span>,
          children: changes.delayed.length === 0 ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="无超期" /> : (
            <ChangeTable data={changes.delayed} columns={[
              { title: '工作项', dataIndex: 'key', width: 120, render: (k: string, r: any) => <span><Tag color="blue">{k}</Tag> {r.title}</span> },
              { title: '超期天数', dataIndex: 'delayDays', width: 120, render: (d: number) => <Tag color="red">{d} 天</Tag> },
            ]} />
          ),
        },
        {
          key: 'planChanged', label: `排期变更 (${changes.planChanged.length})`,
          children: changes.planChanged.length === 0 ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} /> : (
            <ChangeTable data={changes.planChanged} columns={[
              { title: '工作项', dataIndex: 'key', width: 120, render: (k: string, r: any) => <span><Tag color="blue">{k}</Tag> {r.title}</span> },
              { title: '基线', dataIndex: 'from', render: (f: any) => f.start ? `${new Date(f.start).toLocaleDateString('zh-CN')} ~ ${new Date(f.end).toLocaleDateString('zh-CN')}` : '-' },
              { title: '现状', dataIndex: 'to', render: (t: any) => t.start ? `${new Date(t.start).toLocaleDateString('zh-CN')} ~ ${new Date(t.end).toLocaleDateString('zh-CN')}` : '-' },
              { title: '偏差', dataIndex: 'delayDays', width: 100, render: (d: number) => <Tag color={d > 0 ? 'red' : d < 0 ? 'green' : 'default'}>{d > 0 ? '+' : ''}{d} 天</Tag> },
            ]} />
          ),
        },
        {
          key: 'status', label: `状态变更 (${changes.statusChanged.length})`,
          children: changes.statusChanged.length === 0 ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} /> : (
            <ChangeTable data={changes.statusChanged} columns={[
              { title: '工作项', dataIndex: 'key', width: 120, render: (k: string, r: any) => <span><Tag color="blue">{k}</Tag> {r.title}</span> },
              { title: '原状态', dataIndex: 'from', render: (s: string) => <Tag>{s}</Tag> },
              { title: '新状态', dataIndex: 'to', render: (s: string) => <Tag color="blue">{s}</Tag> },
            ]} />
          ),
        },
        {
          key: 'estimate', label: `估分变更 (${changes.estimateChanged.length})`,
          children: changes.estimateChanged.length === 0 ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} /> : (
            <ChangeTable data={changes.estimateChanged} columns={[
              { title: '工作项', dataIndex: 'key', width: 120, render: (k: string, r: any) => <span><Tag color="blue">{k}</Tag> {r.title}</span> },
              { title: '基线', dataIndex: 'from' },
              { title: '现状', dataIndex: 'to' },
              { title: '变化', dataIndex: 'diff', render: (d: number) => <Tag color={d > 0 ? 'red' : 'green'}>{d > 0 ? '+' : ''}{d}</Tag> },
            ]} />
          ),
        },
        {
          key: 'assignee', label: `负责人变更 (${changes.assigneeChanged.length})`,
          children: changes.assigneeChanged.length === 0 ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} /> : (
            <ChangeTable data={changes.assigneeChanged} columns={[
              { title: '工作项', dataIndex: 'key', width: 120, render: (k: string, r: any) => <span><Tag color="blue">{k}</Tag> {r.title}</span> },
              { title: '原负责人', dataIndex: 'from' },
              { title: '新负责人', dataIndex: 'to' },
            ]} />
          ),
        },
        {
          key: 'onTrack', label: `按计划 (${changes.onTrack.length})`,
          children: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={`${changes.onTrack.length} 个工作项按计划推进`} />,
        },
      ]} />
    </div>
  );
}

function ChangeTable({ data, columns }: { data: any[]; columns: any[] }) {
  return <Table size="small" dataSource={data} columns={columns} pagination={{ pageSize: 10 }} />;
}
