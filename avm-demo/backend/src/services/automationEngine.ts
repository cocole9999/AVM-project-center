/**
 * 无代码自动化引擎
 * 触发器（trigger）→ 条件（conditions）→ 操作（actions）三段式
 */
import { prisma } from '../db';

// ============ 触发器 ============
export const TRIGGERS = [
  // 工作项
  { type: 'work_item.created', label: '工作项创建时', resource: 'work_item', icon: '📋' },
  { type: 'work_item.updated', label: '工作项更新时', resource: 'work_item', icon: '✏️' },
  { type: 'work_item.status_changed', label: '工作项状态变更时', resource: 'work_item', icon: '🔄' },
  { type: 'work_item.priority_changed', label: '工作项优先级变更时', resource: 'work_item', icon: '🚨' },
  { type: 'work_item.assignee_changed', label: '工作项负责人变更时', resource: 'work_item', icon: '👤' },
  { type: 'work_item.module_changed', label: '工作项模块变更时', resource: 'work_item', icon: '📦' },
  { type: 'work_item.due_soon', label: '工作项临期（3天内）', resource: 'work_item', icon: '⏰' },
  { type: 'work_item.overdue', label: '工作项超期', resource: 'work_item', icon: '🔥' },
  { type: 'work_item.completed', label: '工作项完成时', resource: 'work_item', icon: '✅' },
  { type: 'work_item.estimate_changed', label: '工时估分变更时', resource: 'work_item', icon: '📊' },
  { type: 'work_item.actual_hours_changed', label: '实际工时变更时', resource: 'work_item', icon: '⏱️' },
  { type: 'work_item.closed', label: '工作项关闭时', resource: 'work_item', icon: '🔒' },
  { type: 'work_item.reopened', label: '工作项重新打开时', resource: 'work_item', icon: '🔓' },
  // 子工作项
  { type: 'work_item.child_created', label: '子工作项创建时', resource: 'work_item', icon: '➕' },
  { type: 'work_item.child_completed', label: '子工作项全部完成时', resource: 'work_item', icon: '🏁' },
  // 流程节点
  { type: 'flow.node_entered', label: '进入流程节点时', resource: 'flow', icon: '🟢' },
  { type: 'flow.node_exited', label: '离开流程节点时', resource: 'flow', icon: '🔵' },
  { type: 'flow.transition_failed', label: '流程流转失败时', resource: 'flow', icon: '⚠️' },
  // 评审
  { type: 'review.created', label: '评审创建时', resource: 'review', icon: '📝' },
  { type: 'review.submitted', label: '评审要素提交时', resource: 'review', icon: '📤' },
  { type: 'review.all_submitted', label: '评审全员提交时', resource: 'review', icon: '✅' },
  { type: 'review.finalized', label: '评审总结论时', resource: 'review', icon: '🎯' },
  { type: 'review.approved', label: '评审通过时', resource: 'review', icon: '✅' },
  { type: 'review.rejected', label: '评审驳回时', resource: 'review', icon: '❌' },
  // 评论
  { type: 'comment.added', label: '添加评论时', resource: 'comment', icon: '💬' },
  { type: 'comment.mentioned', label: '@ 提及某人时', resource: 'comment', icon: '📢' },
  // 关联
  { type: 'relation.added', label: '工作项添加关联时', resource: 'relation', icon: '🔗' },
  { type: 'relation.removed', label: '工作项解除关联时', resource: 'relation', icon: '⛓️‍💥' },
  { type: 'relation.blocked', label: '工作项被阻塞时', resource: 'relation', icon: '🚧' },
  // 仪表盘/图表
  { type: 'chart.data_refreshed', label: '图表数据刷新时', resource: 'chart', icon: '📈' },
  { type: 'dashboard.viewed', label: '仪表盘被查看时', resource: 'dashboard', icon: '👀' },
  // 人员/排期
  { type: 'resource.overallocated', label: '人员过载时', resource: 'resource', icon: '💥' },
  { type: 'resource.idle', label: '人员长期闲置（7 天）', resource: 'resource', icon: '😴' },
  { type: 'handover.completed', label: '工作移交完成时', resource: 'handover', icon: '🤝' },
  // 导入
  { type: 'import.completed', label: '数据导入完成时', resource: 'import', icon: '📥' },
  { type: 'import.failed', label: '数据导入失败时', resource: 'import', icon: '⚠️' },
  // 定时
  { type: 'scheduled.daily', label: '每日定时（00:00）', resource: 'scheduled', icon: '🕛' },
  { type: 'scheduled.weekly', label: '每周一', resource: 'scheduled', icon: '📅' },
  { type: 'scheduled.monthly', label: '每月 1 号', resource: 'scheduled', icon: '🗓️' },
  { type: 'scheduled.hourly', label: '每小时', resource: 'scheduled', icon: '⏰' },
  // Webhook
  { type: 'webhook.received', label: '收到 Webhook', resource: 'webhook', icon: '🔌' },
  // 手动
  { type: 'manual', label: '手动触发', resource: 'manual', icon: '👆' },
];

