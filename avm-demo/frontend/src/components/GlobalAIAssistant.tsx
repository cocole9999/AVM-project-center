/**
 * GlobalAIAssistant - 全局 AI 助手组件 (V1.8.3 多轮记忆)
 *
 * 跨页面可用：
 * - 右下角悬浮按钮（点击唤起）
 * - Ctrl+K / Cmd+K 唤起
 * - 支持自然语言命令（LLM 调工具完成实际操作）
 * - 多轮对话记忆（sessionStorage 持久化 + 后端 history 注入）
 */
import { useEffect, useState, useRef } from 'react';
import { FloatButton, Drawer, Input, Button, Space, Tag, Spin, message as antdMessage, Avatar, Empty, Tooltip, Popconfirm, Badge } from 'antd';
import { RobotOutlined, SendOutlined, CloseOutlined, ThunderboltOutlined, ClearOutlined, HistoryOutlined } from '@ant-design/icons';
import { useAuth } from '../AuthContext';

interface Message {
  id: string;
  role: 'user' | 'ai';
  content: string;
  toolCalls?: { name: string; args: any; result?: any; error?: string; id?: string }[];
  toolCallsRaw?: any[];       // 给后端 history 用
  time: string;
  pending?: boolean;           // 流式时显示
}

interface HistoryMsg {
  role: 'user' | 'assistant' | 'tool';
  content?: string;
  tool_calls?: any[];
  tool_call_id?: string;
}

const API = '/api/ai-command';
const STORAGE_KEY = (user: string) => `avm.ai.history.${user}`;
const MAX_HISTORY = 30;     // sessionStorage 最多保留的消息数
const MAX_CONTEXT = 12;     // 发给后端时最近 N 条

function genId() {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function loadHistory(user: string): Message[] {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY(user));
    if (!raw) return [];
    const arr = JSON.parse(raw) as Message[];
    return Array.isArray(arr) ? arr.slice(-MAX_HISTORY) : [];
  } catch {
    return [];
  }
}

function saveHistory(user: string, msgs: Message[]) {
  try {
    const trimmed = msgs.slice(-MAX_HISTORY);
    sessionStorage.setItem(STORAGE_KEY(user), JSON.stringify(trimmed));
  } catch {
    // sessionStorage 满了或不可用，忽略
  }
}

function buildContextMsgs(msgs: Message[]): HistoryMsg[] {
  // 把前端 messages 翻译成后端 history 格式（只取最后一组 user→assistant→tool_calls→tool→assistant）
  const out: HistoryMsg[] = [];
  const tail = msgs.slice(-MAX_CONTEXT);
  for (const m of tail) {
    if (m.role === 'user') {
      out.push({ role: 'user', content: m.content });
    } else if (m.role === 'ai') {
      out.push({
        role: 'assistant',
        content: m.content,
        ...(m.toolCallsRaw && m.toolCallsRaw.length > 0 ? { tool_calls: m.toolCallsRaw } : {}),
      });
    }
  }
  return out;
}

