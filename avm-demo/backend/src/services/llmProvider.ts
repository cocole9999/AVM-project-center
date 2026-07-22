/**
 * LLM 抽象层 - 支持主流大模型
 *
 * 支持的 provider（按 OpenAI 兼容 / Anthropic 兼容 / 自定义分类）：
 *   - openai     OpenAI (gpt-4o, gpt-4o-mini, o1)
 *   - anthropic  Anthropic Claude (claude-3-5-sonnet, claude-3-5-haiku)
 *   - deepseek   DeepSeek (deepseek-chat, deepseek-coder)
 *   - qwen       通义千问 (qwen-plus, qwen-max, qwen-turbo)
 *   - glm        智谱 GLM (glm-4-plus, glm-4-flash)
 *   - moonshot   月之暗面 Kimi (moonshot-v1-128k, moonshot-v1-32k)
 *   - doubao     字节豆包 (doubao-pro, doubao-lite)
 *   - ollama     Ollama 本地 (llama3, qwen, mistral 等)
 *   - custom     自定义 OpenAI 兼容端点
 *
 * 配置优先级（运行时）：
 *   1. 数据库 LLMSettings 表（前端设置页写）
 *   2. 环境变量 LLM_API_KEY/LLM_BASE_URL/LLM_MODEL
 *   3. 都没设 → Mock
 */
import { prisma } from '../db';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatOptions {
  temperature?: number;
  maxTokens?: number;
  model?: string;
}

export interface ChatResponse {
  content: string;
  model: string;
  usage?: { promptTokens: number; completionTokens: number; totalTokens: number };
  provider: string;
}

export interface LLMProvider {
  name: string;
  displayName: string;
  isAvailable(): boolean;
  chat(messages: ChatMessage[], options?: ChatOptions): Promise<ChatResponse>;
}

// ========== Provider 元数据（供前端展示） ==========
// 模型列表更新到 2026 Q2 主流最新
export const PROVIDERS = [
  {
    key: 'openai', name: 'OpenAI', logo: '🟢', defaultBaseUrl: 'https://api.openai.com/v1', defaultModel: 'gpt-4.1', protocol: 'openai',
    models: ['gpt-4.1', 'gpt-4.1-mini', 'gpt-4.1-nano', 'gpt-4o', 'gpt-4o-mini', 'o4-mini', 'o3', 'o3-mini', 'o1', 'o1-mini', 'o1-pro', 'gpt-5', 'gpt-5-mini', 'gpt-4-turbo'],
  },
  {
    key: 'anthropic', name: 'Anthropic Claude', logo: '🟠', defaultBaseUrl: 'https://api.anthropic.com/v1', defaultModel: 'claude-sonnet-4-5', protocol: 'anthropic',
    models: ['claude-sonnet-4-5', 'claude-opus-4-1', 'claude-sonnet-4', 'claude-opus-4', 'claude-3-7-sonnet', 'claude-3-5-sonnet', 'claude-3-5-haiku'],
  },
  {
    key: 'deepseek', name: 'DeepSeek', logo: '🔵', defaultBaseUrl: 'https://api.deepseek.com', defaultModel: 'deepseek-v4-pro', protocol: 'openai',
    // 移除 v3 老模型 (deepseek-chat/coder/reasoner) — API 已升级 v4，老模型名调用时被服务端 fallback
    models: ['deepseek-v4-pro', 'deepseek-v4-flash', 'deepseek-v4-coder', 'deepseek-v4-reasoner'],
  },
  {
    key: 'MiniMax', name: 'MiniMax', logo: '🟧', defaultBaseUrl: 'https://api.MiniMax.chat/v1', defaultModel: 'MiniMax-Text-01', protocol: 'openai',
    models: ['MiniMax-Text-01', 'MiniMax-2.5', 'MiniMax-2.0', 'MiniMax-VL-01', 'MiniMax-2.7', 'abab-7-chat'],
  },
  {
    key: 'qwen', name: '通义千问 Qwen', logo: '🟣', defaultBaseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', defaultModel: 'qwen3-max', protocol: 'openai',
    models: ['qwen3-max', 'qwen3-plus', 'qwen3-turbo', 'qwen3-coder-plus', 'qwen3-235b-a22b', 'qwen-max', 'qwen-plus', 'qwen-turbo', 'qwen-long', 'qwen-coder-plus', 'qwen-vl-max', 'qwen-vl-plus'],
  },
  {
    key: 'glm', name: '智谱 GLM', logo: '🟡', defaultBaseUrl: 'https://open.bigmodel.cn/api/paas/v4', defaultModel: 'glm-4.6', protocol: 'openai',
    models: ['glm-4.6', 'glm-4.5', 'glm-4.5-air', 'glm-4-plus', 'glm-4-air', 'glm-4-flash', 'glm-4-long', 'glm-z1-air', 'codegeex-4'],
  },
  {
    key: 'moonshot', name: '月之暗面 Kimi', logo: '⚪', defaultBaseUrl: 'https://api.moonshot.cn/v1', defaultModel: 'kimi-k2-0711-preview', protocol: 'openai',
    models: ['kimi-k2-0711-preview', 'kimi-k2', 'moonshot-v1-8k', 'moonshot-v1-32k', 'moonshot-v1-128k', 'moonshot-v1-auto'],
  },
  {
    key: 'doubao', name: '字节豆包', logo: '🟤', defaultBaseUrl: 'https://ark.cn-beijing.volces.com/api/v3', defaultModel: 'doubao-1-5-pro-32k', protocol: 'openai',
    models: ['doubao-1-5-pro-32k', 'doubao-1-5-pro-256k', 'doubao-1-5-lite-32k', 'doubao-1-5-thinking-pro', 'doubao-pro-32k', 'doubao-pro-128k', 'doubao-lite-32k'],
  },
  {
    key: 'ollama', name: 'Ollama (本地)', logo: '⚫', defaultBaseUrl: 'http://localhost:11434/v1', defaultModel: 'llama3.3', protocol: 'openai',
    models: ['llama3.3', 'llama3.2', 'qwen3', 'qwen2.5', 'mistral', 'mixtral', 'gemma3', 'phi4', 'codellama', 'deepseek-r1', 'deepseek-coder-v2'],
  },
  {
    key: 'custom', name: '自定义 OpenAI 兼容', logo: '🔘', defaultBaseUrl: '', defaultModel: '', protocol: 'openai',
    models: [],
  },
];

