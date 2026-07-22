#!/usr/bin/env node
/**
 * AVM MCP Server - stdio 模式 (V1.8.5)
 *
 * 用于 Claude Desktop / Cursor / Trae / 其它支持 MCP 协议的客户端。
 * 走 stdin/stdout JSON-RPC 2.0，每行一个请求。
 * 核心逻辑委托给 services/mcpCore.ts 的 handleJsonRpcRequest
 *
 * 启动方式（Trae / Claude Desktop 配置）：
 *   {
 *     "mcpServers": {
 *       "avm": {
 *         "command": "npx",
 *         "args": ["tsx", "D:/AI/飞书项目/avm-demo/backend/src/bin/mcp-stdio.ts"]
 *       }
 *     }
 *   }
 *
 * 或打包后直接 node 跑编译产物。
 */
import { handleJsonRpcRequest, SERVER_INFO } from '../services/mcpCore';

function send(msg: any) {
  // 写一行 JSON 到 stdout
  process.stdout.write(JSON.stringify(msg) + '\n');
  // 显式 flush（避免 pipe 关闭时丢数据）
  if (typeof (process.stdout as any)._handle?.flush === 'function') {
    try { (process.stdout as any)._handle.flush(); } catch {}
  }
}

function sendError(id: number | string | null, code: number, message: string, data?: any) {
  send({ jsonrpc: '2.0', id, error: { code, message, data } });
}

// ========== 主循环 ==========
const pendingPromises: Promise<any>[] = [];
let buffer = '';
process.stdin.setEncoding('utf-8');
process.stdin.on('data', (chunk) => {
  buffer += chunk;
  let idx;
  while ((idx = buffer.indexOf('\n')) >= 0) {
    const line = buffer.slice(0, idx).trim();
    buffer = buffer.slice(idx + 1);
    if (!line) continue;
    try {
      const req = JSON.parse(line);
      const p = handleJsonRpcRequest(req).then((resp) => {
        if (resp) send(resp);
      });
      pendingPromises.push(p);
    } catch (e: any) {
      sendError(null, -32700, `Parse error: ${e.message}`);
    }
  }
});

process.stdin.on('end', async () => {
  await Promise.allSettled(pendingPromises);
  // 给 stdout 一小段时间 flush
  setTimeout(() => process.exit(0), 50);
});

process.stderr.write(`[avm-mcp-stdio] started ${SERVER_INFO.name} v${SERVER_INFO.version}\n`);
