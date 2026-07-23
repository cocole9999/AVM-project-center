import { Router } from 'express';
import { prisma } from '../db';
import { caches } from '../cache';
import { requireAuth, requireRole } from '../middleware/auth';
import { recordAudit, diffFields } from '../utils/audit';
import bcrypt from 'bcrypt';
import crypto from 'crypto';

export const userRouter = Router();

const BCRYPT_ROUNDS = 10;
const TOKEN_EXPIRY_HOURS = 24;

async function hashPassword(pwd: string): Promise<string> {
  return bcrypt.hash(pwd, BCRYPT_ROUNDS);
}

async function verifyPassword(pwd: string, hash: string): Promise<boolean> {
  return bcrypt.compare(pwd, hash);
}

userRouter.get('/', async (_req, res) => {
  const cached = caches.users.get('list:all');
  if (cached) return res.json(cached);
  const list = await prisma.user.findMany({
    select: { id: true, username: true, displayName: true, email: true, department: true, role: true, active: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
  });
  caches.users.set('list:all', list);
  res.json(list);
});

userRouter.post('/', requireRole('tenant_admin'), async (req: any, res) => {
  try {
    const { username, displayName, email, password, department, role } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'username and password required' });
    }
    caches.users.invalidate('list:all');
    const u = await prisma.user.create({
      data: {
        username,
        displayName: displayName || username,
        email: email || null,
        password: await hashPassword(password),
        department: department || null,
        role: role || 'member',
      },
      select: { id: true, username: true, displayName: true, email: true, department: true, role: true },
    });
    recordAudit('user', u.id, 'create', null, { method: 'POST', summary: `创建用户 ${u.username} (${u.role})` }, { username: req.user?.username || 'system', role: req.user?.role || 'system' });
    res.status(201).json(u);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

userRouter.patch('/:id', requireRole('tenant_admin'), async (req: any, res) => {
  try {
    const { displayName, email, department, role, active, password } = req.body;
    const data: any = {};
    if (displayName !== undefined) data.displayName = displayName;
    if (email !== undefined) data.email = email;
    if (department !== undefined) data.department = department;
    if (role !== undefined) data.role = role;
    if (active !== undefined) data.active = active;
    if (password) data.password = await hashPassword(password);
    const before = await prisma.user.findUnique({ where: { id: req.params.id } });
    const u = await prisma.user.update({
      where: { id: req.params.id },
      data,
      select: { id: true, username: true, displayName: true, email: true, department: true, role: true, active: true },
    });
    if (before) {
      const changes = diffFields(before as any, u as any, ['displayName', 'email', 'department', 'role', 'active']);
      const action = role !== undefined && before.role !== role ? 'update' : 'update';
      const summary = role !== undefined && before.role !== role
        ? `${before.username} 角色 ${before.role} → ${u.role}`
        : `${before.username} 更新 (${changes.length} 项)`;
      recordAudit('user', u.id, action, changes, { method: 'PATCH', summary }, { username: req.user?.username || 'system', role: req.user?.role || 'system' });
    }
    res.json(u);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

userRouter.delete('/:id', requireRole('tenant_admin'), async (req: any, res) => {
  const before = await prisma.user.findUnique({ where: { id: req.params.id } });
  await prisma.user.delete({ where: { id: req.params.id } });
  caches.users.invalidate('list:all');
  recordAudit('user', req.params.id, 'delete', null, { method: 'DELETE', summary: `删除用户 ${before?.username}` }, { username: req.user?.username || 'system', role: req.user?.role || 'system' });
  res.status(204).end();
});

// 登录
userRouter.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = await prisma.user.findUnique({ where: { username } });
    if (!user || !user.active) {
      recordAudit('auth', null, 'login_failed', null, { ip: req.ip, method: 'POST', summary: `登录失败: ${username}` });
      return res.status(401).json({ error: '用户名或密码错误' });
    }
    const valid = await verifyPassword(password, user.password);
    if (!valid) {
      recordAudit('auth', user.id, 'login_failed', null, { ip: req.ip, method: 'POST', summary: `登录失败: ${username} 密码错` });
      return res.status(401).json({ error: '用户名或密码错误' });
    }
    // 持久化 token + 24 小时过期
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + TOKEN_EXPIRY_HOURS * 3600 * 1000);
    await prisma.user.update({
      where: { id: user.id },
      data: { token, tokenExpiresAt: expiresAt, lastLoginAt: new Date(), lastLoginIp: req.ip || null },
    });
    recordAudit('auth', user.id, 'login', null, { ip: req.ip, method: 'POST', summary: `${username} 登录` }, { username: user.username, role: user.role || 'member' });
    res.json({
      token,
      user: { id: user.id, username: user.username, displayName: user.displayName, role: user.role, department: user.department },
    });
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

// 登出（清除 token）
// V1.11: 优先用 requireAuth 注入的 req.user（更安全），fallback 到 header
userRouter.post('/logout', async (req: any, res) => {
  try {
    let userId: string | null = null;
    if (req.user?.id && req.user.id !== 'dev-user') {
      userId = req.user.id;
    } else {
      const authHeader = req.headers.authorization || '';
      const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
      if (token) {
        const u = await prisma.user.findUnique({ where: { token }, select: { id: true } });
        userId = u?.id || null;
      }
    }
    if (userId) {
      await prisma.user.update({ where: { id: userId }, data: { token: null } });
      const u = await prisma.user.findUnique({ where: { id: userId } });
      if (u) {
        recordAudit('auth', u.id, 'logout', null, { method: 'POST', summary: `${u.username} 登出` }, { username: u.username, role: u.role || 'member' });
      }
    }
    res.json({ ok: true });
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});