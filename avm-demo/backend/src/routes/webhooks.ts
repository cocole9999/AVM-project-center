/**
 * WebHook 出站 + 接收
 */
import { Router } from 'express';
import { prisma } from '../db';
import { triggerWebhooks } from '../services/webhookEngine';
import { requireAuth, autoRole } from '../middleware/auth';

export const webhookRouter = Router();

// V1.11: 鉴权 + 写保护
webhookRouter.use(requireAuth);
webhookRouter.use(autoRole());

// 列出 Webhook
webhookRouter.get('/configs', async (req, res) => {
  try {
    const { spaceId } = req.query as any;
    const where: any = {};
    if (spaceId) where.spaceId = spaceId;
    const list = await prisma.webhookConfig.findMany({ where, orderBy: { createdAt: 'desc' } });
    res.json(list);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

webhookRouter.get('/configs/:id', async (req, res) => {
  const c = await prisma.webhookConfig.findUnique({ where: { id: req.params.id } });
  if (!c) return res.status(404).json({ error: 'Not found' });
  res.json(c);
});

webhookRouter.post('/configs', async (req, res) => {
  try {
    const { spaceId, name, url, events, headers, secret, enabled, retryCount, createdBy } = req.body;
    if (!name || !url) return res.status(400).json({ error: 'name, url required' });
    const c = await prisma.webhookConfig.create({
      data: {
        spaceId: spaceId || null, name, url, events: events || '',
        headers: typeof headers === 'string' ? headers : JSON.stringify(headers || {}),
        secret: secret || '',
        enabled: enabled !== false,
        retryCount: retryCount ?? 3,
        createdBy: createdBy || null,
      },
    });
    res.status(201).json(c);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

webhookRouter.patch('/configs/:id', async (req, res) => {
  try {
    const c = await prisma.webhookConfig.update({ where: { id: req.params.id }, data: req.body });
    res.json(c);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

webhookRouter.delete('/configs/:id', async (req, res) => {
  try {
    await prisma.webhookConfig.delete({ where: { id: req.params.id } });
    res.status(204).end();
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

// 测试发送
webhookRouter.post('/configs/:id/test', async (req, res) => {
  try {
    const c = await prisma.webhookConfig.findUnique({ where: { id: req.params.id } });
    if (!c) return res.status(404).json({ error: 'Not found' });
    const payload = req.body.payload || { test: true, message: 'AVM Webhook test' };
    const event = req.body.event || 'webhook.test';
    const result = await triggerWebhooks(event, payload, [c]);
    res.json(result);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

// 接收外部 Webhook (V1.27: 验证 token 匹配 WebhookConfig.secret 或 config.id)
webhookRouter.post('/inbox/:token', async (req, res) => {
  try {
    const { token } = req.params;
    if (!token || token.length < 8) {
      return res.status(401).json({ error: 'invalid webhook token' });
    }
    // 优先按 secret 查, 其次按 id (cuid 长度也 >=20)
    const config = await prisma.webhookConfig.findFirst({
      where: { OR: [{ secret: token }, { id: token }], enabled: true },
    });
    if (!config) {
      console.warn('[Webhook Inbox] 未授权 token:', token.slice(0, 8) + '***');
      return res.status(401).json({ error: 'invalid webhook token' });
    }
    console.log('[Webhook Inbox] matched config:', config.id, config.name);
    res.json({ ok: true, configId: config.id, received: req.body });
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

// 调用日志
webhookRouter.get('/logs', async (req, res) => {
  try {
    const { configId, limit } = req.query as any;
    const where: any = {};
    if (configId) where.configId = configId;
    const list = await prisma.webhookLog.findMany({
      where, orderBy: { createdAt: 'desc' }, take: Number(limit) || 50,
    });
    res.json(list);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});
