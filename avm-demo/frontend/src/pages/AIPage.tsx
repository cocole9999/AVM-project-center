import { useEffect, useState } from 'react';
import {
  Card, Input, Button, Space, Avatar, Tabs, Tag, Form, Select, message, List, Empty, Spin,
  Modal, Statistic, Row, Col, Alert, Button as AntButton, Tooltip,
} from 'antd';
import {
  RobotOutlined, SendOutlined, UserOutlined, BulbOutlined, FireOutlined, FileTextOutlined,
  MedicineBoxOutlined, FlagOutlined, SettingOutlined, ExperimentOutlined,
} from '@ant-design/icons';
import { aiApi, llmSettingsApi, metaApi } from '../api';
import type { AIFieldConfig } from '../types';
import { Link } from 'react-router-dom';

interface ChatMessage {
  role: 'user' | 'ai';
  content: string;
  data?: any;
  suggestions?: string[];
  llmEnhanced?: boolean;
  llmInsight?: string;
  llmModel?: string;
  time: string;
}

export function AIPage() {
  const [activeTab, setActiveTab] = useState('chat');
  const [llmStatus, setLlmStatus] = useState<any>(null);
  const [stats, setStats] = useState<any>(null);
  const [activeProviders, setActiveProviders] = useState<any[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: 'ai',
      content: '你好！我是 AVM AI 助理。我可以帮你查询项目数据、估分建议、缺陷归类、风险评估、生成本周周报。',
      suggestions: ['P0 紧急项有多少个？', '当前超期的工作项', '需求有多少个？', '迭代有几个？', '状态分布'],
      time: new Date().toLocaleString('zh-CN'),
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const refresh = () => aiApi.llmStatus().then(setLlmStatus).catch(() => {});
    refresh();
    // 监听全局 LLM 状态变更（其他页面切换模型后同步刷新）
    const handler = () => refresh();
    window.addEventListener('llm-status-updated', handler);
    return () => window.removeEventListener('llm-status-updated', handler);
  }, []);

  // 开箱即用：进入页面就拉一次 stats，让用户立刻看到数据（不依赖 LLM）
  useEffect(() => {
    metaApi.stats().then(setStats).catch(() => {});
  }, []);

  // 拉已配置的 provider 列表（用于顶部"切换厂商"下拉）
  useEffect(() => {
    const load = () => llmSettingsApi.list().then(r => setActiveProviders(r.activeProviders || [])).catch(() => {});
    load();
    const handler = () => load();
    window.addEventListener('llm-status-updated', handler);
    return () => window.removeEventListener('llm-status-updated', handler);
  }, []);

  const handleSend = async (text?: string) => {
    const q = (text || input).trim();
    if (!q) return;
    setInput('');
    setMessages(m => [...m, { role: 'user', content: q, time: new Date().toLocaleString('zh-CN') }]);
    setLoading(true);
    try {
      const r = await aiApi.qa(q);
      setMessages(m => [...m, {
        role: 'ai',
        content: r.answer,
        data: r.data,
        suggestions: r.suggestions,
        llmEnhanced: r.llmEnhanced,
        llmInsight: r.llmInsight,
        llmModel: r.llmModel,
        time: new Date().toLocaleString('zh-CN'),
      }]);
    } catch (e: any) {
      message.error('查询失败：' + e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <Card style={{ marginBottom: 12 }} styles={{ body: { padding: 12 } }}>
        <Space wrap>
          <RobotOutlined style={{ fontSize: 18, color: '#1677ff' }} />
          <span style={{ fontSize: 16, fontWeight: 500 }}>AI 智能助理</span>
          {llmStatus?.configured ? (
            <>
              {activeProviders.length > 1 ? (
                <>
                  <span style={{ fontSize: 12, color: '#666' }}>厂商</span>
                  <ProviderSwitcher
                    current={llmStatus.provider}
                    activeProviders={activeProviders}
                    onChanged={(newStatus) => setLlmStatus(newStatus)}
                  />
                </>
              ) : (
                <Tag color="purple">{llmStatus.displayName || llmStatus.provider}</Tag>
              )}
              <span style={{ fontSize: 12, color: '#666' }}>模型</span>
              <ModelSwitcher
                provider={llmStatus.provider}
                models={llmStatus.models}
                current={llmStatus.model}
                onChanged={(newStatus) => setLlmStatus(newStatus)}
              />
            </>
          ) : (
            <Tag color="blue">启发式引擎</Tag>
          )}
          <Link to="/llm-settings">
            <Button size="small" type="link" icon={<SettingOutlined />}>LLM 设置</Button>
          </Link>
        </Space>
        {stats && (
          <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px dashed #e8e8e8' }}>
            <Space size="large" wrap>
              <span style={{ fontSize: 12, color: '#999' }}>实时项目数据</span>
              <span style={{ fontSize: 13 }}>总工作项 <b style={{ color: '#1677ff', fontSize: 16 }}>{stats.total || 0}</b></span>
              <span style={{ fontSize: 13 }}>P0 <Tag color="red" style={{ marginLeft: 2 }}>{stats.byPriority?.P0 || 0}</Tag></span>
              <span style={{ fontSize: 13 }}>P1 <Tag color="orange" style={{ marginLeft: 2 }}>{stats.byPriority?.P1 || 0}</Tag></span>
              <span style={{ fontSize: 13 }}>需求 <b>{stats.byType?.requirement || 0}</b></span>
              <span style={{ fontSize: 13 }}>任务 <b>{stats.byType?.task || 0}</b></span>
              <span style={{ fontSize: 13 }}>缺陷 <b style={{ color: '#cf1322' }}>{stats.byType?.bug || 0}</b></span>
              <span style={{ fontSize: 13 }}>进行中 <Tag color="blue">{stats.byStatus?.in_progress || 0}</Tag></span>
              <span style={{ fontSize: 13 }}>已完成 <Tag color="green">{stats.byStatus?.done || 0}</Tag></span>
            </Space>
          </div>
        )}
      </Card>

      <Tabs
        activeKey={activeTab}
        onChange={setActiveTab}
        items={[
          {
            key: 'chat',
            label: <span><RobotOutlined /> 智能问答</span>,
            children: <ChatTab messages={messages} setMessages={setMessages} input={input} setInput={setInput} loading={loading} handleSend={handleSend} />,
          },
          {
            key: 'estimate',
            label: <span><BulbOutlined /> 估分建议</span>,
            children: <EstimateTool />,
          },
          {
            key: 'classify',
            label: <span><MedicineBoxOutlined /> 缺陷归类</span>,
            children: <ClassifyTool />,
          },
          {
            key: 'weekly',
            label: <span><FileTextOutlined /> 个人周报</span>,
            children: <WeeklyReportTool />,
          },
          {
            key: 'configs',
            label: <span><SettingOutlined /> AI 字段配置</span>,
            children: <ConfigsTab />,
          },
        ]}
      />
    </div>
  );
}

function ChatTab({ messages, setMessages, input, setInput, loading, handleSend }: any) {
  const userRowStyle: React.CSSProperties = { marginBottom: 16, display: 'flex', gap: 8, flexDirection: 'row-reverse' };
  const aiRowStyle: React.CSSProperties = { marginBottom: 16, display: 'flex', gap: 8, flexDirection: 'row' };
  const userBubbleStyle: React.CSSProperties = { maxWidth: '70%', background: '#1677ff', color: '#fff', padding: '8px 12px', borderRadius: 8, fontSize: 13, whiteSpace: 'pre-wrap' };
  const aiBubbleStyle: React.CSSProperties = { maxWidth: '70%', background: '#fafafa', color: '#333', padding: '8px 12px', borderRadius: 8, fontSize: 13, whiteSpace: 'pre-wrap' };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: 12 }}>
      <Card styles={{ body: { padding: 0, height: 'calc(100vh - 240px)', display: 'flex', flexDirection: 'column' } }}>
        <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
          {messages.map((m: ChatMessage, i: number) => (
            <div key={i} style={m.role === 'user' ? userRowStyle : aiRowStyle}>
              <Avatar icon={m.role === 'user' ? <UserOutlined /> : <RobotOutlined />} />
              <div style={m.role === 'user' ? userBubbleStyle : aiBubbleStyle}>
                {m.role === 'ai' && m.llmModel && (
                  <div style={{ fontSize: 10, color: '#999', marginBottom: 4 }}>
                    调用模型：<Tag color="purple" style={{ marginLeft: 4, fontSize: 10 }}>{m.llmModel}</Tag>
                    {m.llmEnhanced && <Tag color="green" style={{ marginLeft: 4, fontSize: 10 }}>LLM 增强</Tag>}
                  </div>
                )}
                {m.content}
                {m.llmInsight && (
                  <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px dashed #d9b3ff' }}>
                    <div style={{ fontSize: 11, color: '#722ed1', marginBottom: 4 }}>
                      🤖 LLM 深度解读{m.llmModel ? ` (${m.llmModel})` : ''}
                    </div>
                    <div style={{ fontSize: 13, color: '#333' }}>{m.llmInsight}</div>
                  </div>
                )}
                {m.suggestions && m.suggestions.length > 0 && (
                  <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid #e8e8e8' }}>
                    {m.suggestions.map((s, j) => (
                      <Tag key={j} style={{ cursor: 'pointer' }} onClick={() => handleSend(s)}>{s}</Tag>
                    ))}
                  </div>
                )}
                {m.data && m.data.items && (
                  <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid #e8e8e8' }}>
                    {m.data.items.slice(0, 5).map((it: any, j: number) => (
                      <div key={j} style={{ fontSize: 12 }}>• {it.key} {it.title}</div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
          {loading && <Spin />}
        </div>
        <div style={{ borderTop: '1px solid #f0f0f0', padding: 12, display: 'flex', gap: 8 }}>
          <Input
            placeholder="问我点什么吧...（如：P0 多少个？超期项？）"
            value={input}
            onChange={e => setInput(e.target.value)}
            onPressEnter={() => handleSend()}
            disabled={loading}
          />
          <Button type="primary" icon={<SendOutlined />} onClick={() => handleSend()} loading={loading}>
            发送
          </Button>
        </div>
      </Card>
      <Card title="能力示例" size="small">
        <Space direction="vertical" style={{ width: '100%' }} size={8}>
          {[
            { icon: <FlagOutlined />, title: '数据查询', desc: '"P0 多少个？"' },
            { icon: <FireOutlined />, title: '超期识别', desc: '"超期的工作项"' },
            { icon: <BulbOutlined />, title: '估分建议', desc: '在需求/任务详情页' },
            { icon: <MedicineBoxOutlined />, title: '缺陷归类', desc: '新建缺陷时自动' },
            { icon: <FileTextOutlined />, title: '周报生成', desc: '一键生成本人周报' },
            { icon: <FireOutlined />, title: '风险评估', desc: '在详情页查看' },
          ].map((c, i) => (
            <div key={i} style={{ padding: 8, background: '#fafafa', borderRadius: 6 }}>
              <Space>
                <span style={{ color: '#1677ff' }}>{c.icon}</span>
                <b style={{ fontSize: 13 }}>{c.title}</b>
              </Space>
              <div style={{ fontSize: 12, color: '#999', marginTop: 2 }}>{c.desc}</div>
            </div>
          ))}
        </Space>
      </Card>
    </div>
  );
}

function EstimateTool() {
  const [form] = Form.useForm();
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const handle = async () => {
    const v = await form.validateFields();
    setLoading(true);
    try {
      const r = await aiApi.suggestEstimate(v);
      setResult(r);
    } catch (e: any) {
      message.error('AI 失败：' + e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Row gutter={12}>
      <Col span={12}>
        <Card title="输入工作项信息">
          <Form form={form} layout="vertical" onFinish={handle}>
            <Form.Item label="类型" name="type" initialValue="requirement" rules={[{ required: true }]}>
              <Select options={[
                { value: 'requirement', label: '需求' },
                { value: 'task', label: '任务' },
              ]} />
            </Form.Item>
            <Form.Item label="标题" name="title" rules={[{ required: true }]}>
              <Input placeholder="一句话描述工作项" />
            </Form.Item>
            <Form.Item label="详细描述" name="description">
              <Input.TextArea rows={4} placeholder="补充背景、验收标准等" />
            </Form.Item>
            <Form.Item label="所属模块" name="module">
              <Input placeholder="如：登录模块" />
            </Form.Item>
            <Button type="primary" htmlType="submit" icon={<BulbOutlined />} loading={loading}>AI 估分</Button>
          </Form>
        </Card>
      </Col>
      <Col span={12}>
        <Card title="AI 建议" loading={loading}>
          {!result ? <Empty description="填写左侧表单并提交" /> : (
            <>
              <Statistic title="建议估分" value={result.estimate} suffix="SP" valueStyle={{ color: '#1677ff' }} />
              {result.actualEstimate && (
                <div style={{ color: '#999', fontSize: 12, marginTop: 4 }}>历史实际平均：<b>{result.actualEstimate}</b> h</div>
              )}
              <div style={{ marginTop: 12 }}>
                <Tag color={result.confidence > 0.7 ? 'green' : 'orange'}>置信度 {Math.round(result.confidence * 100)}%</Tag>
              </div>
              <Alert style={{ marginTop: 12 }} message={result.reason} type="info" showIcon />
              {result.similarItems && result.similarItems.length > 0 && (
                <div style={{ marginTop: 12 }}>
                  <div style={{ fontWeight: 500, marginBottom: 8 }}>相似历史工作项：</div>
                  {result.similarItems.map((s: any, i: number) => (
                    <div key={i} style={{ padding: 8, background: '#fafafa', borderRadius: 6, marginBottom: 4, fontSize: 12 }}>
                      <Space>
                        <Tag>{s.key}</Tag><span>{s.title}</span>
                        <Tag color="blue">估分 {s.estimate}</Tag>
                        <Tag color="cyan">实际 {s.actualHours}h</Tag>
                        <Tag color="green">相似度 {s.simScore}%</Tag>
                      </Space>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </Card>
      </Col>
    </Row>
  );
}

function ClassifyTool() {
  const [form] = Form.useForm();
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const handle = async () => {
    const v = await form.validateFields();
    setLoading(true);
    try {
      const r = await aiApi.classifyBug(v);
      setResult(r);
    } catch (e: any) {
      message.error('AI 失败：' + e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Row gutter={12}>
      <Col span={12}>
        <Card title="输入缺陷信息">
          <Form form={form} layout="vertical" onFinish={handle}>
            <Form.Item label="标题" name="title" rules={[{ required: true }]}>
              <Input placeholder="缺陷标题" />
            </Form.Item>
            <Form.Item label="详细描述" name="description">
              <Input.TextArea rows={4} placeholder="复现步骤、现象等" />
            </Form.Item>
            <Button type="primary" htmlType="submit" icon={<MedicineBoxOutlined />} loading={loading}>AI 归类</Button>
          </Form>
        </Card>
      </Col>
      <Col span={12}>
        <Card title="归类结果" loading={loading}>
          {!result ? <Empty /> : (
            <>
              <div style={{ fontSize: 32, fontWeight: 500, color: '#1677ff' }}>{result.category}</div>
              <Tag color={result.confidence > 0.7 ? 'green' : 'orange'}>置信度 {Math.round(result.confidence * 100)}%</Tag>
              {result.matchedKeywords && result.matchedKeywords.length > 0 && (
                <div style={{ marginTop: 12 }}>
                  <div style={{ fontWeight: 500, marginBottom: 6 }}>匹配关键字：</div>
                  <Space wrap>
                    {result.matchedKeywords.map((k: string, i: number) => <Tag key={i} color="blue">{k}</Tag>)}
                  </Space>
                </div>
              )}
              {result.alternatives && result.alternatives.length > 0 && (
                <div style={{ marginTop: 12 }}>
                  <div style={{ fontWeight: 500, marginBottom: 6 }}>备选类别：</div>
                  {result.alternatives.map((a: any, i: number) => (
                    <Tag key={i} color="default">{a.category} (命中 {a.score})</Tag>
                  ))}
                </div>
              )}
            </>
          )}
        </Card>
      </Col>
    </Row>
  );
}

function WeeklyReportTool() {
  const [report, setReport] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      setReport(await aiApi.weeklyReport({ user: '我' }));
    } catch (e: any) {
      message.error('生成失败：' + e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <Button type="primary" onClick={load} loading={loading} icon={<FileTextOutlined />}>生成本周周报</Button>
      {report && (
        <div style={{ marginTop: 16 }}>
          <Card title="AI 周报" loading={loading}>
            <Alert message={report.summary} type="success" showIcon style={{ marginBottom: 16 }} />
            <Row gutter={12}>
              <Col span={6}><Statistic title="完成" value={report.completed.count} suffix="项" /></Col>
              <Col span={6}><Statistic title="进行中" value={report.inProgress.count} suffix="项" /></Col>
              <Col span={6}><Statistic title="本周创建" value={report.created.count} suffix="项" /></Col>
              <Col span={6}><Statistic title="发表评论" value={report.comments.count} suffix="条" /></Col>
            </Row>
            <div style={{ marginTop: 16 }}>
              <h4>完成工作项</h4>
              {report.completed.items.length === 0 ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} /> : (
                <List size="small" dataSource={report.completed.items}
                  renderItem={(it: any) => <List.Item><Tag>{it.key}</Tag>{it.title}<Tag color="blue">{it.estimate}SP</Tag></List.Item>}
                />
              )}
            </div>
            <div style={{ marginTop: 16 }}>
              <h4>进行中</h4>
              {report.inProgress.items.length === 0 ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} /> : (
                <List size="small" dataSource={report.inProgress.items}
                  renderItem={(it: any) => <List.Item><Tag>{it.key}</Tag>{it.title}<Tag>{it.status}</Tag></List.Item>}
                />
              )}
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}

function ConfigsTab() {
  const [configs, setConfigs] = useState<AIFieldConfig[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [form] = Form.useForm();

  const load = async () => {
    setLoading(true);
    setConfigs(await aiApi.listConfigs());
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleSave = async () => {
    const v = await form.validateFields();
    await aiApi.createConfig(v);
    message.success('已创建');
    setModalOpen(false);
    form.resetFields();
    load();
  };

  const toggleEnabled = async (c: AIFieldConfig) => {
    await aiApi.updateConfig(c.id, { enabled: !c.enabled });
    load();
  };

  return (
    <div>
      <Space style={{ marginBottom: 12 }}>
        <Button type="primary" onClick={() => setModalOpen(true)}>新建 AI 字段</Button>
      </Space>
      <List
        loading={loading}
        dataSource={configs}
        renderItem={c => (
          <List.Item actions={[
            <Button type="link" key="t" onClick={() => toggleEnabled(c)}>{c.enabled ? '禁用' : '启用'}</Button>,
            <Button type="link" danger key="d" onClick={async () => { await aiApi.deleteConfig(c.id); load(); }}>删除</Button>,
          ]}>
            <List.Item.Meta
              avatar={<Avatar style={{ background: '#1677ff' }} icon={<RobotOutlined />} />}
              title={<Space>
                {c.name}
                <Tag color={c.enabled ? 'green' : 'default'}>{c.enabled ? '已启用' : '已禁用'}</Tag>
                <Tag color="blue">{c.workType}</Tag>
              </Space>}
              description={<Space wrap>
                <span>能力：<Tag>{c.capability}</Tag></span>
                <span>目标字段：<Tag color="cyan">{c.targetField}</Tag></span>
                <span>输入：<Tag>{c.inputFields}</Tag></span>
              </Space>}
            />
          </List.Item>
        )}
      />
      <Modal title="新建 AI 字段" open={modalOpen} onCancel={() => setModalOpen(false)} onOk={handleSave}>
        <Form form={form} layout="vertical">
          <Form.Item label="名称" name="name" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item label="工作项类型" name="workType" rules={[{ required: true }]}>
            <Select options={[
              { value: 'requirement', label: '需求' },
              { value: 'task', label: '任务' },
              { value: 'bug', label: '缺陷' },
            ]} />
          </Form.Item>
          <Form.Item label="目标字段" name="targetField" rules={[{ required: true }]}><Input placeholder="如：estimate" /></Form.Item>
          <Form.Item label="AI 能力" name="capability" rules={[{ required: true }]}>
            <Select options={[
              { value: 'estimate_suggest', label: '估分建议' },
              { value: 'bug_classify', label: '缺陷归类' },
              { value: 'priority_suggest', label: '优先级建议' },
              { value: 'risk_score', label: '风险评分' },
            ]} />
          </Form.Item>
          <Form.Item label="输入字段" name="inputFields"><Input placeholder="如：title,description,module" /></Form.Item>
        </Form>
      </Modal>
    </div>
  );
}

// 模型切换器：下拉 + 自定义输入
function ModelSwitcher({ provider, models, current, onChanged }: {
  provider: string;
  models: { builtin: string[]; custom: string[]; all: string[] };
  current: string;
  onChanged: (status: any) => void;
}) {
  const [switching, setSwitching] = useState(false);
  const all = models.all || [];

  const switchTo = async (m: string) => {
    if (!m || m === current) return;
    setSwitching(true);
    try {
      const r = await llmSettingsApi.switchModel(provider, m);
      message.success(`已切换到 ${m}`);
      // 用后端响应里的 status 立即更新（避免再调 llmStatus 命中 cache）
      if (r.status) onChanged(r.status);
    } catch (e: any) { message.error(e.message); }
    finally { setSwitching(false); }
  };

  const addAndSwitch = async (m: string) => {
    if (!m) return;
    setSwitching(true);
    try {
      await llmSettingsApi.addCustomModel(provider, m);
      const r = await llmSettingsApi.switchModel(provider, m);
      message.success(`已添加并切换到 ${m}`);
      if (r.status) onChanged(r.status);
    } catch (e: any) { message.error(e.message); }
    finally { setSwitching(false); }
  };

  return (
    <Space.Compact>
      <Select
        size="small"
        style={{ minWidth: 200 }}
        value={current}
        loading={switching}
        onChange={switchTo}
        showSearch
        placeholder="切换模型"
        optionFilterProp="label"
        options={[
          ...(models.builtin || []).map(m => ({ value: m, label: `${m}${m === current ? ' ★' : ''}` })),
          ...(models.custom || []).map(m => ({ value: m, label: `${m}${m === current ? ' ★' : ''}` })),
        ]}
      />
      <Tooltip title="使用自定义模型名">
        <Button
          size="small"
          icon={<ExperimentOutlined />}
          onClick={() => {
            const m = window.prompt('输入自定义模型名（立即添加并切换）：');
            if (m) addAndSwitch(m.trim());
          }}
        />
      </Tooltip>
    </Space.Compact>
  );
}

// 厂商切换器：在已配置的 provider 之间切换（deepseek / openai / qwen / glm 等）
function ProviderSwitcher({ current, activeProviders, onChanged }: {
  current: string;
  activeProviders: { key: string; name: string; logo?: string; model?: string; isPrimary?: boolean }[];
  onChanged: (status: any) => void;
}) {
  const [switching, setSwitching] = useState(false);
  if (!activeProviders || activeProviders.length === 0) return null;

  const switchTo = async (key: string) => {
    if (!key || key === current) return;
    setSwitching(true);
    try {
      const r = await llmSettingsApi.activateProvider(key);
      message.success(`已切换到 ${r.displayName}（${r.model}）`);
      if (r.status) onChanged(r.status);
    } catch (e: any) { message.error(e.message); }
    finally { setSwitching(false); }
  };

  return (
    <Select
      size="small"
      style={{ minWidth: 130 }}
      value={current}
      loading={switching}
      onChange={switchTo}
      placeholder="切换厂商"
    >
      {activeProviders.map(p => (
        <Select.Option key={p.key} value={p.key}>
          {p.logo} {p.name} {p.isPrimary ? '★' : ''}
        </Select.Option>
      ))}
    </Select>
  );
}