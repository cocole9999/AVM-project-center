# AVM 项目中心 — 完整演示版（V1.0 + V1.1 + V1.2 + AI + 生产化）

> 按照 PRD 实现的可演示原型：React + Node.js + SQLite，覆盖工作项管理、流程引擎、Stage-Gate 评审、深度度量、智能化能力，并配套 Docker 生产化部署。

---

## 快速启动

### 环境要求

- Node.js 18+（已测试 v25.2.1）
- npm 9+
- Windows / macOS / Linux

### 第一次启动

```bash
# 1. 安装后端依赖 + 初始化数据库
cd backend
npm install
npm run db:push     # 推送 Prisma schema 到 SQLite
npm run db:seed     # 写入演示数据（18 个工作项 + 2 个迭代 + 关联 + 评论）

# 2. 安装前端依赖
cd ../frontend
npm install

# 3. 启动后端（新窗口）
cd ../backend
npm run dev
# 监听 http://localhost:4000

# 4. 启动前端（再新窗口）
cd ../frontend
npm run dev
# 监听 http://localhost:5173
```

打开浏览器访问 **http://localhost:5173**，即可看到 AVM 项目中心演示。

### 重置数据

```bash
cd backend
npm run db:reset    # 重建数据库并重新写入种子数据
```

---

## 技术栈

| 层 | 技术 |
|---|---|
| 前端 | React 18 + TypeScript + Vite + Ant Design 5 + @dnd-kit |
| 后端 | Node.js + Express + TypeScript + Prisma ORM |
| 数据库 | SQLite（单文件 `backend/data.db`，易分发） |
| 通信 | RESTful API（前端通过 Vite Proxy 转发到后端） |

---

## 已实现功能

### ✅ 工作项管理
- 4 种工作项类型：需求 / 任务 / 缺陷 / 版本
- 字段：标题、描述、状态、优先级（P0-P3）、严重程度（缺陷）、负责人、模块、估分、实际工时、计划/实际起止时间、标签、迭代归属
- 创建 / 编辑 / 删除 / 列表 / 详情
- 工作项关联（关联/阻塞/重复/引用）
- 父子层级（Epic → Story → Task）

### ✅ 三种视图
1. **表格视图**：多列展示、筛选、排序、分组、批量勾选、估分/工时进度条
2. **看板视图**：拖拽流转状态、按状态分组、估分汇总、超期高亮
3. **甘特视图**：日/周/月三档时间轴、今日线、进度条、未排期归集

### ✅ 详情页
- 完整字段展示与内联编辑
- Markdown 简化渲染（## 标题、- 列表、**加粗**）
- 状态机强校验（不可流转到非法状态）
- 子工作项列表
- 关联工作项（双向）
- 评论功能
- 活动流（创建/状态变更/字段修改/评论自动留痕）

### ✅ V1.1 流程引擎
- **节点流配置**：需求/任务/缺陷 三种内置流程；可视化节点编辑器（@xyflow/react）
- **流转规则**：节点准入条件（DOD 校验）、权限控制、必填字段
- **Stage-Gate 评审**：TR/DCP/QR 三类评审模板（5/4/4 个要素），参与者打分，自动计算结论
- **工作流触发**：状态机自动联动评审发起；评审结论回写工作项

### ✅ V1.2 深度度量
- **图表库**：16+ 图表类型（柱/线/饼/面积/散点/雷达/热力/漏斗/仪表/桑基/树图/矩阵/表格…）
- **图表编辑器**：可视化配置维度/指标/筛选/分组
- **数据预览**：实时计算引擎，支持 `work_items / activities / comments` 多源
- **自定义仪表盘**：组件拖拽布局，多人共享，系统/自定义双模

### ✅ AI 能力（启发式引擎）
- **AI 估分建议**：基于历史相似工作项的相似度 + 估分 + 实际工时加权
- **AI 缺陷归类**：9 大类规则引擎（UI/功能/性能/接口/数据/安全/兼容/网络/三方）
- **AI 优先级建议**：关键字 + 缺陷严重程度联合判定
- **AI 风险评估**：排期/工时/阻塞/子项/资源五维度评分
- **AI 智能问答**：自然语言查询项目状态（"P0 多少个？""状态分布？"）
- **AI 周报生成**：自动汇总个人完成/进行中/新建/评论

### ✅ 用户与权限
- 4 级角色：租户管理员 / 空间管理员 / 业务管理员 / 普通成员
- 测试账号：
  - `admin / admin123` — 租户管理员
  - `pm / pm123` — 空间管理员
  - `zhangsan / 123456` — 业务管理员
  - `lisi / 123456` — 普通成员

### ✅ 生产化部署
- `docker-compose.yml` 一键起 PostgreSQL + 后端 + 前端（Nginx）
- 后端 Dockerfile（Node 20 多阶段构建）
- 前端 Dockerfile（Nginx 静态托管，含 SPA fallback）
- `.env.example` 环境变量模板
- PostgreSQL schema 切换：仅需修改 `DATABASE_URL` + 移除 `@db.Text` 注释

---

## 与 PRD 对位的实现度