// ========== OpenAI 兼容实现 ==========
// 按模型名粗略估算最大输出 token（保守值；不传 temperature 让 API 走默认）
function inferMaxOutputTokens(model: string): number {
  const m = (model || '').toLowerCase();
  if (m.includes('opus') || m.includes('gpt-5') || m.includes('gpt-4.1') || m.includes('deepseek-v4')) return 16384;
  if (m.includes('claude') || m.includes('MiniMax-text-01') || m.includes('MiniMax-2')) return 8192;
  if (m.includes('o1') || m.includes('o3') || m.includes('o4')) return 32768;
  if (m.includes('deepseek-reasoner') || m.includes('r1') || m.includes('deepseek-v4-reasoner')) return 16384;
  if (m.includes('gemini') || m.includes('qwen3-max') || m.includes('kimi-k2')) return 16384;
  if (m.includes('gpt-4o') || m.includes('gpt-4.1') || m.includes('glm-4.6')) return 16384;
  if (m.includes('gpt-5-mini') || m.includes('gpt-4.1-mini') || m.includes('qwen3')) return 8192;
  if (m.includes('llama') || m.includes('qwen2.5') || m.includes('mistral')) return 8192;
  return 8192; // 默认
}

export class OpenAICompatibleProvider implements LLMProvider {
  constructor(public name: string, public displayName: string, private apiKey: string, private baseUrl: string, private defaultModel: string) {}
  isAvailable() { return !!this.apiKey && !!this.baseUrl; }
  async chat(messages: ChatMessage[], options: ChatOptions = {}, signal?: AbortSignal): Promise<ChatResponse> {
    if (!this.isAvailable()) throw new Error(`${this.displayName} 未配置 API Key 或 Base URL`);
    const model = options.model || this.defaultModel;
    const body: any = {
      model,
      messages,
      // 不传 temperature（用 API 默认 1.0）
      max_tokens: options.maxTokens ?? inferMaxOutputTokens(model),
    };
    // 扩展：function calling
    const ext = options as any;
    if (ext.tools) body.tools = ext.tools;
    if (ext.tool_choice) body.tool_choice = ext.tool_choice;
    const res = await fetch(`${this.baseUrl.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.apiKey}` },
      body: JSON.stringify(body),
      signal,
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`${this.displayName} ${res.status}: ${text.slice(0, 200)}`);
    }
    const data: any = await res.json();
    const message = data.choices?.[0]?.message || {};
    return {
      content: message.content || '',
      model: data.model || model,
      usage: data.usage ? { promptTokens: data.usage.prompt_tokens, completionTokens: data.usage.completion_tokens, totalTokens: data.usage.total_tokens } : undefined,
      provider: this.name,
      // 扩展字段：function calling
      rawMessage: message,
      toolCalls: message.tool_calls || [],
    } as any;
  }
}

