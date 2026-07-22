/**
 * 企业版 SSO 路由
 * - Tenant 租户 CRUD
 * - SSOSetting 配置管理
 * - 飞书 OAuth 登录跳转 + 回调
 * - SSO 登录日志
 */
import { Router } from 'express';
import crypto from 'crypto';
import { prisma } from '../db';
import { env } from '../env';

export const ssoRouter = Router();

// ========== 租户管理 ==========

ssoRouter.get('/tenants', async (_req, res) => {
  const list = await prisma.tenant.findMany({ orderBy: { createdAt: 'desc' } });
  // 不返回 secrets
  res.json(list.map((t: any) => { const { ssoSettings, ssoLogs, ...rest } = t; return rest; }));
});

ssoRouter.post('/tenants', async (req, res) => {
  try {
    const { code, name, shortName, logo, industry, scale, contact, phone, plan, maxUsers } = req.body;
    const t = await prisma.tenant.create({
      data: {
        code, name, shortName: shortName || '', logo: logo || '',
        industry: industry || '', scale: scale || '',
        contact: contact || '', phone: phone || '',
        plan: plan || 'standard', maxUsers: maxUsers || 100,
      },
    });
    res.status(201).json(t);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

ssoRouter.patch('/tenants/:id', async (req, res) => {
  try {
    const t = await prisma.tenant.update({ where: { id: req.params.id }, data: req.body });
    res.json(t);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

ssoRouter.delete('/tenants/:id', async (req, res) => {
  await prisma.tenant.delete({ where: { id: req.params.id } });
  res.status(204).end();
});

ssoRouter.get('/tenants/:id/stats', async (req, res) => {
  const [users, spaces, ssoLogs, settings] = await Promise.all([
    prisma.user.count({ where: { tenantId: req.params.id } }),
    prisma.space.count({ where: { ownerId: { in: (await prisma.user.findMany({ where: { tenantId: req.params.id }, select: { username: true } })).map(u => u.username) } } }),
    prisma.sSOLog.findMany({ where: { tenantId: req.params.id }, orderBy: { createdAt: 'desc' }, take: 20 }),
    prisma.sSOSetting.findMany({ where: { tenantId: req.params.id } }),
  ]);
  res.json({ userCount: users, ssoLogCount: ssoLogs.length, ssoSettings: settings, recentLogs: ssoLogs });
});

// ========== SSO 配置 ==========

ssoRouter.get('/tenants/:tenantId/settings', async (req, res) => {
  const list = await prisma.sSOSetting.findMany({ where: { tenantId: req.params.tenantId } });
  // appSecret 脱敏
  res.json(list.map(s => ({ ...s, appSecret: s.appSecret ? '***' + s.appSecret.slice(-4) : '' })));
});

ssoRouter.put('/tenants/:tenantId/settings/:provider', async (req, res) => {
  try {
    const { enabled, appId, appSecret, redirectUri, corpId, agentId, config } = req.body;
    const s = await prisma.sSOSetting.upsert({
      where: { tenantId_provider: { tenantId: req.params.tenantId, provider: req.params.provider } },
      update: { enabled, appId, appSecret, redirectUri, corpId, agentId, config: config || '{}' },
      create: {
        tenantId: req.params.tenantId, provider: req.params.provider,
        enabled, appId, appSecret, redirectUri, corpId, agentId, config: config || '{}',
      },
    });
    res.json({ ...s, appSecret: s.appSecret ? '***' + s.appSecret.slice(-4) : '' });
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

ssoRouter.delete('/tenants/:tenantId/settings/:provider', async (req, res) => {
  await prisma.sSOSetting.delete({
    where: { tenantId_provider: { tenantId: req.params.tenantId, provider: req.params.provider } },
  });
  res.status(204).end();
});

// ========== 飞书 OAuth ==========

// 生成 state 防 CSRF
const stateStore = new Map<string, { tenantId: string; provider: string; ts: number }>();

ssoRouter.get('/oauth/:provider/login', async (req, res) => {
  try {
    const { tenantId } = req.query;
    if (!tenantId) return res.status(400).json({ error: 'tenantId required' });
    const setting = await prisma.sSOSetting.findUnique({
      where: { tenantId_provider: { tenantId: String(tenantId), provider: req.params.provider } },
    });
    if (!setting || !setting.enabled) return res.status(400).json({ error: 'SSO not enabled' });

    const state = crypto.randomBytes(16).toString('hex');
    stateStore.set(state, { tenantId: String(tenantId), provider: req.params.provider, ts: Date.now() });
    // 清理过期 state（5 分钟）
    for (const [k, v] of stateStore.entries()) {
      if (Date.now() - v.ts > 300000) stateStore.delete(k);
    }

    if (req.params.provider === 'feishu') {
      const redirectUri = setting.redirectUri || env.FEISHU_REDIRECT_URI;
      const url = `https://passport.feishu.cn/suite/passport/oauth/authorize?app_id=${setting.appId}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}`;
      res.json({ authUrl: url, state });
    } else {
      res.status(400).json({ error: `Provider ${req.params.provider} not implemented in demo` });
    }
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// 通用：模拟 SSO 登录（演示用，生产要走真实 OAuth 流程）
ssoRouter.post('/oauth/:provider/demo-login', async (req, res) => {
  try {
    const { tenantId, openId, userName, email } = req.body;
    if (!tenantId || !openId) return res.status(400).json({ error: 'tenantId and openId required' });

    // 1. 查找或创建用户
    let user = await prisma.user.findFirst({ where: { tenantId, feishuOpenId: openId } });
    if (!user) {
      // 默认密码 hash（演示用 'sso'）；username 用完整 openId 避免冲突
      const username = `sso_${tenantId.slice(-6)}_${openId}`;
      user = await prisma.user.create({
        data: {
          username,
          displayName: userName || `SSO用户${openId.slice(0, 4)}`,
          email: email || null,
          password: 'sso',
          tenantId,
          feishuOpenId: openId,
          ssoBound: true,
          role: 'member',
        },
      });
    } else {
      user = await prisma.user.update({
        where: { id: user.id },
        data: { lastLoginAt: new Date(), ssoBound: true },
      });
    }

    // 2. 写日志
    await prisma.sSOLog.create({
      data: {
        tenantId, provider: req.params.provider, userKey: openId,
        userName: user.displayName, action: 'login', success: true,
        ip: req.ip || '', userAgent: req.headers['user-agent'] || '',
      },
    });

    // 3. 签发 token（演示用 cuid + user.id）
    const token = crypto.randomBytes(24).toString('hex');

    res.json({
      token,
      user: { id: user.id, username: user.username, displayName: user.displayName, role: user.role, tenantId: user.tenantId, ssoBound: user.ssoBound },
      tenantId,
    });
  } catch (e: any) {
    console.error('[demo-login] error full:', JSON.stringify({msg: e.message, code: e.code, meta: e.meta}, null, 2));
    res.status(500).json({ error: e.message, code: e.code, meta: e.meta });
  }
});

// 飞书 OAuth 真实回调（用 code 换 token，再拉用户信息）
ssoRouter.get('/oauth/feishu/callback', async (req, res) => {
  try {
    const { code, state } = req.query;
    if (!code || !state) return res.status(400).send('Missing code or state');
    const s = stateStore.get(String(state));
    if (!s) return res.status(400).send('Invalid or expired state');
    stateStore.delete(String(state));

    const setting = await prisma.sSOSetting.findUnique({
      where: { tenantId_provider: { tenantId: s.tenantId, provider: 'feishu' } },
    });
    if (!setting) return res.status(400).send('SSO not configured');

    // 1. 拿 app_access_token
    const appTokenRes = await fetch('https://open.feishu.cn/open-apis/auth/v3/app_access_token/internal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ app_id: setting.appId, app_secret: setting.appSecret }),
    });
    const appTokenData: any = await appTokenRes.json();
    if (appTokenData.code !== 0) throw new Error(`飞书 app_access_token 失败: ${appTokenData.msg}`);

    // 2. 拿 user_access_token
    const userTokenRes = await fetch('https://open.feishu.cn/open-apis/authen/v1/index', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${appTokenData.app_access_token}`,
      },
      body: JSON.stringify({ grant_type: 'authorization_code', code: String(code) }),
    });
    // 注：飞书 OAuth 实际是前端用 code 调 /authen/v1/oidc/access_token，
    // 这里给出的是后端流程示意。生产应按官方文档实现。
    res.status(501).send('飞书 OAuth 回调实现需参考官方文档配置 OIDC，重定向到前端 /sso/feishu/callback?code=...');
  } catch (e: any) {
    await prisma.sSOLog.create({
      data: {
        tenantId: '', provider: 'feishu', userKey: '', userName: '',
        action: 'login', success: false, errorMsg: e.message,
      },
    });
    res.status(500).send(`OAuth 错误: ${e.message}`);
  }
});

// ========== 用户解绑 / 绑定 SSO ==========
ssoRouter.post('/users/:id/bind-sso', async (req, res) => {
  try {
    const { provider, openId } = req.body;
    const data: any = { ssoBound: true };
    if (provider === 'feishu') data.feishuOpenId = openId;
    else if (provider === 'dingtalk') data.dingtalkId = openId;
    else if (provider === 'wechatwork') data.wechatworkId = openId;
    const u = await prisma.user.update({ where: { id: req.params.id }, data });
    res.json(u);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

ssoRouter.post('/users/:id/unbind-sso', async (req, res) => {
  const u = await prisma.user.update({
    where: { id: req.params.id },
    data: { ssoBound: false, feishuOpenId: null, dingtalkId: null, wechatworkId: null },
  });
  res.json(u);
});

// ========== SSO 登录日志 ==========
ssoRouter.get('/logs', async (req, res) => {
  const list = await prisma.sSOLog.findMany({
    where: req.query.tenantId ? { tenantId: String(req.query.tenantId) } : undefined,
    orderBy: { createdAt: 'desc' },
    take: Number(req.query.limit) || 50,
  });
  res.json(list);
});
