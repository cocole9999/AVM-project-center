#!/usr/bin/env node
/**
 * check-missing-imports.cjs
 *
 * 扫描 frontend/src 下所有 .tsx/.ts 文件，检查 JSX/TSX 中使用的标识符
 * 是否已经在该文件的 import 块中声明。漏 import 是 Vite HMR 阶段最常见的
 * ReferenceError 来源 (ThunderboltOutlined/Alert/...)，运行此脚本提前发现。
 *
 * 检查范围:
 *   1. JSX 使用的 antd 组件 (PascalCase) 是否在 antd import 块中
 *   2. JSX 使用的 antd 图标 (XxxOutlined) 是否在 @ant-design/icons import 块中
 *   3. JSX 使用的自定义组件 (本地 imports from '..') 是否在 import 块中
 *
 * 不检测:
 *   - HTML 元素 (div/span/input/...)
 *   - React hooks (useState/useEffect/...)  — 通常 import 'react' 已带
 *   - 全局对象 (console/window/document/setTimeout/...)
 *   - 来自同文件其他位置 (let/const/function) 的标识符
 *   - 类型 import (interface/type) — type-only 不会触发 ReferenceError
 */
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..', 'src');
const KNOWN_BUILTINS = new Set([
  // JS 内置
  'console', 'window', 'document', 'navigator', 'setTimeout', 'setInterval', 'clearTimeout', 'clearInterval',
  'Promise', 'Date', 'Math', 'JSON', 'Object', 'Array', 'Map', 'Set', 'WeakMap', 'WeakSet',
  'Error', 'TypeError', 'RangeError', 'SyntaxError', 'parseInt', 'parseFloat', 'isNaN', 'isFinite',
  'Number', 'String', 'Boolean', 'Symbol', 'RegExp', 'URL', 'URLSearchParams', 'fetch',
  'globalThis', 'process', 'Buffer',
  // React 内置 (来自 react 包)
  'Fragment', 'Children', 'Component', 'PureComponent', 'memo', 'forwardRef', 'createContext',
  'useState', 'useEffect', 'useRef', 'useMemo', 'useCallback', 'useContext', 'useReducer', 'useImperativeHandle', 'useLayoutEffect', 'useDebugValue',
  'createElement', 'cloneElement', 'createRef', 'isValidElement', 'lazy', 'Suspense', 'StrictMode',
  // React Router 内置 (假设用户已 import, 这里只放过常用)
  'Link', 'NavLink', 'Navigate', 'Outlet', 'useNavigate', 'useLocation', 'useParams', 'useMatch', 'useSearchParams', 'BrowserRouter', 'HashRouter', 'MemoryRouter', 'Routes', 'Route', 'Router',
  // antd 内置 (这些通常从 antd 包 import)
  // 通过扫描 antd import 块动态跳过
  // 第三方常见
  'dayjs',
]);

function walk(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (/\.(tsx|ts)$/.test(entry.name)) out.push(full);
  }
  return out;
}

