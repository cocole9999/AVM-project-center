/**
 * AI 人力分析引擎
 * 跨人员 / 跨项目 / 跨时间窗 的人力风险评估
 */
import { prisma } from '../db';

const DONE_STATUSES = ['已完成', '已验收', '已发布', '已关闭'];

interface UserWorkload {
  userId: string;
  userName: string;
  totalHours: number;
  capacity: number;
  utilization: number;
  level: 'overload' | 'busy' | 'normal' | 'idle';
  dailyHours: Record<string, number>;
  items: Array<{ workItemKey: string; workItemTitle: string; startDate: string; endDate: string; hours: number; priority: string; status: string; isOverdue: boolean }>;
  activeCount: number;
  overdueCount: number;
  p0Count: number;
  unassignedP0Count: number;
  risks: Array<{ type: string; level: 'high' | 'medium' | 'low'; description: string }>;
  suggestions: string[];
}

interface TeamAnalysis {
  startDate: string;
  endDate: string;
  totalCapacity: number;
  totalAllocated: number;
  teamUtilization: number;
  healthScore: number;
  users: UserWorkload[];
  teamRisks: Array<{ type: string; level: 'high' | 'medium' | 'low'; description: string; affected: string[] }>;
  suggestions: string[];
}

// 启发式 AI 评估
export async function analyzeResources(startDate: string, endDate: string, spaceId?: string): Promise<TeamAnalysis> {
  const start = new Date(startDate);
  const end = new Date(endDate);
  const where: any = { spaceId: spaceId || undefined };

  // 1. 时间窗内所有排期
  const allocations = await prisma.resourceAllocation.findMany({
    where: {
      ...where,
      startDate: { lte: end },
      endDate: { gte: start },
    },
  });

  // 2. 当前活跃工作项
  const activeItems = await prisma.workItem.findMany({
    where: { ...where, status: { notIn: DONE_STATUSES } },
  });

  // 3. 工作日
  const workingDays: string[] = [];
  const cursor = new Date(start);
  while (cursor <= end) {
    const dow = cursor.getDay();
    if (dow !== 0 && dow !== 6) workingDays.push(cursor.toISOString().slice(0, 10));
    cursor.setDate(cursor.getDate() + 1);
  }
  const workingDaysCount = workingDays.length;
  const dailyCapacity = 8;

  // 4. 按人聚合
  const userMap: Record<string, UserWorkload> = {};
  for (const a of allocations) {
    if (!userMap[a.userId]) {
      userMap[a.userId] = {
        userId: a.userId, userName: a.userName,
        totalHours: 0, capacity: workingDaysCount * dailyCapacity, utilization: 0,
        level: 'normal', dailyHours: {}, items: [],
        activeCount: 0, overdueCount: 0, p0Count: 0, unassignedP0Count: 0,
        risks: [], suggestions: [],
      };
    }
    const u = userMap[a.userId];
    u.totalHours += a.allocatedHours;
    u.items.push({
      workItemKey: a.workItemKey, workItemTitle: a.workItemTitle,
      startDate: a.startDate.toISOString(), endDate: a.endDate.toISOString(),
      hours: a.allocatedHours, priority: '?', status: a.status, isOverdue: false,
    });

    const days = Math.max(1, Math.ceil((new Date(a.endDate).getTime() - new Date(a.startDate).getTime()) / 86400000) + 1);
    const perDay = a.allocatedHours / days;
    const c = new Date(Math.max(new Date(a.startDate).getTime(), start.getTime()));
    const ec = new Date(Math.min(new Date(a.endDate).getTime(), end.getTime()));
    while (c <= ec) {
      const k = c.toISOString().slice(0, 10);
      u.dailyHours[k] = (u.dailyHours[k] || 0) + perDay;
      c.setDate(c.getDate() + 1);
    }
  }

  // 5. 补充活跃工作项数据（无排期也显示）
  for (const item of activeItems) {
    if (!item.assignee) {
      if (item.priority === 'P0') {
        // 记录到第一个用户
        const first = Object.values(userMap)[0];
        if (first) first.unassignedP0Count++;
      }
      continue;
    }
    if (!userMap[item.assignee]) {
      userMap[item.assignee] = {
        userId: item.assignee, userName: item.assignee,
        totalHours: 0, capacity: workingDaysCount * dailyCapacity, utilization: 0,
        level: 'normal', dailyHours: {}, items: [],
        activeCount: 0, overdueCount: 0, p0Count: 0, unassignedP0Count: 0,
        risks: [], suggestions: [],
      };
    }
    const u = userMap[item.assignee];
    u.activeCount++;
    if (item.priority === 'P0') u.p0Count++;
    if (item.planEnd && new Date(item.planEnd) < new Date() && !DONE_STATUSES.includes(item.status)) {
      u.overdueCount++;
    }
  }

  // 6. 计算利用率 + 风险评级
  for (const u of Object.values(userMap)) {
    u.utilization = u.capacity > 0 ? Math.round((u.totalHours / u.capacity) * 100) : 0;

    // 风险评级
    if (u.utilization > 120) {
      u.level = 'overload';
      u.risks.push({ type: 'utilization', level: 'high', description: `利用率 ${u.utilization}%，严重过载` });
    } else if (u.utilization > 100) {
      u.level = 'overload';
      u.risks.push({ type: 'utilization', level: 'high', description: `利用率 ${u.utilization}%，过载` });
    } else if (u.utilization > 80) {
      u.level = 'busy';
      u.risks.push({ type: 'utilization', level: 'medium', description: `利用率 ${u.utilization}%，饱和` });
    } else if (u.utilization < 30) {
      u.level = 'idle';
      u.risks.push({ type: 'utilization', level: 'low', description: `利用率仅 ${u.utilization}%，资源闲置` });
    }

    // P0 过多
    if (u.p0Count >= 3) {
      u.risks.push({ type: 'priority', level: 'high', description: `负责 ${u.p0Count} 个 P0 紧急项，可能无法同时高质量交付` });
    }

    // 超期过多
    if (u.overdueCount >= 2) {
      u.risks.push({ type: 'overdue', level: 'high', description: `有 ${u.overdueCount} 个超期未完成` });
    }

    // 连续高负荷
    const dailyValues = Object.values(u.dailyHours);
    const consecutiveHigh = findConsecutiveHigh(dailyValues, 10);
    if (consecutiveHigh >= 5) {
      u.risks.push({ type: 'sustained', level: 'medium', description: `连续 ${consecutiveHigh} 天高负荷，存在 burnout 风险` });
    }

    // 智能建议
    if (u.level === 'overload' && u.items.length > 0) {
      u.suggestions.push(`将 "${u.items[0].workItemTitle}" 转移给饱和度更低的人`);
      u.suggestions.push('考虑拆分 P0 任务或延后非关键需求');
    }
    if (u.level === 'idle' && u.p0Count === 0) {
      u.suggestions.push('可承接其他成员的过载工作');
    }
    if (u.overdueCount > 0) {
      u.suggestions.push(`优先处理 ${u.overdueCount} 个超期项，必要时申请延期或转交`);
    }
    if (u.unassignedP0Count > 0) {
      u.suggestions.push(`系统中有 ${u.unassignedP0Count} 个未指派的 P0 紧急项，建议主动认领`);
    }
  }

  // 7. 团队级风险
  const users = Object.values(userMap).sort((a, b) => b.utilization - a.utilization);
  const teamRisks: TeamAnalysis['teamRisks'] = [];
  const overloadUsers = users.filter(u => u.level === 'overload');
  const idleUsers = users.filter(u => u.level === 'idle');
  const totalAllocated = users.reduce((s, u) => s + u.totalHours, 0);
  const totalCapacity = users.reduce((s, u) => s + u.capacity, 0);
  const teamUtilization = totalCapacity > 0 ? Math.round((totalAllocated / totalCapacity) * 100) : 0;

  if (overloadUsers.length > 0 && idleUsers.length > 0) {
    teamRisks.push({
      type: 'imbalance', level: 'high',
      description: `团队内部分布不均：${overloadUsers.length} 人过载 + ${idleUsers.length} 人闲置，可重新分配`,
      affected: [...overloadUsers.map(u => u.userName), ...idleUsers.map(u => u.userName)],
    });
  }
  const totalOverdue = users.reduce((s, u) => s + u.overdueCount, 0);
  if (totalOverdue > 0) {
    teamRisks.push({
      type: 'overdue', level: 'high',
      description: `团队共有 ${totalOverdue} 个超期未完成工作项`,
      affected: users.filter(u => u.overdueCount > 0).map(u => u.userName),
    });
  }
  const totalP0 = users.reduce((s, u) => s + u.p0Count, 0);
  if (totalP0 >= 5) {
    teamRisks.push({
      type: 'p0_overload', level: 'medium',
      description: `团队同时承担 ${totalP0} 个 P0 紧急项，优先级管理压力大`,
      affected: users.filter(u => u.p0Count > 0).map(u => u.userName),
    });
  }
  if (teamUtilization > 100) {
    teamRisks.push({
      type: 'team_overload', level: 'high',
      description: `团队整体利用率 ${teamUtilization}%，处于过载状态`,
      affected: users.filter(u => u.utilization > 0).map(u => u.userName),
    });
  }

  // 8. 健康分（0-100）
  let health = 100;
  health -= overloadUsers.length * 10;
  health -= idleUsers.length * 5;
  health -= Math.min(30, totalOverdue * 3);
  health -= Math.min(20, (totalP0 - 5) * 2);
  if (teamUtilization > 100) health -= 15;
  health = Math.max(0, health);

  // 9. 智能建议
  const suggestions: string[] = [];
  if (overloadUsers.length > 0) {
    suggestions.push(`🚨 ${overloadUsers.map(u => u.userName).join('、')} 处于过载状态，建议优先重新分配其工作`);
  }
  if (idleUsers.length > 0 && overloadUsers.length > 0) {
    suggestions.push(`💡 ${idleUsers.map(u => u.userName).join('、')} 有空闲，可承接过载同事的工作`);
  }
  if (totalOverdue > 3) {
    suggestions.push(`⏰ 超期项较多（${totalOverdue} 个），建议召开专项 review 评估是否需调整排期`);
  }
  if (users.length === 0) {
    suggestions.push('📋 团队暂无排期数据，建议先为关键工作项分配排期');
  }
  if (teamUtilization < 50 && users.length > 0) {
    suggestions.push('📉 团队利用率偏低，可承接更多需求或安排培训');
  }
  if (suggestions.length === 0) {
    suggestions.push('✅ 团队人力配置合理，保持当前节奏');
  }

  return {
    startDate, endDate,
    totalCapacity, totalAllocated,
    teamUtilization, healthScore: health,
    users,
    teamRisks,
    suggestions,
  };
}

function findConsecutiveHigh(dailyValues: number[], threshold: number): number {
  let max = 0, cur = 0;
  for (const v of dailyValues) {
    if (v >= threshold) {
      cur++;
      max = Math.max(max, cur);
    } else {
      cur = 0;
    }
  }
  return max;
}

// 缓存到数据库
export async function saveAnalysis(spaceId: string | undefined, startDate: string, endDate: string, result: TeamAnalysis) {
  return prisma.resourceAnalysis.create({
    data: {
      spaceId: spaceId || null,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      result: JSON.stringify(result),
      riskCount: result.users.filter(u => u.level === 'overload' || u.overdueCount > 0).length,
      healthScore: result.healthScore,
    },
  });
}
