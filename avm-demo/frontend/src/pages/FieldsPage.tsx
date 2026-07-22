/**
 * 字段配置中心
 * 公式字段 + 聚合字段 的可视化配置
 */
import { useEffect, useState } from 'react';
import { Card, Tabs, Table, Button, Space, Modal, Form, Input, Select, Switch, message, Tag, Tooltip, Popconfirm } from 'antd';
import { PlusOutlined, FunctionOutlined, CalculatorOutlined, ThunderboltOutlined, ReloadOutlined, DeleteOutlined, EditOutlined } from '@ant-design/icons';
import { fieldApi, type FormulaField, type RollupField } from '../api';

const TYPE_OPTIONS = [
  { value: 'requirement', label: '需求' },
  { value: 'task', label: '任务' },
  { value: 'bug', label: '缺陷' },
  { value: 'release', label: '版本' },
];

const OUTPUT_TYPE_OPTIONS = [
  { value: 'number', label: '数字' },
  { value: 'percent', label: '百分比' },
  { value: 'text', label: '文本' },
  { value: 'date', label: '日期' },
  { value: 'duration', label: '时长' },
];

const AGG_OPTIONS = [
  { value: 'sum', label: '求和' },
  { value: 'avg', label: '平均' },
  { value: 'max', label: '最大' },
  { value: 'min', label: '最小' },
  { value: 'count', label: '计数' },
  { value: 'countDone', label: '已完成数' },
  { value: 'countOver', label: '超期数' },
  { value: 'progress', label: '完成率' },
];

const SOURCE_OPTIONS = [
  { value: 'estimate', label: '估分' },
  { value: 'actualHours', label: '实际工时' },
  { value: 'storyPoints', label: '故事点' },
  { value: 'remaining', label: '剩余工时' },
  { value: 'progress', label: '完成度' },
];

