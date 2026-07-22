/**
 * 字段管理：公式字段 + 聚合字段 + 派生字段值查询
 */
import { Router } from 'express';
import { prisma } from '../db';
import { evaluateFormula, computeItemFormulas, computeItemRollups, computeFormulaField, computeRollupField, recomputeAllDerivedFields, getFormulaMeta } from '../services/formulaEngine';
import { computeItemDerivedFields } from '../services/rollupEngine';

export const fieldRouter = Router();

// ========== 公式字段 ==========
fieldRouter.get('/formulas', async (req, res) => {
  try {
    const { workType, spaceId } = req.query as any;
    const where: any = {};
    if (workType) where.workType = workType;
    if (spaceId) where.spaceId = spaceId;
    const list = await prisma.formulaField.findMany({ where, orderBy: { createdAt: 'asc' } });
    res.json(list);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

fieldRouter.post('/formulas', async (req, res) => {
  try {
    const { spaceId, workType, name, fieldKey, formula, outputType, format, description, createdBy } = req.body;
    if (!workType || !name || !fieldKey || !formula) {
      return res.status(400).json({ error: 'workType, name, fieldKey, formula required' });
    }
    const f = await prisma.formulaField.create({
      data: { spaceId: spaceId || null, workType, name, fieldKey, formula, outputType: outputType || 'number', format: format || '', description: description || '', createdBy: createdBy || null },
    });
    // 立即计算一次
    await computeFormulaField(f.id);
    res.status(201).json(f);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

fieldRouter.patch('/formulas/:id', async (req, res) => {
  try {
    const f = await prisma.formulaField.update({ where: { id: req.params.id }, data: req.body });
    if (req.body.formula !== undefined || req.body.enabled !== undefined) {
      await computeFormulaField(f.id);
    }
    res.json(f);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

fieldRouter.delete('/formulas/:id', async (req, res) => {
  try {
    await prisma.formulaField.delete({ where: { id: req.params.id } });
    res.status(204).end();
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

fieldRouter.post('/formulas/:id/recompute', async (req, res) => {
  try {
    const values = await computeFormulaField(req.params.id);
    res.json({ count: Object.keys(values).length, sample: Object.entries(values).slice(0, 5) });
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

// ========== 聚合字段 ==========
fieldRouter.get('/rollups', async (req, res) => {
  try {
    const { workType, spaceId } = req.query as any;
    const where: any = {};
    if (workType) where.workType = workType;
    if (spaceId) where.spaceId = spaceId;
    const list = await prisma.rollupField.findMany({ where, orderBy: { createdAt: 'asc' } });
    res.json(list);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

fieldRouter.post('/rollups', async (req, res) => {
  try {
    const { spaceId, workType, name, fieldKey, childType, sourceField, aggregation, outputType, format, description } = req.body;
    if (!workType || !name || !fieldKey || !sourceField || !aggregation) {
      return res.status(400).json({ error: 'workType, name, fieldKey, sourceField, aggregation required' });
    }
    const f = await prisma.rollupField.create({
      data: { spaceId: spaceId || null, workType, name, fieldKey, childType: childType || 'task', sourceField, aggregation, outputType: outputType || 'number', format: format || '', description: description || '' },
    });
    await computeRollupField(f.id);
    res.status(201).json(f);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

fieldRouter.patch('/rollups/:id', async (req, res) => {
  try {
    const f = await prisma.rollupField.update({ where: { id: req.params.id }, data: req.body });
    await computeRollupField(f.id);
    res.json(f);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

fieldRouter.delete('/rollups/:id', async (req, res) => {
  try {
    await prisma.rollupField.delete({ where: { id: req.params.id } });
    res.status(204).end();
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

fieldRouter.post('/rollups/:id/recompute', async (req, res) => {
  try {
    const values = await computeRollupField(req.params.id);
    res.json({ count: Object.keys(values).length, sample: Object.entries(values).slice(0, 5) });
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

// ========== 工作项的派生字段值 ==========
fieldRouter.get('/derived/:workItemId', async (req, res) => {
  try {
    const result = await computeItemDerivedFields(req.params.workItemId);
    res.json(result);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// 批量重算
fieldRouter.post('/recompute-all', async (req, res) => {
  try {
    const { spaceId } = req.body;
    const r = await recomputeAllDerivedFields(spaceId);
    res.json(r);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// 公式测试（无需保存，直接对示例数据求值）
fieldRouter.post('/test-formula', async (req, res) => {
  try {
    const { formula, sample } = req.body;
    const value = evaluateFormula(formula, sample || {});
    res.json({ formula, value, formatted: value });
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

// 元信息：可用字段 + 函数
fieldRouter.get('/meta', (_req, res) => {
  res.json(getFormulaMeta());
});

// 公式语法校验
fieldRouter.post('/validate', (req, res) => {
  try {
    const { formula } = req.body;
    evaluateFormula(formula, {});
    res.json({ valid: true, formula });
  } catch (e: any) {
    res.json({ valid: false, error: e.message, formula });
  }
});