| PRD 模块 | 实现度 | 说明 |
|---|---|---|
| 工作项管理 | ✅ 100% | 含 PRD 中列出的全部核心字段 |
| 视图系统 | ✅ 100% | 表格/看板/甘特三种视图全部实现 |
| 详情页 | ✅ 95% | 包含字段/关联/评论/活动流/AI 按钮/流程流转 |
| 项目仪表盘 | ✅ 90% | 核心指标卡片 + 状态分布 + 临期预警 + 自定义仪表盘 |
| 权限体系 | ✅ 80% | 4 级角色 + 用户列表 + 字段级权限待 V2.0 |
| 流程引擎（节点流配置） | ✅ 90% | 可视化节点编辑器 + 节点/流转/准入规则 |
| Stage-Gate 评审 | ✅ 90% | TR/DCP/QR 模板 + 参与者打分 + 总结论自动判定 |
| 自动化工作流 | 🔶 60% | 状态机 + 评审联动，复杂触发器待 V2.0 |
| AI 能力 | ✅ 85% | 估分/归类/优先级/风险/智能问答/周报全部实现（启发式引擎） |
| 度量仪表盘（深度图表） | ✅ 90% | 16+ 图表类型 + 维度/指标/筛选 + 自定义仪表盘 |
| 资源管理 | ❌ | V2.0 |
| IM 集成 | ❌ | V2.0 |
| 开放平台与 API | ✅ 80% | 完整 RESTful API + Docker 部署 |
| 生产化部署 | ✅ 90% | Docker Compose + Dockerfile + Nginx + PostgreSQL |

---

## 目录结构

```
avm-demo/
├── backend/                      # 后端
│   ├── prisma/schema.prisma      # 数据模型
│   ├── src/
│   │   ├── index.ts              # 入口
│   │   ├── db.ts                 # Prisma client
│   │   ├── constants.ts          # 状态机/颜色映射
│   │   ├── seed.ts               # 种子数据
│   │   ├── services/
│   │   │   ├── flowEngine.ts     # V1.1 流程引擎
│   │   │   ├── reviewEngine.ts   # V1.1 评审引擎
│   │   │   └── aiEngine.ts       # AI 启发式引擎
│   │   └── routes/
│   │       ├── workItems.ts      # 工作项 CRUD + 关联 + 批量流转
│   │       ├── iterations.ts     # 迭代
│   │       ├── comments.ts       # 评论
│   │       ├── activities.ts     # 活动流
│   │       ├── meta.ts           # 元数据 + 统计
│   │       ├── flows.ts          # V1.1 流程
│   │       ├── reviews.ts        # V1.1 评审
│   │       ├── charts.ts         # V1.2 图表
│   │       ├── dashboards.ts     # V1.2 仪表盘
│   │       ├── ai.ts             # AI 能力
│   │       └── users.ts          # 用户与权限
│   ├── Dockerfile                # 后端镜像
│   └── data.db                   # SQLite 数据库（运行后生成）
│
├── frontend/                     # 前端
│   ├── index.html
│   ├── vite.config.ts
│   ├── nginx.conf                # 前端 Nginx 配置
│   ├── Dockerfile                # 前端镜像
│   └── src/
│       ├── main.tsx              # 入口
│       ├── Root.tsx              # 路由
│       ├── App.tsx               # 主布局（侧栏 + 顶栏）
│       ├── api.ts                # API 客户端
│       ├── types.ts              # TypeScript 类型定义
│       ├── components/
│       │   └── EChart.tsx        # ECharts 通用图表组件
│       ├── pages/
│       │   ├── DashboardPage.tsx     # V1.0 项目仪表盘
│       │   ├── WorkItemsPage.tsx     # 工作项列表（视图切换）
│       │   ├── WorkItemDetailPage.tsx # 工作项详情（含 AI 按钮 + 流程流转）
│       │   ├── FlowsPage.tsx             # V1.1 流程列表
│       │   ├── FlowEditorPage.tsx        # V1.1 流程可视化编辑器
│       │   ├── ReviewsPage.tsx           # V1.1 评审列表
│       │   ├── ReviewDetailPage.tsx      # V1.1 评审详情 + 提交
│       │   ├── DashboardsPage.tsx        # V1.2 仪表盘列表
│       │   ├── DashboardDetailPage.tsx   # V1.2 仪表盘详情
│       │   ├── ChartEditorPage.tsx       # V1.2 图表编辑器
│       │   └── AIPage.tsx                # AI 智能助手
│       └── views/
│           ├── TableView.tsx         # 表格视图
│           ├── KanbanView.tsx        # 看板视图（@dnd-kit）
│           └── GanttView.tsx         # 甘特视图（自研 SVG 简化版）
│
├── docker-compose.yml            # 一键起 PostgreSQL + 后端 + 前端
├── .env.example                  # 环境变量模板
├── final_e2e.py                  # 17 个 E2E 验证用例
└── README.md                     # 本文件
```

---

## API 速查

