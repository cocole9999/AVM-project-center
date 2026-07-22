/**
 * MCP Server 测试页
 * 让用户看到 AVM 暴露给外部 AI 工具的能力
 */
import { useEffect, useState } from 'react';
import { Card, Tabs, Tag, Space, Input, Select, Button, Form, Empty, message, Alert, Row, Col, List, Spin, Divider, InputNumber } from 'antd';
import { ApiOutlined, PlayCircleOutlined, ToolOutlined, FileTextOutlined, CodeOutlined, BulbOutlined } from '@ant-design/icons';
import { mcpApi } from '../api';

export function MCPPage() {
  const [info, setInfo] = useState<any>(null);
  const [tools, setTools] = useState<any[]>([]);
  const [resources, setResources] = useState<any[]>([]);
  const [prompts, setPrompts] = useState<any[]>([]);
  const [selectedTool, setSelectedTool] = useState<string>('');
  const [callResult, setCallResult] = useState<any>(null);
  const [calling, setCalling] = useState(false);
  const [testQuestion, setTestQuestion] = useState('P0 多少个？');
  const [testResult, setTestResult] = useState<any>(null);

  useEffect(() => {
    Promise.all([
      mcpApi.info(),
      mcpApi.tools(),
      mcpApi.resources(),
      mcpApi.promptTemplates(),
    ]).then(([i, t, r, p]) => {
      setInfo(i);
      setTools(t.tools);
      setResources(r.resources);
      setPrompts(p.templates);
    }).catch(console.error);
  }, []);

  const selectedToolDef = tools.find(t => t.name === selectedTool);

  const callTool = async (toolName: string, args: any) => {
    setCalling(true);
    setCallResult(null);
    try {
      const r = await mcpApi.call(toolName, args);
      setCallResult(r);
      message.success(`调用成功：${toolName}`);
    } catch (e: any) {
      message.error(`调用失败：${e.message}`);
      setCallResult({ error: e.message });
    } finally { setCalling(false); }
  };

  return (
    <div>
      <Card
        title={
          <Space>
            <ApiOutlined />
            <span>MCP Server</span>
            <Tag color="blue">{info?.version}</Tag>
            <Tag color="green">运行中</Tag>
          </Space>
        }
        extra={<code style={{ background: '#f5f5f5', padding: '2px 6px', borderRadius: 3 }}>protocol: {info?.protocol}</code>}
        style={{ borderRadius: 8 }}
      >
        <Alert
          type="info"
          showIcon
          message="AVM 暴露了 13 个 MCP 工具，可被 Claude / Cursor / aily 等外部 AI 直接调用"
          description={
            <div>
              <div>所有端点前缀：<code>/api/mcp</code></div>
              <div>协议：<a href="https://modelcontextprotocol.io" target="_blank">Model Context Protocol</a></div>
              <div style={{ marginTop: 4 }}>配置示例（Claude/Cursor MCP 配置）:</div>
              <pre style={{ background: '#1f1f1f', color: '#52c41a', padding: 8, borderRadius: 4, margin: '4px 0', fontSize: 11 }}>
{`{
  "mcpServers": {
    "avm": {
      "url": "http://localhost:4000/api/mcp",
      "type": "http"
    }
  }
}`}
              </pre>
              <div style={{ marginTop: 8 }}>Stdio 模式（Claude Desktop 本地）— 在 backend 目录跑：</div>
              <pre style={{ background: '#1f1f1f', color: '#52c41a', padding: 8, borderRadius: 4, margin: '4px 0', fontSize: 11 }}>
{`# 1. 启动 stdio 服务（独立进程）
npx tsx src/bin/mcp-stdio.ts

# 2. Claude Desktop 配置
{
  "mcpServers": {
    "avm": {
      "command": "npx",
      "args": ["tsx", "D:/AI/飞书项目/avm-demo/backend/src/bin/mcp-stdio.ts"]
    }
  }
}`}
              </pre>
            </div>
          }
        />
      </Card>

      <Tabs
        style={{ marginTop: 12 }}
        defaultActiveKey="playground"
        items={[
          {
            key: 'playground', label: <span><PlayCircleOutlined /> 在线试用</span>,
            children: (
              <Row gutter={12}>
                <Col span={8}>
                  <Card size="small" title="工具列表" style={{ borderRadius: 8 }}>
                    <List
                      size="small"
                      dataSource={tools}
                      renderItem={(t) => (
                        <List.Item
                          style={{ cursor: 'pointer', background: selectedTool === t.name ? '#e6f7ff' : 'transparent', padding: '6px 8px', borderRadius: 4 }}
                          onClick={() => setSelectedTool(t.name)}
                        >
                          <Space>
                            <ToolOutlined />
                            <span style={{ fontSize: 12, fontFamily: 'monospace' }}>{t.name}</span>
                          </Space>
                        </List.Item>
                      )}
                    />
                  </Card>
                </Col>
                <Col span={16}>
                  {selectedToolDef ? (
                    <Card size="small" title={<Space><span>调用：</span><code style={{ background: '#f5f5f5', padding: '2px 6px', borderRadius: 3 }}>{selectedToolDef.name}</code></Space>} style={{ borderRadius: 8 }}>
                      <p style={{ color: '#666' }}>{selectedToolDef.description}</p>
                      <ToolForm tool={selectedToolDef} onSubmit={(args) => callTool(selectedToolDef.name, args)} submitting={calling} />
                      {callResult && (
                        <>
                          <Divider />
                          <div style={{ background: '#fafafa', padding: 12, borderRadius: 4, maxHeight: 400, overflow: 'auto' }}>
                            <div style={{ fontSize: 12, color: '#999', marginBottom: 8 }}>响应：</div>
                            <pre style={{ margin: 0, fontSize: 12 }}>{JSON.stringify(callResult, null, 2)}</pre>
                          </div>
                        </>
                      )}
                    </Card>
                  ) : (
                    <Card style={{ borderRadius: 8 }}><Empty description="请选择左侧工具" /></Card>
                  )}
                </Col>
              </Row>
            ),
          },
          {
            key: 'qa', label: <span><BulbOutlined /> 智能问答试用</span>,
            children: (
              <Card style={{ borderRadius: 8 }}>
                <Form layout="inline" onFinish={async (v) => {
                  setCalling(true);
                  try {
                    const r = await mcpApi.call('ai_qa', { question: v.question });
                    setTestResult(r.result);
                  } finally { setCalling(false); }
                }}>
                  <Form.Item name="question" style={{ flex: 1 }}>
                    <Input.Search placeholder="问问项目数据，如：P0 多少个？" enterButton="提问" loading={calling} size="large" onSearch={(v) => callTool('ai_qa', { question: v })} />
                  </Form.Item>
                </Form>
                <div style={{ marginTop: 12 }}>
                  <Space wrap>
                    {['P0 多少个？', '当前超期的工作项', '需求有多少个？', '状态分布', '迭代有几个？'].map(q => (
                      <Tag key={q} style={{ cursor: 'pointer' }} onClick={() => { setTestQuestion(q); callTool('ai_qa', { question: q }); }}>{q}</Tag>
                    ))}
                  </Space>
                </div>
                {testResult && (
                  <Card style={{ marginTop: 16, background: '#fafafa' }} size="small">
                    <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 8 }}>AI 回答：</div>
                    <div style={{ fontSize: 13 }}>{testResult.answer}</div>
                    {testResult.suggestions && (
                      <div style={{ marginTop: 8 }}>
                        <span style={{ color: '#999', fontSize: 12 }}>你还可以问：</span>
                        {testResult.suggestions.map((s: string, i: number) => (
                          <Tag key={i} color="blue" style={{ cursor: 'pointer', margin: 2 }} onClick={() => callTool('ai_qa', { question: s })}>{s}</Tag>
                        ))}
                      </div>
                    )}
                  </Card>
                )}
              </Card>
            ),
          },
          {
            key: 'resources', label: <span><FileTextOutlined /> 资源（{resources.length}）</span>,
            children: (
              <Card size="small" style={{ borderRadius: 8 }}>
                <p>外部 AI 可读取的 AVM 资源（工作项）：</p>
                <List
                  size="small"
                  dataSource={resources.slice(0, 30)}
                  renderItem={(r) => (
                    <List.Item>
                      <List.Item.Meta
                        avatar={<Tag color="blue">URI</Tag>}
                        title={<code style={{ fontSize: 12 }}>{r.uri}</code>}
                        description={r.description}
                      />
                    </List.Item>
                  )}
                />
              </Card>
            ),
          },
          {
            key: 'prompts', label: <span><CodeOutlined /> 提示词模板（{prompts.length}）</span>,
            children: (
              <Row gutter={12}>
                {prompts.map(p => (
                  <Col span={12} key={p.id} style={{ marginBottom: 12 }}>
                    <Card size="small" title={<Space><Tag color="purple">{p.id}</Tag>{p.name}</Space>} style={{ borderRadius: 8 }}>
                      <p style={{ color: '#666' }}>{p.description}</p>
                      <pre style={{ background: '#1f1f1f', color: '#52c41a', padding: 12, borderRadius: 4, fontSize: 12, whiteSpace: 'pre-wrap' }}>{p.template}</pre>
                    </Card>
                  </Col>
                ))}
              </Row>
            ),
          },
        ]}
      />
    </div>
  );
}

