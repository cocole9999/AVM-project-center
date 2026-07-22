/**
 * LLM 大模型设置页
 * - 9+ 主流 provider 列表
 * - 每个 provider 可填 API Key / Base URL / 模型
 * - 测试连接 + 测试聊天
 * - 标记主 provider
 */
import { useEffect, useState } from 'react';
import {
  Card, Table, Tag, Space, Button, Modal, Form, Input, Switch, Select, App, Spin,
  Tabs, Empty, Alert, Tooltip, Popconfirm, Row, Col, Statistic, Badge,
} from 'antd';
import {
  ApiOutlined, CheckCircleOutlined, CloseCircleOutlined, ThunderboltOutlined, StarOutlined, StarFilled,
  ExperimentOutlined, ReloadOutlined, DeleteOutlined, KeyOutlined,
} from '@ant-design/icons';
import { llmSettingsApi } from '../api';

interface Provider {
  key: string;
  name: string;
  logo: string;
  defaultBaseUrl: string;
  defaultModel: string;
  protocol: string;
}

interface Setting {
  id?: string;
  provider: string;
  name: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  currentModel?: string;  // V1.7 实际生效模型（与默认 model 分离）
  enabled: boolean;
  isPrimary: boolean;
  note: string;
}

export function LLMSettingsPage() {
  const { message } = App.useApp();
  const [providers, setProviders] = useState<Provider[]>([]);
  const [settings, setSettings] = useState<Setting[]>([]);
  const [status, setStatus] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Setting | null>(null);
  const [form] = Form.useForm();
  const [testResult, setTestResult] = useState<any>(null);
  const [testing, setTesting] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const r = await llmSettingsApi.list();
      setProviders(r.providers);
      setSettings(r.settings);
      setStatus(r.status);
    } catch (e: any) { message.error(e.message); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const openConfig = (providerKey: string) => {
    const meta = providers.find(p => p.key === providerKey);
    const existing = settings.find(s => s.provider === providerKey);
    const initial: any = existing || {
      provider: providerKey,
      name: meta?.name,
      baseUrl: meta?.defaultBaseUrl,
      model: meta?.defaultModel,
      enabled: true,
      isPrimary: false,
      note: '',
      apiKey: '',
    };
    setEditing(initial);
    form.setFieldsValue(initial);
    setTestResult(null);
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!editing) return;
    try {
      const v = await form.validateFields();
      // 如果 apiKey 包含 *** 说明没改，保留原值
      if (v.apiKey && v.apiKey.includes('***')) v.apiKey = '';
      await llmSettingsApi.upsert(editing.provider, v);
      message.success('已保存');
      setModalOpen(false);
      load();
    } catch (e: any) { message.error(e.message); }
  };

  const handleTest = async () => {
    if (!editing) return;
    try {
      const v = await form.validateFields();
      setTesting(true);
      setTestResult(null);
      // 测试连接用当前生效模型 (currentModel)，不传 model 字段让后端自动选
      const { model: _ignore, ...payload } = v;
      const r = await llmSettingsApi.test(editing.provider, payload);
      setTestResult(r);
      if (r.success) message.success(`${r.message}（${r.latencyMs}ms）`);
      else message.error(`失败：${r.message}`);
    } catch (e: any) { message.error(e.message); }
    finally { setTesting(false); }
  };

  const handleTestChat = async () => {
    if (!editing) return;
    try {
      const v = await form.validateFields();
      // 测试聊天也用当前生效模型，不传 model 字段让后端自动选 currentModel
      const { model: _ignore, ...payload } = v;
      const v2 = { ...payload, provider: editing.provider, prompt: '你好，请用一句话介绍你自己' };
      setTesting(true);
      setTestResult(null);
      const r = await llmSettingsApi.testChat(v2);
      setTestResult(r);
      if (r.success) message.success(`回复成功（${r.latencyMs}ms）`);
      else message.error(`失败：${r.message}`);
    } catch (e: any) { message.error(e.message); }
    finally { setTesting(false); }
  };

  const handleSetPrimary = async (provider: string) => {
    try {
      await llmSettingsApi.setPrimary(provider);
      message.success(`已切换主 provider 为 ${provider}`);
      load();
    } catch (e: any) { message.error(e.message); }
  };

  const handleDelete = async (provider: string) => {
    try {
      await llmSettingsApi.remove(provider);
      message.success('已删除');
      load();
    } catch (e: any) { message.error(e.message); }
  };

  const getMeta = (key: string) => providers.find(p => p.key === key);

  return (
    <div>
      <Card
        title={
          <Space>
            <ApiOutlined />
            <span>大模型设置</span>
            <Tag color="purple">LLM</Tag>
            {status?.configured ? (
              <Badge status="success" text={`主 provider: ${status.displayName || status.provider} · ${status.model}`} />
            ) : (
              <Badge status="default" text="未配置（当前走 Mock 兜底）" />
            )}
          </Space>
        }
        extra={<Button icon={<ReloadOutlined />} onClick={load}>刷新</Button>}
        style={{ borderRadius: 8 }}
      >
        <Alert
          type="info" showIcon style={{ marginBottom: 12 }}
          message="支持 9 个主流大模型 provider，配一个就能用"
          description={
            <div>
              <div>• 标记"主 provider"后，AI 助理（估分/归类/问答/周报）自动走真实大模型</div>
              <div>• 不配置任何 provider 时自动 fallback 到启发式引擎，演示无影响</div>
              <div>• API Key 加密仅在网络传输，生产部署建议挂到 Vault/K8s Secret</div>
            </div>
          }
        />

        <Row gutter={12} style={{ marginBottom: 12 }}>
          <Col span={6}><Card size="small"><Statistic title="支持的 provider" value={providers.length} prefix={<ApiOutlined />} /></Card></Col>
          <Col span={6}><Card size="small"><Statistic title="已配置" value={settings.filter(s => s.apiKey && !s.apiKey.startsWith('***') || s.apiKey?.length > 8).length} prefix={<KeyOutlined />} /></Card></Col>
          <Col span={8}><Card size="small"><Statistic title="主 provider" value={status?.configured ? status.displayName : 'Mock'} valueStyle={{ color: status?.configured ? '#52c41a' : '#999' }} /></Card></Col>
        </Row>

        <Table
          rowKey="provider" loading={loading} pagination={false}
          dataSource={providers}
          columns={[
            {
              title: 'Provider', width: 240,
              render: (_v, p) => {
                const s = settings.find(x => x.provider === p.key);
                return (
                  <Space>
                    <span style={{ fontSize: 20 }}>{p.logo}</span>
                    <div>
                      <div style={{ fontWeight: 500 }}>{p.name}{s?.isPrimary && <Tag color="gold" style={{ marginLeft: 6 }}>主</Tag>}</div>
                      <div style={{ fontSize: 11, color: '#999' }}>{p.key} · {p.protocol}</div>
                    </div>
                  </Space>
                );
              },
            },
            { title: 'Base URL', render: (_v, p) => {
              const s = settings.find(x => x.provider === p.key);
              return s ? <code style={{ fontSize: 12 }}>{s.baseUrl || p.defaultBaseUrl || '-'}</code> : <span style={{ color: '#ccc' }}>未配置</span>;
            }},
            { title: '模型', width: 220, render: (_v, p) => {
              const s = settings.find(x => x.provider === p.key);
              if (!s) return <span style={{ color: '#ccc' }}>-</span>;
              const current = s.currentModel || s.model;
              const isDifferent = s.currentModel && s.currentModel !== s.model;
              return (
                <Space size={4} direction="vertical" style={{ lineHeight: 1.4 }}>
                  {isDifferent ? (
                    <>
                      <Tag color="purple">{current} ★</Tag>
                      <span style={{ fontSize: 11, color: '#999' }}>默认：{s.model}</span>
                    </>
                  ) : (
                    <Tag color="blue">{current}</Tag>
                  )}
                </Space>
              );
            }},
            { title: 'API Key', width: 100, render: (_v, p) => {
              const s = settings.find(x => x.provider === p.key);
              const hasKey = s?.apiKey && s.apiKey.length > 4;
              return hasKey ? <Tag color="success" icon={<CheckCircleOutlined />}>已配</Tag> : <Tag>未配</Tag>;
            }},
            { title: '状态', width: 80, render: (_v, p) => {
              const s = settings.find(x => x.provider === p.key);
              return s?.enabled ? <Badge status="success" text="启用" /> : <Badge status="default" text="停用" />;
            }},
            {
              title: '操作', width: 260, fixed: 'right',
              render: (_v, p) => {
                const s = settings.find(x => x.provider === p.key);
                return (
                  <Space>
                    <Button size="small" icon={<ExperimentOutlined />} onClick={() => openConfig(p.key)}>
                      {s?.apiKey ? '编辑' : '配置'}
                    </Button>
                    {s && !s.isPrimary && (
                      <Tooltip title="设为 AI 助理的主 provider">
                        <Button size="small" icon={<StarOutlined />} onClick={() => handleSetPrimary(p.key)}>主</Button>
                      </Tooltip>
                    )}
                    {s?.isPrimary && <Tag color="gold" icon={<StarFilled />}>主</Tag>}
                    {s && (
                      <Popconfirm title="确定删除此 provider 配置？" onConfirm={() => handleDelete(p.key)}>
                        <Button size="small" danger icon={<DeleteOutlined />} />
                      </Popconfirm>
                    )}
                  </Space>
                );
              },
            },
          ]}
        />
      </Card>

      <Modal
        open={modalOpen}
        title={editing ? `配置 ${getMeta(editing.provider)?.name}` : '配置'}
        onCancel={() => setModalOpen(false)}
        onOk={handleSave}
        width={680}
        okText="保存"
      >
        {editing && (
          <Form form={form} layout="vertical">
            <Form.Item name="name" label="显示名称" rules={[{ required: true }]}>
              <Input />
            </Form.Item>
            <Row gutter={12}>
              <Col span={14}><Form.Item name="baseUrl" label="API Base URL" tooltip="留空用默认值">
                <Input placeholder={getMeta(editing.provider)?.defaultBaseUrl} />
              </Form.Item></Col>
              <Col span={10}><Form.Item name="model" label="默认模型" tooltip="留空用默认值">
                <Input placeholder={getMeta(editing.provider)?.defaultModel} />
              </Form.Item></Col>
            </Row>
            <Form.Item name="apiKey" label="API Key" tooltip="支持 OpenAI/Anthropic 协议；Ollama 可留空">
              <Input.Password placeholder="sk-..." />
            </Form.Item>
            <Row gutter={12}>
              <Col span={12}><Form.Item name="enabled" label="启用" valuePropName="checked"><Switch /></Form.Item></Col>
              <Col span={12}><Form.Item name="isPrimary" label="主 provider" valuePropName="checked"><Switch /></Form.Item></Col>
            </Row>
            <Form.Item name="note" label="备注"><Input.TextArea rows={2} placeholder="如：内部知识库专用 / 仅供 PM 使用" /></Form.Item>
            <div style={{ fontSize: 12, color: '#999', marginTop: -12, marginBottom: 12 }}>
              💡 温度和 maxTokens 由系统按模型自动选择（不传 temperature 用 API 默认 1.0；maxTokens 按模型上限智能推断）
            </div>

            {/* 模型管理：当前模型 + 预置 + 自定义 */}
            <ModelsEditor provider={editing.provider} />

            <Space>
              <Button icon={<ThunderboltOutlined />} loading={testing} onClick={handleTest}>测试连接</Button>
              <Button icon={<ExperimentOutlined />} loading={testing} onClick={handleTestChat}>测试聊天</Button>
            </Space>

            {testResult && (
              <Alert
                style={{ marginTop: 12 }}
                type={testResult.success ? 'success' : 'error'}
                showIcon
                message={
                  testResult.success
                    ? `成功（${testResult.latencyMs || 0}ms）${testResult.model ? ` · 模型 ${testResult.model}` : ''}`
                    : `失败：${testResult.message}`
                }
                description={testResult.message && testResult.success ? <pre style={{ background: '#fafafa', padding: 8, borderRadius: 4, maxHeight: 120, overflow: 'auto', fontSize: 12 }}>{testResult.message}</pre> : null}
              />
            )}
          </Form>
        )}
      </Modal>
    </div>
  );
}

