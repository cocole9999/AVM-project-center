/**
 * V1.14 提及解析 + 通知触发
 *
 * - parseMentions(content) 提取所有 @username 提及
 *   支持: @admin / @张三 / @"李四（研发一组）"
 * - resolveMentions(usernames) → userIds
 * - notifyMention(comment, mentionedUsers, workItem) 创建 mention 通知
 * - sendIMPush 通过 webhook 推送到飞书/钉钉/企微
 */
import { prisma } from '../db';
import { triggerWebhooks } from '../services/webhookEngine';
import { pushToUser } from '../services/wsServer';

const MENTION_RE = /@["']?([\u4e00-\u9fa5\w\s（）()\.\-]+?)["']?(?=\s|$|[,，。.!？?；;:\n])/g;

export interface ParsedMention {
  raw: string;        // 原始 mention 字符串（不含 @）
  text: string;       // 清理后
}

/**
 * 提取内容里所有 @提及 — 简单 regex，匹配 "@张三" "@李四（研发一组）" "@admin"
 * 返回 ParsedMention[] 去重
 */
export function parseMentions(content: string): ParsedMention[] {
  if (!content) return [];
  const seen = new Set<string>();
  const out: ParsedMention[] = [];
  let m;
  // 重置 regex state
  const re = new RegExp(MENTION_RE.source, 'g');
  while ((m = re.exec(content)) !== null) {
    const text = m[1].trim();
    if (!text || text.length > 30) continue;
    if (seen.has(text)) continue;
    seen.add(text);
    out.push({ raw: m[0], text });
  }
  return out;
}

/**
 * 把 mention 解析成 user 列表 — 支持 username / displayName / 部门
 */
export async function resolveMentions(mentions: ParsedMention[]): Promise<Array<{ user: any; matched: string }>> {
  if (mentions.length === 0) return [];
  const out: Array<{ user: any; matched: string }> = [];
  for (const m of mentions) {
    // 先精确匹配 username / displayName
    let u = await prisma.user.findFirst({
      where: { OR: [
        { username: m.text },
        { displayName: m.text },
      ] },
    });
    // 模糊匹配 (displayName 包含)
    if (!u) {
      u = await prisma.user.findFirst({
        where: { displayName: { contains: m.text } },
      });
    }
    if (u) {
      // 避免重复
      if (!out.find(o => o.user.id === u!.id)) {
        out.push({ user: u, matched: m.text });
      }
    }
  }
  return out;
}

/**
 * 创建 mention 通知 (给每个被提及用户) + 通过 webhook 推送 IM
 */
export async function notifyMentions(
  comment: { id: string; workItemId: string; author: string; content: string },
  mentionedUsers: Array<{ user: any; matched: string }>,
  workItem: { id: string; key: string; title: string },
) {
  if (mentionedUsers.length === 0) return;

  // 1. 入库 Notification
  const notifIds: string[] = [];
  for (const { user, matched } of mentionedUsers) {
    // 不要给自己发通知
    if (user.username === comment.author || user.displayName === comment.author) continue;
    const n = await prisma.notification.create({
      data: {
        recipientId: user.username,
        type: 'mention',
        level: 'info',
        title: `${comment.author} 在 ${workItem.key} 提到了你`,
        content: comment.content.slice(0, 200),
        link: `/work-items/${workItem.key}`,
        meta: JSON.stringify({
          workItemId: workItem.id,
          workItemKey: workItem.key,
          workItemTitle: workItem.title,
          commentId: comment.id,
          author: comment.author,
          matched,
        }),
      },
    });
    notifIds.push(n.id);
  }

  // 2. 触发 webhook (异步，不阻塞)
  // 1.5 V1.15: WebSocket 实时推送给每个被提及用户
  for (const { user, matched } of mentionedUsers) {
    if (user.username === comment.author || user.displayName === comment.author) continue;
    pushToUser(user.id, {
      type: 'notification',
      notification: {
        kind: 'mention',
        title: `${comment.author} 在 ${workItem.key} 提到了你`,
        content: comment.content.slice(0, 200),
        link: `/work-items/${workItem.key}`,
        workItemId: workItem.id,
        workItemKey: workItem.key,
        workItemTitle: workItem.title,
        author: comment.author,
        matched,
        notifIds,
      },
    });
  }

  // 2. 触发 webhook (异步，不阻塞)
  const payload = {
    event: 'comment.mention',
    comment: {
      id: comment.id,
      author: comment.author,
      content: comment.content,
      workItemId: comment.workItemId,
      workItemKey: workItem.key,
      workItemTitle: workItem.title,
    },
    mentioned: mentionedUsers.map(m => ({
      username: m.user.username,
      displayName: m.user.displayName,
      matched: m.matched,
    })),
    notifIds,
  };
  // 查找匹配 comment.mention 事件的 webhook
  triggerWebhooks('comment.mention', payload).catch(e => {
    console.error('[mention] webhook push error:', e.message);
  });
}

/**
 * 飞书机器人 markdown 格式 (标准 webhook bot)
 * 钉钉 / 企微也支持 markdown，转换在 webhookEngine 内部按 channel 区分
 */
export function toFeishuMarkdown(payload: any): any {
  const { comment, workItemKey, workItemTitle } = payload;
  return {
    msg_type: 'interactive',
    card: {
      header: {
        title: { tag: 'plain_text', content: `🔔 ${comment.author} 在 ${workItemKey} 提到了你` },
      },
      elements: [
        {
          tag: 'markdown',
          content: `**${workItemKey}** ${workItemTitle}\n\n${comment.content.slice(0, 300)}`,
        },
        {
          tag: 'note',
          elements: [
            { tag: 'plain_text', content: `AVM 项目中心 · ${new Date().toLocaleString('zh-CN')}` },
          ],
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
