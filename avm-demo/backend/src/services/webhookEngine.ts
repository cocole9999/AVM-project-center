/**
 * WebHook 触发器引擎
 * 事件驱动：触发器/自动化 → triggerWebhooks(event, payload) → 所有匹配的 webhook
 *
 * V1.14: 智能 IM 推送 — 按 URL 模式自动识别飞书/钉钉/企微，转换 payload
 *   - URL 含 feishu.cn  → 飞书机器人 interactive card
 *   - URL 含 dingtalk   → 钉钉机器人 markdown
 *   - URL 含 weixin.qq  → 企微 markdown
 *   - 其他               → 原样 JSON POST
 */
import { prisma } from '../db';
import crypto from 'crypto';

export async function triggerWebhooks(event: string, payload: any, configs?: any[]): Promise<{
  triggered: number;
  results: any[];
}> {
  let targets = configs;
  if (!targets) {
    targets = await prisma.webhookConfig.findMany({ where: { enabled: true } });
  }
  targets = targets.filter(c => {
    if (!c.events) return true; // 空表示接收所有
    const evs = c.events.split(',').map((e: string) => e.trim()).filter(Boolean);
    return evs.length === 0 || evs.some((e: string) => eventMatches(e, event));
  });

  const results: any[] = [];
  for (const c of targets) {
    const result = await sendWebhook(c, event, payload);
    results.push(result);
  }
  return { triggered: results.length, results };
}

function eventMatches(pattern: string, event: string): boolean {
  if (pattern === event) return true;
  if (pattern.endsWith('.*')) {
    const prefix = pattern.slice(0, -2);
    return event.startsWith(prefix + '.');
  }
  return false;
}

/** 根据 URL 判断 IM 类型 */
function detectIMChannel(url: string): 'feishu' | 'dingtalk' | 'wechatwork' | 'custom' {
  if (url.includes('feishu.cn') || url.includes('larksuite.com')) return 'feishu';
  if (url.includes('dingtalk') || url.includes('dingding')) return 'dingtalk';
  if (url.includes('qyapi.weixin.qq.com') || url.includes('weixin.qq')) return 'wechatwork';
  return 'custom';
}

/** 转换为飞书机器人 interactive card */
function toFeishuCard(event: string, payload: any): any {
  const { comment, workItemKey, workItemTitle, mentioned } = payload;
  const author = comment?.author || '系统';
  const mentionList = (mentioned || []).map((m: any) => m.displayName).join('、');
  return {
    msg_type: 'interactive',
    card: {
      header: {
        title: { tag: 'plain_text', content: `🔔 ${author} 在 ${workItemKey} 提到了你` },
      },
      elements: [
        {
          tag: 'markdown',
          content: `**${workItemKey}** ${workItemTitle || ''}\n\n${(comment?.content || '').slice(0, 300)}\n\n提及: ${mentionList}`,
        },
        {
          tag: 'note',
          elements: [{ tag: 'plain_text', content: `AVM 项目中心 · ${new Date().toLocaleString('zh-CN')}` }],
        },
        {
          tag: 'action',
          actions: [{
            tag: 'button',
            text: { tag: 'plain_text', content: '查看评论 →' },
            type: 'primary',
            url: `${process.env.AVM_BASE_URL || 'http://localhost:9000'}/work-items/${workItemKey}`,
          }],
        },
      ],
    },
  };
}

/** 转换为钉钉机器人 markdown */
function toDingtalkMarkdown(event: string, payload: any): any {
  const { comment, workItemKey, workItemTitle, mentioned } = payload;
  const author = comment?.author || '系统';
  const mentionList = (mentioned || []).map((m: any) => m.displayName).join('、');
  const url = `${process.env.AVM_BASE_URL || 'http://localhost:9000'}/work-items/${workItemKey}`;
  return {
    msgtype: 'markdown',
    markdown: {
      title: `${author} 在 ${workItemKey} 提到了你`,
      text: `### 🔔 ${author} 在 ${workItemKey} 提到了你\n\n**${workItemTitle || ''}**\n\n${(comment?.content || '').slice(0, 300)}\n\n提及: ${mentionList}\n\n[查看评论](${url})`,
    },
  };
}

/** 转换为企微机器人 markdown */
function toWechatWorkMarkdown(event: string, payload: any): any {
  const { comment, workItemKey, workItemTitle, mentioned } = payload;
  const author = comment?.author || '系统';
  const mentionList = (mentioned || []).map((m: any) => m.displayName).join('、');
  return {
    msgtype: 'markdown',
    markdown: {
      content: `## 🔔 <font color="warning">${author} 在 ${workItemKey} 提到了你</font>\n\n> **${workItemTitle || ''}**\n\n${(comment?.content || '').slice(0, 300)}\n\n提及: ${mentionList}`,
    },
  };
}

/** 按 IM 类型转 payload */
function transformPayloadForIM(channel: 'feishu' | 'dingtalk' | 'wechatwork' | 'custom', event: string, payload: any): any {
  if (channel === 'feishu') return toFeishuCard(event, payload);
  if (channel === 'dingtalk') return toDingtalkMarkdown(event, payload);
  if (channel === 'wechatwork') return toWechatWorkMarkdown(event, payload);
  return { event, payload, ts: new Date().toISOString() };
}

async function sendWebhook(config: any, event: string, payload: any): Promise<any> {
  const start = Date.now();
  const channel = detectIMChannel(config.url);
  const finalPayload = transformPayloadForIM(channel, event, payload);
  const body = JSON.stringify(finalPayload);
  let headers: any = {};
  try { headers = JSON.parse(config.headers || '{}'); } catch {}
  headers['Content-Type'] = 'application/json';
  headers['X-AVM-Event'] = event;
  headers['X-AVM-IM-Channel'] = channel;

  // 签名 (通用)
  if (config.secret) {
    const sig = crypto.createHmac('sha256', config.secret).update(body).digest('hex');
    headers['X-AVM-Signature'] = sig;
  }

  let status = 'success';
  let statusCode = 0;
  let response = '';
  let error = '';

  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 10000);
    const res = await fetch(config.url, { method: 'POST', headers, body, signal: ctrl.signal });
    clearTimeout(t);
    statusCode = res.status;
    response = (await res.text()).slice(0, 500);
    if (!res.ok) { status = 'failed'; error = `HTTP ${res.status}`; }
  } catch (e: any) {
    status = 'failed';
    error = e.message || 'fetch error';
  }

  const duration = Date.now() - start;

  // 写日志 + 更新统计
  await prisma.webhookLog.create({
    data: { configId: config.id, event, payload: body.slice(0, 1000), response, status, statusCode, duration, error },
  });
  await prisma.webhookConfig.update({
    where: { id: config.id },
    data: {
      totalCalls: { increment: 1 },
      successCalls: { increment: status === 'success' ? 1 : 0 },
      failedCalls: { increment: status === 'failed' ? 1 : 0 },
      lastCallAt: new Date(),
      lastCallStatus: status,
    },
  });

  return { configId: config.id, configName: config.name, event, status, statusCode, duration, error, channel };
}
