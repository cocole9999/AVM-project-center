/**
 * 测试管理
 * 来源 PRD §自动化·测试管理
 * 包含：测试用例库 + 测试计划 + 执行记录 + 缺陷关联
 */
import { useEffect, useState } from 'react';
import { Card, Tabs, Table, Button, Space, Modal, Form, Input, Select, Tag, message, Popconfirm, Row, Col, Statistic, Progress, Empty, Drawer, Spin } from 'antd';
import { PlusOutlined, ExperimentOutlined, PlayCircleOutlined, BugOutlined, ReloadOutlined, DeleteOutlined, EditOutlined, CheckCircleOutlined, CloseCircleOutlined, MinusCircleOutlined, FileTextOutlined } from '@ant-design/icons';
import { testApi } from '../api';
import dayjs from 'dayjs';

const CASE_TYPE_LABEL: Record<string, string> = { functional: '功能', integration: '集成', smoke: '冒烟', regression: '回归', performance: '性能', security: '安全' };
const CASE_TYPE_COLOR: Record<string, string> = { functional: 'blue', integration: 'cyan', smoke: 'green', regression: 'orange', performance: 'purple', security: 'red' };
const PRIORITY_COLOR: Record<string, string> = { P0: 'red', P1: 'orange', P2: 'blue', P3: 'default' };
const STATUS_COLOR: Record<string, string> = { pending: 'default', in_progress: 'blue', passed: 'green', failed: 'red', blocked: 'orange', skipped: 'default' };
const STATUS_LABEL: Record<string, string> = { pending: '待执行', in_progress: '执行中', passed: '通过', failed: '失败', blocked: '阻塞', skipped: '跳过' };
const PLAN_STATUS_COLOR: Record<string, string> = { draft: 'default', in_progress: 'blue', completed: 'green', archived: 'default' };
const PLAN_STATUS_LABEL: Record<string, string> = { draft: '草稿', in_progress: '进行中', completed: '已完成', archived: '已归档' };

export function TestPage() {
  return (
    <Tabs defaultActiveKey="overview" items={[
      { key: 'overview', label: '总览', children: <TestOverview /> },
      { key: 'cases', label: '用例库', children: <TestCasesView /> },
      { key: 'plans', label: '测试计划', children: <TestPlansView /> },
      { key: 'runs', label: '执行记录', children: <TestRunsView /> },
    ]} />
  );
}