// ============ 条件 ============
export const CONDITIONS = [
  { field: 'type', label: '工作项类型', op: ['eq', 'neq', 'in', 'not_in'], valueType: 'enum' },
  { field: 'status', label: '状态', op: ['eq', 'neq', 'in', 'not_in', 'changed_to', 'changed_from'], valueType: 'string' },
  { field: 'priority', label: '优先级', op: ['eq', 'neq', 'in', 'not_in', 'changed_to'], valueType: 'enum' },
  { field: 'assignee', label: '负责人', op: ['eq', 'neq', 'empty', 'not_empty', 'changed_to', 'changed_from'], valueType: 'string' },
  { field: 'reporter', label: '创建人', op: ['eq', 'neq'], valueType: 'string' },
  { field: 'module', label: '模块', op: ['eq', 'neq', 'in', 'contains'], valueType: 'string' },
  { field: 'labels', label: '标签', op: ['contains', 'not_contains'], valueType: 'string' },
  { field: 'title', label: '标题', op: ['contains', 'not_contains'], valueType: 'string' },
  { field: 'description', label: '描述', op: ['contains'], valueType: 'string' },
  { field: 'estimate', label: '估分', op: ['gt', 'gte', 'lt', 'lte', 'eq', 'neq', 'changed_to'], valueType: 'number' },
  { field: 'actualHours', label: '实际工时', op: ['gt', 'gte', 'lt', 'lte', 'eq', 'neq'], valueType: 'number' },
  { field: 'planStart', label: '计划开始', op: ['before', 'after', 'eq'], valueType: 'date' },
  { field: 'planEnd', label: '计划完成', op: ['before', 'after', 'eq'], valueType: 'date' },
  { field: 'iteration', label: '所属迭代', op: ['eq', 'neq', 'in'], valueType: 'string' },
  { field: 'isOverdue', label: '是否超期', op: ['eq'], valueType: 'boolean' },
  { field: 'isCompleted', label: '是否完成', op: ['eq'], valueType: 'boolean' },
  { field: 'progress', label: '完成度', op: ['gt', 'gte', 'lt', 'lte', 'eq'], valueType: 'number' },
  { field: 'childCount', label: '子项数', op: ['gt', 'gte', 'lt', 'lte', 'eq'], valueType: 'number' },
  { field: 'commentCount', label: '评论数', op: ['gt', 'gte', 'lt', 'lte', 'eq'], valueType: 'number' },
  { field: 'actor', label: '触发人（上下文）', op: ['eq', 'neq'], valueType: 'string' },
  { field: 'dayOfWeek', label: '星期几（1-7）', op: ['eq', 'in'], valueType: 'number' },
  { field: 'hourOfDay', label: '小时（0-23）', op: ['eq', 'in'], valueType: 'number' },
];