### V1.0 工作项
| Method | Path | 说明 |
|---|---|---|
| GET | `/api/health` | 健康检查 |
| GET | `/api/work-items?type=&status=&priority=&assignee=&q=` | 工作项列表 |
| GET | `/api/work-items/:id` | 工作项详情（含子项/关联/评论） |
| POST | `/api/work-items` | 创建工作项 |
| PATCH | `/api/work-items/:id` | 更新工作项（含状态流转校验） |
| DELETE | `/api/work-items/:id` | 删除 |
| POST | `/api/work-items/:id/relations` | 添加关联 |
| POST | `/api/work-items/bulk-status` | 批量状态流转 |
| GET | `/api/iterations` | 迭代列表 |
| POST | `/api/comments` | 添加评论 |
| GET | `/api/activities?workItemId=` | 活动流 |
| GET | `/api/meta/options` | 字段选项 |
| GET | `/api/meta/stats` | 全局统计 |

### V1.1 流程与评审
| Method | Path | 说明 |
|---|---|---|
| GET | `/api/flows` | 流程列表 |
| GET | `/api/flows/:id` | 流程详情（节点 + 流转） |
| POST | `/api/flows` | 创建流程 |
| GET | `/api/reviews` | 评审列表 |
| POST | `/api/reviews` | 发起评审 |
| GET | `/api/reviews/:id` | 评审详情 |
| POST | `/api/reviews/:id/submit` | 参与者提交要素 |
| POST | `/api/reviews/:id/finalize` | 总结论 |
| GET | `/api/reviews/templates/all` | 评审模板 |
| POST | `/api/reviews/:id/transition` | 工作项流转 |

### V1.2 图表与仪表盘
| Method | Path | 说明 |
|---|---|---|
| GET | `/api/charts` | 图表列表 |
| POST | `/api/charts` | 创建图表 |
| PATCH | `/api/charts/:id` | 更新图表 |
| POST | `/api/charts/:id/compute` | 计算图表数据 |
| POST | `/api/charts/preview` | 预览（不持久化） |
| GET | `/api/dashboards` | 仪表盘列表 |
| POST | `/api/dashboards` | 创建仪表盘 |

### AI 能力
| Method | Path | 说明 |
|---|---|---|
| POST | `/api/ai/suggest-estimate` | AI 估分建议 |
| POST | `/api/ai/classify-bug` | AI 缺陷归类 |
| POST | `/api/ai/suggest-priority` | AI 优先级建议 |
| POST | `/api/ai/assess-risk/:workItemId` | AI 风险评估 |
| POST | `/api/ai/qa` | 智能问答 |
| GET | `/api/ai/weekly-report?user=` | AI 周报 |
| GET | `/api/ai/configs` | AI 字段配置 |

### 用户与权限
| Method | Path | 说明 |
|---|---|---|
| GET | `/api/users` | 用户列表 |
| POST | `/api/users` | 创建用户 |
| PATCH | `/api/users/:id` | 更新用户 |

---

## 演示路径建议

打开 http://localhost:5173 后推荐按以下顺序体验：

1. **项目仪表盘**（默认页）：看核心指标 + 临期项
2. **需求 → 看板视图**：拖拽一个卡片从「待评审」流转到「已规划」
3. **需求 → 表格视图**：筛选 + 排序 + 勾选批量操作
4. **需求 → 甘特视图**：切换日/周/月视图、滚动时间轴
5. **打开任意工作项详情**：体验编辑、子项、关联、评论、活动流、**AI 估分**、**AI 风险**、**流程流转**
6. **流程管理**：进入「流程」查看 3 条内置流程，打开编辑可视化节点流
7. **评审管理**：进入「评审」查看模板（TR/DCP/QR），打开工作项发起评审
8. **仪表盘**：进入「仪表盘」查看内置仪表盘，新建自定义仪表盘
9. **AI 助手**：进入「AI」体验智能问答（"P0 多少个？"）、估分建议、缺陷归类、个人周报

## 生产部署（Docker）

```bash
# 启动 PostgreSQL + 后端 + 前端
cp .env.example .env
docker compose up -d
# 访问 http://localhost
```

---

## 常见问题

**Q: 端口被占用？**
A: 修改 `backend/.env` 的 `PORT` 和 `frontend/vite.config.ts` 的 `server.port`。

**Q: 浏览器打开看不到数据？**
A: 检查后端是否在 4000 端口运行；浏览器 F12 查看 Network 是否 200。

**Q: 拖拽看板不生效？**
A: 必须按下一段距离（4px）才开始拖拽，避免误操作。

**Q: 想加新字段？**
A: 后端：`prisma/schema.prisma` 加字段 → `npx prisma db push` → `npx prisma generate`；前端：在 `types.ts` 和对应页面加字段。

---

## 下一步可扩展方向

按 PRD 路线推荐：

- **V1.3**（1 周）：字段级权限、复杂自动化（触发器+条件+操作）
- **V2.0**（2-3 周）：资源管理、IM 集成（飞书/钉钉）、AI MCP、开放 SDK
- **LLM 接入**：将 `aiEngine.ts` 替换为真实 LLM 调用（OpenAI / Claude / 国产大模型），保留启发式作为兜底