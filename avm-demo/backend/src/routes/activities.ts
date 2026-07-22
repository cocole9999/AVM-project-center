import { Router } from 'express';
import { prisma } from '../db';
import { asyncHandler } from '../middleware/validate';

export const activityRouter = Router();

activityRouter.get('/', asyncHandler(async (req, res) => {
  const { workItemId, limit } = req.query as Record<string, string | undefined>;
  const where: any = {};
  if (workItemId) where.workItemId = workItemId;
  const items = await prisma.activity.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: limit ? Number(limit) : 50,
  });
  res.json(items);
}));