// ============ 操作 ============
export const ACTIONS = [
  { type: 'update_field', label: '更新字段', config: { field: 'string', value: 'any' }, icon: '✏️' },
  { type: 'update_priority', label: '调整优先级', config: { priority: 'string' }, icon: '🚨' },
  { type: 'update_status', label: '变更状态', config: { status: 'string' }, icon: '🔄' },
  { type: 'assign_user', label: '指派给', config: { userId: 'string' }, icon: '👤' },
  { type: 'add_assignee', label: '添加负责人', config: { userId: 'string' }, icon: '➕' },
  { type: 'add_label', label: '添加标签', config: { label: 'string' }, icon: '🏷️' },
  { type: 'remove_label', label: '移除标签', config: { label: 'string' }, icon: '🗑️' },
  { type: 'create_work_item', label: '创建子工作项', config: { type: 'string', title: 'string', priority: 'string', assignee: 'string' }, icon: '➕' },
  { type: 'create_subtask_from_template', label: '从模板创建子工作项', config: { templateId: 'string' }, icon: '📋' },
  { type: 'add_comment', label: '添加评论', config: { content: 'string' }, icon: '💬' },
  { type: 'send_notification', label: '发送通知给', config: { recipientId: 'string', title: 'string', content: 'string', level: 'string' }, icon: '🔔' },
  { type: 'send_notification_to_assignee', label: '通知负责人', config: { title: 'string', content: 'string', level: 'string' }, icon: '🔔' },
  { type: 'send_notification_to_reporter', label: '通知创建人', config: { title: 'string', content: 'string' }, icon: '🔔' },
  { type: 'trigger_webhook', label: '触发 Webhook', config: { configId: 'string' }, icon: '🔌' },
  { type: 'start_review', label: '发起评审', config: { templateId: 'string', participants: 'array' }, icon: '🎯' },
  { type: 'clone_work_item', label: '克隆工作项', config: { title: 'string' }, icon: '📑' },
  { type: 'move_to_iteration', label: '移到迭代', config: { iterationId: 'string' }, icon: '📦' },
  { type: 'log_to_console', label: '记录到日志', config: { message: 'string' }, icon: '📝' },
];

export function listTriggers() { return TRIGGERS; }
export function listConditions() { return CONDITIONS; }
export function listActions() { return ACTIONS; }

// 评估条件
function evalCondition(cond: any, ctx: any): boolean {
  const v = ctx[cond.field];
  const target = cond.value;
  const prev = ctx[`_${cond.field}_prev`];
  switch (cond.op) {
    case 'eq': return v === target;
    case 'neq': return v !== target;
    case 'in': return Array.isArray(target) && target.includes(v);
    case 'not_in': return Array.isArray(target) && !target.includes(v);
    case 'gt': return Number(v) > Number(target);
    case 'gte': return Number(v) >= Number(target);
    case 'lt': return Number(v) < Number(target);
    case 'lte': return Number(v) <= Number(target);
    case 'contains': return String(v || '').includes(String(target));
    case 'not_contains': return !String(v || '').includes(String(target));
    case 'before': return v && new Date(v) < new Date(target);
    case 'after': return v && new Date(v) > new Date(target);
    case 'empty': return !v;
    case 'not_empty': return !!v;
    // 变更相关
    case 'changed_to': return prev !== v && v === target;
    case 'changed_from': return prev === target && prev !== v;
    default: return false;
  }
}

