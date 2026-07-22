/**
 * V1.23 文件上传 (评论图片)
 *
 * POST /api/uploads  multipart/form-data (file 字段)
 * 返回: { url: "/uploads/xxx.png", filename, size, mimetype }
 *
 * 文件存到 backend/uploads/ 目录, 通过 /uploads/xxx.png 静态服务访问
 */
import { Router } from 'express';
import multer from 'multer';
import * as path from 'path';
import * as fs from 'fs';
import crypto from 'crypto';
import { requireAuth } from '../middleware/auth';
import { recordAudit, actorFromReq } from '../utils/audit';

export const uploadRouter = Router();

const UPLOAD_DIR = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// 允许的 mime 类型
const ALLOWED_MIMES = new Set([
  'image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/webp', 'image/svg+xml',
]);

// 内存模式 (5MB)
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIMES.has(file.mimetype)) cb(null, true);
    else cb(new Error(`不支持的文件类型: ${file.mimetype}`));
  },
});

uploadRouter.post('/', requireAuth, (req, res, next) => {
  upload.single('file')(req, res, (err: any) => {
    if (err) {
      return res.status(400).json({ error: err.message || '上传失败' });
    }
    next();
  });
}, (req: any, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: '未上传文件' });
    const ext = path.extname(req.file.originalname) || '.png';
    const hash = crypto.randomBytes(8).toString('hex');
    const ts = Date.now();
    const safeName = `${ts}-${hash}${ext}`.replace(/[^a-zA-Z0-9._-]/g, '_');
    const fullPath = path.join(UPLOAD_DIR, safeName);
    fs.writeFileSync(fullPath, req.file.buffer);

    const actor = actorFromReq(req);
    recordAudit('upload', safeName, 'create', null, {
      method: 'POST /uploads',
      summary: `上传文件 ${req.file.originalname} (${(req.file.size / 1024).toFixed(1)} KB)`,
    }, actor);

    res.json({
      ok: true,
      url: `/uploads/${safeName}`,
      filename: safeName,
      originalName: req.file.originalname,
      size: req.file.size,
      mimetype: req.file.mimetype,
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});
