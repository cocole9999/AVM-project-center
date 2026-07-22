/**
 * 自动化规则管理
 * 触发器 + 条件 + 操作 三段式可视化配置
 */
import { useEffect, useState } from 'react';
import { Card, Table, Button, Space, Modal, Form, Input, Select, Switch, message, Tag, Popconfirm, Tabs, Drawer, Empty } from 'antd';
import { PlusOutlined, ThunderboltOutlined, ReloadOutlined, DeleteOutlined, EditOutlined, PlayCircleOutlined, EyeOutlined, ApiOutlined } from '@ant-design/icons';
import { automationApi, type AutomationRule } from '../api';

export function AutomationPage() {
  const [rules, setRules] = useState<AutomationRule[]>([]);
  const [logs, setLogs] = useState<any[]>([]);
  const [meta, setMeta] = useState<any>({ triggers: [], conditions: [], actions: [] });
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState<AutomationRule | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [testDrawerOpen, setTestDrawerOpen] = useState(false);
  const [testResult, setTestResult] = useState<any>(null);
  const [testingRuleId, setTestingRuleId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const [r, l, m] = await Promise.all([
        automationApi.rules(),
        automationApi.logs({ limit: 30 }),
        Promise.all([automationApi.meta.triggers(), automationApi.meta.conditions(), automationApi.meta.actions()])
          .then(([t, c, a]) => ({ triggers: t, conditions: c, actions: a })),
      ]);
      setRules(r);
      setLogs(l);
      setMeta(m);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  return (
    <div>
      <Tabs defaultActiveKey="rules" items={[
        {
          key: 'rules', label: '规则列表',
          children: (
            <Card
              extra={
                <Space>
                  <Button icon={<ReloadOutlined />} onClick={load}>刷新</Button>
                  <Button type="primary" icon={<PlusOutlined />} onClick={() => { setEditing(null); setModalOpen(true); }}>
                    新建规则
                  </Button>
                </Space>
              }
              title="无代码自动化规则"
              style={{ borderRadius: 8 }}
            >
              <Table
                dataSource={rules}
                rowKey="id"
                loading={loading}
                pagination={false}
                columns={[
                  { title: '名称', dataIndex: 'name', width: 220 },
                  { title: '触发器', dataIndex: 'trigger', width: 200, render: t => {
                    const obj = typeof t === 'string' ? JSON.parse(t) : t;
                    return <Tag color="blue"><ThunderboltOutlined /> {obj.type || '-'}</Tag>;
                  } },
                  { title: '条件', dataIndex: 'conditions', width: 100, render: c => {
                    const arr = typeof c === 'string' ? JSON.parse(c || '[]') : c;
                    return <Tag>{arr.length} 个</Tag>;
                  } },
                  { title: '操作', dataIndex: 'actions', width: 100, render: a => {
                    const arr = typeof a === 'string' ? JSON.parse(a) : a;
                    return <Tag color="orange">{arr.length} 个</Tag>;
                  } },
                  { title: '状态', dataIndex: 'enabled', width: 100, render: (e, r) => (
                    <Switch size="small" checked={e} onChange={async () => {
                      await automationApi.toggle(r.id);
                      load();
                    }} />
                  ) },
                  { title: '触发次数', dataIndex: 'runCount', width: 100 },
                  { title: '上次结果', dataIndex: 'lastRunResult', render: t => <span style={{ fontSize: 12, color: '#666' }}>{t || '-'}</span> },
                  { title: '操作', width: 220, render: (_, r) => (
                    <Space>
                      <Button type="link" size="small" icon={<EditOutlined />} onClick={() => { setEditing(r); setModalOpen(true); }}>编辑</Button>
                      <Button type="link" size="small" icon={<PlayCircleOutlined />} onClick={async () => {
                        setTestingRuleId(r.id);
                        try {
                          const res = await automationApi.run(r.id, { type: 'work_item.created', workItemId: 'demo', status: '待评审', priority: 'P0' });
                          message.success(`已触发：${res.matched ? '条件匹配' : '条件未匹配'}，执行 ${res.actionsExecuted.length} 操作`);
                          load();
                        } catch (e) { message.error('触发失败'); }
                      }}>运行</Button>
                      <Button type="link" size="small" icon={<EyeOutlined />} onClick={async () => {
                        setTestingRuleId(r.id);
                        const res = await automationApi.test(r.id, { type: 'requirement', status: '待评审', priority: 'P0' });
                        setTestResult(res);
                        setTestDrawerOpen(true);
                      }}>测试</Button>
                      <Popconfirm title="确定删除？" onConfirm={async () => {
                        await automationApi.remove(r.id);
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
          ),
        },
        {
          key: 'logs', label: `执行日志（${logs.length}）`,
          children: (
            <Card style={{ borderRadius: 8 }}>
              <Table
                dataSource={logs}
                rowKey="id"
                size="small"
                pagination={{ pageSize: 20 }}
                columns={[
                  { title: '时间', dataIndex: 'createdAt', width: 170, render: t => new Date(t).toLocaleString('zh-CN') },
                  { title: '规则', dataIndex: 'ruleName', width: 220 },
                  { title: '状态', dataIndex: 'status', width: 100, render: s => <Tag color={s === 'success' ? 'green' : s === 'failed' ? 'red' : 'default'}>{s}</Tag> },
                  { title: '条件', dataIndex: 'conditionsResult', width: 100 },
                  { title: '执行', dataIndex: 'actionsExecuted', render: a => {
                    try {
                      const arr = JSON.parse(a || '[]');
                      return <span style={{ fontSize: 12 }}>{arr.length} 个操作</span>;
                    } catch { return '-'; }
                  } },
                ]}
              />
            </Card>
          ),
        },
      ]} />

      <RuleModal
        open={modalOpen}
        rule={editing}
        meta={meta}
        onClose={() => setModalOpen(false)}
        onSaved={() => { setModalOpen(false); load(); }}
      />

      <Drawer
        title="规则测试结果"
        open={testDrawerOpen}
        onClose={() => setTestDrawerOpen(false)}
        width={500}
      >
        {testResult ? (
          <div>
            <h4>条件评估</h4>
            {testResult.conditionsEval.length === 0 ? <Tag>无条件</Tag> : (
              testResult.conditionsEval.map((c: any, i: number) => (
                <div key={i} style={{ marginBottom: 8, padding: 8, background: c.result ? '#f6ffed' : '#fff1f0', borderRadius: 4 }}>
                  <Tag color={c.result ? 'green' : 'red'}>{c.result ? '通过' : '不匹配'}</Tag>
                  <code>{c.condition.field} {c.condition.op} {JSON.stringify(c.condition.value)}</code>
                  <div style={{ fontSize: 12, color: '#999', marginTop: 4 }}>实际值：{JSON.stringify(c.actual)}</div>
                </div>
              ))
            )}
            <h4 style={{ marginTop: 16 }}>将执行的操作（不会真的执行）</h4>
            {testResult.actionsPreview.map((a: any, i: number) => (
              <div key={i} style={{ marginBottom: 6, padding: 8, background: '#fafafa', borderRadius: 4 }}>
                <Tag color="blue">{a.type}</Tag>
                <span style={{ fontSize: 13 }}>{a.wouldDo}</span>
              </div>
            ))}
          </div>
        ) : <Empty />}
      </Drawer>
    </div>
  );
}

function RuleModal({ open, rule, meta, onClose, onSaved }: { open: boolean; rule: AutomationRule | null; meta: any; onClose: () => void; onSaved: () => void }) {
  const [form] = Form.useForm();
  const [conditions, setConditions] = useState<any[]>([]);
  const [actions, setActions] = useState<any[]>([]);

  useEffect(() => {
    if (open) {
      const t = rule ? (typeof rule.trigger === 'string' ? JSON.parse(rule.trigger) : rule.trigger) : { type: 'work_item.created' };
      const c = rule ? (typeof rule.conditions === 'string' ? JSON.parse(rule.conditions || '[]') : rule.conditions) : [];
      const a = rule ? (typeof rule.actions === 'string' ? JSON.parse(rule.actions || '[]') : rule.actions) : [];
      form.setFieldsValue({
        name: rule?.name || '',
        description: rule?.description || '',
        enabled: rule?.enabled !== false,
        trigger: t,
      });
      setConditions(c);
      setActions(a);
    }
  }, [open, rule, form]);

  const handleSave = async () => {
    const values = await form.validateFields();
    const payload = {
      ...values,
      conditions: JSON.stringify(conditions),
      actions: JSON.stringify(actions),
      trigger: JSON.stringify(values.trigger),
    };
    delete payload.test;
    if (rule) {
      await automationApi.update(rule.id, payload);
    } else {
      await automationApi.create(payload);
    }
    message.success('已保存');
    onSaved();
  };

  return (
    <Modal title={rule ? '编辑规则' : '新建规则'} open={open} onCancel={onClose} onOk={handleSave} width={800} okText="保存">
      <Form form={form} layout="vertical">
        <Form.Item name="name" label="规则名称" rules={[{ required: true }]}>
          <Input placeholder="P0 缺陷自动指派给值班人" />
        </Form.Item>
        <Form.Item name="description" label="描述">
          <Input.TextArea rows={2} />
        </Form.Item>
        <Form.Item name="trigger" label="触发器" rules={[{ required: true }]}>
          <Select
            options={meta.triggers.map((t: any) => ({ value: t.type, label: t.label }))}
            onChange={(v) => form.setFieldValue('trigger', { type: v })}
          />
        </Form.Item>

        <Form.Item label="条件（AND，全部满足才执行）">
          <ConditionEditor conditions={conditions} meta={meta} onChange={setConditions} />
        </Form.Item>

        <Form.Item label="操作（依次执行）">
          <ActionEditor actions={actions} meta={meta} onChange={setActions} />
        </Form.Item>

        <Form.Item name="enabled" label="启用" valuePropName="checked">
          <Switch />
        </Form.Item>
      </Form>
    </Modal>
  );
}

function ConditionEditor({ conditions, meta, onChange }: any) {
  const addCond = () => onChange([...conditions, { field: 'status', op: 'eq', value: '' }]);
  return (
    <div>
      {conditions.map((c: any, i: number) => (
        <Space key={i} style={{ marginBottom: 6, width: '100%' }} wrap>
          <Select
            value={c.field}
            style={{ width: 130 }}
            options={meta.conditions.map((m: any) => ({ value: m.field, label: m.label }))}
            onChange={(v) => { const arr = [...conditions]; arr[i] = { ...c, field: v }; onChange(arr); }}
          />
          <Select
            value={c.op}
            style={{ width: 100 }}
            options={[{ value: 'eq', label: '=' }, { value: 'neq', label: '≠' }, { value: 'gt', label: '>' }, { value: 'lt', label: '<' }, { value: 'contains', label: '包含' }, { value: 'in', label: '在...' }]}
            onChange={(v) => { const arr = [...conditions]; arr[i] = { ...c, op: v }; onChange(arr); }}
          />
          <Input
            value={c.value}
            style={{ width: 200 }}
            onChange={(e) => { const arr = [...conditions]; arr[i] = { ...c, value: e.target.value }; onChange(arr); }}
            placeholder="值"
          />
          <Button type="link" danger size="small" onClick={() => onChange(conditions.filter((_: any, idx: number) => idx !== i))}>删除</Button>
        </Space>
      ))}
      <Button block icon={<PlusOutlined />} onClick={addCond}>添加条件</Button>
    </div>
  );
}

function ActionEditor({ actions, meta, onChange }: any) {
  const addAct = () => onChange([...actions, { type: 'add_comment', config: { content: '' } }]);
  return (
    <div>
      {actions.map((a: any, i: number) => (
        <Space key={i} direction="vertical" style={{ marginBottom: 8, width: '100%', padding: 8, background: '#fafafa', borderRadius: 4 }}>
          <Space>
            <Select
              value={a.type}
              style={{ width: 180 }}
              options={meta.actions.map((m: any) => ({ value: m.type, label: m.label }))}
              onChange={(v) => { const arr = [...actions]; arr[i] = { type: v, config: {} }; onChange(arr); }}
            />
            <Button type="link" danger size="small" onClick={() => onChange(actions.filter((_: any, idx: number) => idx !== i))}>删除</Button>
          </Space>
          <ActionConfigEditor action={a} onChange={(config) => { const arr = [...actions]; arr[i] = { ...a, config }; onChange(arr); }} />
        </Space>
      ))}
      <Button block icon={<PlusOutlined />} onClick={addAct}>添加操作</Button>
    </div>
  );
}

function ActionConfigEditor({ action, onChange }: any) {
  const cfg = action.config || {};
  switch (action.type) {
    case 'update_field':
      return <Space>
        <Input placeholder="字段名" value={cfg.field || ''} onChange={e => onChange({ ...cfg, field: e.target.value })} style={{ width: 160 }} />
        <Input placeholder="新值" value={cfg.value || ''} onChange={e => onChange({ ...cfg, value: e.target.value })} style={{ width: 200 }} />
      </Space>;
    case 'assign_user':
      return <Input placeholder="用户ID" value={cfg.userId || ''} onChange={e => onChange({ ...cfg, userId: e.target.value })} style={{ width: 200 }} />;
    case 'add_label':
    case 'remove_label':
      return <Input placeholder="标签名" value={cfg.label || ''} onChange={e => onChange({ ...cfg, label: e.target.value })} style={{ width: 200 }} />;
    case 'add_comment':
    case 'send_notification':
      return <Input.TextArea rows={2} placeholder="内容（支持 {{变量}}）" value={cfg.content || cfg.title || ''} onChange={e => onChange({ ...cfg, content: e.target.value })} />;
    case 'create_work_item':
      return <Space wrap>
        <Select placeholder="类型" value={cfg.type} onChange={v => onChange({ ...cfg, type: v })} style={{ width: 120 }} options={[{ value: 'task', label: '任务' }, { value: 'bug', label: '缺陷' }]} />
        <Input placeholder="标题" value={cfg.title || ''} onChange={e => onChange({ ...cfg, title: e.target.value })} style={{ width: 200 }} />
        <Select placeholder="优先级" value={cfg.priority} onChange={v => onChange({ ...cfg, priority: v })} style={{ width: 100 }} options={['P0', 'P1', 'P2', 'P3'].map(p => ({ value: p, label: p }))} />
      </Space>;
    default:
      return <Tag>暂无可配置项</Tag>;
  }
}
