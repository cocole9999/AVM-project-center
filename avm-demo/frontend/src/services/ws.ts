/**
 * V1.15 WebSocket 客户端 (单例 + 自动重连)
 *
 * - 启动: connect(token) 建立 ws 连接
 * - 重连: 断线后按指数退避 (1s, 2s, 4s, 8s, max 30s) 自动重连
 * - 事件: subscribe(eventName, handler) / unsubscribe
 * - 事件类型:
 *   - 'connected' { user: { id, username, displayName } }
 *   - 'disconnected' { code, reason }
 *   - 'notification' { notification: { kind, title, content, link, ... } }
 *   - 'pong' { ts }
 *
 * 注意: 同一 token 多 tab 连接 → 后端会按 userId 聚合推送
 */
type WSMessage = { type: string; [k: string]: any };
type Handler = (msg: WSMessage) => void;

class WsClient {
  private ws: WebSocket | null = null;
  private url = '';
  private token = '';
  private handlers = new Map<string, Set<Handler>>();
  private reconnectAttempts = 0;
  private reconnectTimer: any = null;
  private pingTimer: any = null;
  private stopped = false;
  private status: 'idle' | 'connecting' | 'connected' | 'disconnected' | 'failed' = 'idle';
  private statusListeners = new Set<(s: string) => void>();

  /** 建立连接 (有 token 立即连接) */
  connect(token: string) {
    this.token = token;
    // 自动探测 host (从 location.host 拿 hostname, port 用 4001)
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = location.hostname || '127.0.0.1';
    this.url = `${proto}//${host}:4001/api/ws?token=${encodeURIComponent(token)}`;
    this.stopped = false;
    this.open();
  }

  private open() {
    if (this.stopped) return;
    if (!this.token) return;
    this.setStatus('connecting');
    try {
      this.ws = new WebSocket(this.url);
    } catch (e) {
      console.error('[ws] create failed:', e);
      this.scheduleReconnect();
      return;
    }
    this.ws.onopen = () => {
      this.setStatus('connected');
      this.reconnectAttempts = 0;
      this.startPing();
      this.emit({ type: 'connected', user: this.getCurrentUser() });
    };
    this.ws.onmessage = (ev) => {
      try {
        const m: WSMessage = JSON.parse(ev.data);
        if (m.type === 'pong') return; // 心跳不外抛
        this.emit(m);
      } catch (e) {
        console.error('[ws] parse error:', e);
      }
    };
    this.ws.onclose = (ev) => {
      this.cleanup();
      this.setStatus('disconnected');
      this.emit({ type: 'disconnected', code: ev.code, reason: ev.reason });
      if (!this.stopped) this.scheduleReconnect();
    };
    this.ws.onerror = (e) => {
      console.warn('[ws] error:', e);
      // onclose 会跟
    };
  }

  private scheduleReconnect() {
    if (this.stopped) return;
    if (this.reconnectTimer) return;
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
    this.reconnectAttempts++;
    console.log(`[ws] reconnect in ${delay}ms (attempt ${this.reconnectAttempts})`);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.open();
    }, delay);
  }

  private startPing() {
    if (this.pingTimer) return;
    this.pingTimer = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        try { this.ws.send(JSON.stringify({ type: 'ping' })); } catch {}
      }
    }, 25000);
  }

  private stopPing() {
    if (this.pingTimer) { clearInterval(this.pingTimer); this.pingTimer = null; }
  }

  private cleanup() {
    this.stopPing();
    if (this.ws) { try { this.ws.close(); } catch {} this.ws = null; }
  }

  disconnect() {
    this.stopped = true;
    if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null; }
    this.cleanup();
    this.setStatus('idle');
  }

  /** 订阅事件 (type === '*' 接收所有) */
  on(type: string, handler: Handler): () => void {
    if (!this.handlers.has(type)) this.handlers.set(type, new Set());
    this.handlers.get(type)!.add(handler);
    return () => this.off(type, handler);
  }

  off(type: string, handler: Handler) {
    this.handlers.get(type)?.delete(handler);
  }

  private emit(msg: WSMessage) {
    this.handlers.get(msg.type)?.forEach(h => { try { h(msg); } catch (e) { console.error(e); } });
    this.handlers.get('*')?.forEach(h => { try { h(msg); } catch (e) { console.error(e); } });
  }

  private getCurrentUser() {
    try {
      const raw = localStorage.getItem('avm-auth');
      if (!raw) return null;
      return JSON.parse(raw).user;
    } catch { return null; }
  }

  getStatus() { return this.status; }
  onStatusChange(fn: (s: string) => void): () => void {
    this.statusListeners.add(fn);
    fn(this.status);
    return () => { this.statusListeners.delete(fn); };
  }
  private setStatus(s: any) {
    this.status = s;
    this.statusListeners.forEach(fn => fn(s));
  }
}

export const wsClient = new WsClient();