function TestOverview() {
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try { setStats(await testApi.stats()); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  if (!stats) return <Spin spinning={loading}><Empty /></Spin>;

  const passRate = (stats.totalCases > 0 && (stats.passedRuns + stats.failedRuns) > 0)
    ? Math.round(stats.passedRuns / (stats.passedRuns + stats.failedRuns) * 100) : 0;

  return (
    <div>
      <Row gutter={12} style={{ marginBottom: 12 }}>
        <Col span={6}><Card size="small"><Statistic title="用例总数" value={stats.totalCases} prefix={<FileTextOutlined />} /></Card></Col>
        <Col span={6}><Card size="small"><Statistic title="测试计划" value={stats.totalPlans} prefix={<ExperimentOutlined />} /></Card></Col>
        <Col span={6}><Card size="small"><Statistic title="进行中计划" value={stats.activePlans} valueStyle={{ color: '#1890ff' }} /></Card></Col>
        <Col span={6}><Card size="small"><Statistic title="执行通过率" value={passRate} suffix="%" valueStyle={{ color: passRate >= 80 ? '#52c41a' : '#faad14' }} /></Card></Col>
      </Row>
      <Row gutter={12}>
        <Col span={12}>
          <Card size="small" title="用例类型分布" style={{ borderRadius: 8 }}>
            {stats.byType.map((b: any) => (
              <div key={b.type} style={{ marginBottom: 8 }}>
                <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                  <Tag color={CASE_TYPE_COLOR[b.type] || 'default'}>{CASE_TYPE_LABEL[b.type] || b.type}</Tag>
                  <span style={{ fontSize: 12 }}>{b.count} 个</span>
                </Space>
                <Progress percent={Math.round(b.count / stats.totalCases * 100)} showInfo={false} strokeColor={CASE_TYPE_COLOR[b.type]} />
              </div>
            ))}
          </Card>
        </Col>
        <Col span={12}>
          <Card size="small" title="优先级分布" style={{ borderRadius: 8 }}>
            {stats.byPriority.map((b: any) => (
              <div key={b.priority} style={{ marginBottom: 8 }}>
                <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                  <Tag color={PRIORITY_COLOR[b.priority]}>{b.priority}</Tag>
                  <span style={{ fontSize: 12 }}>{b.count} 个</span>
                </Space>
                <Progress percent={Math.round(b.count / stats.totalCases * 100)} showInfo={false} strokeColor={PRIORITY_COLOR[b.priority]} />
              </div>
            ))}
          </Card>
        </Col>
      </Row>
    </div>
  );
}

function TestCasesView() {
  const [list, setList] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [bugsOfCase, setBugsOfCase] = useState<any>(null);

  const load = async () => {
    setLoading(true);
    try { setList(await testApi.cases()); } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  return (
    <div>
      <Card
        title={<Space><FileTextOutlined />测试用例库</Space>}
        extra={
          <Space>
            <Button icon={<ReloadOutlined />} onClick={load}>刷新</Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => { setEditing(null); setModalOpen(true); }}>
              新建用例
            </Button>
          </Space>
        }
        style={{ borderRadius: 8 }}
      >
        <Table
          dataSource={list}
          rowKey="id"
          loading={loading}
          size="small"
          pagination={{ pageSize: 20 }}
          columns={[
            { title: '编号', dataIndex: 'code', width: 160, render: c => <code>{c}</code> },
            { title: '标题', dataIndex: 'title', width: 240 },
            { title: '模块', dataIndex: 'module', width: 120, render: m => m || <span style={{ color: '#999' }}>-</span> },
            { title: '类型', dataIndex: 'caseType', width: 80, render: t => <Tag color={CASE_TYPE_COLOR[t]}>{CASE_TYPE_LABEL[t] || t}</Tag> },
            { title: '优先级', dataIndex: 'priority', width: 80, render: p => <Tag color={PRIORITY_COLOR[p]}>{p}</Tag> },
            { title: '关联', dataIndex: 'workItemKey', width: 120, render: k => k ? <Tag color="blue">{k}</Tag> : '-' },
            { title: '自动化', dataIndex: 'automated', width: 80, render: a => a ? <Tag color="cyan">是</Tag> : <Tag>否</Tag> },
            { title: '标签', dataIndex: 'tags', render: t => t ? t.split(',').map((x: string) => <Tag key={x}>{x}</Tag>) : '-' },
            { title: '操作', width: 220, render: (_, c) => (
              <Space>
                <Button type="link" size="small" icon={<EditOutlined />} onClick={() => { setEditing(c); setModalOpen(true); }}>编辑</Button>
                <Button type="link" size="small" icon={<BugOutlined />} onClick={async () => {
                  const detail = await testApi.getCase(c.id);
                  setBugsOfCase(detail);
                }}>缺陷</Button>
                <Popconfirm title="确定删除？" onConfirm={async () => { await testApi.removeCase(c.id); message.success('已删除'); load(); }}>
                  <Button type="link" size="small" danger icon={<DeleteOutlined />}>删除</Button>
                </Popconfirm>
              </Space>
            ) },
          ]}
        />
      </Card>

      <TestCaseModal open={modalOpen} testCase={editing} onClose={() => setModalOpen(false)} onSaved={() => { setModalOpen(false); load(); }} />
      <CaseBugsDrawer data={bugsOfCase} onClose={() => setBugsOfCase(null)} onChanged={load} />
    </div>
  );
}

function TestCaseModal({ open, testCase, onClose, onSaved }: { open: boolean; testCase: any; onClose: () => void; onSaved: () => void }) {
  const [form] = Form.useForm();
  const [steps, setSteps] = useState<any[]>([]);

  useEffect(() => {
    if (open) {
      let parsedSteps: any[] = [];
      try { if (testCase?.steps) parsedSteps = JSON.parse(testCase.steps); } catch {}
      form.setFieldsValue(testCase || { caseType: 'functional', priority: 'P1', automated: false });
      setSteps(parsedSteps);
    }
  }, [open, testCase, form]);

  const handleSave = async () => {
    const values = await form.validateFields();
    values.steps = JSON.stringify(steps);
    if (testCase) await testApi.updateCase(testCase.id, values);
    else await testApi.createCase(values);
    message.success('已保存');
    onSaved();
  };

  return (
    <Modal title={testCase ? '编辑测试用例' : '新建测试用例'} open={open} onCancel={onClose} onOk={handleSave} width={800} okText="保存">
      <Form form={form} layout="vertical">
        <Row gutter={8}>
          <Col span={14}><Form.Item name="title" label="标题" rules={[{ required: true }]}><Input placeholder="如：登录-错误密码锁定" /></Form.Item></Col>
          <Col span={10}><Form.Item name="module" label="模块"><Input placeholder="如：登录" /></Form.Item></Col>
        </Row>
        <Row gutter={8}>
          <Col span={8}><Form.Item name="caseType" label="用例类型" rules={[{ required: true }]}>
            <Select options={Object.entries(CASE_TYPE_LABEL).map(([v, l]) => ({ value: v, label: l }))} />
          </Form.Item></Col>
          <Col span={8}><Form.Item name="priority" label="优先级" rules={[{ required: true }]}>
            <Select options={['P0', 'P1', 'P2', 'P3'].map(p => ({ value: p, label: p }))} />
          </Form.Item></Col>
          <Col span={8}><Form.Item name="automated" label="自动化" valuePropName="checked"><Select options={[{value:false,label:'否'},{value:true,label:'是'}]} /></Form.Item></Col>
        </Row>
        <Form.Item name="description" label="描述"><Input.TextArea rows={2} /></Form.Item>
        <Form.Item name="preconditions" label="前置条件"><Input.TextArea rows={2} /></Form.Item>
        <Form.Item name="tags" label="标签（逗号分隔）"><Input placeholder="如：核心,登录,P0" /></Form.Item>
        <Form.Item name="expectedResult" label="预期结果"><Input.TextArea rows={2} /></Form.Item>
        <Form.Item label="测试步骤">
          <StepsEditor steps={steps} onChange={setSteps} />
        </Form.Item>
      </Form>
    </Modal>
  );
}

function StepsEditor({ steps, onChange }: { steps: any[]; onChange: (s: any[]) => void }) {
  return (
    <div>
      {steps.map((s, i) => (
        <Space.Compact block key={i} style={{ marginBottom: 6 }}>
          <Input style={{ width: 40 }} value={i + 1} disabled />
          <Input style={{ width: '40%' }} placeholder="步骤" value={s.step} onChange={e => { const arr = [...steps]; arr[i] = { ...arr[i], step: e.target.value }; onChange(arr); }} />
          <Input style={{ width: '40%' }} placeholder="预期" value={s.expected} onChange={e => { const arr = [...steps]; arr[i] = { ...arr[i], expected: e.target.value }; onChange(arr); }} />
          <Button onClick={() => onChange(steps.filter((_, idx) => idx !== i))} danger>删除</Button>
        </Space.Compact>
      ))}
      <Button block icon={<PlusOutlined />} onClick={() => onChange([...steps, { step: '', expected: '' }])}>添加步骤</Button>
    </div>
  );
}

function CaseBugsDrawer({ data, onClose, onChanged }: { data: any; onClose: () => void; onChanged: () => void }) {
  const [bugKey, setBugKey] = useState('');
  const [bugTitle, setBugTitle] = useState('');
  const [relationType, setRelationType] = useState('found_by');

  if (!data) return null;
  const bugs: any[] = data.bugs || [];

  return (
    <Drawer title={`缺陷关联：${data.code} ${data.title}`} open={!!data} onClose={onClose} width={500}>
      <Card size="small" title="新增关联" style={{ marginBottom: 12 }}>
        <Space.Compact block style={{ marginBottom: 6 }}>
          <Input style={{ width: '40%' }} placeholder="BUG key（如 BUG-1）" value={bugKey} onChange={e => setBugKey(e.target.value)} />
          <Input style={{ width: '60%' }} placeholder="缺陷标题" value={bugTitle} onChange={e => setBugTitle(e.target.value)} />
        </Space.Compact>
        <Select value={relationType} onChange={setRelationType} style={{ width: '100%', marginBottom: 6 }} options={[
          { value: 'found_by', label: '该用例发现' },
          { value: 'blocks', label: '阻塞该用例' },
          { value: 'related', label: '相关' },
        ]} />
        <Button type="primary" block onClick={async () => {
          if (!bugKey || !bugTitle) { message.warning('请填写 BUG key 和标题'); return; }
          await testApi.addCaseBug(data.id, { bugId: `manual-${Date.now()}`, bugKey, bugTitle, relationType, createdBy: '我' });
          message.success('已关联');
          setBugKey(''); setBugTitle('');
          const fresh = await testApi.getCase(data.id);
          Object.assign(data, fresh);
        }}>添加关联</Button>
      </Card>
      <div>
        {bugs.length === 0 ? <Empty description="无关联缺陷" /> : bugs.map(b => (
          <Card key={b.id} size="small" style={{ marginBottom: 8 }}>
            <Space>
              <Tag color="red">{b.bugKey}</Tag>
              <span>{b.bugTitle}</span>
              <Tag color={b.relationType === 'blocks' ? 'orange' : b.relationType === 'related' ? 'blue' : 'cyan'}>{b.relationType}</Tag>
              <Button size="small" danger icon={<DeleteOutlined />} onClick={async () => {
                await testApi.removeCaseBug(data.id, b.bugId);
                const fresh = await testApi.getCase(data.id);
                Object.assign(data, fresh);
              }} />
            </Space>
            {b.notes && <div style={{ fontSize: 12, color: '#999', marginTop: 4 }}>{b.notes}</div>}
          </Card>
        ))}
      </div>
    </Drawer>
  );
}

function TestPlansView() {
  const [list, setList] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [planDetail, setPlanDetail] = useState<any>(null);

  const load = async () => {
    setLoading(true);
    try { setList(await testApi.plans()); } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  return (
    <div>
      <Card
        title={<Space><ExperimentOutlined />测试计划</Space>}
        extra={
          <Space>
            <Button icon={<ReloadOutlined />} onClick={load}>刷新</Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => { setEditing(null); setModalOpen(true); }}>
              新建计划
            </Button>
          </Space>
        }
        style={{ borderRadius: 8 }}
      >
        <Table
          dataSource={list}
          rowKey="id"
          loading={loading}
          pagination={false}
          columns={[
            { title: '名称', dataIndex: 'name', width: 240 },
            { title: '迭代', dataIndex: 'iterationName', width: 160, render: n => n || '-' },
            { title: '起止', width: 200, render: (_, p) => `${dayjs(p.startDate).format('MM-DD')} ~ ${dayjs(p.endDate).format('MM-DD')}` },
            { title: '状态', dataIndex: 'status', width: 100, render: s => <Tag color={PLAN_STATUS_COLOR[s]}>{PLAN_STATUS_LABEL[s]}</Tag> },
            { title: '负责人', dataIndex: 'ownerName', width: 100 },
            { title: '进度', width: 180, render: (_, p) => {
              const total = p.totalCases || 0;
              const done = p.passedCases + p.failedCases + p.blockedCases + p.skippedCases;
              const passRate = done > 0 ? Math.round(p.passedCases / done * 100) : 0;
              return (
                <div>
                  <Progress percent={total > 0 ? Math.round(done / total * 100) : 0} size="small" format={() => `${done}/${total}`} />
                  <div style={{ fontSize: 11, color: '#999' }}>通过率 {passRate}%</div>
                </div>
              );
            }},
            { title: '操作', width: 160, render: (_, p) => (
              <Space>
                <Button type="link" size="small" onClick={async () => {
                  const d = await testApi.getPlan(p.id);
                  setPlanDetail(d);
                }}>详情</Button>
                <Popconfirm title="确定删除？" onConfirm={async () => { await testApi.removePlan(p.id); message.success('已删除'); load(); }}>
                  <Button type="link" size="small" danger icon={<DeleteOutlined />}>删除</Button>
                </Popconfirm>
              </Space>
            ) },
          ]}
        />
      </Card>

      <TestPlanModal open={modalOpen} plan={editing} onClose={() => setModalOpen(false)} onSaved={() => { setModalOpen(false); load(); }} />
      <PlanDetailDrawer data={planDetail} onClose={() => setPlanDetail(null)} onChanged={load} />
    </div>
  );
}

function TestPlanModal({ open, plan, onClose, onSaved }: { open: boolean; plan: any; onClose: () => void; onSaved: () => void }) {
  const [form] = Form.useForm();
  useEffect(() => {
    if (open) form.setFieldsValue(plan || { startDate: dayjs(), endDate: dayjs().add(7, 'day') });
  }, [open, plan, form]);

  const handleSave = async () => {
    const values = await form.validateFields();
    if (values.startDate) values.startDate = values.startDate.toISOString();
    if (values.endDate) values.endDate = values.endDate.toISOString();
    if (plan) await testApi.updatePlan(plan.id, values);
    else await testApi.createPlan({ ...values, ownerName: values.ownerName || '我', ownerId: 'me', createdBy: 'me' });
    message.success('已保存');
    onSaved();
  };

  return (
    <Modal title={plan ? '编辑测试计划' : '新建测试计划'} open={open} onCancel={onClose} onOk={handleSave} width={500} okText="保存">
      <Form form={form} layout="vertical">
        <Form.Item name="name" label="计划名称" rules={[{ required: true }]}><Input /></Form.Item>
        <Form.Item name="iterationName" label="所属迭代"><Input /></Form.Item>
        <Form.Item name="description" label="描述"><Input.TextArea rows={2} /></Form.Item>
        <Space.Compact block>
          <Form.Item name="startDate" label="开始日期" style={{ flex: 1, marginRight: 8 }}><Input type="date" /></Form.Item>
          <Form.Item name="endDate" label="结束日期" style={{ flex: 1 }}><Input type="date" /></Form.Item>
        </Space.Compact>
        <Form.Item name="ownerName" label="负责人"><Input defaultValue="我" /></Form.Item>
      </Form>
    </Modal>
  );
}

function PlanDetailDrawer({ data, onClose, onChanged }: { data: any; onClose: () => void; onChanged: () => void }) {
  const [addCaseOpen, setAddCaseOpen] = useState(false);
  const [allCases, setAllCases] = useState<any[]>([]);
  const [selectedCaseIds, setSelectedCaseIds] = useState<string[]>([]);

  if (!data) return null;
  const planCases: any[] = data.planCases || [];

  return (
    <Drawer title={`测试计划详情：${data.name}`} open={!!data} onClose={onClose} width={900}>
      <Card size="small" style={{ marginBottom: 12 }}>
        <Row gutter={16}>
          <Col><Statistic title="状态" value={PLAN_STATUS_LABEL[data.status]} valueStyle={{ color: PLAN_STATUS_COLOR[data.status] }} /></Col>
          <Col><Statistic title="用例数" value={data.totalCases} /></Col>
          <Col><Statistic title="通过" value={data.passedCases} valueStyle={{ color: '#52c41a' }} /></Col>
          <Col><Statistic title="失败" value={data.failedCases} valueStyle={{ color: '#ff4d4f' }} /></Col>
          <Col><Statistic title="阻塞" value={data.blockedCases} valueStyle={{ color: '#faad14' }} /></Col>
        </Row>
      </Card>
      <Space style={{ marginBottom: 12 }}>
        <Button type="primary" icon={<PlusOutlined />} onClick={async () => { setAllCases(await testApi.cases()); setAddCaseOpen(true); }}>添加用例</Button>
        <Button icon={<PlayCircleOutlined />} onClick={async () => {
          await testApi.createRun(data.id, { runnerId: 'me', runnerName: '我', caseIds: planCases.map(c => c.caseId) });
          message.success('已开始执行');
          const fresh = await testApi.getPlan(data.id);
          Object.assign(data, fresh);
        }}>开始执行</Button>
      </Space>
      <Table
        size="small"
        dataSource={planCases}
        rowKey="caseId"
        columns={[
          { title: '#', dataIndex: 'orderNum', width: 50 },
          { title: '用例', width: 200, render: (_, c) => <span><code style={{ fontSize: 11 }}>{c.case?.code}</code> {c.case?.title}</span> },
          { title: '优先级', width: 70, render: (_, c) => <Tag color={PRIORITY_COLOR[c.case?.priority || 'P2']}>{c.case?.priority}</Tag> },
          { title: '执行人', dataIndex: 'assigneeName', width: 100 },
          { title: '状态', dataIndex: 'status', width: 100, render: s => <Tag color={STATUS_COLOR[s]}>{STATUS_LABEL[s]}</Tag> },
          { title: '实际结果', dataIndex: 'actualResult', render: r => r || '-' },
          { title: '操作', width: 200, render: (_, c) => (
            <Space>
              <Button size="small" type="link" icon={<CheckCircleOutlined style={{ color: '#52c41a' }} />} onClick={() => testApi.updatePlanCase(data.id, c.caseId, { status: 'passed', actualResult: '通过' }).then(() => testApi.getPlan(data.id).then(d => Object.assign(data, d)))}>通过</Button>
              <Button size="small" type="link" icon={<CloseCircleOutlined style={{ color: '#ff4d4f' }} />} onClick={() => testApi.updatePlanCase(data.id, c.caseId, { status: 'failed', actualResult: '失败' }).then(() => testApi.getPlan(data.id).then(d => Object.assign(data, d)))}>失败</Button>
              <Button size="small" type="link" icon={<MinusCircleOutlined />} onClick={() => testApi.updatePlanCase(data.id, c.caseId, { status: 'blocked', actualResult: '阻塞' }).then(() => testApi.getPlan(data.id).then(d => Object.assign(data, d)))}>阻塞</Button>
            </Space>
          ) },
        ]}
      />
      <Modal title="添加用例到计划" open={addCaseOpen} onCancel={() => setAddCaseOpen(false)} onOk={async () => {
        await testApi.addCasesToPlan(data.id, { caseIds: selectedCaseIds });
        message.success(`已添加 ${selectedCaseIds.length} 个用例`);
        setAddCaseOpen(false);
        setSelectedCaseIds([]);
        const fresh = await testApi.getPlan(data.id);
        Object.assign(data, fresh);
      }} width={700}>
        <Table
          size="small"
          dataSource={allCases}
          rowKey="id"
          rowSelection={{ selectedRowKeys: selectedCaseIds, onChange: setSelectedCaseIds }}
          columns={[
            { title: '编号', dataIndex: 'code' },
            { title: '标题', dataIndex: 'title' },
            { title: '模块', dataIndex: 'module' },
            { title: '优先级', dataIndex: 'priority', render: p => <Tag color={PRIORITY_COLOR[p]}>{p}</Tag> },
          ]}
        />
      </Modal>
    </Drawer>
  );
}

function TestRunsView() {
  const [list, setList] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const load = async () => {
    setLoading(true);
    try { setList(await testApi.runs()); } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  return (
    <Card title={<Space><PlayCircleOutlined />执行记录</Space>} extra={<Button icon={<ReloadOutlined />} onClick={load}>刷新</Button>} style={{ borderRadius: 8 }}>
      <Table
        dataSource={list}
        rowKey="id"
        loading={loading}
        size="small"
        pagination={{ pageSize: 20 }}
        columns={[
          { title: '时间', dataIndex: 'startedAt', width: 170, render: t => new Date(t).toLocaleString('zh-CN') },
          { title: '计划', dataIndex: 'planName' },
          { title: '执行人', dataIndex: 'runnerName', width: 100 },
          { title: '通过', dataIndex: 'passed', width: 80, render: v => <Tag color="green">{v}</Tag> },
          { title: '失败', dataIndex: 'failed', width: 80, render: v => <Tag color="red">{v}</Tag> },
          { title: '阻塞', dataIndex: 'blocked', width: 80, render: v => <Tag color="orange">{v}</Tag> },
          { title: '跳过', dataIndex: 'skipped', width: 80 },
          { title: '状态', dataIndex: 'status', width: 100, render: s => <Tag color={s === 'passed' ? 'green' : s === 'failed' ? 'red' : 'blue'}>{s}</Tag> },
          { title: '完成时间', dataIndex: 'finishedAt', width: 170, render: t => t ? new Date(t).toLocaleString('zh-CN') : '-' },
        ]}
      />
    </Card>
  );
}