// ========== Anthropic 兼容实现 ==========
export class AnthropicProvider implements LLMProvider {
  constructor(public name: string, public displayName: string, private apiKey: string, private baseUrl: string, private defaultModel: string) {}
  isAvailable() { return !!this.apiKey && !!this.baseUrl; }
  async chat(messages: ChatMessage[], options: ChatOptions = {}, signal?: AbortSignal): Promise<ChatResponse> {
    if (!this.isAvailable()) throw new Error(`${this.displayName} 未配置 API Key 或 Base URL`);
    const system = messages.find(m => m.role === 'system')?.content;
    const userMsgs = messages.filter(m => m.role !== 'system');
    const model = options.model || this.defaultModel;
    const res = await fetch(`${this.baseUrl.replace(/\/$/, '')}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': this.apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model,
        system,
        messages: userMsgs.map(m => ({ role: m.role, content: m.content })),
        max_tokens: options.maxTokens ?? inferMaxOutputTokens(model),
        // 不传 temperature（用 API 默认 1.0）
      }),
      signal,
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`${this.displayName} ${res.status}: ${text.slice(0, 200)}`);
    }
    const data: any = await res.json();
    return {
      content: data.content?.[0]?.text || '',
      model: data.model || model,
      usage: data.usage ? { promptTokens: data.usage.input_tokens || 0, completionTokens: data.usage.output_tokens || 0, totalTokens: (data.usage.input_tokens || 0) + (data.usage.output_tokens || 0) } : undefined,
      provider: this.name,
    } as any;
  }
}

// ========== Mock ==========
class MockProvider implements LLMProvider {
  name = 'mock';
  displayName = 'Mock（演示）';
  isAvailable() { return true; }
  async chat(messages: ChatMessage[]): Promise<ChatResponse> {
    const last = messages[messages.length - 1]?.content || '';
    return { content: `[Mock LLM] 收到 ${messages.length} 条消息，最后一条：${last.slice(0, 60)}...`, model: 'mock-1.0', provider: this.name };
  }
}

// ========== Provider 解析（运行时从 DB + env 合并） ==========
interface ResolvedProvider {
  name: string;
  displayName: string;
  apiKey: string;
  baseUrl: string;
  defaultModel: string;
  protocol: 'openai' | 'anthropic';
}

async function loadFromDb(): Promise<ResolvedProvider[]> {
  try {
    // 优先 isPrimary=true 的，然后按 createdAt 升序
    const rows = await prisma.lLMSettings.findMany({
      where: { enabled: true },
      orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
    });
    return rows.map(r => {
      const meta = PROVIDERS.find(p => p.key === r.provider);
      // 优先级：currentModel > model > defaultModel
      const activeModel = r.currentModel || r.model || meta?.defaultModel || '';
      return {
        name: r.provider,
        displayName: r.name || meta?.name || r.provider,
        apiKey: r.apiKey,
        baseUrl: r.baseUrl || meta?.defaultBaseUrl || '',
        defaultModel: activeModel,
        protocol: (meta?.protocol || 'openai') as 'openai' | 'anthropic',
      };
    });
  } catch { return []; }
}

function loadFromEnv(): ResolvedProvider | null {
  const provider = (process.env.LLM_PROVIDER || '').toLowerCase();
  const apiKey = process.env.LLM_API_KEY || '';
  if (!provider || !apiKey) return null;
  const meta = PROVIDERS.find(p => p.key === provider) || PROVIDERS[PROVIDERS.length - 1];
  return {
    name: provider,
    displayName: meta.name,
    apiKey,
    baseUrl: process.env.LLM_BASE_URL || meta.defaultBaseUrl,
    defaultModel: process.env.LLM_MODEL || meta.defaultModel,
    protocol: (meta.protocol || 'openai') as 'openai' | 'anthropic',
  };
}

function buildProvider(p: ResolvedProvider): LLMProvider {
  if (p.protocol === 'anthropic') return new AnthropicProvider(p.name, p.displayName, p.apiKey, p.baseUrl, p.defaultModel);
  return new OpenAICompatibleProvider(p.name, p.displayName, p.apiKey, p.baseUrl, p.defaultModel);
}

let _cached: { providers: ResolvedProvider[]; ts: number } | null = null;
const CACHE_TTL = 30_000; // 30s

async function getAllProviders(): Promise<ResolvedProvider[]> {
  if (_cached && Date.now() - _cached.ts < CACHE_TTL) return _cached.providers;
  const fromDb = await loadFromDb();
  let providers = fromDb;
  if (providers.length === 0) {
    const fromEnv = loadFromEnv();
    if (fromEnv) providers = [fromEnv];
  }
  _cached = { providers, ts: Date.now() };
  return providers;
}

export function clearLLMCache() { _cached = null; }

// 列出某 provider 的全部可用模型（预置 + 用户自定义）
export async function getAvailableModels(providerKey: string): Promise<{ builtin: string[]; custom: string[]; current: string; all: string[] }> {
  const meta = PROVIDERS.find(p => p.key === providerKey);
  const builtin = meta?.models || [];
  let custom: string[] = [];
  let current = '';
  try {
    const s = await prisma.lLMSettings.findUnique({ where: { provider: providerKey } });
    if (s) {
      try { custom = JSON.parse(s.customModels || '[]'); } catch { custom = []; }
      current = s.currentModel || s.model || meta?.defaultModel || '';
    }
  } catch {}
  const all = Array.from(new Set([...builtin, ...custom]));
  return { builtin, custom, current, all };
}

export async function getLLMProvider(): Promise<LLMProvider> {
  const providers = await getAllProviders();
  if (providers.length === 0) return new MockProvider();
  // 优先用标记 isPrimary 的（DB 端控制），否则用第一个
  return buildProvider(providers[0]);
}

export async function getLLMStatus() {
  // 实时读，不走 30s 缓存（status 端点要求反映最新）
  clearLLMCache();
  const providers = await getAllProviders();
  if (providers.length === 0) {
    return { provider: 'mock', available: true, configured: false, providers: PROVIDERS, current: null, models: { builtin: [], custom: [], current: '', all: [] } };
  }
  const current = providers[0];
  const meta = PROVIDERS.find(p => p.key === current.name);
  const models = await getAvailableModels(current.name);
  return {
    provider: current.name,
    available: true,
    configured: true,
    model: current.defaultModel,
    baseUrl: current.baseUrl,
    displayName: current.displayName,
    providers: PROVIDERS,
    current: { ...current, logo: meta?.logo, protocol: current.protocol },
    models,
  };
}

// 测试连接（用最小 token 调用真实 API）
export async function testProvider(provider: string, config: { apiKey: string; baseUrl: string; model: string }): Promise<{ success: boolean; message: string; latencyMs?: number; model?: string }> {
  const meta = PROVIDERS.find(p => p.key === provider);
  if (!meta) return { success: false, message: `未知 provider: ${provider}` };
  const baseUrl = config.baseUrl || meta.defaultBaseUrl;
  const model = config.model || meta.defaultModel;
  const start = Date.now();
  try {
    if (meta.protocol === 'anthropic') {
      const res = await fetch(`${baseUrl.replace(/\/$/, '')}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': config.apiKey, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model, max_tokens: 16, messages: [{ role: 'user', content: 'ping' }] }),
      });
      if (!res.ok) {
        const t = await res.text();
        return { success: false, message: `${res.status}: ${t.slice(0, 200)}` };
      }
      return { success: true, message: '连接成功', latencyMs: Date.now() - start, model };
    } else {
      const res = await fetch(`${baseUrl.replace(/\/$/, '')}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.apiKey}` },
        body: JSON.stringify({ model, max_tokens: 16, messages: [{ role: 'user', content: 'ping' }] }),
      });
      if (!res.ok) {
        const t = await res.text();
        return { success: false, message: `${res.status}: ${t.slice(0, 200)}` };
      }
      return { success: true, message: '连接成功', latencyMs: Date.now() - start, model };
    }
  } catch (e: any) {
    return { success: false, message: e.message || '连接失败' };
  }
}
