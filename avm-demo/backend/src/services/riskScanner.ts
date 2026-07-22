/**
 * AI 智能预警服务
 *
 * - 定期扫描项目风险（基于 scan_risks 工具）
 * - LLM 总结成"预警卡片"
 * - 写入 Notification 中心（推送给所有 admin + pm + 张三/李四/王五）
 * - 24 小时内同类型预警去重（避免噪音）
 */
import { prisma } from '../db';
import { buildProjectSnapshot } from './projectSnapshot';
import { pushToUser, broadcastAll } from './wsServer';
import { getLLMProvider, clearLLMCache } from './llmProvider';
import { executeTool } from './aiTools';

const RECIPIENTS = ['admin', 'pm', '张三(研发一组)', '李四(测试)', '王五(研发二组)', '赵六(产品)'];
const SCAN_INTERVAL_MS = 60 * 60 * 1000; // 1 小时
const DEDUPE_WINDOW_MS = 24 * 60 * 60 * 1000; // 24h

let _scannerTimer: NodeJS.Timeout | null = null;

export interface RiskScanResult {
  scannedAt: string;
  riskCount: number;
  overdueCount: number;
  notificationsCreated: number;
  skippedByDedup: number;
  alerts: { projectCode: string; severity: string; summary: string }[];
}

/** 核心：跑一次风险扫描 + 推送到 Notification */
export async function runRiskScan(trigger: 'manual' | 'startup' | 'schedule' = 'schedule'): Promise<RiskScanResult> {
  const scannedAt = new Date();
  console.log(`[risk-scan] ${trigger} 扫描开始 ${scannedAt.toISOString()}`);

  // 1. 调 scan_risks 工具拿真实数据
  let scanData: any = { riskProjects: [], overdueWorkItems: [] };
  try {
    scanData = await executeTool('scan_risks', { includeOverdue: true });
  } catch (e: any) {
    console.error('[risk-scan] scan_risks 失败:', e.message);
  }
  const risks = scanData.riskProjects || [];
  const overdue = scanData.overdueWorkItems || [];
  if (risks.length === 0 && overdue.length === 0) {
    console.log('[risk-scan] 无风险，跳过通知');
    return { scannedAt: scannedAt.toISOString(), riskCount: 0, overdueCount: 0, notificationsCreated: 0, skippedByDedup: 0, alerts: [] };
  }

  // 2. LLM 总结（让"风险预警"读起来自然）
  const provider = await getLLMProvider();
  let alerts: { projectCode: string; severity: string; summary: string }[] = [];
  if (provider.isAvailable() && provider.name !== 'mock') {
    try {
      const snapshot = await buildProjectSnapshot();
      const prompt = `请基于以下扫描结果，生成 3-5 条简洁的风险预警卡片。

【扫描结果】
${JSON.stringify({ risks: risks.slice(0, 10), overdue: overdue.slice(0, 10) }, null, 2)}

【项目快照】（已省略）

要求：
1. 每条预警包含：项目编码、严重程度（critical/high/medium）、一句话摘要
2. 摘要要具体：哪个项目 / 什么问题 / 建议动作
3. 用 JSON 数组返回：[{"projectCode":"AVM-XXX","severity":"high","summary":"..."}]
4. 严禁编造项目或数据

只返回 JSON，不要其他解释。`;

      const r = await provider.chat([
        { role: 'system', content: snapshot.text + '\n\n你是一位资深 PM 风险分析师。' },
        { role: 'user', content: prompt },
      ], { temperature: 0.3, maxTokens: 1500 });

      // 解析 JSON（可能被 markdown 包裹）
      const text = r.content.trim();
      const jsonMatch = text.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        alerts = JSON.parse(jsonMatch[0]);
        if (!Array.isArray(alerts)) alerts = [];
      }
    } catch (e: any) {
      console.warn('[risk-scan] LLM 总结失败，用原始数据:', e.message);
    }
  }

  // fallback：如果 LLM 没生成 alerts，用原始 risks 生成
  if (alerts.length === 0) {
    alerts = risks.map((r: any) => ({
      projectCode: r.projectCode,
      severity: r.risk === 'high' ? 'high' : 'medium',
      summary: r.issues.join('；') + '。建议：尽快复盘并调整资源。',
    }));
  }

  // 3. 24h 去重 + 写 Notification
  let created = 0;
  let skipped = 0;
  for (const alert of alerts) {
    if (!alert.projectCode) continue;
    const dedupKey = `risk_scan:${alert.projectCode}:${alert.severity}`;
    const since = new Date(scannedAt.getTime() - DEDUPE_WINDOW_MS);
    // 用 link 字段做 dedup key（type=ai_risk_alert + link=dedupKey）
    const existing = await prisma.notification.findFirst({
      where: { type: 'ai_risk_alert', link: dedupKey, createdAt: { gte: since } },
    });
    if (existing) {
      skipped++;
      continue;
    }
    // 写给所有 recipient
    for (const recipient of RECIPIENTS) {
      const notif = await prisma.notification.create({
        data: {
          recipientId: recipient,
          type: 'ai_risk_alert',
          level: alert.severity === 'critical' ? 'error' : alert.severity === 'high' ? 'warning' : 'info',
          title: `🚨 风险预警 [${alert.severity}]: ${alert.projectCode}`,
          content: alert.summary,
          link: dedupKey,
          read: false,
        },
      });
      created++;
    }
  }

  console.log(`[risk-scan] 完成: ${created} 条通知, ${skipped} 条去重跳过`);

  // 4. 扫描外部依赖延期
  const depResult = await scanDependencyOverdue(scannedAt);

  return {
    scannedAt: scannedAt.toISOString(),
    riskCount: risks.length,
    overdueCount: overdue.length,
    notificationsCreated: created + depResult.notificationsCreated,
    skippedByDedup: skipped + depResult.skippedByDedup,
    alerts,
    dependencyOverdue: depResult,
  };
}

