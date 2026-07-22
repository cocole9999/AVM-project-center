import { Router } from 'express';
import * as review from '../services/reviewEngine';

export const reviewRouter = Router();

// 列出评审
reviewRouter.get('/', async (req, res) => {
  const list = await review.listReviews(req.query.workItemId as string);
  res.json(list);
});

// 获取评审详情
reviewRouter.get('/:id', async (req, res) => {
  const r = await review.getReview(req.params.id);
  if (!r) return res.status(404).json({ error: 'Review not found' });
  res.json(r);
});

// 发起评审
reviewRouter.post('/', async (req, res) => {
  try {
    const r = await review.createReview(req.body);
    res.status(201).json(r);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

// 参与者提交评审要素
reviewRouter.post('/:id/submit', async (req, res) => {
  try {
    const { userId, submissions } = req.body;
    const r = await review.submitReviewItems(req.params.id, userId, submissions);
    res.json(r);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

// 总结论
reviewRouter.post('/:id/finalize', async (req, res) => {
  try {
    const r = await review.finalizeReview(req.params.id, req.body);
    res.json(r);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

// 评审模板
reviewRouter.get('/templates/all', async (_req, res) => {
  const list = await review.listReviewTemplates();
  res.json(list);
});

reviewRouter.post('/templates', async (req, res) => {
  try {
    const t = await review.createReviewTemplate(req.body);
    res.status(201).json(t);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});