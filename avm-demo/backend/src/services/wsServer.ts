/**
 * V1.15 WebSocket 实时通知推送
 *
 * 客户端 (frontend) 用 ws://host/api/ws?token=xxx 连接
 * 服务端:
 *  - 验证 token (resolve to user)
 *  - 维护 userId -> Set<WebSocket> 映射 (一个用户多端)
 *  - 收到 pushToUser(userId, payload) 广播到该用户所有连接
 *  - 心跳: 每 30s ping，断线自动清理
 *
 * 推送场景:
 *  - comment.mention  (V1.14)
 *  - handover (V1.7)
 *  - automation rule triggered
 *  - risk.scan (V1.8.3 已有 dep_overdue)
 */
import { WebSocketServer, WebSocket } from 'ws';
import type { Server as HttpServer, IncomingMessage } from 'http';
import { prisma } from '../db';

const userConnections = new Map<string, Set<WebSocket>>();
let wss: WebSocketServer | null = null;
let startedAt = 0;

export function attachWsServer(server: HttpServer, path = '/api/ws') {
  if (wss) return wss;
  wss = new WebSocketServer({ noServer: true });
  startedAt = Date.now();

  // HTTP server 处理 upgrade 请求
  server.on('upgrade', (req, socket, head) => {
    const url = req.url || '';
    if (!url.startsWith(path)) {
      socket.destroy();
      return;
    }
    // 提取 token: ?token=xxx 或 Authorization 头
    let token: string | null = null;
    try {
      const u = new URL(url, 'http://localhost');
      token = u.searchParams.get('token');
    } catch {}
    if (!token) {
      const authHeader = req.headers['authorization'];
      if (authHeader && authHeader.startsWith('Bearer ')) {
        token = authHeader.slice(7);
      }
    }
    if (!token) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }
    wss!.handleUpgrade(req, socket, head, (ws) => {
      handleConnection(ws, token!, req);
    });
  });

  // 心跳检测
  setInterval(() => {
    wss?.clients.forEach((ws: any) => {
      if (ws.isAlive === false) return ws.terminate();
      ws.isAlive = false;
      try { ws.ping(); } catch {}
    });
  }, 30000);

  console.log(`[ws] Server attached at ${path}`);
  return wss;
}

async function handleConnection(ws: WebSocket, token: string, req: IncomingMessage) {
  // 验证 token
  const user = await prisma.user.findFirst({ where: { token }, select: { id: true, username: true, displayName: true, role: true, active: true } });
  if (!user || !user.active) {
    ws.close(4401, 'invalid token');
    return;
  }
  // 注册连接
  if (!userConnections.has(user.id)) userConnections.set(user.id, new Set());
  userConnections.get(user.id)!.add(ws);
  console.log(`[ws] ${user.username} connected (${userConnections.get(user.id)!.size} sessions)`);

  (ws as any).isAlive = true;
  (ws as any).userId = user.id;
  (ws as any).username = user.username;

  // 欢迎消息
  send(ws, { type: 'connected', user: { id: user.id, username: user.username, displayName: user.displayName } });

  ws.on('pong', () => { (ws as any).isAlive = true; });
  ws.on('message', (raw) => {
    // 客户端心跳 / ping
    try {
      const m = JSON.parse(raw.toString());
      if (m.type === 'ping') {
        send(ws, { type: 'pong', ts: Date.now() });
      } else if (m.type === 'subscribe' && m.topic) {
        (ws as any).subscriptions = (ws as any).subscriptions || new Set();
        (ws as any).subscriptions.add(m.topic);
      }
    } catch {}
  });
  ws.on('close', () => cleanupConnection(ws, user.id));
  ws.on('error', () => cleanupConnection(ws, user.id));
}

function cleanupConnection(ws: WebSocket, userId: string) {
  const set = userConnections.get(userId);
  if (set) {
    set.delete(ws);
    if (set.size === 0) userConnections.delete(userId);
  }
}

function send(ws: WebSocket, payload: any) {
  if (ws.readyState === WebSocket.OPEN) {
    try { ws.send(JSON.stringify(payload)); } catch {}
  }
}

/**
 * 推送给指定 user (所有连接)
 */
export function pushToUser(userId: string, payload: any): number {
  const set = userConnections.get(userId);
  if (!set || set.size === 0) return 0;
  const data = JSON.stringify({ ...payload, ts: Date.now() });
  let n = 0;
  set.forEach(ws => {
    if (ws.readyState === WebSocket.OPEN) {
      try { ws.send(data); n++; } catch {}
    }
  });
  return n;
}

/**
 * 推送给所有连接 (广播, e.g. 系统通知)
 */
export function broadcastAll(payload: any): number {
  if (!wss) return 0;
  const data = JSON.stringify({ ...payload, ts: Date.now() });
  let n = 0;
  wss.clients.forEach(ws => {
    if (ws.readyState === WebSocket.OPEN) {
      try { ws.send(data); n++; } catch {}
    }
  });
  return n;
}

/**
 * 推送给指定角色的所有 user (e.g. 全部 admin)
 */
export async function pushToRole(role: string, payload: any): Promise<number> {
  const users = await prisma.user.findMany({ where: { role, active: true }, select: { id: true } });
  let n = 0;
  for (const u of users) n += pushToUser(u.id, payload);
  return n;
}

/**
 * 统计当前在线连接
 */
export function getStats() {
  const userCount = userConnections.size;
  let sessionCount = 0;
  userConnections.forEach(set => { sessionCount += set.size; });
  return {
    startedAt,
    uptimeMs: Date.now() - startedAt,
    connectedUsers: userCount,
    activeSessions: sessionCount,
  };
}
