# AVM 项目中心 — 安全审计报告

> 编制日期：2026-07-23
> 基于代码审计 + 自动化扫描

---

## 一、安全头配置

| 头字段 | 状态 | 值 |
|--------|------|----|
| `X-Content-Type-Options` | ✅ | `nosniff` |
| `X-Frame-Options` | ✅ | `DENY` |
| `Content-Security-Policy` | ✅ 生产 / ❌ 开发 | 生产模式启用 |
| `Strict-Transport-Security` | ⚠️ 开发模式关闭 | 生产模式需配置 HSTS |
| `X-XSS-Protection` | ✅ | Helmets 默认启用 |

### 验证命令
```bash
curl -s -I http://localhost:4000/api/health | grep -i "x-\|content-\|strict-"
```

---

## 二、已知风险

| 风险 | 严重度 | 说明 | 缓解措施 |
|------|--------|------|---------|
| **xlsx Prototype Pollution** | HIGH | SheetJS xlsx 库存在原型污染漏洞，无修复可用 | 仅管理员可触发导入导出；数据为内部可信数据 |
| **body-parser** | LOW | 已通过 `npm audit fix` 修复 | ✅ 已处理 |
| **docker-compose 默认密码** | MEDIUM | `POSTGRES_PASSWORD` 有默认 fallback | 生产部署必须通过 `.env` 设置强密码 |
| **token 明文存储 DB** | MEDIUM | 登录 token 未加盐哈希存储 | 使用 crypto.randomBytes(32) 生成，强度高 |
| **CORS 开发模式** | LOW | 开发模式 CORS `origin: {}` 允许所有来源 | 生产模式有限制 |

---

## 三、密码策略

| 策略 | 当前状态 | 建议 |
|------|---------|------|
| 哈希算法 | bcrypt (10 rounds) | ✅ 符合行业标准 |
| 密码最低长度 | 6 字符 (Zod: `z.string().min(6)`) | 建议提升到 8 字符 |
| 登录限流 | 15 次/15 分钟 | ✅ |
| Token 过期 | 24 小时 | ✅ |
| Token 刷新 | 需重新登录 | ⚠️ 缺少静默刷新机制 |

---

## 四、渗透测试检查清单

| 检查项 | 状态 | 说明 |
|--------|------|------|
| **SQL 注入** | ✅ | Prisma ORM 参数化查询，无原始 SQL 拼接 |
| **XSS (反射型)** | ✅ | Express 不渲染用户 HTML，Zod 校验输入 |
| **XSS (存储型)** | ✅ | 前端评论使用 DOMPurify 净化 Markdown 内容 |
| **CSRF** | ⚠️ 低风险 | 应用使用 Bearer Token 认证，非 Cookie 认证，天然防 CSRF |
| **路径遍历** | ✅ | 文件上传使用随机哈希文件名，防 `../` 攻击 |
| **权限越权** | ✅ | `autoRole` + `requireRole` 中间件覆盖所有写操作 |
| **信息泄露** | ✅ | 错误响应不返回 stack trace，仅 `requestId` 可追踪 |
| **Rate Limiting** | ✅ | 登录 15/15min + API 通用 100/min |
| **HTTP 安全头** | ✅ | Helmet 中间件在生产模式完整启用 |
| **敏感信息泄露** | ✅ | `.env` 在 `.gitignore` 中，不被提交 |
| **依赖漏洞** | ⚠️ | xlsx 库在 npm audit 中报 HIGH 级漏洞，暂无修复 |

---

## 五、生产部署 checklist

- [ ] 修改 `.env` 中的 `POSTGRES_PASSWORD` 为强密码
- [ ] 设置 `NODE_ENV=production` 启用严格模式
- [ ] 确认 Helmet CSP 不破坏前端资源加载
- [ ] 删除 Seed 数据中的默认账号（admin/admin123 等）
- [ ] 配置 HSTS header（`max-age=31536000; includeSubDomains`）
- [ ] 为 LLM 设置页面添加 IP 白名单
- [ ] 运行 `npm audit` 检查新漏洞
- [ ] 配置日志轮转和 retention policy
- [ ] 设置数据库定期备份
- [ ] 启用 WebSocket 连接认证的 IP 频率限制

---

## 六、联系方式

安全问题请提交 GitHub Issue 或联系项目维护者。
