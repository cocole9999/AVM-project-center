# AVM MCP Server 接入指南

AVM 项目中心对外暴露了符合 [Model Context Protocol](https://modelcontextprotocol.io) (MCP) 规范的 Server，让 Claude / Cursor / Cline / aily 等支持 MCP 的 AI 工具能直接读取和操作你的项目数据。

## 能力清单

| 维度 | 数量 | 说明 |
|---|---|---|
| **Tools** | 13 | list/get/create/update 工作项、search、metrics、workload、AI 问答、估分、缺陷归类、自动化触发、人力分析 |
| **Resources** | 50+ | 每个工作项一个 `avm://work-item/{id}` 资源，AI 可直接读取 |
| **Prompts** | 4 | 每日站会 / 迭代回顾 / 风险评估 / 新人入职 模板 |
| **传输方式** | 3 种 | stdio（最稳）+ Streamable HTTP（SSE，推荐）+ Legacy HTTP+SSE |

---

## 方式 A：HTTP 模式（推荐，SSE 协议）

AVM 后端实现了完整的 **MCP Streamable HTTP 2025-03-26 规范** + **Legacy HTTP+SSE 2024-11-05 规范**，
Trae / Claude Desktop / Cursor 等现代客户端配 `"type": "http"` 即可直接走 SSE 通道。

### 前置条件

- AVM 后端跑起来：`cd backend && npm run dev`（默认 `http://localhost:4000`）
- 验证 SSE 端点：
  ```bash
  curl -X POST http://localhost:4000/api/mcp/stream \
    -H "Content-Type: application/json" \
    -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}}}'
  ```
  应返回 `Content-Type: text/event-stream` + `event: message\ndata: {jsonrpc-response}`

### Trae IDE 配置

打开 Trae → AI 面板 → 右上角 ⚙️ → MCP → 添加 MCP Servers → 手动添加：

```json
{
  "mcpServers": {
    "avm": {
      "url": "http://localhost:4000/api/mcp/stream",
      "type": "http"
    }
  }
}
```

**注意**：
- URL 必须用 `/api/mcp/stream`（不是 `/api/mcp`）—— 这是 SSE 端点
- `type: "http"` 即可，Trae 自动识别 SSE
- 状态变 🟢 绿点 = 配上了

### Claude Desktop 配置

编辑 `~/Library/Application Support/Claude/claude_desktop_config.json`（macOS）
或 `%APPDATA%\Claude\claude_desktop_config.json`（Windows）：

```json
{
  "mcpServers": {
    "avm": {
      "url": "http://localhost:4000/api/mcp/stream",
      "type": "http"
    }
  }
}
```

### Cursor 配置

Cursor → Settings → MCP → Add new global MCP server：

```json
{
  "mcpServers": {
    "avm": {
      "url": "http://localhost:4000/api/mcp/stream",
      "type": "http"
    }
  }
}
```

### Cline (VS Code) 配置

Cline → MCP Servers → Configure → 添加：

```json
{
  "mcpServers": {
    "avm": {
      "url": "http://localhost:4000/api/mcp/stream",
      "type": "http"
    }
  }
}
```

---

## 方式 B：stdio 模式（适合严格隔离的客户端）

适合：需要走本地子进程通信的客户端（不暴露端口）。

### Claude Desktop 配置

```json
{
  "mcpServers": {
    "avm": {
      "command": "npx",
      "args": ["tsx", "D:/AI/飞书项目/avm-demo/backend/src/bin/mcp-stdio.ts"]
    }
  }
}
```

**注意**：
- 路径要改成你本机的绝对路径
- 需要先 `cd backend && npm install`，确保 `node_modules/.bin/tsx` 存在
- 也可以打包后用 `node` 跑编译产物（待实现）

### 测试 stdio 是否工作

```bash
cd backend
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}}}' | npx tsx src/bin/mcp-stdio.ts
```

应返回：

```json
{"jsonrpc":"2.0","id":1,"result":{"protocolVersion":"2024-11-05","serverInfo":{"name":"avm-mcp-server","version":"1.0.0"},...}}
```

---

## 工具一览

| 工具名 | 用途 | 示例调用 |
|---|---|---|
| `list_work_items` | 查询工作项 | "列出所有 P0 任务" |
| `get_work_item` | 工作项详情 | "REQ-1 的完整描述" |
| `create_work_item` | 创建工作项 | "加一个 P1 任务：黑盒测试" |
| `update_work_item` | 更新字段 | "把 TASK-5 的状态改成开发中" |
| `add_comment` | 加评论 | "在 BUG-3 下面评论'已修复'" |
| `search` | 全局搜索 | "搜一下透明底盘相关的" |
| `get_metrics` | 项目指标 | "现在工作项总数？按状态分布？" |
| `get_team_workload` | 团队负载 | "张三手上多少活？" |
| `analyze_resources` | AI 人力分析 | "分析 7 月团队利用率" |
| `trigger_automation` | 触发自动化 | "手动跑 P0 缺陷指派规则" |
| `ai_qa` | 智能问答 | "P0 紧急项有哪些？" |
| `ai_estimate` | AI 估分 | "这个需求要多少工时？" |
| `ai_classify_bug` | 缺陷归类 | "归类这个 BUG：登录 500 错误" |

---

## 实战场景

### 场景 1：让 Claude 帮你写晨会报告

> "用 AVM 的每日站会模板，生成今天的状态报告"

→ Claude 会自动调用 `get_metrics` + `list_work_items` + `prompts/get` 拼出 Markdown 报告

### 场景 2：Cursor 里直接创建任务

> "在 AVM 创建一个 P1 任务：测试 V2.5 透明底盘，分配给李四，估分 8h"

→ Cursor 调用 `create_work_item` 一气呵成

### 场景 3：风险评估

> "用 AVM 的风险评估模板，看看本周哪些项目最危险"

→ Claude 调 `analyze_resources` + `get_metrics` + `list_work_items(priority=P0)`，给出 Top 3 风险

### 场景 4：Cursor 自动 follow-up

> "把通知里那 3 个 P0 风险预警都建跟进任务，分配给对应负责人"

→ Cursor 多次调 `create_work_item`，自动从通知内容提取关键信息

---

## 验证接入

启动 AVM 后端后，浏览器访问：

- `http://localhost:4000/api/mcp` — Server info
- `http://localhost:4000/api/mcp/tools` — 13 个工具定义
- `http://localhost:4000/api/mcp/resources` — 所有工作项资源

前端测试页：登录 AVM → 左侧菜单「MCP Server」（`/mcp`）→ 可视化调用工具

---

## 常见问题

**Q1: Claude Desktop 看不到工具？**
A: 重启 Claude Desktop；检查 `claude_desktop_config.json` 路径；查 stderr 日志（macOS: `~/Library/Logs/Claude/`）

**Q2: stdio 模式报 "tsx command not found"？**
A: Windows 下用 `npx.cmd tsx` 或在 `args` 里加 shell 包装。也可用 `node_modules/.bin/tsx.cmd` 直接执行。

**Q3: AI 调工具后没改实际数据？**
A: 调 `create_work_item` / `update_work_item` 会直接改库（带权限校验）。`list_*` / `get_*` 是只读。

**Q4: 公司内网怎么走？**
A: HTTP 模式只需把 `localhost:4000` 换成内网 IP（如 `http://10.0.1.50:4000/api/mcp/stream`），确保端口可达即可。

**Q5: 怎么加新工具？**
A: 改 `backend/src/services/mcpCore.ts` 加 MCP_TOOLS 项 + `executeTool` 分支，不需要重启客户端（HTTP 模式自动拉新）。

**Q6: Trae 报 "SSE error: Invalid content type, expected text/event-stream"？**
A: URL 写错了。必须用 `http://localhost:4000/api/mcp/stream`（带 `/stream`），不能用 `/api/mcp`（那个是 REST 端点返回 JSON）。

**Q7: HTTP 模式返回 502 / 连不上？**
A: 检查后端是否启动（`netstat -ano | findstr :4000`）；防火墙是否放行 4000 端口；后端日志 `out-backend.log` 是否有错。

**Q8: SSE 长连接过几分钟断了？**
A: 正常现象。Trae/Claude 会自动重连。Legacy 模式的 sessionId 30 分钟过期后会需要重新建连。

---

## 进阶：让 AI 自主决策

MCP 工具的设计原则是"原子操作"，让 AI 自由组合。比 V1.8 的 `aiCommand` 更灵活——后者把流程写死成 26 个具名工具，AI 只能调固定名字；MCP 给了 AI 13 个原始操作，AI 可以多次组合：

| V1.8 aiCommand 风格 | V1.8.4 MCP 风格 |
|---|---|
| 写死"创建工作项并指派" | AI 自己：搜 → 看 → 决定是否创建 → 决定分配给谁 |
| 26 个具名工具，难扩展 | 13 个原子操作，加新功能只改后端 |
| 仅限 AVM 前端 | 任何支持 MCP 的 AI 客户端 |

适合需要"AI 主动规划"的场景，代价是 AI 调用次数多、token 多。

---

最后更新：2026-07-19 / V1.8.5（新增 SSE 端点）
