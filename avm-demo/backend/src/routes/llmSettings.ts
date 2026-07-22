/**
 * LLM 设置管理
 * - 列表 / 详情 / 创建 / 更新 / 删除
 * - 测试连接
 * - 状态查询
 * - 标记主 provider
 */
import { Router } from 'express';
import { prisma } from '../db';
import { PROVIDERS, getLLMStatus, testProvider, clearLLMCache, OpenAICompatibleProvider, AnthropicProvider, getAvailableModels } from '../services/llmProvider';

export const llmSettingsRouter = Router();

// 列出所有 provider 的设置（合并 PROVIDERS 元数据）
llmSettingsRouter.get('/', async (_req, res) => {
  const settings = await prisma.lLMSettings.findMany({ orderBy: { createdAt: 'asc' } });
  // 隐藏 apiKey 完整值（只显示前后几位）
  const masked = settings.map(s => ({ ...s, apiKey: s.apiKey ? maskKey(s.apiKey) : '' }));
  // 已配置的 provider 列表（用于"切换厂商"UI），按 primary 优先 + 已启用 + 创建时间排序
  const activeProviders = masked
    .filter(s => s.apiKey)  // 只列已配置 key 的
    .map(s => {
      const meta = PROVIDERS.find(p => p.key === s.provider);
      return {
        key: s.provider,
        name: s.name || meta?.name || s.provider,
        logo: meta?.logo,
        model: s.currentModel || s.model,
        enabled: s.enabled,
        isPrimary: s.isPrimary,
        protocol: meta?.protocol,
      };
    })
    .sort((a, b) => (b.isPrimary ? 1 : 0) - (a.isPrimary ? 1 : 0));
  res.json({ providers: PROVIDERS, settings: masked, status: await getLLMStatus(), activeProviders });
});

function maskKey(k: string): string {
  if (k.length <= 8) return '***';
  return k.slice(0, 4) + '***' + k.slice(-4);
}

llmSettingsRouter.get('/:provider', async (req, res) => {
  const s = await prisma.lLMSettings.findUnique({ where: { provider: req.params.provider } });
  if (!s) return res.json({ provider: req.params.provider, configured: false });
  res.json({ ...s, apiKey: s.apiKey ? maskKey(s.apiKey) : '' });
});