/** 扫描外部依赖延期（V1.7.1） */
async function scanDependencyOverdue(scannedAt: Date): Promise<{
  overdueCount: number;
  notificationsCreated: number;
  skippedByDedup: number;
  items: { id: string; name: string; type: string; projectCode: string; daysOverdue: number; status: string }[];
}> {
  const today = scannedAt;
  // 找出所有预期日期已过、但状态不是 ready/cancelled 的依赖
  const overdueDeps = await prisma.externalDependency.findMany({
    where: {
      expectedDate: { lt: today },
      status: { notIn: ['ready', 'cancelled'] },
    },
    include: {
      project: { select: { code: true, name: true } },
      workItem: { select: { key: true, title: true, assignee: true } },
    },
  });

  if (overdueDeps.length === 0) {
    return { overdueCount: 0, notificationsCreated: 0, skippedByDedup: 0, items: [] };
  }

  let created = 0;
  let skipped = 0;
  const items: { id: string; name: string; type: string; projectCode: string; daysOverdue: number; status: string }[] = [];

  for (const dep of overdueDeps) {
    const daysOverdue = dep.expectedDate ? Math.ceil((today.getTime() - new Date(dep.expectedDate).getTime()) / 86400000) : 0;
    items.push({
      id: dep.id,
      name: dep.name,
      type: dep.type,
      projectCode: dep.project?.code || '-',
      daysOverdue,
      status: dep.status,
    });
    // 严重程度：超期 > 7 天 = critical；> 3 天 = high；其他 medium；blocked = critical
    const severity = dep.status === 'blocked' || daysOverdue > 7 ? 'critical' : daysOverdue > 3 ? 'high' : 'medium';
    const dedupKey = `dep_overdue:${dep.id}:${severity}`;
    const since = new Date(scannedAt.getTime() - DEDUPE_WINDOW_MS);
    const existing = await prisma.notification.findFirst({
      where: { type: 'dep_overdue', link: dedupKey, createdAt: { gte: since } },
    });
    if (existing) {
      skipped++;
      continue;
    }
    // 写给：负责人 + 关联工作项的 assignee + 所有 recipient
    const targetUsers = new Set<string>([...RECIPIENTS]);
    if (dep.owner) targetUsers.add(dep.owner);
    if (dep.workItem?.assignee) targetUsers.add(dep.workItem.assignee);

    for (const recipient of targetUsers) {
      const content = `${dep.type}「${dep.name}」超期 ${daysOverdue} 天${dep.status === 'blocked' ? '，当前状态卡点' : ''}。${dep.blocker ? `\n卡点：${dep.blocker}` : ''}${dep.project ? `\n项目：${dep.project.code} ${dep.project.name}` : ''}${dep.workItem ? `\n关联工作项：${dep.workItem.key} ${dep.workItem.title}` : ''}`;
      const notif = await prisma.notification.create({
        data: {
          recipientId: recipient,
          type: 'dep_overdue',
          level: severity === 'critical' ? 'error' : severity === 'high' ? 'warning' : 'info',
          title: `📦 依赖延期 [${dep.type}/${severity}]: ${dep.name}`,
          content,
          link: dedupKey,
          read: false,
        },
      });
      // V1.15: 实时推送
      const u = await prisma.user.findFirst({ where: { username: recipient }, select: { id: true } });
      if (u) {
        pushToUser(u.id, {
          type: 'notification',
          notification: {
            id: notif.id,
            kind: 'dep_overdue',
            title: notif.title,
            content: notif.content,
            link: notif.link,
            severity,
            depType: dep.type,
            depName: dep.name,
            daysOverdue,
          },
        });
      }
      created++;
    }
  }
  console.log(`[risk-scan] 依赖延期扫描: ${overdueDeps.length} 项, ${created} 条通知, ${skipped} 条去重`);
  return { overdueCount: overdueDeps.length, notificationsCreated: created, skippedByDedup: skipped, items };
}

/** 启动定时任务 */
export function startRiskScanner() {
  if (_scannerTimer) return; // 已启动
  // 启动 60 秒后跑一次（让服务先就绪）
  setTimeout(() => {
    runRiskScan('startup').catch(e => console.error('[risk-scan] startup error:', e));
  }, 60_000);
  // 然后每 1 小时跑
  _scannerTimer = setInterval(() => {
    runRiskScan('schedule').catch(e => console.error('[risk-scan] schedule error:', e));
  }, SCAN_INTERVAL_MS);
  console.log('[risk-scan] 定时任务已启动 (每 1 小时 + 启动后 60s)');
}

/** 停止定时任务（测试用） */
export function stopRiskScanner() {
  if (_scannerTimer) {
    clearInterval(_scannerTimer);
    _scannerTimer = null;
  }
}