// 执行操作
async function execAction(action: any, ctx: any, log: any): Promise<{ ok: boolean; detail: string }> {
  try {
    switch (action.type) {
      case 'update_field': {
        if (!ctx.workItemId) return { ok: false, detail: 'no workItemId' };
        const item = await prisma.workItem.update({
          where: { id: ctx.workItemId },
          data: { [action.config.field]: action.config.value },
        });
        return { ok: true, detail: `set ${action.config.field} = ${action.config.value} (${item.key})` };
      }
      case 'update_priority': {
        if (!ctx.workItemId) return { ok: false, detail: 'no workItemId' };
        const item = await prisma.workItem.update({
          where: { id: ctx.workItemId },
          data: { priority: action.config.priority },
        });
        return { ok: true, detail: `priority = ${action.config.priority} (${item.key})` };
      }
      case 'update_status': {
        if (!ctx.workItemId) return { ok: false, detail: 'no workItemId' };
        const item = await prisma.workItem.update({
          where: { id: ctx.workItemId },
          data: { status: action.config.status },
        });
        return { ok: true, detail: `status = ${action.config.status} (${item.key})` };
      }
      case 'assign_user': {
        if (!ctx.workItemId) return { ok: false, detail: 'no workItemId' };
        await prisma.workItem.update({
          where: { id: ctx.workItemId },
          data: { assignee: action.config.userId },
        });
        return { ok: true, detail: `assign to ${action.config.userId}` };
      }
      case 'add_assignee': {
        // 演示版 assignee 是单值；这里用 add_label 模拟多负责人
        if (!ctx.workItemId) return { ok: false, detail: 'no workItemId' };
        const item = await prisma.workItem.findUnique({ where: { id: ctx.workItemId } });
        const labels = (item?.labels || '').split(',').filter(Boolean);
        const tag = `@${action.config.userId}`;
        if (!labels.includes(tag)) labels.push(tag);
        await prisma.workItem.update({ where: { id: ctx.workItemId }, data: { labels: labels.join(',') } });
        return { ok: true, detail: `add @${action.config.userId}` };
      }
      case 'add_label': {
        if (!ctx.workItemId) return { ok: false, detail: 'no workItemId' };
        const item = await prisma.workItem.findUnique({ where: { id: ctx.workItemId } });
        const labels = (item?.labels || '').split(',').filter(Boolean);
        if (!labels.includes(action.config.label)) labels.push(action.config.label);
        await prisma.workItem.update({ where: { id: ctx.workItemId }, data: { labels: labels.join(',') } });
        return { ok: true, detail: `add label ${action.config.label}` };
      }
      case 'remove_label': {
        if (!ctx.workItemId) return { ok: false, detail: 'no workItemId' };
        const item = await prisma.workItem.findUnique({ where: { id: ctx.workItemId } });
        const labels = (item?.labels || '').split(',').filter(l => l && l !== action.config.label);
        await prisma.workItem.update({ where: { id: ctx.workItemId }, data: { labels: labels.join(',') } });
        return { ok: true, detail: `remove label ${action.config.label}` };
      }
      case 'add_comment': {
        if (!ctx.workItemId) return { ok: false, detail: 'no workItemId' };
        const exist = await prisma.workItem.findUnique({ where: { id: ctx.workItemId } });
        if (!exist) return { ok: false, detail: `workItem ${ctx.workItemId} not found` };
        await prisma.comment.create({
          data: { workItemId: ctx.workItemId, author: ctx.actor || '系统', content: action.config.content },
        });
        return { ok: true, detail: 'comment added' };
      }
      case 'send_notification': {
        await prisma.notification.create({
          data: {
            recipientId: action.config.recipientId,
            type: 'system', level: action.config.level || 'info',
            title: action.config.title, content: action.config.content,
            resourceType: ctx.workItemType || null,
            resourceId: ctx.workItemId || null,
          },
        });
        return { ok: true, detail: `notified ${action.config.recipientId}` };
      }
      case 'send_notification_to_assignee': {
        if (!ctx.assignee) return { ok: false, detail: 'no assignee' };
        await prisma.notification.create({
          data: {
            recipientId: ctx.assignee,
            type: 'system', level: action.config.level || 'info',
            title: action.config.title, content: action.config.content,
            resourceType: ctx.workItemType || null,
            resourceId: ctx.workItemId || null,
          },
        });
        return { ok: true, detail: `notified assignee ${ctx.assignee}` };
      }
      case 'send_notification_to_reporter': {
        if (!ctx.reporter) return { ok: false, detail: 'no reporter' };
        await prisma.notification.create({
          data: {
            recipientId: ctx.reporter,
            type: 'system', level: action.config.level || 'info',
            title: action.config.title, content: action.config.content,
            resourceType: ctx.workItemType || null,
            resourceId: ctx.workItemId || null,
          },
        });
        return { ok: true, detail: `notified reporter ${ctx.reporter}` };
      }
      case 'create_work_item': {
        if (!ctx.spaceId) return { ok: false, detail: 'no spaceId' };
        const count = await prisma.workItem.count({ where: { type: action.config.type } });
        const prefix = { requirement: 'REQ', task: 'TASK', bug: 'BUG', release: 'REL' }[action.config.type] || 'ITEM';
        const newItem = await prisma.workItem.create({
          data: {
            type: action.config.type,
            key: `${prefix}-${count + 1}`,
            title: action.config.title,
            status: '待评审',
            priority: action.config.priority || 'P2',
            reporter: ctx.actor || '系统',
            assignee: action.config.assignee || null,
            spaceId: ctx.spaceId,
            parentId: ctx.workItemId || null,
          },
        });
        return { ok: true, detail: `created ${newItem.key}` };
      }
      case 'create_subtask_from_template': {
        // 调用模板 API 内部
        const template = await prisma.workItemTemplate.findUnique({ where: { id: action.config.templateId } });
        if (!template) return { ok: false, detail: 'template not found' };
        if (!ctx.workItemId) return { ok: false, detail: 'no workItemId' };
        const defaults = JSON.parse(template.defaultFields || '{}');
        const childItems = JSON.parse(template.childItems || '[]');
        const mainKey = `${template.workType.toUpperCase()}-AUTO-${Date.now().toString(36)}`;
        const main = await prisma.workItem.create({
          data: {
            type: template.workType,
            key: mainKey,
            title: action.config.title || template.name,
            status: '待评审',
            reporter: ctx.actor || '系统',
            ...defaults,
            spaceId: ctx.spaceId,
            parentId: ctx.workItemId,
          },
        });
        for (const ci of childItems) {
          await prisma.workItem.create({
            data: {
              type: ci.type || template.workType,
              key: `${ci.type?.toUpperCase() || 'T'}-AUTO-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`,
              title: ci.title,
              status: '待评审',
              reporter: ctx.actor || '系统',
              ...ci.defaults,
              parentId: main.id,
              spaceId: ctx.spaceId,
            },
          });
        }
        return { ok: true, detail: `created from template ${template.name} (${main.key})` };
      }
      case 'clone_work_item': {
        if (!ctx.workItemId) return { ok: false, detail: 'no workItemId' };
        const src = await prisma.workItem.findUnique({ where: { id: ctx.workItemId } });
        if (!src) return { ok: false, detail: 'source not found' };
        const count = await prisma.workItem.count({ where: { type: src.type } });
        const prefix = { requirement: 'REQ', task: 'TASK', bug: 'BUG', release: 'REL' }[src.type] || 'ITEM';
        const clone = await prisma.workItem.create({
          data: {
            type: src.type, key: `${prefix}-${count + 1}`,
            title: action.config.title || `${src.title} (副本)`,
            description: src.description, status: '待评审', priority: src.priority,
            reporter: ctx.actor || '系统', assignee: src.assignee, module: src.module,
            estimate: src.estimate, storyPoints: src.storyPoints, labels: src.labels,
            spaceId: src.spaceId,
          },
        });
        return { ok: true, detail: `cloned to ${clone.key}` };
      }
      case 'move_to_iteration': {
        if (!ctx.workItemId) return { ok: false, detail: 'no workItemId' };
        const it = await prisma.iteration.findUnique({ where: { id: action.config.iterationId } });
        if (!it) return { ok: false, detail: 'iteration not found' };
        await prisma.workItem.update({
          where: { id: ctx.workItemId },
          data: { iteration: { connect: { id: it.id } } },
        });
        return { ok: true, detail: `moved to ${it.name}` };
      }
      case 'log_to_console': {
        const message = (action.config.message || '').replace(/\{\{(\w+)\}\}/g, (_: string, k: string) => String(ctx[k] ?? ''));
        console.log('[Automation]', message);
        return { ok: true, detail: `logged: ${message}` };
      }
      case 'trigger_webhook': {
        // 延迟 require 避免循环依赖
        const { triggerWebhooks } = await import('./webhookEngine');
        await triggerWebhooks(ctx.triggerType || 'manual', ctx);
        return { ok: true, detail: `webhook triggered` };
      }
      case 'start_review': {
        if (!ctx.workItemId) return { ok: false, detail: 'no workItemId' };
        const tmpl = await prisma.reviewTemplate.findUnique({ where: { id: action.config.templateId } });
        if (!tmpl) return { ok: false, detail: 'template not found' };
        const items = JSON.parse(tmpl.items);
        const review = await prisma.review.create({
          data: {
            workItemId: ctx.workItemId,
            reviewType: tmpl.reviewType,
            title: `${tmpl.name} (${ctx.key || ''})`,
            initiator: ctx.actor || '系统',
            status: 'pending',
            items: { create: items.map((it: any) => ({
              name: it.name, itemType: it.itemType || 'score',
              description: it.description || '', maxScore: it.maxScore || 5,
            })) },
          },
        });
        return { ok: true, detail: `review created: ${review.id}` };
      }
      default:
        return { ok: false, detail: `unknown action type: ${action.type}` };
    }
  } catch (e: any) {
    return { ok: false, detail: e.message };
  }
}