// 创建 / 更新（upsert）
llmSettingsRouter.put('/:provider', async (req, res) => {
  try {
    const { name, baseUrl, apiKey, model, temperature, maxTokens, enabled, isPrimary, note, extra, customModels, currentModel } = req.body;
    const meta = PROVIDERS.find(p => p.key === req.params.provider);
    if (!meta) return res.status(400).json({ error: `未知 provider: ${req.params.provider}` });
    // 如果没传 apiKey，保留原值
    const existing = await prisma.lLMSettings.findUnique({ where: { provider: req.params.provider } });
    const finalKey = apiKey !== undefined && apiKey !== '' && !apiKey.includes('***')
      ? apiKey
      : (existing?.apiKey || '');
    if (isPrimary) {
      // 取消其他主 provider
      await prisma.lLMSettings.updateMany({ where: { isPrimary: true, NOT: { provider: req.params.provider } }, data: { isPrimary: false } });
    }
    const updateData: any = {
      name: name || meta.name,
      // baseUrl：空字符串 / undefined 都 fallback 到默认（用户清空字段也能恢复默认）
      baseUrl: (baseUrl && baseUrl.trim()) ? baseUrl.trim() : meta.defaultBaseUrl,
      apiKey: finalKey,
      model: (model && model.trim()) ? model.trim() : meta.defaultModel,
      temperature: temperature ?? 0.3,
      maxTokens: maxTokens ?? 2048,
      enabled: enabled ?? true,
      isPrimary: isPrimary ?? false,
      note: note ?? '',
      extra: extra ?? '{}',
    };
    if (customModels !== undefined) updateData.customModels = JSON.stringify(customModels);
    if (currentModel !== undefined) updateData.currentModel = currentModel;
    const s = await prisma.lLMSettings.upsert({
      where: { provider: req.params.provider },
      update: updateData,
      create: {
        provider: req.params.provider,
        ...updateData,
        customModels: customModels !== undefined ? JSON.stringify(customModels) : '[]',
        currentModel: currentModel || '',
      },
    });
    clearLLMCache();
    res.json({ ...s, apiKey: s.apiKey ? maskKey(s.apiKey) : '' });
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

llmSettingsRouter.delete('/:provider', async (req, res) => {
  await prisma.lLMSettings.delete({ where: { provider: req.params.provider } }).catch(() => {});
  clearLLMCache();
  res.status(204).end();
});

llmSettingsRouter.post('/:provider/test', async (req, res) => {
  const meta = PROVIDERS.find(p => p.key === req.params.provider);
  if (!meta) return res.status(400).json({ error: `未知 provider: ${req.params.provider}` });
  // 优先用请求体传入的（测试新值），fallback 到 DB
  let apiKey = req.body.apiKey;
  let baseUrl = req.body.baseUrl;
  let model = req.body.model;
  if (!apiKey || apiKey.includes('***')) {
    const s = await prisma.lLMSettings.findUnique({ where: { provider: req.params.provider } });
    if (s) {
      apiKey = apiKey && !apiKey.includes('***') ? apiKey : s.apiKey;
      baseUrl = baseUrl || s.baseUrl;
    }
  }
  // model 优先级：用户传的 model > 当前生效 currentModel > 默认 model（用户没传时用 currentModel）
  if (!model) {
    const s2 = await prisma.lLMSettings.findUnique({ where: { provider: req.params.provider } });
    if (s2) model = s2.currentModel || s2.model;
  }
  if (!apiKey) return res.status(400).json({ error: '请先填入 API Key' });
  const result = await testProvider(req.params.provider, { apiKey, baseUrl, model });
  if (result.success) {
    result.message = `连接成功（当前生效: ${model}）`;
  }
  res.json(result);
});

llmSettingsRouter.post('/:provider/primary', async (req, res) => {
  const meta = PROVIDERS.find(p => p.key === req.params.provider);
  if (!meta) return res.status(404).json({ error: `未知 provider: ${req.params.provider}` });
  await prisma.lLMSettings.updateMany({ where: { isPrimary: true }, data: { isPrimary: false } });
  const s = await prisma.lLMSettings.update({
    where: { provider: req.params.provider },
    data: { isPrimary: true, enabled: true },
  }).catch(() => null);
  if (!s) return res.status(404).json({ error: '该 provider 未配置' });
  clearLLMCache();
  res.json({ ok: true });
});

// 切换当前模型（运行时立刻生效；如未配置则自动建空记录 + 标记主 provider）
llmSettingsRouter.post('/:provider/switch-model', async (req, res) => {
  try {
    const { model, markPrimary } = req.body;
    if (!model) return res.status(400).json({ error: 'model 必填' });
    const meta = PROVIDERS.find(p => p.key === req.params.provider);
    if (!meta) return res.status(404).json({ error: `未知 provider: ${req.params.provider}` });
    // 校验：必须是预置之一（未配置时也允许预置模型）
    if (meta.models.length > 0 && !meta.models.includes(model)) {
      const s = await prisma.lLMSettings.findUnique({ where: { provider: req.params.provider } });
      const custom = s ? (() => { try { return JSON.parse(s.customModels || '[]'); } catch { return []; } })() : [];
      const all = Array.from(new Set([...meta.models, ...custom]));
      if (!all.includes(model)) return res.status(400).json({ error: `模型 ${model} 不在该 provider 可用列表中` });
    }
    // upsert：没配置就建一个空记录（不带 API Key 不生效，但允许记录 currentModel）
    if (markPrimary) {
      await prisma.lLMSettings.updateMany({ where: { isPrimary: true }, data: { isPrimary: false } });
    }
    // 用户点切换模型 = 隐含启用该 provider（否则切换无意义；loadFromDb 会按 enabled=true 过滤）
    // 如果该 provider 还没配 API Key，enabled 设了也不影响 isAvailable()，安全
    const data: any = { currentModel: model, enabled: true };
    if (markPrimary) { data.isPrimary = true; }
    await prisma.lLMSettings.upsert({
      where: { provider: req.params.provider },
      update: data,
      create: { provider: req.params.provider, ...data, name: meta?.name, baseUrl: meta?.defaultBaseUrl || '', model: meta?.defaultModel || model, apiKey: '', customModels: '[]' },
    });
    clearLLMCache();
    // 返回完整状态（前端不用再调 llmStatus），含新 currentModel + 完整 provider 信息
    const newStatus = await getLLMStatus();
    res.json({
      ok: true,
      model,
      provider: req.params.provider,
      currentModel: model,
      displayName: meta.name,
      baseUrl: meta.defaultBaseUrl,
      status: newStatus,
    });
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

// 激活 provider（设为 primary + enabled；如果还没 currentModel 则取 defaultModel）
// 用于在多个已配置的 provider 之间切换（"换厂商"）
llmSettingsRouter.post('/:provider/activate', async (req, res) => {
  try {
    const meta = PROVIDERS.find(p => p.key === req.params.provider);
    if (!meta) return res.status(404).json({ error: `未知 provider: ${req.params.provider}` });
    const existing = await prisma.lLMSettings.findUnique({ where: { provider: req.params.provider } });
    if (!existing || !existing.apiKey) {
      return res.status(400).json({ error: '该 provider 尚未配置 API Key，请先在配置里填入' });
    }
    // 取消其他 primary
    await prisma.lLMSettings.updateMany({ where: { isPrimary: true, NOT: { provider: req.params.provider } }, data: { isPrimary: false } });
    // 设当前为 primary + enabled，currentModel 保留
    await prisma.lLMSettings.update({
      where: { provider: req.params.provider },
      data: { isPrimary: true, enabled: true },
    });
    clearLLMCache();
    const newStatus = await getLLMStatus();
    res.json({
      ok: true,
      provider: req.params.provider,
      displayName: existing.name || meta.name,
      model: existing.currentModel || existing.model || meta.defaultModel,
      status: newStatus,
    });
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

// 列出该 provider 全部可用模型（含预置 + 自定义 + 当前）
llmSettingsRouter.get('/:provider/models', async (req, res) => {
  const data = await getAvailableModels(req.params.provider);
  res.json(data);
});

// 添加自定义模型（如未配置则建空记录）
llmSettingsRouter.post('/:provider/custom-models', async (req, res) => {
  try {
    const { model } = req.body;
    if (!model) return res.status(400).json({ error: 'model 必填' });
    const meta = PROVIDERS.find(p => p.key === req.params.provider);
    if (!meta) return res.status(404).json({ error: `未知 provider: ${req.params.provider}` });
    const existing = await prisma.lLMSettings.findUnique({ where: { provider: req.params.provider } });
    let custom: string[] = [];
    if (existing) {
      try { custom = JSON.parse(existing.customModels || '[]'); } catch {}
    }
    if (custom.includes(model)) return res.json({ ok: true, customModels: custom });
    custom.push(model);
    await prisma.lLMSettings.upsert({
      where: { provider: req.params.provider },
      update: { customModels: JSON.stringify(custom) },
      create: { provider: req.params.provider, name: meta?.name, baseUrl: meta?.defaultBaseUrl || '', model: meta?.defaultModel || model, customModels: JSON.stringify(custom) },
    });
    clearLLMCache();
    res.json({ ok: true, customModels: custom });
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

// 删除自定义模型
llmSettingsRouter.delete('/:provider/custom-models/:model', async (req, res) => {
  const s = await prisma.lLMSettings.findUnique({ where: { provider: req.params.provider } });
  if (!s) return res.status(204).end();
  let custom: string[] = [];
  try { custom = JSON.parse(s.customModels || '[]'); } catch {}
  custom = custom.filter(m => m !== req.params.model);
  await prisma.lLMSettings.update({ where: { provider: req.params.provider }, data: { customModels: JSON.stringify(custom) } });
  clearLLMCache();
  res.json({ ok: true, customModels: custom });
});

llmSettingsRouter.post('/test-chat', async (req, res) => {
  try {
    const { provider, prompt, apiKey, baseUrl, model } = req.body;
    const meta = PROVIDERS.find(p => p.key === provider);
    if (!meta) return res.status(400).json({ success: false, message: `未知 provider: ${provider}` });
    let key = apiKey;
    let url = baseUrl;
    let m = model;
    if (!key || key.includes('***')) {
      const s = await prisma.lLMSettings.findUnique({ where: { provider } });
      if (s) {
        key = key && !key.includes('***') ? key : s.apiKey;
        url = url || s.baseUrl;
        // 同 test 端点：优先 currentModel（当前生效），再 model（默认）
        if (!m) { m = s.currentModel || s.model; }
      }
    }
    if (!key) return res.status(400).json({ success: false, message: '请先填入 API Key' });
    const start = Date.now();
    const realProvider = meta.protocol === 'anthropic'
      ? new AnthropicProvider(provider, meta.name, key, url || meta.defaultBaseUrl, m || meta.defaultModel)
      : new OpenAICompatibleProvider(provider, meta.name, key, url || meta.defaultBaseUrl, m || meta.defaultModel);
    // 加 10s 超时避免无效 key 永远等
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    try {
      const chatRes = await realProvider.chat([{ role: 'user', content: prompt || '你好，请用一句话介绍你自己' }], undefined as any, controller.signal);
      clearTimeout(timeout);
      res.json({ success: true, message: chatRes.content, model: chatRes.model, latencyMs: Date.now() - start, usage: chatRes.usage });
    } catch (e: any) {
      clearTimeout(timeout);
      res.json({ success: false, message: e.name === 'AbortError' ? '请求超时（10s）' : e.message });
    }
  } catch (e: any) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// 状态
llmSettingsRouter.get('/_/status', async (_req, res) => {
  res.json(await getLLMStatus());
});
