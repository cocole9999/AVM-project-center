// AVM 前端类型定义（与后端 Prisma schema 对位）

// V1.8.3 资源管理
export interface ResourceAllocation {
  id: string;
  userId: string;
  userName: string;
  workItemId: string;
  workItemKey: string;
  workItemTitle: string;
  startDate: string;
  endDate: string;
  allocatedHours: number;
  type: string;     // dev/review/test/...
  status: string;   // planned/active/done
  spaceId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ResourceLoadUser {
  userId: string;
  userName: string;
  totalHours: number;
  items: Array<{ workItemKey: string; workItemTitle: string; startDate: string; endDate: string; hours: number; type: string }>;
  dailyHours: Record<string, number>;
  maxDaily: number;
  avgDaily: number;
  utilization: number;
  level: 'overload' | 'busy' | 'normal' | 'idle';
}
export type WorkItemType = 'requirement' | 'task' | 'bug' | 'release';

export interface WorkItem {
  id: string;
  type: WorkItemType;
  key: string;
  title: string;
  description: string;
  status: string;
  priority: 'P0' | 'P1' | 'P2' | 'P3';
  severity?: 'S0' | 'S1' | 'S2' | 'S3' | null;
  estimate?: number | null;
  actualHours?: number | null;
  storyPoints?: number | null;
  planStart?: string | null;
  planEnd?: string | null;
  actualStart?: string | null;
  actualEnd?: string | null;
  assignee?: string | null;
  reporter: string;
  module?: string | null;
  labels: string;
  iterationId?: string | null;
  iteration?: { id: string; name: string; status: string } | null;
  projectId?: string | null;
  project?: { id: string; code: string; name: string; status?: string; billingType?: string } | null;
  customerId?: string | null;
  customer?: { id: string; code?: string; name: string; shortName?: string } | null;
  carModelId?: string | null;
  carModel?: { id: string; code?: string; name: string; brand?: string } | null;
  parentId?: string | null;
  parent?: { id: string; key: string; title: string; type: WorkItemType } | null;
  children?: Array<{ id: string; key: string; title: string; type: WorkItemType; status: string; assignee?: string | null; priority?: string }>;
  relatedFrom?: Array<{ id: string; relationType: string; to: { id: string; key: string; title: string; type: WorkItemType; status: string } }>;
  relatedTo?: Array<{ id: string; relationType: string; from: { id: string; key: string; title: string; type: WorkItemType; status: string } }>;
  comments?: Comment[];
  _count?: { children: number; comments: number };
  createdAt: string;
  updatedAt: string;
}

export interface Iteration {
  id: string;
  name: string;
  goal: string;
  status: 'planning' | 'active' | 'completed';
  startDate: string;
  endDate: string;
  _count?: { workItems: number };
}

export interface Comment {
  id: string;
  workItemId: string;
  author: string;
  content: string;
  createdAt: string;
}

export interface Activity {
  id: string;
  workItemId: string;
  actor: string;
  action: string;
  field?: string;
  oldValue?: string;
  newValue?: string;
  meta?: string;
  createdAt: string;
}

export interface MetaOptions {
  types: WorkItemType[];
  priority: string[];
  severity: string[];
  relationTypes: string[];
  statusByType: Record<WorkItemType, { values: string[]; initial: string; terminal: string[] }>;
}

export const TYPE_LABEL: Record<WorkItemType, string> = {
  requirement: '需求',
  task: '任务',
  bug: '缺陷',
  release: '版本',
};

export const TYPE_COLOR: Record<WorkItemType, string> = {
  requirement: 'blue',
  task: 'cyan',
  bug: 'red',
  release: 'purple',
};

export const PRIORITY_COLOR: Record<string, string> = {
  P0: 'red',
  P1: 'orange',
  P2: 'blue',
  P3: 'default',
};

export const STATUS_COLOR: Record<string, string> = {
  待评审: 'default',
  已规划: 'cyan',
  开发中: 'blue',
  测试中: 'purple',
  验收中: 'magenta',
  已验收: 'green',
  已关闭: 'default',
  待领取: 'default',
  进行中: 'blue',
  自测中: 'cyan',
  已完成: 'green',
  待修复: 'orange',
  修复中: 'blue',
  待验证: 'purple',
  已驳回: 'red',
  规划中: 'default',
  集成中: 'blue',
  发布中: 'purple',
  已发布: 'green',
};

// ========== V1.1 流程引擎 ==========

export type FlowNodeType = 'normal' | 'start' | 'end' | 'review' | 'gate';

export interface FlowNode {
  id: string;
  flowId: string;
  name: string;
  nodeType: FlowNodeType;
  description: string;
  positionX: number;
  positionY: number;
  statusValue?: string | null;
  roles: string;
  requiredFields: string;
  slaHours?: number | null;
  dodItems: string;
  reviewType?: string | null;
  reviewRule: string;
  createdAt: string;
  updatedAt: string;
}

export interface FlowTransition {
  id: string;
  flowId: string;
  fromNodeId: string;
  toNodeId: string;
  condition: string;
  label: string;
  isDefault: boolean;
}

export interface NodeFlow {
  id: string;
  name: string;
  workType: string;
  description: string;
  version: number;
  isActive: boolean;
  nodes?: FlowNode[];
  transitions?: FlowTransition[];
  _count?: { nodes: number; transitions: number };
  createdAt: string;
  updatedAt: string;
}

// ========== V1.1 评审 ==========

export interface ReviewParticipant {
  id: string;
  reviewId: string;
  userId: string;
  userName: string;
  role: string;
  weight: number;
  hasResponded: boolean;
  respondedAt?: string | null;
}

export interface ReviewItem {
  id: string;
  reviewId: string;
  name: string;
  itemType: 'score' | 'check' | 'text';
  description: string;
  score?: number | null;
  maxScore: number;
  checked?: boolean | null;
  answer?: string | null;
  comment: string;
  completed: boolean;
}

export interface Review {
  id: string;
  workItemId: string;
  reviewType: 'tr' | 'dcp' | 'qr';
  title: string;
  status: 'pending' | 'in_progress' | 'approved' | 'rejected';
  conclusion?: 'go' | 'not_go' | 'go_with_risk' | null;
  summary: string;
  initiator: string;
  finalizer?: string | null;
  finalizedAt?: string | null;
  workItem?: { id: string; key: string; title: string; type: string; status: string };
  items?: ReviewItem[];
  participants?: ReviewParticipant[];
  _count?: { items: number; participants: number };
  createdAt: string;
  updatedAt: string;
}

export interface ReviewTemplate {
  id: string;
  name: string;
  reviewType: string;
  description: string;
  items: string;
  createdAt: string;
  updatedAt: string;
}

// ========== V1.2 度量 ==========

export interface ChartConfig {
  id: string;
  name: string;
  chartType: string;
  source: string;
  dimensions: string;        // JSON
  measures: string;          // JSON
  filters: string;           // JSON
  options: string;           // JSON
  dashboardId?: string | null;
  position: number;
  createdAt: string;
  updatedAt: string;
}

export interface Dashboard {
  id: string;
  name: string;
  description: string;
  layout: string;            // JSON
  scope: string;
  target?: string | null;
  charts?: ChartConfig[];
  _count?: { charts: number };
  createdAt: string;
  updatedAt: string;
}

// ========== AI ==========

export interface AIFieldConfig {
  id: string;
  name: string;
  workType: string;
  targetField: string;
  capability: string;
  prompt: string;
  inputFields: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

// ========== 用户 ==========

export interface User {
  id: string;
  username: string;
  displayName: string;
  email?: string | null;
  department?: string | null;
  role: 'tenant_admin' | 'space_admin' | 'biz_admin' | 'member' | 'visitor';
  active: boolean;
  createdAt: string;
}