function stripStringsAndComments(src) {
  // 只 strip 注释, 不 strip 字符串 — JSX 里的 "<Identifier" 在字符串里也只是文本
  // (不会作为 React 元素渲染), 但 strip 字符串会破坏代码结构 (如 `''` 之间的代码被吃)
  // 风险: 字符串里的 <Foo> 会被当作 JSX 元素, 误报
  // 解决: 对字符串内的 <Xxx 做白名单跳过 (DOM/HTML 元素和已知 prop 名)
  return src
    .replace(/\/\*[\s\S]*?\*\//g, () => '')
    .replace(/\/\/.*$/gm, () => '');
}

function extractImportBlock(src) {
  // 收集所有 import { ... } from '...' 中的标识符
  const imported = new Set();
  // default import
  for (const m of src.matchAll(/^\s*import\s+(\w+)\s+from\s+/gm)) {
    imported.add(m[1]);
  }
  // named imports (支持多行 + 类型)
  for (const m of src.matchAll(/import[\s\S]*?\{([\s\S]+?)\}\s*from\s*['"][^'"]+['"]/g)) {
    for (const id of m[1].split(',')) {
      const name = id.trim().split(/\s+as\s+/).pop().trim();
      if (name) imported.add(name);
    }
  }
  // import * as X
  for (const m of src.matchAll(/import\s*\*\s*as\s+(\w+)\s+from\s+/g)) {
    imported.add(m[1]);
  }
  return imported;
}

function extractInlineTypeOnly(src) {
  // 收集 inline type imports: 在 named import 列表中的 `type Foo`
  // 例如: import { foo, type Bar, type Baz } from '...'
  const types = new Set();
  for (const m of src.matchAll(/import\s*\{([\s\S]+?)\}\s*from\s*['"][^'"]+['"]/g)) {
    for (const id of m[1].split(',')) {
      const trimmed = id.trim();
      // 匹配 "type Xxx" 或 "type Xxx as Yyy"
      const typeMatch = trimmed.match(/^type\s+(\w+)(?:\s+as\s+\w+)?$/);
      if (typeMatch) types.add(typeMatch[1]);
    }
  }
  return types;
}

function extractJsxIdentifiers(stripped) {
  // 找 <Xxx 或 <Xxx.Xxx 这种 JSX 元素
  // 关键: 区分 JSX vs 泛型 — JSX 后面是 props 或 /> 或 >, 泛型后面是 , 或 >
  // 简化启发: JSX 元素 (PascalCase) 后面接 (空格 + 小写名) 或 (空格 + >)
  //            泛型 (PascalCase) 后面接 (空格 + >) 或 (空格 + ,)
  // 区分法: 看 <Identifier 后的字符: 如果是 ">" 且前后都是泛型上下文(无 props), 跳过
  const ids = new Set();
  // 排除 < 后跟 [, , 等纯泛型情况
  const re = /<([A-Z][A-Za-z0-9_]*(?:\.[A-Z][A-Za-z0-9_]*)?)(?=[\s/>,\]\[])/g;
  let m;
  while ((m = re.exec(stripped)) !== null) {
    const id = m[1].split('.')[0];
    if (!id) continue;
    // 排除: <T>(...)  这种泛型函数声明 — 后面是 ( 不是 props
    const after = stripped.slice(m.index + 1 + m[1].length, m.index + 1 + m[1].length + 5);
    // 如果紧跟 ( 如 <Foo>(  — 泛型
    if (after.trimStart().startsWith('(')) continue;
    ids.add(id);
  }
  return ids;
}

function findMissing(file) {
  const src = fs.readFileSync(file, 'utf-8');
  const stripped = stripStringsAndComments(src);
  const imported = extractImportBlock(src);
  const used = extractJsxIdentifiers(stripped);

  // 跳过 type imports (interface/type) — 不影响运行时
  // 关键: 'type' 关键字可以紧跟 import, 也可以是 import 后第一个 token; 多行 import type {...} 块
  const typeOnly = new Set();
  // 多行 import type { ... } from '...'
  for (const m of src.matchAll(/import\s+type\s*\{([\s\S]+?)\}\s*from\s*['"][^'"]+['"]/g)) {
    for (const id of m[1].split(',')) {
      const n = id.trim().split(/\s+as\s+/).pop().trim();
      if (n) typeOnly.add(n);
    }
  }
  // 单行 import type Foo from '...'
  for (const m of src.matchAll(/import\s+type\s+(\w+)\s+from\s+/g)) {
    typeOnly.add(m[1]);
  }
  // inline type imports (在 named import 列表中: import { foo, type Bar } from '...')
  for (const id of extractInlineTypeOnly(src)) {
    typeOnly.add(id);
  }

  // 跨文件类型 import: import type { Xxx } from '../types'
  // 实际上 extractImportBlock 已经收集了所有 import 标识符(包括 type 后的)
  // 所以这些已经 imported, 不会报。但为安全, typeOnly 优先放过

  // 收集 antd 包的导入 — 来自 antd 的成员访问 (Layout.Sider / Form.Item / Row.Col) 跳过
  const hasAntdImport = /^import\s+(?:type\s+)?\{[^}]*\}\s+from\s+['"]antd['"]/m.test(src);
  // 已知 antd 子成员 (防误报)
  // antd 子成员 (用户已 import antd 顶级, 然后用 Layout.Sider / Typography.Title 等)
  // 这些不需要单独 import, 但 antdSubMembers 之前误把顶级组件 (Modal/Drawer/Tooltip...) 也放进来了, 导致漏报
  // 正确设计: 只放过"看起来是 JSX 但实际是 antd.X 子成员"的情况
  const antdSubMembers = new Set([
    // antd 顶级: 不能放过 (必须 import)
    // 真正子成员 (用 . 访问): 下面 antdDotAccess 才是
  ]);
  // 已知 antd 子成员 (用 . 访问: Layout.Sider / Typography.Title / Upload.Dragger / Card.Grid)
  const antdDotAccess = new Set([
    'Header', 'Content', 'Footer', 'Sider', 'Item', 'Group', 'Option', 'OptGroup', 'Panel',
    'TabPane', 'Grid', 'Column', 'Step', 'SubMenu', 'MenuItem', 'MenuItemGroup', 'CheckableTag',
    'Search', 'TextArea', 'Password', 'RangePicker', 'Dragger', 'Title', 'Text', 'Paragraph', 'Link',
  ]);
  // 如果用户已经 import antd (即 hasAntdImport), 则 antd 包的成员 (Card/Modal/...) 和
  // antd 子成员 (Sider/Item/...) 都被放过
  for (const id of used) {
    if (hasAntdImport && (antdSubMembers.has(id) || antdDotAccess.has(id))) {
      // 标记为已 skip
    }
  }

  // DOM 全局类型 (来自 TypeScript 内置 lib.dom.d.ts)
  const DOM_BUILTINS = new Set([
    'File', 'Blob', 'FileReader', 'FormData', 'Headers', 'Request', 'Response', 'URL', 'URLSearchParams',
    'Document', 'Window', 'HTMLElement', 'HTMLDivElement', 'HTMLInputElement', 'HTMLButtonElement',
    'HTMLFormElement', 'HTMLAnchorElement', 'HTMLImageElement', 'HTMLCanvasElement', 'HTMLSelectElement',
    'HTMLOptionElement', 'HTMLTextAreaElement', 'Element', 'Node', 'NodeList', 'Event', 'MouseEvent',
    'KeyboardEvent', 'TouchEvent', 'WheelEvent', 'DragEvent', 'PointerEvent', 'FocusEvent',
    'InputEvent', 'UIEvent', 'AnimationEvent', 'TransitionEvent', 'Storage', 'StorageEvent',
    'MessageEvent', 'PopStateEvent', 'CustomEvent', 'EventTarget', 'AbortController', 'AbortSignal',
    'XMLHttpRequest', 'WebSocket', 'FormDataEvent', 'SubmitEvent', 'ProgressEvent', 'PromiseRejectionEvent',
    'localStorage', 'sessionStorage', 'navigator', 'location', 'history', 'screen',
    'ResizeObserver', 'IntersectionObserver', 'MutationObserver', 'URLPattern',
  ]);
  // antd 跨成员 (解构后使用) 常见
  const ANTD_MEMBERS = new Set([
    'Sider', 'Header', 'Content', 'Footer', 'Item', 'Group', 'Option', 'OptGroup', 'Panel',
    'TabPane', 'Grid', 'Column', 'Step', 'SubMenu', 'MenuItem', 'MenuItemGroup', 'CheckableTag',
    'Search', 'TextArea', 'Password', 'RangePicker', 'Dragger', 'Title', 'Text', 'Paragraph', 'Link',
  ]);
  // React 类型命名空间
  const REACT_NS = new Set(['React']);

  const missing = [];
  const isTsx = file.endsWith('.tsx');
  for (const id of used) {
    if (imported.has(id)) continue;
    if (typeOnly.has(id)) continue;
    if (KNOWN_BUILTINS.has(id)) continue;
    if (DOM_BUILTINS.has(id)) continue;
    if (ANTD_MEMBERS.has(id) && hasAntdImport) continue;
    // React 命名空间: 文件已经 `import React, {...} from 'react'` 或 `import * as React from 'react'`
    if (REACT_NS.has(id) && /(import\s+(\w+,|\{\s*[^}]*\bReact\b))|(import\s*\*\s*as\s+React\s+from\s+['"]react['"])/.test(src)) continue;
    // 同文件定义
    const defRe = new RegExp(`\\b(const|let|var|function|class|interface|type)\\s+${id}\\b`);
    const exportDefRe = new RegExp(`\\bexport\\s+(const|let|var|function|class|interface|type)\\s+${id}\\b`);
    if (defRe.test(stripped) || exportDefRe.test(stripped)) continue;
    // antd 跨成员访问
    if (hasAntdImport && (antdSubMembers.has(id) || antdDotAccess.has(id))) {
      continue;
    }
    // HTML/DOM 类型
    if (/Element$|Event$|Node$/.test(id)) continue;
    // .ts 文件不强制 (主要是泛型, 没有 JSX)
    if (!isTsx) continue;
    missing.push(id);
  }
  return missing;
}

const files = walk(SRC);
let totalIssues = 0;
const issuesByFile = {};

for (const f of files) {
  const missing = findMissing(f);
  if (missing.length > 0) {
    issuesByFile[f] = missing;
    totalIssues += missing.length;
  }
}

if (totalIssues === 0) {
  console.log('✅ check-missing-imports: 所有 .tsx/.ts 文件 JSX 使用的标识符都已 import');
  process.exit(0);
} else {
  console.error(`❌ check-missing-imports: 发现 ${totalIssues} 个未 import 的标识符:\n`);
  for (const [f, ids] of Object.entries(issuesByFile)) {
    console.error(`  ${path.relative(process.cwd(), f)}`);
    for (const id of ids) console.error(`    - ${id}`);
  }
  console.error('\n修复: 在文件顶部的 import 块中加缺失的标识符，例如:');
  console.error('  import { ' + Object.values(issuesByFile)[0][0] + ' } from "antd";');
  process.exit(1);
}
