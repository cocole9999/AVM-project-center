/**
 * V1.13 审计日志工具
 *
 * 区别于 Activity（绑 workItemId 的动态流），AuditLog 覆盖全系统所有实体的写操作。
 * 记录：谁 (actor/role)、什么时候、什么实体、什么操作、字段级变化、IP/UA。
 *
 * 用法：
 *   import { recordAudit } from '../utils/audit';
 *   recordAudit('project', p.id, 'create', null, { after: p });   // 立刻写，不 await
 *   recordAudit('project', p.id, 'update', [
 *     { field: 'status', oldValue: 'planning', newValue: 'in_progress' }
 *   ]);
 */
import { prisma } from '../db';

export type AuditEntity =
  | 'project' | 'customer' | 'workItem' | 'carModel' | 'contact'
  | 'dependency' | 'user' | 'webhook' | 'automation' | 'import' | 'handover'
  | 'auth';

export type AuditAction =
  | 'create' | 'update' | 'delete' | 'login' | 'logout'
  | 'login_failed' | 'status_change' | 'import' | 'export'
  | 'toggle' | 'assign';

export interface AuditChange {
  field: string;
  oldValue: any;
  newValue: any;
}

export interface AuditMeta {
  ip?: string;
  userAgent?: string;
  method?: string;
  path?: string;
  summary?: string;     // 人工可读的一句话
  [k: string]: any;
}

/**
 * 写一条审计日志（不阻塞主流程 — 失败只 console.error）
 */
export function recordAudit(
  entity: AuditEntity,
  entityId: string | null | undefined,
  action: AuditAction,
  changes: AuditChange[] | null = null,
  meta: AuditMeta | null = null,
  actor?: { username: string; role: string } | null,
) {
  // fire-and-forget: 不 await, 不 throw
  prisma.auditLog.create({
    data: {
      entity,
      entityId: entityId || 'unknown',
      action,
      actor: actor?.username || 'system',
      actorRole: actor?.role || null,
      changes: changes ? JSON.stringify(changes) : null,
      meta: meta ? JSON.stringify(meta) : null,
    },
  }).catch((e) => {
    console.error('[audit] failed to record:', e.message, { entity, action });
  });
}

/**
 * 从 req 中提取 actor (由 requireAuth 中间件注入的 req.user)
 */
export function actorFromReq(req: any): { username: string; role: string } | null {
  if (req.user && req.user.username) {
    return { username: req.user.username, role: req.user.role || 'unknown' };
  }
  return null;
}

/**
 * 计算两个对象的字段级 diff (用于 update 审计)
 */
export function diffFields(
  before: Record<string, any> | null,
  after: Record<string, any> | null,
  fields: string[],
  ignore: string[] = ['updatedAt', 'createdAt', 'lastLoginAt', 'lastLoginIp'],
): AuditChange[] {
  if (!before || !after) return [];
  const out: AuditChange[] = [];
  for (const f of fields) {
    if (ignore.includes(f)) continue;
    const oldV = before[f];
    const newV = after[f];
    // Date 比较用 ISO
    const oldS = oldV instanceof Date ? oldV.toISOString() : oldV;
    const newS = newV instanceof Date ? newV.toISOString() : newV;
    if (oldS !== newS && !(oldS == null && newS === '') && !(oldS === '' && newS == null)) {
      out.push({ field: f, oldValue: oldS ?? null, newValue: newS ?? null });
    }
  }
  return out;
}

/**
 * Express middleware: 自动记录 (entity, action) 到 req，便于后续 handler 一句话调用
 *
 *   router.post('/projects', requireAuth, audit('project', 'create'), async (req, res) => { ... });
 *
 * 配合 audit.flush(req, { entityId: ..., changes: [...] }) 在 handler 末尾写日志
 */
import { Request, Response, NextFunction } from 'express';
export function audit(entity: AuditEntity, action: AuditAction) {
  return (req: any, _res: Response, next: NextFunction) => {
    req._audit = { entity, action, meta: { ip: req.ip, method: req.method, path: req.path, userAgent: req.headers['user-agent'] } };
    next();
  };
}

/** handler 末尾调用，写审计 (fire-and-forget) */
export function flush(req: any, extra: { entityId?: string; changes?: AuditChange[]; summary?: string } = {}) {
  if (!req._audit) return;
  const { entity, action, meta } = req._audit;
  const fullMeta = { ...meta, summary: extra.summary };
  recordAudit(entity, extra.entityId, action, extra.changes || null, fullMeta, actorFromReq(req));
}
