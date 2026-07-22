/**
 * 评审引擎服务
 * 负责：TR / DCP / QR 评审的全流程
 * 流程：发起 -> 参与者填写要素 -> 收齐 -> 总结论 -> 影响工作项状态
 */
import { prisma } from '../db';

// 发起评审
export async function createReview(data: any) {
  const review = await prisma.review.create({
    data: {
      workItemId: data.workItemId,
      reviewType: String(data.reviewType),
      title: data.title,
      initiator: data.initiator,
      status: 'pending',
    },
  });

  for (const it of data.items) {
    await prisma.reviewItem.create({
      data: {
        reviewId: review.id,
        name: it.name,
        itemType: it.itemType,
        description: it.description || '',
        maxScore: it.maxScore || 5,
      },
    });
  }

  for (const p of data.participants) {
    await prisma.reviewParticipant.create({
      data: {
        reviewId: review.id,
        userId: p.userId,
        userName: p.userName,
        role: p.role,
        weight: p.weight || 1,
      },
    });
  }

  return getReview(review.id);
}

// 获取评审详情
export async function getReview(id: string) {
  return prisma.review.findUnique({
    where: { id },
    include: {
      workItem: {
        select: { id: true, key: true, title: true, type: true, status: true },
      },
      items: { orderBy: { createdAt: 'asc' } },
      participants: { orderBy: { createdAt: 'asc' } },
    },
  });
}

// 列出工作项的评审
export async function listReviews(workItemId?: string) {
  return prisma.review.findMany({
    where: workItemId ? { workItemId } : {},
    orderBy: { createdAt: 'desc' },
    include: {
      workItem: { select: { id: true, key: true, title: true, type: true } },
      _count: { select: { items: true, participants: true } },
    },
  });
}

// 评审参与者提交要素
export async function submitReviewItems(
  reviewId: string,
  userId: string,
  submissions: Array<{ itemId: string; score?: number; checked?: boolean; answer?: string; comment?: string }>
) {
  for (const s of submissions) {
    await prisma.reviewItem.update({
      where: { id: s.itemId },
      data: {
        score: s.score,
        checked: s.checked,
        answer: s.answer,
        comment: s.comment || '',
        completed: true,
      },
    });
  }

  await prisma.reviewParticipant.update({
    where: { reviewId_userId: { reviewId, userId } },
    data: { hasResponded: true, respondedAt: new Date() },
  });

  // 检查是否所有人都已提交
  const allParticipants = await prisma.reviewParticipant.findMany({ where: { reviewId } });
  const allDone = allParticipants.every(p => p.hasResponded);
  const review = await prisma.review.findUnique({ where: { id: reviewId } });

  if (allDone && review?.status === 'pending') {
    await prisma.review.update({
      where: { id: reviewId },
      data: { status: 'in_progress' },
    });
  }

  return getReview(reviewId);
}

// 总结论：根据要素和规则计算
export async function finalizeReview(
  reviewId: string,
  data: { conclusion: 'go' | 'not_go' | 'go_with_risk'; summary: string; finalizer: string }
) {
  const review = await prisma.review.findUnique({
    where: { id: reviewId },
    include: { items: true, participants: true },
  });
  if (!review) throw new Error('评审不存在');

  // 业务规则判定
  let computed: 'go' | 'not_go' | 'go_with_risk' = data.conclusion;

  // 简化规则：勾选类要素有未勾选 -> go_with_risk
  // 文本类要素未填写 -> go_with_risk
  for (const it of review.items) {
    if (it.itemType === 'check' && it.checked === false) {
      computed = 'go_with_risk';
    }
    if (it.itemType === 'text' && !it.answer) {
      computed = 'go_with_risk';
    }
  }

  const updated = await prisma.review.update({
    where: { id: reviewId },
    data: {
      status: computed === 'not_go' ? 'rejected' : 'approved',
      conclusion: computed,
      summary: data.summary,
      finalizer: data.finalizer,
      finalizedAt: new Date(),
    },
  });

  // 记录活动
  await prisma.activity.create({
    data: {
      workItemId: review.workItemId,
      actor: data.finalizer || 'system',
      action: 'review_finalized',
      newValue: computed,
      meta: data.summary,
    },
  });

  return updated;
}

// 评审模板
export async function listReviewTemplates() {
  return prisma.reviewTemplate.findMany({ orderBy: { name: 'asc' } });
}

export async function createReviewTemplate(data: {
  name: string;
  reviewType: string;
  description?: string;
  items: Array<{ name: string; itemType: string; description?: string; maxScore?: number }>;
}) {
  return prisma.reviewTemplate.create({
    data: {
      name: data.name,
      reviewType: data.reviewType,
      description: data.description || '',
      items: JSON.stringify(data.items),
    },
  });
}