// 执行自动化规则
export async function runAutomation(rule: any, context: any): Promise<{
  matched: boolean;
  actionsExecuted: any[];
  log: any;
}> {
  const conditions = JSON.parse(rule.conditions || '[]');
  const actions = JSON.parse(rule.actions || '[]');

  // 评估条件
  let matched = conditions.length === 0;
  if (conditions.length > 0) {
    matched = conditions.every((c: any) => evalCondition(c, context));
  }

  const actionsExecuted: any[] = [];
  if (matched) {
    for (const action of actions) {
      const result = await execAction(action, context, null);
      actionsExecuted.push({ type: action.type, config: action.config, ...result });
    }
  }

  // 写日志
  const log = await prisma.automationLog.create({
    data: {
      ruleId: rule.id,
      ruleName: rule.name,
      triggerContext: JSON.stringify(context),
      conditionsResult: String(matched),
      actionsExecuted: JSON.stringify(actionsExecuted),
      status: actionsExecuted.every(a => a.ok) ? 'success' : (matched ? 'failed' : 'skipped'),
    },
  });

  // 更新规则统计
  await prisma.automationRule.update({
    where: { id: rule.id },
    data: {
      runCount: { increment: 1 },
      lastRunAt: new Date(),
      lastRunResult: matched ? `成功执行 ${actionsExecuted.length} 个操作` : '条件未匹配',
    },
  });

  return { matched, actionsExecuted, log };
}

