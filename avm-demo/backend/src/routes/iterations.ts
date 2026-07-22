import { Router } from 'express';
import { prisma } from '../db';
import { asyncHandler } from '../middleware/validate';

export const iterationRouter = Router();

iterationRouter.get('/', asyncHandler(async (_req, res) => {
  const items = await prisma.iteration.findMany({
    orderBy: { startDate: 'desc' },
    include: { _count: { select: { workItems: true } } },
  });
  res.json(items);
}));

iterationRouter.get('/:id', asyncHandler(async (req, res) => {
  const item = await prisma.iteration.findUnique({
    where: { id: req.params.id },
    include: {
      workItems: {
        orderBy: { updatedAt: 'desc' },
        select: {
          id: true, key: true, title: true, type: true, status: true,
          priority: true, assignee: true, estimate: true, actualHours: true,
        },
      },
    },
  });
  if (!item) return res.status(404).json({ error: 'Iteration not found' });
  res.json(item);
}));

iterationRouter.post('/', asyncHandler(async (req, res) => {
  const { name, goal, status, startDate, endDate } = req.body;
  if (!name || !startDate || !endDate) {
    return res.status(400).json({ error: 'name, startDate, endDate required' });
  }
  const created = await prisma.iteration.create({
    data: {
      name, goal: goal || '', status: status || 'planning',
      startDate: new Date(startDate),
      endDate: new Date(endDate),
    },
  });
  res.status(201).json(created);
}));

iterationRouter.patch('/:id', asyncHandler(async (req, res) => {
  const allowed: any = {};
  for (const k of ['name', 'goal', 'status']) {
    if (req.body[k] !== undefined) allowed[k] = req.body[k];
  }
  if (req.body.startDate) allowed.startDate = new Date(req.body.startDate);
  if (req.body.endDate) allowed.endDate = new Date(req.body.endDate);
  const updated = await prisma.iteration.update({
    where: { id: req.params.id },
    data: allowed,
  });
  res.json(updated);
}));

iterationRouter.delete('/:id', asyncHandler(async (req, res) => {
  await prisma.iteration.delete({ where: { id: req.params.id } });
  res.status(204).end();
}));

// V1.28 迭代回顾 (Sprint Retrospective)
// GET /api/iterations/:id/retrospective
// 自动生成: 完成/未完成/延期/亮点/风险/建议
iterationRouter.get('/:id/retrospective', async (req, res) => {
  try {
    const iter = await prisma.iteration.findUnique({ where: { id: req.params.id } });
    if (!iter) return res.status(404).json({ error: 'Iteration not found' });
    const start = new Date(iter.startDate);
    const end = new Date(iter.endDate);
    const items = await prisma.workItem.findMany({
      where: { iterationId: iter.id },
      select: { id: true, key: true, title: true, type: true, status: true, priority: true, assignee: true, estimate: true, actualHours: true, actualEnd: true, planEnd: true },
    });
    const done = items.filter(i => i.actualEnd && new Date(i.actualEnd) >= start && new Date(i.actualEnd) <= end);
    const overdue = items.filter(i => i.planEnd && new Date(i.planEnd) < new Date() && !['已完成', '已关闭', '已驳回', '已发布', '已验收'].includes(i.status));
    const critical = items.filter(i => (i.priority === 'P0' || i.priority === 'P1') && !['已完成', '已关闭', '已驳回', '已发布', '已验收'].includes(i.status));
    const totalEstimate = items.reduce((s, i) => s + (i.estimate || 0), 0);
    const totalActual = items.reduce((s, i) => s + (i.actualHours || 0), 0);
    // 按类型/assignee 聚合
    const byType: Record<string, number> = {};
    const byAssignee: Record<string, { done: number; total: number }> = {};
    for (const i of items) {
      byType[i.type] = (byType[i.type] || 0) + 1;
      if (!byAssignee[i.assignee || '未指派']) byAssignee[i.assignee || '未指派'] = { done: 0, total: 0 };
      byAssignee[i.assignee || '未指派'].total++;
      if (done.includes(i)) byAssignee[i.assignee || '未指派'].done++;
    }
    // 渲染 markdown 报告
    const lines: string[] = [];
    lines.push(`# ${iter.name} 迭代回顾`);
    lines.push('');
    lines.push(`> **周期**: ${start.toISOString().slice(0, 10)} ~ ${end.toISOString().slice(0, 10)}`);
    lines.push(`> **状态**: ${iter.status}`);
    lines.push(`> **生成时间**: ${new Date().toLocaleString('zh-CN')}`);
    lines.push('');
    lines.push('## 一、整体数据');
    lines.push('');
    lines.push('| 指标 | 数值 |');
    lines.push('|------|------|');
    lines.push(`| 规划工作项 | ${items.length} |`);
    lines.push(`| 已完成 | ${done.length} |`);
    lines.push(`| 未完成 | ${items.length - done.length} |`);
    lines.push(`| 延期 (临期) | ${overdue.length} |`);
    lines.push(`| P0/P1 紧急未完成 | ${critical.length} |`);
    lines.push(`| 计划工时 | ${totalEstimate}h |`);
    lines.push(`| 实际工时 | ${totalActual}h |`);
    const completionRate = items.length > 0 ? Math.round(done.length / items.length * 100) : 0;
    lines.push(`| 完成率 | ${completionRate}% |`);
    lines.push('');
    lines.push('## 二、本期亮点');
    lines.push('');
    if (done.length === 0) {
      lines.push('- 本期暂无完成项');
    } else {
      lines.push(`- 团队按时/提前完成 ${done.length} 个工作项 (完成率 ${completionRate}%)`);
      const byAssigneeDone = Object.entries(byAssignee).sort((a, b) => b[1].done - a[1].done).slice(0, 3);
      if (byAssigneeDone.length > 0) {
        lines.push('- 完成最多:');
        for (const [name, s] of byAssigneeDone) {
          if (s.done > 0) lines.push(`  - ${name}: ${s.done}/${s.total}`);
        }
      }
    }
    lines.push('');
    lines.push('## 三、风险与延期');
    lines.push('');
    if (overdue.length === 0) {
      lines.push('- 无临期项 🎉');
    } else {
      lines.push(`**${overdue.length} 个工作项临期/延期**：`);
      for (const i of overdue.slice(0, 10)) {
        const days = Math.floor((Date.now() - new Date(i.planEnd!).getTime()) / 86400000);
        lines.push(`- 🔴 **${i.key}** ${i.title} *(延期 ${days} 天 · 负责人: ${i.assignee || '未指派'})*`);
      }
      if (overdue.length > 10) lines.push(`- ... 还有 ${overdue.length - 10} 项`);
    }
    lines.push('');
    lines.push('## 四、P0/P1 紧急待办');
    lines.push('');
    if (critical.length === 0) {
      lines.push('- 全部 P0/P1 已处理');
    } else {
      for (const i of critical.slice(0, 10)) {
        lines.push(`- 🚨 **${i.key}** ${i.title} *(${i.priority} · ${i.status} · ${i.assignee || '未指派'})*`);
      }
      if (critical.length > 10) lines.push(`- ... 还有 ${critical.length - 10} 项`);
    }
    lines.push('');
    lines.push('## 五、按类型分布');
    lines.push('');
    for (const [t, c] of Object.entries(byType)) {
      lines.push(`- ${t}: ${c}`);
    }
    lines.push('');
    lines.push('## 六、下期建议');
    lines.push('');
    if (overdue.length > 0) {
      lines.push(`1. **优先清理 ${overdue.length} 个临期项**, 重新评估计划或重新分配`);
    }
    if (critical.length > 0) {
      lines.push(`2. **${critical.length} 个 P0/P1 未完成**, 建议拆分或增加人手`);
    }
    if (totalActual > totalEstimate && totalEstimate > 0) {
      const over = Math.round((totalActual - totalEstimate) / totalEstimate * 100);
      lines.push(`3. **工时偏差 ${over}%**, 估算偏低, 下期增加 15-20% 缓冲`);
    } else if (totalActual < totalEstimate * 0.7 && totalEstimate > 0) {
      lines.push(`3. **实际工时 < 计划 70%**, 计划可能过于保守, 下期可以接更多需求`);
    }
    lines.push(`4. 维护迭代节奏, 持续开 daily standup, 及时发现阻塞`);
    lines.push('');
    lines.push('---');
    lines.push(`*本报告由 AVM 平台自动生成 · ${new Date().toLocaleString('zh-CN')}*`);

    res.json({
      iteration: { id: iter.id, name: iter.name, startDate: iter.startDate, endDate: iter.endDate, status: iter.status, goal: iter.goal },
      summary: {
        totalItems: items.length,
        doneCount: done.length,
        overdueCount: overdue.length,
        criticalCount: critical.length,
        totalEstimate,
        totalActual,
        completionRate,
      },
      byAssignee,
      byType,
      report: lines.join('\n'),
    });
  } catch (e: any) {
    console.error('[iterations/retrospective]', e);
    res.status(500).json({ error: e.message });
  }
});

