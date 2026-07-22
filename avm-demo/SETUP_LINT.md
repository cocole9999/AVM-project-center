# AVM Frontend Import Lint

自动检测 `.tsx` / `.ts` 文件中 **JSX 使用的标识符是否已 import**。

## 痛点

Vite HMR 阶段，加新组件/图标但忘了 import 时会报 `ReferenceError: XxxOutlined is not defined`，整个页面白屏。本 lint 在 commit 前自动检测，避免上线后才发现。

实际中已经反复踩坑 5+ 次（V1.19 / V1.20 / V1.25 / V1.25+1 / V1.27），最常见的漏 import 标识符：

- `ThunderboltOutlined` / `AlertOutlined` / `BankOutlined` 等 antd 图标
- `Alert` / `Statistic` / `Timeline` 等 antd 组件
- 各种自定义组件

## 启用方式

### 方式 1：npm script（最简单）

随时手动跑：

```bash
cd frontend
npm run lint
```

输出示例（无错时）：

```
✅ check-missing-imports: 所有 .tsx/.ts 文件 JSX 使用的标识符都已 import
```

输出示例（有错时）：

```
❌ check-missing-imports: 发现 2 个未 import 的标识符:

  src/pages/WorkItemDetailPage.tsx
    - Alert
    - ThunderboltOutlined
修复: 在文件顶部的 import 块中加缺失的标识符，例如:
  import { Alert } from "antd";
```

### 方式 2：pre-commit hook（推荐）

```bash
# 1. 初始化 git 仓库（如果还没有）
cd avm-demo
git init
git add .
git commit -m "init"

# 2. 配置 git 使用项目内的 .githooks
git config core.hooksPath .githooks

# 3. 之后每次 git commit 会自动跑 npm run lint
```

### 方式 3：husky（如果想用 husky 生态）

```bash
cd avm-demo
npx husky install
npx husky add .husky/pre-commit "cd frontend && npm run lint"
```

## 实现细节

- 脚本位置：`frontend/scripts/check-missing-imports.cjs`
- 跳过：HTML/DOM 全局类型、`React` 命名空间、antd 跨成员（`Sider/Item/...`）、同文件定义
- 识别：`import type { ... }` 和 inline `import { foo, type Bar }` 两种 type 风格
- 不依赖 npm 安装，开箱即用（除了 antd / @ant-design/icons / react 的 antd 子成员白名单）

## 已知限制

1. **不解 JSX 表达式上下文**：字符串里的 `<Identifier>` 也会被算成 JSX（一般不会误报，因为字符串里很少有 PascalCase 标识符）
2. **不识别动态组件**：`const Cmp = someMap[type]; <Cmp />` 不会检测
3. **不识别 default import 的子成员**：`import Antd from 'antd'; <Antd.Card />` 不会触发 Antd.Card 检测（一般场景不需要）

## 误报怎么办？

在 `frontend/scripts/check-missing-imports.cjs` 的 `KNOWN_BUILTINS` / `DOM_BUILTINS` / `ANTD_MEMBERS` 集合里加你项目的特殊标识符，然后提个 PR。