// 干跑（不写实际数据）
export async function testRule(rule: any, context: any): Promise<{
  matched: boolean;
  conditionsEval: any[];
  actionsPreview: any[];
}> {
  const conditions = JSON.parse(rule.conditions || '[]');
  const actions = JSON.parse(rule.actions || '[]');

  const conditionsEval = conditions.map((c: any) => ({
    condition: c,
    result: evalCondition(c, context),
    actual: context[c.field],
  }));

  const matched = conditions.length === 0 || conditionsEval.every(c => c.result);

  const actionsPreview = actions.map((a: any) => ({
    type: a.type,
    config: a.config,
    wouldDo: describeAction(a, context),
  }));

  return { matched, conditionsEval, actionsPreview };
}

function describeAction(action: any, ctx: any): string {
  switch (action.type) {
    case 'update_field': return `将 ${action.config.field} 更新为 ${action.config.value}`;
    case 'assign_user': return `指派给 ${action.config.userId}`;
    case 'add_label': return `添加标签 ${action.config.label}`;
    case 'add_comment': return `添加评论：${action.config.content}`;
    case 'send_notification': return `通知 ${action.config.recipientId}：${action.config.title}`;
    case 'create_work_item': return `创建子工作项：${action.config.title}`;
    default: return action.type;
  }
}