// 模型管理子组件
function ModelsEditor({ provider }: { provider: string }) {
  const [models, setModels] = useState<{ builtin: string[]; custom: string[]; current: string; all: string[] }>({ builtin: [], custom: [], current: '', all: [] });
  const [newModel, setNewModel] = useState('');

  const load = async () => {
    try { setModels(await llmSettingsApi.listModels(provider)); } catch {}
  };
  useEffect(() => { load(); }, [provider]);

  const [switchingTo, setSwitchingTo] = useState<string | null>(null);
  const switchTo = async (m: string) => {
    if (switchingTo) return;
    setSwitchingTo(m);
    try {
      const r = await llmSettingsApi.switchModel(provider, m);
      // 立即更新本地 state（不等 load），保证 UI 立即反映
      setModels(prev => ({ ...prev, current: m }));
      message.success(`已切换到 ${m}`);
      // 广播给其他页面（AIPage 等）刷新
      window.dispatchEvent(new CustomEvent('llm-status-updated', { detail: { provider, model: m } }));
    } catch (e: any) { message.error(e.message); }
    finally { setSwitchingTo(null); }
  };
  const addModel = async () => {
    if (!newModel.trim()) return;
    try {
      await llmSettingsApi.addCustomModel(provider, newModel.trim());
      setNewModel('');
      load();
    } catch (e: any) { message.error(e.message); }
  };
  const removeModel = async (m: string) => {
    try {
      await llmSettingsApi.removeCustomModel(provider, m);
      load();
    } catch (e: any) { message.error(e.message); }
  };

  return (
    <div style={{ background: '#fafafa', padding: 12, borderRadius: 6, marginTop: 8 }}>
      <div style={{ marginBottom: 8, padding: '8px 12px', background: '#fff', borderRadius: 4, border: '1px solid #d9b3ff' }}>
        <span style={{ fontSize: 12, color: '#666' }}>当前生效模型：</span>
        <Tag color="purple" style={{ marginLeft: 6, fontSize: 14, padding: '2px 10px', fontWeight: 500 }}>
          {models.current || '未选（走 defaultModel）'}
          {switchingTo && <Spin size="small" style={{ marginLeft: 6 }} />}
        </Tag>
      </div>
      <div style={{ fontSize: 12, color: '#666', marginBottom: 4 }}>预置模型（点击切换）</div>
      <div style={{ marginBottom: 8 }}>
        {models.builtin.length === 0 ? <span style={{ color: '#ccc', fontSize: 12 }}>该 provider 无预置模型，请手动添加</span> :
          models.builtin.map(m => {
            const isCurrent = m === models.current;
            const isSwitching = switchingTo === m;
            return (
              <Tag
                key={m}
                color={isCurrent ? 'gold' : 'blue'}
                style={{ cursor: 'pointer', marginBottom: 4, padding: '4px 10px', fontSize: 13, userSelect: 'none' }}
                onClick={() => switchTo(m)}
              >
                {isSwitching ? <Spin size="small" style={{ marginRight: 4 }} /> : isCurrent ? '★ ' : '○ '}{m}
              </Tag>
            );
          })
        }
      </div>
      <div style={{ fontSize: 12, color: '#666', marginBottom: 4 }}>自定义模型</div>
      <div style={{ marginBottom: 8 }}>
        {models.custom.length === 0 ? <span style={{ color: '#ccc', fontSize: 12 }}>暂无</span> :
          models.custom.map(m => {
            const isCurrent = m === models.current;
            const isSwitching = switchingTo === m;
            return (
              <Tag
                key={m}
                color={isCurrent ? 'gold' : 'cyan'}
                style={{ cursor: 'pointer', marginBottom: 4, padding: '4px 10px', fontSize: 13, userSelect: 'none' }}
                onClick={() => switchTo(m)}
                closable
                onClose={(e) => { e.preventDefault(); removeModel(m); }}
              >
                {isSwitching ? <Spin size="small" style={{ marginRight: 4 }} /> : isCurrent ? '★ ' : '○ '}{m}
              </Tag>
            );
          })
        }
      </div>
      <Space.Compact style={{ width: '100%' }}>
        <Input value={newModel} onChange={e => setNewModel(e.target.value)} placeholder="添加自定义模型（如 gpt-4-32k）" onPressEnter={addModel} />
        <Button type="primary" onClick={addModel}>添加</Button>
      </Space.Compact>
    </div>
  );
}