export function FieldsPage() {
  const [formulas, setFormulas] = useState<FormulaField[]>([]);
  const [rollups, setRollups] = useState<RollupField[]>([]);
  const [loading, setLoading] = useState(false);
  const [editingFormula, setEditingFormula] = useState<FormulaField | null>(null);
  const [editingRollup, setEditingRollup] = useState<RollupField | null>(null);
  const [formulaModalOpen, setFormulaModalOpen] = useState(false);
  const [rollupModalOpen, setRollupModalOpen] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [f, r] = await Promise.all([fieldApi.formulas(), fieldApi.rollups()]);
      setFormulas(f);
      setRollups(r);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  return (
    <div>
      <Tabs
        defaultActiveKey="formulas"
        items={[
          {
            key: 'formulas',
            label: <span><FunctionOutlined /> 公式字段（{formulas.length}）</span>,
            children: (
              <Card
                extra={
                  <Space>
                    <Button icon={<ThunderboltOutlined />} onClick={async () => {
                      const r = await fieldApi.recomputeAll();
                      message.success(`重算完成：${r.formulasCount} 公式 + ${r.rollupsCount} 聚合，耗时 ${r.duration}ms`);
                    }}>全部重算</Button>
                    <Button type="primary" icon={<PlusOutlined />} onClick={() => { setEditingFormula(null); setFormulaModalOpen(true); }}>
                      新建公式
                    </Button>
                  </Space>
                }
                title="公式计算字段"
                style={{ borderRadius: 8 }}
              >
                <Table
                  dataSource={formulas}
                  rowKey="id"
                  loading={loading}
                  pagination={false}
                  columns={[
                    { title: '名称', dataIndex: 'name', width: 160 },
                    { title: '字段标识', dataIndex: 'fieldKey', width: 120, render: k => <Tag color="geekblue">{k}</Tag> },
                    { title: '类型', dataIndex: 'workType', width: 100, render: t => <Tag color="blue">{t}</Tag> },
                    { title: '公式', dataIndex: 'formula', render: f => <code style={{ background: '#f5f5f5', padding: '2px 6px', borderRadius: 3 }}>{f}</code> },
                    { title: '输出', dataIndex: 'outputType', width: 100, render: t => <Tag>{t}</Tag> },
                    { title: '启用', dataIndex: 'enabled', width: 80, render: e => <Switch size="small" checked={e} disabled /> },
                    { title: '操作', width: 200, render: (_, r) => (
                      <Space>
                        <Button type="link" size="small" icon={<EditOutlined />} onClick={() => { setEditingFormula(r); setFormulaModalOpen(true); }}>编辑</Button>
                        <Button type="link" size="small" icon={<ThunderboltOutlined />} onClick={async () => {
                          const res = await fieldApi.recomputeFormula(r.id);
                          message.success(`重算完成：${res.count} 个工作项`);
                        }}>重算</Button>
                        <Popconfirm title="确定删除？" onConfirm={async () => {
                          await fieldApi.deleteFormula(r.id);
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
            key: 'rollups',
            label: <span><CalculatorOutlined /> 聚合字段（{rollups.length}）</span>,
            children: (
              <Card
                extra={
                  <Button type="primary" icon={<PlusOutlined />} onClick={() => { setEditingRollup(null); setRollupModalOpen(true); }}>
                    新建聚合
                  </Button>
                }
                title="聚合字段（子工作项统计）"
                style={{ borderRadius: 8 }}
              >
                <Table
                  dataSource={rollups}
                  rowKey="id"
                  loading={loading}
                  pagination={false}
                  columns={[
                    { title: '名称', dataIndex: 'name', width: 180 },
                    { title: '字段标识', dataIndex: 'fieldKey', width: 140, render: k => <Tag color="purple">{k}</Tag> },
                    { title: '父类型', dataIndex: 'workType', width: 90, render: t => <Tag color="blue">{t}</Tag> },
                    { title: '子类型', dataIndex: 'childType', width: 80, render: t => <Tag>{t}</Tag> },
                    { title: '源字段', dataIndex: 'sourceField', width: 110, render: s => <Tag color="cyan">{s}</Tag> },
                    { title: '聚合', dataIndex: 'aggregation', width: 100, render: a => <Tag color="orange">{a}</Tag> },
                    { title: '操作', width: 200, render: (_, r) => (
                      <Space>
                        <Button type="link" size="small" icon={<EditOutlined />} onClick={() => { setEditingRollup(r); setRollupModalOpen(true); }}>编辑</Button>
                        <Popconfirm title="确定删除？" onConfirm={async () => {
                          await fieldApi.deleteRollup(r.id);
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
        ]}
      />

      {/* 公式编辑 */}
      <FormulaModal
        open={formulaModalOpen}
        field={editingFormula}
        onClose={() => setFormulaModalOpen(false)}
        onSaved={() => { setFormulaModalOpen(false); load(); }}
      />

      {/* 聚合编辑 */}
      <RollupModal
        open={rollupModalOpen}
        field={editingRollup}
        onClose={() => setRollupModalOpen(false)}
        onSaved={() => { setRollupModalOpen(false); load(); }}
      />
    </div>
  );
}

function FormulaModal({ open, field, onClose, onSaved }: { open: boolean; field: FormulaField | null; onClose: () => void; onSaved: () => void }) {
  const [form] = Form.useForm();
  const [testResult, setTestResult] = useState<any>(null);
  const [testSample, setTestSample] = useState({ estimate: 8, actualHours: 3, status: '开发中', priority: 'P1', planEnd: new Date(Date.now() + 86400000 * 2).toISOString() });
  const [meta, setMeta] = useState<any>(null);

  useEffect(() => {
    if (open) {
      form.setFieldsValue(field || { workType: 'requirement', outputType: 'number', format: '0.0', enabled: true });
      fieldApi.meta().then(setMeta).catch(() => {});
    }
  }, [open, field, form]);

  const handleTest = async () => {
    const formula = form.getFieldValue('formula');
    const sample = { ...testSample, planEnd: new Date(testSample.planEnd) };
    try {
      const r = await fieldApi.testFormula(formula, sample);
      setTestResult(r.value);
    } catch (e: any) { message.error('公式错误：' + e.message); }
  };

  const insertAtCursor = (text: string) => {
    const current = form.getFieldValue('formula') || '';
    form.setFieldValue('formula', current + (current ? ' ' : '') + text);
  };

  const handleSave = async () => {
    const values = await form.validateFields();
    // 校验公式
    const v = await fieldApi.validateFormula(values.formula);
    if (!v.valid) {
      message.error('公式语法错误：' + v.error);
      return;
    }
    if (field) {
      await fieldApi.updateFormula(field.id, values);
    } else {
      await fieldApi.createFormula(values);
    }
    message.success('已保存');
    onSaved();
  };

  return (
    <Modal title={field ? '编辑公式' : '新建公式'} open={open} onCancel={onClose} onOk={handleSave} width={780} okText="保存">
      <Form form={form} layout="vertical">
        <Space.Compact block>
          <Form.Item name="name" label="名称" rules={[{ required: true }]} style={{ flex: 1, marginRight: 8 }}>
            <Input placeholder="如：剩余工时" />
          </Form.Item>
          <Form.Item name="fieldKey" label="字段标识" rules={[{ required: true, pattern: /^[a-zA-Z][a-zA-Z0-9_]*$/, message: '英文标识' }]} style={{ flex: 1 }}>
            <Input placeholder="如：remaining" />
          </Form.Item>
        </Space.Compact>
        <Space.Compact block>
          <Form.Item name="workType" label="适用类型" rules={[{ required: true }]} style={{ flex: 1, marginRight: 8 }}>
            <Select options={TYPE_OPTIONS} />
          </Form.Item>
          <Form.Item name="outputType" label="输出类型" style={{ flex: 1, marginRight: 8 }}>
            <Select options={OUTPUT_TYPE_OPTIONS} />
          </Form.Item>
          <Form.Item name="format" label="格式" style={{ flex: 1 }}>
            <Input placeholder="0.0 / 0% / 0" />
          </Form.Item>
        </Space.Compact>
        <Form.Item name="formula" label="公式" rules={[{ required: true }]}>
          <Input.TextArea rows={2} placeholder="estimate - actualHours" style={{ fontFamily: 'monospace' }} />
        </Form.Item>

        {meta && (
          <Card size="small" title="📖 可用字段和函数（点击插入）" style={{ background: '#fafafa', marginBottom: 12 }}>
            <Tabs size="small" items={[
              {
                key: 'fields', label: `字段 (${meta.fields.length})`,
                children: (
                  <div style={{ maxHeight: 160, overflow: 'auto' }}>
                    {['number', 'date', 'string'].map(type => {
                      const fields = meta.fields.filter((f: any) => f.type === type);
                      if (!fields.length) return null;
                      return (
                        <div key={type} style={{ marginBottom: 8 }}>
                          <div style={{ fontSize: 11, color: '#999', marginBottom: 4 }}>{type === 'number' ? '数字' : type === 'date' ? '日期' : '字符串'}</div>
                          <Space wrap size={[4, 4]}>
                            {fields.map((f: any) => (
                              <Tag key={f.key} color={type === 'number' ? 'blue' : type === 'date' ? 'purple' : 'green'} style={{ cursor: 'pointer', fontFamily: 'monospace' }}
                                onClick={() => insertAtCursor(f.key)}>
                                {f.key}
                                <span style={{ color: '#999', marginLeft: 4, fontSize: 10 }}>{f.desc}</span>
                              </Tag>
                            ))}
                          </Space>
                        </div>
                      );
                    })}
                  </div>
                ),
              },
              {
                key: 'num', label: `数字函数 (${meta.numberFunctions.length})`,
                children: (
                  <div style={{ maxHeight: 160, overflow: 'auto' }}>
                    <Space wrap size={[4, 4]}>
                      {meta.numberFunctions.map((f: string) => (
                        <Tag key={f} color="blue" style={{ cursor: 'pointer', fontFamily: 'monospace' }} onClick={() => insertAtCursor(f + '()')}>
                          {f}()
                        </Tag>
                      ))}
                    </Space>
                  </div>
                ),
              },
              {
                key: 'str', label: `字符串函数 (${meta.stringFunctions.length})`,
                children: (
                  <div style={{ maxHeight: 160, overflow: 'auto' }}>
                    <Space wrap size={[4, 4]}>
                      {meta.stringFunctions.map((f: string) => (
                        <Tag key={f} color="green" style={{ cursor: 'pointer', fontFamily: 'monospace' }} onClick={() => insertAtCursor(f + '()')}>
                          {f}()
                        </Tag>
                      ))}
                    </Space>
                  </div>
                ),
              },
              {
                key: 'date', label: `日期函数 (${meta.dateFunctions.length})`,
                children: (
                  <div style={{ maxHeight: 160, overflow: 'auto' }}>
                    <Space wrap size={[4, 4]}>
                      {meta.dateFunctions.map((f: string) => (
                        <Tag key={f} color="purple" style={{ cursor: 'pointer', fontFamily: 'monospace' }} onClick={() => insertAtCursor(f + '()')}>
                          {f}()
                        </Tag>
                      ))}
                    </Space>
                  </div>
                ),
              },
            ]} />
          </Card>
        )}

        <Card size="small" title="公式测试" style={{ background: '#fafafa' }}>
          <Space direction="vertical" style={{ width: '100%' }} size={6}>
            <Space wrap>
              <Input size="small" value={testSample.estimate} onChange={e => setTestSample({ ...testSample, estimate: Number(e.target.value) })} style={{ width: 90 }} addonBefore="估分" />
              <Input size="small" value={testSample.actualHours} onChange={e => setTestSample({ ...testSample, actualHours: Number(e.target.value) })} style={{ width: 90 }} addonBefore="实际" />
              <Input size="small" value={testSample.priority} onChange={e => setTestSample({ ...testSample, priority: e.target.value })} style={{ width: 100 }} addonBefore="优先级" />
              <Input size="small" value={testSample.status} onChange={e => setTestSample({ ...testSample, status: e.target.value })} style={{ width: 120 }} addonBefore="状态" />
            </Space>
            <Space>
              <Button size="small" onClick={handleTest} type="primary">测试</Button>
              {testResult !== null && testResult !== undefined && <Tag color="green" style={{ fontSize: 13 }}>结果：<strong>{String(testResult)}</strong></Tag>}
            </Space>
            <div style={{ fontSize: 11, color: '#999' }}>
              💡 提示：<code>DAYS(planEnd, NOW())</code> 计算距今天数；<code>CONCAT_WS('-', key, status)</code> 拼字符串；<code>IF(overdue, daysLeft, 0)</code> 超期判断
            </div>
          </Space>
        </Card>

        <Form.Item name="description" label="描述" style={{ marginTop: 12 }}>
          <Input.TextArea rows={2} />
        </Form.Item>
        <Form.Item name="enabled" label="启用" valuePropName="checked">
          <Switch />
        </Form.Item>
      </Form>
    </Modal>
  );
}

function RollupModal({ open, field, onClose, onSaved }: { open: boolean; field: RollupField | null; onClose: () => void; onSaved: () => void }) {
  const [form] = Form.useForm();
  useEffect(() => {
    if (open) {
      form.setFieldsValue(field || { workType: 'requirement', childType: 'task', sourceField: 'estimate', aggregation: 'sum', outputType: 'number', format: '0.0', enabled: true });
    }
  }, [open, field, form]);

  const handleSave = async () => {
    const values = await form.validateFields();
    if (field) {
      await fieldApi.updateRollup(field.id, values);
    } else {
      await fieldApi.createRollup(values);
    }
    message.success('已保存');
    onSaved();
  };

  return (
    <Modal title={field ? '编辑聚合' : '新建聚合'} open={open} onCancel={onClose} onOk={handleSave} width={600} okText="保存">
      <Form form={form} layout="vertical">
        <Space.Compact block>
          <Form.Item name="name" label="名称" rules={[{ required: true }]} style={{ flex: 1, marginRight: 8 }}>
            <Input placeholder="子任务估分合计" />
          </Form.Item>
          <Form.Item name="fieldKey" label="字段标识" rules={[{ required: true, pattern: /^[a-zA-Z][a-zA-Z0-9_]*$/ }]} style={{ flex: 1 }}>
            <Input placeholder="sumTaskEstimate" />
          </Form.Item>
        </Space.Compact>
        <Space.Compact block>
          <Form.Item name="workType" label="父类型" rules={[{ required: true }]} style={{ flex: 1, marginRight: 8 }}>
            <Select options={TYPE_OPTIONS} />
          </Form.Item>
          <Form.Item name="childType" label="子类型" style={{ flex: 1, marginRight: 8 }}>
            <Select options={TYPE_OPTIONS} />
          </Form.Item>
        </Space.Compact>
        <Space.Compact block>
          <Form.Item name="sourceField" label="源字段" rules={[{ required: true }]} style={{ flex: 1, marginRight: 8 }}>
            <Select options={SOURCE_OPTIONS} />
          </Form.Item>
          <Form.Item name="aggregation" label="聚合方式" rules={[{ required: true }]} style={{ flex: 1, marginRight: 8 }}>
            <Select options={AGG_OPTIONS} />
          </Form.Item>
          <Form.Item name="outputType" label="输出类型" style={{ flex: 1 }}>
            <Select options={OUTPUT_TYPE_OPTIONS} />
          </Form.Item>
        </Space.Compact>
        <Form.Item name="format" label="格式">
          <Input placeholder="0.0 / 0%" />
        </Form.Item>
        <Form.Item name="description" label="描述">
          <Input.TextArea rows={2} />
        </Form.Item>
        <Form.Item name="enabled" label="启用" valuePropName="checked">
          <Switch />
        </Form.Item>
      </Form>
    </Modal>
  );
}
