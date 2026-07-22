/**
 * MCP Server (Model Context Protocol) - HTTP + SSE 端点 (V1.8.5)
 *
 * 暴露两种 HTTP 模式供外部 AI 工具接入：
 * 1. Streamable HTTP (2025-03-26 规范) — POST /api/mcp/stream
 *    单个端点，JSON-RPC 请求体 → JSON-RPC 响应（SSE 格式）
 *    Trae / Claude Desktop 新版 / Cursor 都用这个
 *
 * 2. Legacy HTTP+SSE (2024-11-05 规范) — GET /api/mcp/sse + POST /api/mcp/messages
 *    GET 立即建立 SSE 连接，发送 `endpoint` 事件告诉客户端消息端点 URL
 *    POST /messages 接收 JSON-RPC 消息，返回 202 Accepted（响应通过 GET 通道推送）
 *
 * 核心逻辑（initialize/tools/list/tools/call/...）见 services/mcpCore.ts 的 handleJsonRpcRequest
 * 这层只做协议适配（HTTP/SSE/stdio）
 */
import { Router } from 'express';
import { MCP_TOOLS, executeTool, listResources, readResource, PROMPT_TEMPLATES, handleJsonRpcRequest, SERVER_INFO } from '../services/mcpCore';

export const mcpRouter = Router();

mcpRouter.get('/', (_req, res) => {
  res.json({
    name: 'avm-mcp-server',
    version: '1.0.0',
    description: 'AVM 项目中心 MCP Server - 让外部 AI 工具（Claude/Cursor/Trae/aily）调用 AVM 数据',
    protocol: 'mcp-1.0',
    capabilities: { tools: true, resources: true, promptTemplates: true },
    tools_count: MCP_TOOLS.length,
    endpoints: {
      // Streamable HTTP（推荐）— Trae / Claude Desktop / Cursor
      streamableHttp: 'POST /api/mcp/stream (JSON-RPC, 返回 SSE)',
      // Legacy HTTP+SSE
      legacySse: 'GET /api/mcp/sse + POST /api/mcp/messages',
      // REST 便捷端点（也走 MCP 协议）
      listTools: 'GET /api/mcp/tools',
      callTool: 'POST /api/mcp/tools/:name',
      listResources: 'GET /api/mcp/resources',
      readResource: 'GET /api/mcp/resources/:uri',
      promptTemplates: 'GET /api/mcp/prompt-templates',
      // stdio 模式（最稳）
      stdio: '用 npx tsx src/bin/mcp-stdio.ts 启动 stdio 模式',
    },
  });
});

// ========== V1.8.5: Streamable HTTP 2025-03-26 规范 ==========
// Trae / Claude Desktop 配 "type": "http" 时用这个端点
mcpRouter.post('/stream', async (req, res) => {
  // 先设置 SSE 头（即使错误也走 SSE 格式，避免客户端 content-type 不匹配）
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');  // 禁用 nginx buffering
  res.flushHeaders?.();

  try {
    const req_ = req.body;
    if (!req_ || typeof req_ !== 'object' || !req_.method) {
      res.write(`event: message\ndata: ${JSON.stringify({
        jsonrpc: '2.0', id: req_?.id ?? null, error: { code: -32700, message: 'Invalid JSON-RPC request' }
      })}\n\n`);
      return res.end();
    }

    const resp = await handleJsonRpcRequest(req_);
    if (resp) {
      // SSE 格式：event: message\ndata: <json>\n\n
      res.write(`event: message\ndata: ${JSON.stringify(resp)}\n\n`);
    }
    res.end();
  } catch (e: any) {
    res.write(`event: message\ndata: ${JSON.stringify({
      jsonrpc: '2.0', id: null, error: { code: -32603, message: e.message }
    })}\n\n`);
    res.end();
  }
});

// ========== V1.8.5: Legacy HTTP+SSE 2024-11-05 规范 ==========
// 一些老版本客户端 (Claude Desktop 早期版本) 走这个
// 存所有活跃 SSE 连接，按 sessionId 路由响应
const sseSessions = new Map<string, { res: any; createdAt: number }>();
const SESSION_TTL_MS = 30 * 60 * 1000;  // 30 分钟

function cleanupSessions() {
  const now = Date.now();
  for (const [sid, s] of sseSessions) {
    if (now - s.createdAt > SESSION_TTL_MS) {
      try { s.res.end(); } catch {}
      sseSessions.delete(sid);
    }
  }
}
setInterval(cleanupSessions, 60_000).unref();

mcpRouter.get('/sse', (req, res) => {
  // 建立 SSE 连接
  const sessionId = Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();

  sseSessions.set(sessionId, { res, createdAt: Date.now() });

  // 1) 立即告诉客户端消息端点 URL
  const baseUrl = `${req.protocol}://${req.get('host')}`;
  res.write(`event: endpoint\ndata: ${baseUrl}/api/mcp/messages?sessionId=${sessionId}\n\n`);

  // 2) 心跳保持连接
  const heartbeat = setInterval(() => {
    try { res.write(`: keepalive\n\n`); } catch { clearInterval(heartbeat); }
  }, 15000);

  req.on('close', () => {
    clearInterval(heartbeat);
    sseSessions.delete(sessionId);
  });
});

mcpRouter.post('/messages', async (req, res) => {
  const sessionId = req.query.sessionId as string;
  const session = sessionId ? sseSessions.get(sessionId) : null;
  if (!session) {
    return res.status(400).json({ error: 'Invalid or expired sessionId' });
  }

  const req_ = req.body;
  if (!req_ || typeof req_ !== 'object' || !req_.method) {
    return res.status(400).json({ jsonrpc: '2.0', id: req_?.id ?? null, error: { code: -32700, message: 'Invalid JSON-RPC request' } });
  }

  // 先返回 202 Accepted (legacy 规范要求)，响应通过 SSE 通道推
  res.status(202).json({ accepted: true });

  try {
    const resp = await handleJsonRpcRequest(req_);
    if (resp) {
      session.res.write(`event: message\ndata: ${JSON.stringify(resp)}\n\n`);
    }
  } catch (e: any) {
    session.res.write(`event: message\ndata: ${JSON.stringify({
      jsonrpc: '2.0', id: req_?.id ?? null, error: { code: -32603, message: e.message }
    })}\n\n`);
  }
});

// ========== REST 便捷端点（也走 MCP 协议） ==========
mcpRouter.get('/tools', (_req, res) => {
  res.json({ tools: MCP_TOOLS });
});

mcpRouter.post('/tools/:name', async (req, res) => {
  try {
    const { name } = req.params;
    const tool = MCP_TOOLS.find(t => t.name === name);
    if (!tool) return res.status(404).json({ error: `Tool not found: ${name}` });
    const args = req.body || {};
    const result = await executeTool(name, args);
    res.json({ tool: name, args, result });
  } catch (e: any) {
    res.status(400).json({ error: e.message, tool: req.params.name });
  }
});

mcpRouter.get('/resources', async (_req, res) => {
  try {
    res.json({ resources: await listResources() });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

mcpRouter.get('/resources/:uri(*)', async (req, res) => {
  try {
    const uri = decodeURIComponent(req.params.uri);
    res.json(await readResource(uri));
  } catch (e: any) {
    res.status(404).json({ error: e.message });
  }
});

mcpRouter.get('/prompt-templates', (_req, res) => {
  res.json({ templates: PROMPT_TEMPLATES });
});