export function GlobalAIAssistant() {
  const { user } = useAuth();
  const username = user?.displayName || user?.username || 'guest';
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>(() => {
    const saved = loadHistory(username);
    if (saved.length > 0) return saved;
    return [{
      id: genId(),
      role: 'ai',
      content: '你好！我是 AVM 全局 AI 助理。你可以用自然语言告诉我做什么，比如"创建一个 P0 需求"、"检查所有项目风险"、"给领克 09 加一个新工作项"。',
      time: new Date().toLocaleTimeString('zh-CN'),
    }];
  });
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  // 持久化（每次 messages 变化）
  useEffect(() => {
    saveHistory(username, messages);
  }, [messages, username]);

  // 快捷键 Ctrl+K / Cmd+K
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen(true);
      } else if (e.key === 'Escape' && open) {
        setOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  // 打开时拉建议
  useEffect(() => {
    if (open) {
      fetch(API + '/suggestions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ page: window.location.pathname }),
      })
        .then(r => r.json())
        .then(d => setSuggestions(d.suggestions || []))
        .catch(() => setSuggestions([]));
    }
  }, [open]);

  // 滚动到底
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, open, loading]);

  const send = async (text?: string) => {
    const q = (text || input).trim();
    if (!q) return;
    setInput('');
    const userMsg: Message = { id: genId(), role: 'user', content: q, time: new Date().toLocaleTimeString('zh-CN') };
    setMessages(m => [...m, userMsg]);
    setLoading(true);

    // 构造 history（不含当前 userMsg）
    const historyPayload = buildContextMsgs(messages);

    try {
      const r = await fetch(API + '/command', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command: q, history: historyPayload }),
      }).then(r => r.json());
      if (r.error) throw new Error(r.error);
      const aiMsg: Message = {
        id: genId(),
        role: 'ai',
        content: r.reply || '（AI 没返回内容）',
        toolCalls: r.toolCalls || [],
        time: new Date().toLocaleTimeString('zh-CN'),
      };
      setMessages(m => [...m, aiMsg]);
      // 工具调用了"创建/更新"类操作 → 广播事件让其他页面刷新
      const created = (r.toolCalls || []).some((tc: any) =>
        (tc.name === 'create_work_item' || tc.name === 'update_work_item') && !tc.error
      );
      if (created) {
        window.dispatchEvent(new CustomEvent('avm-data-changed'));
        antdMessage.success('已自动刷新相关页面');
      }
    } catch (e: any) {
      setMessages(m => [...m, {
        id: genId(),
        role: 'ai',
        content: `❌ ${e.message}`,
        time: new Date().toLocaleTimeString('zh-CN'),
      }]);
    } finally {
      setLoading(false);
    }
  };

  const clearHistory = () => {
    setMessages([{
      id: genId(),
      role: 'ai',
      content: '对话已清空。有什么新任务尽管说～',
      time: new Date().toLocaleTimeString('zh-CN'),
    }]);
    antdMessage.success('对话已清空');
  };

  const messageCount = messages.filter(m => m.role === 'user').length;

  return (
    <>
      {/* 悬浮按钮（右下角） */}
      <Badge count={messageCount} size="small" offset={[-8, 8]} color="#722ed1">
        <FloatButton
          type="primary"
          icon={<RobotOutlined />}
          tooltip="AI 助理 (Ctrl+K)"
          style={{ right: 24, bottom: 24, width: 56, height: 56 }}
          onClick={() => setOpen(true)}
        />
      </Badge>

      {/* 命令面板（Drawer） */}
      <Drawer
        title={
          <Space>
            <RobotOutlined style={{ color: '#1677ff' }} />
            <span>AVM 全局 AI 助理</span>
            <Tag color="purple" style={{ marginLeft: 8 }}>Ctrl+K</Tag>
            {messageCount > 1 && (
              <Tag color="cyan" icon={<HistoryOutlined />}>
                已聊 {messageCount} 轮
              </Tag>
            )}
          </Space>
        }
        open={open}
        onClose={() => setOpen(false)}
        placement="right"
        width={520}
        closeIcon={<CloseOutlined />}
        styles={{ body: { padding: 0, display: 'flex', flexDirection: 'column', height: 'calc(100vh - 55px)' } }}
        extra={
          <Popconfirm
            title="清空对话历史？"
            description="当前会话的所有消息会被清掉（不影响他人）"
            okText="清空"
            cancelText="取消"
            onConfirm={clearHistory}
          >
            <Button size="small" icon={<ClearOutlined />}>新会话</Button>
          </Popconfirm>
        }
        footer={
          <div style={{ borderTop: '1px solid #f0f0f0', padding: 12 }}>
            <Space.Compact style={{ width: '100%' }}>
              <Input
                placeholder="说点什么...（如：创建一个 P0 需求 / 检查风险）"
                value={input}
                onChange={e => setInput(e.target.value)}
                onPressEnter={() => send()}
                disabled={loading}
                size="large"
              />
              <Button type="primary" size="large" icon={<SendOutlined />} onClick={() => send()} loading={loading}>
                发送
              </Button>
            </Space.Compact>
          </div>
        }
      >
        {/* 快捷建议：只在新会话（≤1 轮）时显示 */}
        {messages.filter(m => m.role === 'user').length === 0 && suggestions.length > 0 && (
          <div style={{ padding: 12, background: '#fafafa', borderBottom: '1px solid #f0f0f0' }}>
            <div style={{ fontSize: 12, color: '#666', marginBottom: 8 }}>
              <ThunderboltOutlined style={{ color: '#fa8c16' }} /> 你可以试试
            </div>
            <Space wrap size={[8, 8]}>
              {suggestions.map((s, i) => (
                <Tag key={i} style={{ cursor: 'pointer' }} onClick={() => send(s)} color="blue">
                  {s}
                </Tag>
              ))}
            </Space>
          </div>
        )}

        {/* 消息流 */}
        <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
          {messages.length === 0 && <Empty description="开始对话" />}
          {messages.map((m) => (
            <div key={m.id} style={{ marginBottom: 16, display: 'flex', gap: 8, flexDirection: m.role === 'user' ? 'row-reverse' : 'row' }}>
              <Avatar
                icon={m.role === 'user' ? '👤' : <RobotOutlined />}
                style={{ background: m.role === 'user' ? '#1677ff' : '#722ed1' }}
              />
              <div style={{
                maxWidth: '85%',
                background: m.role === 'user' ? '#1677ff' : '#fafafa',
                color: m.role === 'user' ? '#fff' : '#333',
                padding: '8px 12px',
                borderRadius: 8,
                fontSize: 13,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
              }}>
                {m.content}
                {m.toolCalls && m.toolCalls.length > 0 && (
                  <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px dashed #d9b3ff' }}>
                    <div style={{ fontSize: 11, color: '#722ed1', marginBottom: 4 }}>🔧 工具调用：</div>
                    {m.toolCalls.map((tc, j) => (
                      <div key={j} style={{ fontSize: 11, color: tc.error ? '#cf1322' : '#389e0d', marginBottom: 2 }}>
                        {tc.error ? '❌' : '✓'} <code style={{ fontSize: 10 }}>{tc.name}</code>
                        {tc.error ? `: ${tc.error}` : tc.result?.key ? ` → ${tc.result.key}` : tc.result?.ok ? ' → ok' : ''}
                      </div>
                    ))}
                  </div>
                )}
                <div style={{ fontSize: 10, opacity: 0.6, marginTop: 4, textAlign: 'right' }}>{m.time}</div>
              </div>
            </div>
          ))}
          {loading && (
            <div style={{ textAlign: 'center', padding: 16 }}>
              <Spin tip="AI 思考中..." />
            </div>
          )}
        </div>
      </Drawer>
    </>
  );
}