// GET /api/iterations/:id/burndown
// 返回: { iteration: {id,name,startDate,endDate,totalEstimate},
//         daily: [{date, plannedRemaining, actualRemaining}] }
iterationRouter.get('/:id/burndown', async (req, res) => {
  try {
    const iter = await prisma.iteration.findUnique({ where: { id: req.params.id } });
    if (!iter) return res.status(404).json({ error: 'Iteration not found' });
    const items = await prisma.workItem.findMany({
      where: { iterationId: iter.id },
      select: { id: true, estimate: true, actualHours: true, status: true, actualEnd: true, createdAt: true },
    });
    const totalEstimate = items.reduce((s, i) => s + (i.estimate || 0), 0);
    const start = new Date(iter.startDate);
    const end = new Date(iter.endDate);
    const days = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / 86400000));
    const daily: Array<{ date: string; plannedRemaining: number; actualRemaining: number }> = [];
    const today = new Date();
    const todayStr = today.toISOString().slice(0, 10);
    for (let i = 0; i <= days; i++) {
      const day = new Date(start.getTime() + i * 86400000);
      const dayStr = day.toISOString().slice(0, 10);
      // 理想: 线性消耗到 0
      const plannedRemaining = Math.max(0, +(totalEstimate * (1 - i / days)).toFixed(2));
      // 实际: 算到 day 那天为止, 已完成的工时 (actualHours on items with actualEnd <= day)
      let actualCompleted = 0;
      for (const it of items) {
        if (it.actualEnd && new Date(it.actualEnd).getTime() <= day.getTime()) {
          actualCompleted += (it.actualHours || it.estimate || 0);
        } else if (dayStr === todayStr && (!it.actualEnd)) {
          // 今天的: 已完成工时按 actualHours 算 (不管 actualEnd)
          actualCompleted += (it.actualHours || 0);
        }
      }
      const actualRemaining = Math.max(0, +(totalEstimate - actualCompleted).toFixed(2));
      daily.push({ date: dayStr, plannedRemaining, actualRemaining });
    }
    res.json({
      iteration: { id: iter.id, name: iter.name, startDate: iter.startDate, endDate: iter.endDate, totalEstimate },
      daily,
    });
  } catch (e: any) {
    console.error('[iterations/burndown]', e);
    res.status(500).json({ error: e.message });
  }
});