function ToolForm({ tool, onSubmit, submitting }: { tool: any; onSubmit: (args: any) => void; submitting: boolean }) {
  const [args, setArgs] = useState<Record<string, any>>({});

  const properties = tool.inputSchema?.properties || {};
  const required = tool.inputSchema?.required || [];

  return (
    <div>
      {Object.entries(properties).map(([key, schema]: [string, any]) => (
        <Form.Item key={key} label={
          <Space>
            <code>{key}</code>
            {required.includes(key) && <Tag color="red">必填</Tag>}
            <span style={{ fontSize: 12, color: '#999' }}>{schema.description}</span>
          </Space>
        }>
          {schema.enum ? (
            <Select
              style={{ width: '100%' }}
              value={args[key]}
              onChange={(v) => setArgs({ ...args, [key]: v })}
              options={schema.enum.map((v: string) => ({ value: v, label: v }))}
            />
          ) : schema.type === 'number' ? (
            <InputNumber style={{ width: '100%' }} value={args[key]} onChange={(v) => setArgs({ ...args, [key]: v })} />
          ) : schema.type === 'object' ? (
            <Input.TextArea
              rows={3}
              value={args[key] ? JSON.stringify(args[key], null, 2) : ''}
              onChange={(e) => {
                try { setArgs({ ...args, [key]: e.target.value ? JSON.parse(e.target.value) : {} }); }
                catch { /* ignore */ }
              }}
              placeholder='{"workItemId": "xxx", "type": "task"}'
            />
          ) : (
            <Input
              value={args[key] || ''}
              onChange={(e) => setArgs({ ...args, [key]: e.target.value })}
            />
          )}
        </Form.Item>
      ))}
      <Button
        type="primary"
        icon={<PlayCircleOutlined />}
        loading={submitting}
        onClick={() => onSubmit(args)}
      >
        调用 {tool.name}
      </Button>
      <Button style={{ marginLeft: 8 }} onClick={() => setArgs({})}>清空</Button>
    </div>
  );
}
