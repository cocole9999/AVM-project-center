/**
 * V1.14 评论路由 — 鉴权 + @提及解析 + 通知触发
 *
 * POST   /api/comments          - 添加评论 (自动解析 @提及 → 通知 + IM 推送)
 * GET    /api/comments?workItemId=...  列出
 * DELETE /api/comments/:id      - 删除 (admin 或作者)
 */
import { Router } from 'express';
import { prisma } from '../db';
import { requireAuth } from '../middleware/auth';
import { recordAudit, actorFromReq } from '../utils/audit';
import { parseMentions, resolveMentions, notifyMentions } from '../utils/mentions';

export const commentRouter = Router();

commentRouter.use(requireAuth);

// 列出某 workItem 的评论
commentRouter.get('/', async (req, res) => {
  const { workItemId, limit } = req.query as Record<string, string | undefined>;
  if (!workItemId) return res.status(400).json({ error: 'workItemId required' });
  const items = await prisma.comment.findMany({
    where: { workItemId },
    orderBy: { createdAt: 'asc' },
    take: limit ? Number(limit) : 200,
  });
  res.json(items);
});

// 添加评论 — 解析 @提及 + 触发通知
commentRouter.post('/', async (req, res) => {
  try {
    const { workItemId, author, content, imageUrl } = req.body;
    if (!workItemId || (!content?.trim() && !imageUrl)) {
      return res.status(400).json({ error: 'workItemId and (content or imageUrl) required' });
    }
    // 优先用登录用户
    const finalAuthor = req.user?.displayName || author || '匿名';
    const comment = await prisma.comment.create({
      data: {
        workItemId,
        author: finalAuthor,
        content: (content || '').trim(),
        imageUrl: imageUrl || null,
      },
    });
    await prisma.activity.create({
      data: {
        workItemId, actor: finalAuthor,
        action: 'commented',
        meta: content.slice(0, 200),
      },
    });
    // 解析 @提及 → 通知 + IM 推送
    let mentionCount = 0;
    const mentions = parseMentions(content);
    if (mentions.length > 0) {
      const resolved = await resolveMentions(mentions);
      // 查 workItem 信息
      const wi = await prisma.workItem.findUnique({
        where: { id: workItemId },
        select: { id: true, key: true, title: true },
      });
      if (wi) {
        await notifyMentions(
          { id: comment.id, workItemId, author: finalAuthor, content: content.trim() },
          resolved,
          wi,
        );
        mentionCount = resolved.length;
      }
    }
    recordAudit('workItem', workItemId, 'update', null, { method: 'POST', summary: `${finalAuthor} 评论 (提及 ${mentionCount} 人)` }, actorFromReq(req));
    res.status(201).json({ ...comment, mentionCount });
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

// 删除
commentRouter.delete('/:id', async (req, res) => {
  try {
    const before = await prisma.comment.findUnique({ where: { id: req.params.id } });
    if (!before) return res.status(404).json({ error: 'Comment not found' });
    // 作者或 admin (tenant_admin) 可删
    if (req.user?.role !== 'tenant_admin' && req.user?.displayName !== before.author) {
      return res.status(403).json({ error: '只有作者或租户管理员可删除' });
    }
    await prisma.comment.delete({ where: { id: req.params.id } });
    recordAudit('workItem', before.workItemId, 'update', null, { method: 'DELETE', summary: `${req.user?.displayName || '?'} 删除评论` }, actorFromReq(req));
    res.status(204).end();
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

// V1.28 评论 reactions: 点 emoji 加/减
// POST /api/comments/:id/react  body: { emoji: '👍', user: '张三' }
// reactions 字段是 JSON: { "👍": ["user1", "user2"], "❤️": ["user3"] }
const ALLOWED_EMOJIS = new Set(['👍', '❤️', '🎉', '🚀', '✅', '😄', '🤔', '👀']);
commentRouter.post('/:id/react', async (req, res) => {
  try {
    const { id } = req.params;
    const { emoji, user } = req.body;
    if (!emoji || !ALLOWED_EMOJIS.has(emoji)) return res.status(400).json({ error: 'invalid emoji, 必须是允许的表情之一' });
    if (!user || typeof user !== 'string') return res.status(400).json({ error: 'user required' });
    const before = await prisma.comment.findUnique({ where: { id } });
    if (!before) return res.status(404).json({ error: 'Comment not found' });
    let reactions: Record<string, string[]> = {};
    try { reactions = JSON.parse(before.reactions || '{}'); } catch { reactions = {}; }
    const list = reactions[emoji] || [];
    const idx = list.indexOf(user);
    if (idx >= 0) {
      list.splice(idx, 1);
    } else {
      list.push(user);
    }
    if (list.length === 0) delete reactions[emoji];
    else reactions[emoji] = list;
    const updated = await prisma.comment.update({
      where: { id },
      data: { reactions: JSON.stringify(reactions) },
    });
    res.json({ ok: true, reactions, action: idx >= 0 ? 'removed' : 'added' });
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});
