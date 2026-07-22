import axios from 'axios';
import type {
  WorkItem, Iteration, Comment, Activity, MetaOptions, WorkItemType,
  NodeFlow, FlowNode, FlowTransition, Review, ReviewTemplate, ChartConfig,
  Dashboard, AIFieldConfig, User,
} from './types';

export const api = axios.create({
  baseURL: '/api',
  timeout: 15000,
});

export const workItemApi = {
  list: (params?: Record<string, any>) => api.get<WorkItem[]>('/work-items', { params }).then(r => r.data),
  get: (id: string) => api.get<WorkItem>(`/work-items/${id}`).then(r => r.data),
  create: (data: Partial<WorkItem> & { type: WorkItemType }) => api.post<WorkItem>('/work-items', data).then(r => r.data),
  update: (id: string, data: Partial<WorkItem> & { actor?: string }) => api.patch<WorkItem>(`/work-items/${id}`, data).then(r => r.data),
  delete: (id: string) => api.delete(`/work-items/${id}`).then(r => r.data),
  bulkStatus: (ids: string[], status: string, actor = '我') => api.post('/work-items/bulk-status', { ids, status, actor }).then(r => r.data),
  batchUpdate: (ids: string[], changes: Record<string, any>) => api.post<{ updated: number; requested: number; found: number; changes: any }>('/work-items/batch-update', { ids, changes }).then(r => r.data),
  addRelation: (id: string, toId: string, relationType: string) => api.post(`/work-items/${id}/relations`, { toId, relationType }).then(r => r.data),
  removeRelation: (id: string, relId: string) => api.delete(`/work-items/${id}/relations/${relId}`).then(r => r.data),
  // V1.9 甘特图
  gantt: (params?: { projectCode?: string; from?: string; to?: string; includeUnscheduled?: boolean }) =>
    api.get<{ projects: any[]; items: any[]; summary: any; dateRange: { from: string; to: string } }>(
      '/work-items/gantt', { params }
    ).then(r => r.data),
  // V1.28 工作量趋势: 估分/实际工时 随时间变化
  estimateHistory: (id: string) =>
    api.get<{ workItemId: string; points: Array<{ date: string; estimate: number | null; actualHours: number | null; action: string }> }>(
      `/work-items/${id}/estimate-history`
    ).then(r => r.data),
  // V1.29 工作量按人分布
  workloadByUser: (params?: { projectCode?: string; iterationId?: string }) =>
    api.get<{ byUser: Array<{ user: string; totalEstimate: number; totalActual: number; itemCount: number; doneCount: number; overdueCount: number }>; totalItems: number }>(
      '/work-items/workload-by-user', { params }
    ).then(r => r.data),
};

export const iterationApi = {
  list: () => api.get<Iteration[]>('/iterations').then(r => r.data),
  get: (id: string) => api.get<Iteration>(`/iterations/${id}`).then(r => r.data),
  create: (data: Partial<Iteration>) => api.post<Iteration>('/iterations', data).then(r => r.data),
  // V1.28 燃尽图
  burndown: (id: string) => api.get<{ iteration: any; daily: any[] }>(`/iterations/${id}/burndown`).then(r => r.data),
  // V1.28 迭代回顾 (Sprint Retrospective)
  retrospective: (id: string) => api.get<{ iteration: any; summary: any; byAssignee: any; byType: any; report: string }>(`/iterations/${id}/retrospective`).then(r => r.data),
};

export const commentApi = {
  create: (workItemId: string, content: string, author = '我', imageUrl?: string) => api.post<Comment>('/comments', { workItemId, content, author, imageUrl }).then(r => r.data),
  delete: (id: string) => api.delete(`/comments/${id}`).then(r => r.data),
  // V1.28 reactions: 点 emoji 加/减
  react: (id: string, emoji: string, user: string) =>
    api.post<{ ok: boolean; reactions: Record<string, string[]>; action: 'added' | 'removed' }>(`/comments/${id}/react`, { emoji, user }).then(r => r.data),
};

// V1.14 @提及联想
export const mentionApi = {
  search: (q: string) => api.get<Array<{ id: string; username: string; displayName: string; department?: string; role: string; mentionText: string; avatarColor: string }>>('/mentions/search', { params: { q, limit: 10 } }).then(r => r.data),
};

export const activityApi = {
  list: (workItemId?: string, limit = 50) => api.get<Activity[]>('/activities', { params: { workItemId, limit } }).then(r => r.data),
};

export const metaApi = {
  options: () => api.get<MetaOptions>('/meta/options').then(r => r.data),
  assignees: () => api.get<string[]>('/meta/assignees').then(r => r.data),
  modules: () => api.get<string[]>('/meta/modules').then(r => r.data),
  // V1.28 健康度 (按客户/车型维度)
  health: (by: 'customer' | 'carModel' = 'customer') =>
    api.get<{ by: string; items: Array<{ id: string; name: string; brand?: string; code?: string; projectCount: number; workItemCount: number; highRiskCount: number }> }>(`/meta/health?by=${by}`).then(r => r.data),
  stats: () => api.get<{
    total: number;
    byType: Record<string, number>;
    byStatus: Record<string, number>;
    byPriority: Record<string, number>;
  }>('/meta/stats').then(r => r.data),
};

// ========== V1.1 流程引擎 ==========
export const flowApi = {
  list: () => api.get<NodeFlow[]>('/flows').then(r => r.data),
  get: (id: string) => api.get<NodeFlow>(`/flows/${id}`).then(r => r.data),
  getActiveByType: (workType: string) => api.get<NodeFlow>(`/flows/active/${workType}`).then(r => r.data),
  create: (data: any) => api.post<NodeFlow>('/flows', data).then(r => r.data),
  update: (id: string, data: any) => api.patch<NodeFlow>(`/flows/${id}`, data).then(r => r.data),
  delete: (id: string) => api.delete(`/flows/${id}`).then(r => r.data),
  transition: (workItemId: string, toNodeId: string, actor = '我', comment?: string) =>
    api.post(`/flows/transition/${workItemId}`, { toNodeId, actor, comment }).then(r => r.data),
  getAvailableTransitions: (workItemId: string) =>
    api.get(`/flows/transitions/${workItemId}`).then(r => r.data),
};

// ========== V1.1 评审 ==========
export const reviewApi = {
  list: (workItemId?: string) => api.get<Review[]>('/reviews', { params: { workItemId } }).then(r => r.data),
  get: (id: string) => api.get<Review>(`/reviews/${id}`).then(r => r.data),
  create: (data: any) => api.post<Review>('/reviews', data).then(r => r.data),
  submit: (id: string, userId: string, submissions: any[]) =>
    api.post(`/reviews/${id}/submit`, { userId, submissions }).then(r => r.data),
  finalize: (id: string, data: any) => api.post(`/reviews/${id}/finalize`, data).then(r => r.data),
  listTemplates: () => api.get<ReviewTemplate[]>('/reviews/templates/all').then(r => r.data),
  createTemplate: (data: any) => api.post<ReviewTemplate>('/reviews/templates', data).then(r => r.data),
};

// ========== V1.2 度量 ==========
export const chartApi = {
  list: (dashboardId?: string) => api.get<ChartConfig[]>('/charts', { params: { dashboardId } }).then(r => r.data),
  get: (id: string) => api.get<ChartConfig>(`/charts/${id}`).then(r => r.data),
  create: (data: any) => api.post<ChartConfig>('/charts', data).then(r => r.data),
  update: (id: string, data: any) => api.patch<ChartConfig>(`/charts/${id}`, data).then(r => r.data),
  delete: (id: string) => api.delete(`/charts/${id}`).then(r => r.data),
  compute: (id: string, filters?: any[]) => api.post(`/charts/${id}/compute`, { filters }).then(r => r.data),
  preview: (config: any) => api.post('/charts/preview', config).then(r => r.data),
};

export const dashboardApi = {
  list: () => api.get<Dashboard[]>('/dashboards').then(r => r.data),
  get: (id: string) => api.get<Dashboard>(`/dashboards/${id}`).then(r => r.data),
  create: (data: any) => api.post<Dashboard>('/dashboards', data).then(r => r.data),
  update: (id: string, data: any) => api.patch<Dashboard>(`/dashboards/${id}`, data).then(r => r.data),
  delete: (id: string) => api.delete(`/dashboards/${id}`).then(r => r.data),
};

// ========== AI ==========
export const aiApi = {
  suggestEstimate: (data: any) => api.post('/ai/suggest-estimate', data).then(r => r.data),
  classifyBug: (data: any) => api.post('/ai/classify-bug', data).then(r => r.data),
  // V1.8 全局 AI 助理 + 表单辅助
  aiCommand: (command: string, context?: any) => api.post('/ai-command/command', { command, context }).then(r => r.data),
  aiTools: () => api.get('/ai-command/tools').then(r => r.data),
  aiSuggestions: (page: string) => api.post('/ai-command/suggestions', { page }).then(r => r.data),
  aiFillWorkItem: (data: { title: string; type?: string; priority?: string; hint?: string }) =>
    api.post('/ai-command/fill-work-item', data).then(r => r.data),
  aiSuggestAssignee: (data: { title: string; type?: string; priority?: string; projectCode?: string; hint?: string }) =>
    api.post('/ai-command/suggest-assignee', data).then(r => r.data),
  aiRiskScan: () => api.post('/ai-command/risk-scan', {}).then(r => r.data),
  // V1.8.2 通用 AI 填表 + 通知跟进
  aiFillForm: (formType: string, data: Record<string, any>) =>
    api.post('/ai-command/fill-form', { formType, ...data }).then(r => r.data),
  createFollowUp: (notificationId: string, data?: { assignee?: string; priority?: string; type?: string }) =>
    api.post(`/ai-command/notifications/${notificationId}/create-follow-up`, data || {}).then(r => r.data),
  // V1.9 AI 周报
  weeklyReport: (params?: { period?: 'week' | 'month' | 'quarter' | 'custom'; startDate?: string; endDate?: string; projectCode?: string; user?: string }) =>
    api.get('/ai-command/weekly-report', { params }).then(r => r.data),
  // V1.20 月报
  monthlyReport: (params?: { period?: 'month' | 'quarter' | 'custom'; startDate?: string; endDate?: string; projectCode?: string; user?: string }) =>
    api.get('/ai-command/monthly-report', { params }).then(r => r.data),
  // V1.26 仪表盘默认显示最近一份生成的报告
  latestReport: (type?: 'week' | 'month' | 'quarter' | 'custom') =>
    api.get('/ai-command/reports/latest', { params: type ? { type } : {} }).then(r => r.data),
  listReports: (params?: { type?: string; limit?: number }) =>
    api.get('/ai-command/reports/list', { params }).then(r => r.data),
  // V1.20 通用 report 调用
  report: (endpoint: string, params?: any) => api.get(`/ai-command${endpoint}`, { params }).then(r => r.data),
  // V1.9 数据导出
  exportWorkItems: (params?: Record<string, any>) => api.get('/export/work-items', { params, responseType: 'blob' }).then(r => r.data),
  exportProjects: (params?: Record<string, any>) => api.get('/export/projects', { params, responseType: 'blob' }).then(r => r.data),
  exportCustomers: (params?: Record<string, any>) => api.get('/export/customers', { params, responseType: 'blob' }).then(r => r.data),
  exportCarModels: (params?: Record<string, any>) => api.get('/export/car-models', { params, responseType: 'blob' }).then(r => r.data),
  exportRisks: (params?: Record<string, any>) => api.get('/export/risks', { params, responseType: 'blob' }).then(r => r.data),
  suggestPriority: (data: any) => api.post('/ai/suggest-priority', data).then(r => r.data),
  assessRisk: (workItemId: string) => api.post(`/ai/assess-risk/${workItemId}`, {}).then(r => r.data),
  decompose: (workItemId: string) => api.post<{ ok: boolean; llmModel: string | null; parent: any; subtasks: any[]; note?: string }>('/ai/decompose', { workItemId }).then(r => r.data),
  qa: (question: string) => api.post('/ai/qa', { question }).then(r => r.data),
  // V1.7 旧 weeklyReport 已被 V1.9 替代 (上面的 aiApi.weeklyReport)
  listConfigs: () => api.get<AIFieldConfig[]>('/ai/configs').then(r => r.data),
  createConfig: (data: any) => api.post<AIFieldConfig>('/ai/configs', data).then(r => r.data),
  updateConfig: (id: string, data: any) => api.patch<AIFieldConfig>(`/ai/configs/${id}`, data).then(r => r.data),
  deleteConfig: (id: string) => api.delete(`/ai/configs/${id}`).then(r => r.data),
  logs: (limit = 50) => api.get('/ai/logs', { params: { limit } }).then(r => r.data),
  llmStatus: () => api.get('/ai/llm-status').then(r => r.data),
};

// ========== 用户 ==========
export const userApi = {
  list: () => api.get<User[]>('/users').then(r => r.data),
  create: (data: any) => api.post<User>('/users', data).then(r => r.data),
  update: (id: string, data: any) => api.patch<User>(`/users/${id}`, data).then(r => r.data),
  delete: (id: string) => api.delete(`/users/${id}`).then(r => r.data),
  login: (username: string, password: string) => api.post('/users/login', { username, password }).then(r => r.data),
};

// ========== V1.13 审计日志 ==========
export interface AuditChange { field: string; oldValue: any; newValue: any; }
export interface AuditMeta { ip?: string; method?: string; path?: string; summary?: string; userAgent?: string; [k: string]: any; }
export interface AuditLog {
  id: string; entity: string; entityId: string; action: string;
  actor: string; actorRole?: string | null;
  changes?: string | null; meta?: string | null; createdAt: string;
}
export const auditApi = {
  list: (params?: { entity?: string; actor?: string; action?: string; entityId?: string; from?: string; to?: string; limit?: number; offset?: number }) =>
    api.get<{ items: AuditLog[]; total: number; limit: number; offset: number }>('/audit-logs', { params }).then(r => r.data),
  stats: (days = 7) => api.get<{ total: number; byEntity: Record<string, number>; byAction: Record<string, number>; byActor: Record<string, number>; topActors: [string, number][] }>(`/audit-logs/stats?days=${days}`).then(r => r.data),
  get: (id: string) => api.get<AuditLog>(`/audit-logs/${id}`).then(r => r.data),
  byEntity: (entity: string, entityId: string) => api.get<AuditLog[]>(`/audit-logs/by-entity/${entity}/${entityId}`).then(r => r.data),
};

// ========== V1.3 空间 / 通知 / 收藏 / 人员排期 / 搜索 / 工作台 ==========
export interface SpaceType {
  id: string;
  name: string;
  code: string;
  description: string;
  icon: string;
  status: string;
  ownerId?: string;
  memberCount: number;
  itemCount: number;
}

export interface SpaceMember {
  id: string;
  spaceId: string;
  userId: string;
  userName: string;
  role: string;
}

export interface Notification {
  id: string;
  recipientId: string;
  type: string;
  level: string;
  title: string;
  content: string;
  resourceType?: string;
  resourceId?: string;
  link: string;
  read: boolean;
  readAt?: string;
  createdAt: string;
}

export interface Favorite {
  id: string;
  userId: string;
  resourceType: string;
  resourceId: string;
  title: string;
  subtitle: string;
  icon: string;
  link: string;
  folder: string;
  position: number;
  createdAt: string;
}

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
  type: string;
  status: string;
  note: string;
}

export interface ResourceLoadUser {
  userId: string;
  userName: string;
  totalHours: number;
  maxDaily: number;
  avgDaily: number;
  utilization: number;
  level: 'overload' | 'busy' | 'normal' | 'idle';
  dailyHours: Record<string, number>;
  items: any[];
}

export interface WorkbenchData {
  userId: string;
  metrics: {
    total: number;
    completed: number;
    inProgress: number;
    toStart: number;
    overdue: number;
    dueSoon: number;
    weekHours: number;
    weekCapacity: number;
    weekUtilization: number;
  };
  myAssigned: WorkItem[];
  myCreated: WorkItem[];
  myInvolved: any[];
  myDue: WorkItem[];
  myOverdue: WorkItem[];
  myPendingReviews: any[];
  myUnreadNotifs: Notification[];
}

export const spaceApi = {
  list: () => api.get<SpaceType[]>('/spaces').then(r => r.data),
  get: (id: string) => api.get<SpaceType>(`/spaces/${id}`).then(r => r.data),
  mySpaces: (userId: string) => api.get<SpaceType[]>(`/spaces/me/${userId}`).then(r => r.data),
  members: (id: string) => api.get<SpaceMember[]>(`/spaces/${id}/members`).then(r => r.data),
  addMember: (id: string, data: any) => api.post(`/spaces/${id}/members`, data).then(r => r.data),
};

export const notificationApi = {
  list: (userId: string, filter: 'all' | 'unread' | 'read' = 'all') =>
    api.get<Notification[]>('/notifications', { params: { userId, filter } }).then(r => r.data),
  unreadCount: (userId: string) =>
    api.get<{ count: number }>('/notifications/unread-count', { params: { userId } }).then(r => r.data),
  markRead: (id: string) => api.post(`/notifications/${id}/read`).then(r => r.data),
  markAllRead: (userId: string) => api.post('/notifications/read-all', { userId }).then(r => r.data),
  scanDue: () => api.post('/notifications/scan-due').then(r => r.data),
};

export const favoriteApi = {
  list: (userId: string, folder?: string) =>
    api.get<Favorite[]>('/favorites', { params: { userId, folder } }).then(r => r.data),
  add: (data: any) => api.post<Favorite>('/favorites', data).then(r => r.data),
  remove: (id: string) => api.delete(`/favorites/${id}`).then(r => r.data),
  removeByResource: (userId: string, resourceType: string, resourceId: string) =>
    api.delete('/favorites', { params: { userId, resourceType, resourceId } }).then(r => r.data),
};

export const resourceApi = {
  allocations: (params?: any) => api.get<ResourceAllocation[]>('/resources/allocations', { params }).then(r => r.data),
  load: (startDate: string, endDate: string, spaceId?: string) =>
    api.get<{ startDate: string; endDate: string; workingDays: string[]; users: ResourceLoadUser[] }>(
      '/resources/load', { params: { startDate, endDate, spaceId } }
    ).then(r => r.data),
  myAllocations: (userId: string) =>
    api.get<{ allocations: ResourceAllocation[]; totalHours: number }>(`/resources/by-user/${userId}`).then(r => r.data),
  createAllocation: (data: any) => api.post<ResourceAllocation>('/resources/allocations', data).then(r => r.data),
  deleteAllocation: (id: string) => api.delete(`/resources/allocations/${id}`).then(r => r.data),
};

export const searchApi = {
  search: (q: string, type?: string) =>
    api.get<{ q: string; total: number; results: any[] }>('/search', { params: { q, type } }).then(r => r.data),
  suggest: (q: string) =>
    api.get<any[]>('/search/suggest', { params: { q } }).then(r => r.data),
};

export const workbenchApi = {
  me: (userId: string) => api.get<WorkbenchData>('/workbench/me', { params: { userId } }).then(r => r.data),
  team: (spaceId?: string) => api.get<any[]>('/workbench/team', { params: { spaceId } }).then(r => r.data),
  getLayout: (userId: string) => api.get<any>(`/workbench/layout/${userId}`).then(r => r.data),
  saveLayout: (userId: string, data: any) => api.post(`/workbench/layout/${userId}`, data).then(r => r.data),
};

// ========== V1.4 P1 公式/聚合/模板/自动化/WebHook/导入/移交/树 ==========
export interface FormulaField {
  id: string; spaceId?: string; workType: string; name: string; fieldKey: string;
  formula: string; outputType: string; format: string; description: string;
  enabled: boolean; createdBy?: string;
}
export interface RollupField {
  id: string; spaceId?: string; workType: string; name: string; fieldKey: string;
  childType: string; sourceField: string; aggregation: string;
  outputType: string; format: string; description: string; enabled: boolean;
}
export interface WorkItemTemplate {
  id: string; spaceId?: string; name: string; workType: string;
  description: string; defaultFields: string; childItems: string;
  useCount: number; tags: string; category: string;
}
export interface TreeNode {
  id: string; key: string; title: string; type: string; status: string;
  priority: string; assignee?: string; estimate?: number; actualHours?: number;
  planStart?: string; planEnd?: string; progress: number;
  hasChildren: boolean; childCount: number; children: TreeNode[];
}
export interface AutomationRule {
  id: string; spaceId?: string; name: string; description: string;
  enabled: boolean; trigger: string; conditions: string; actions: string;
  runCount: number; lastRunAt?: string; lastRunResult: string;
}
export interface WebhookConfig {
  id: string; spaceId?: string; name: string; url: string;
  events: string; headers: string; secret: string; enabled: boolean;
  totalCalls: number; successCalls: number; failedCalls: number;
  lastCallAt?: string; lastCallStatus: string;
}
export interface ImportJob {
  id: string; spaceId?: string; name: string; resource: string;
  fileName: string; mapping: string; defaults: string;
  status: string; total: number; processed: number; succeeded: number; failed: number;
  errors: string; createdBy?: string;
}

export const fieldApi = {
  formulas: (workType?: string) => api.get<FormulaField[]>('/fields/formulas', { params: { workType } }).then(r => r.data),
  createFormula: (data: any) => api.post<FormulaField>('/fields/formulas', data).then(r => r.data),
  updateFormula: (id: string, data: any) => api.patch<FormulaField>(`/fields/formulas/${id}`, data).then(r => r.data),
  deleteFormula: (id: string) => api.delete(`/fields/formulas/${id}`).then(r => r.data),
  recomputeFormula: (id: string) => api.post(`/fields/formulas/${id}/recompute`).then(r => r.data),
  rollups: (workType?: string) => api.get<RollupField[]>('/fields/rollups', { params: { workType } }).then(r => r.data),
  createRollup: (data: any) => api.post<RollupField>('/fields/rollups', data).then(r => r.data),
  updateRollup: (id: string, data: any) => api.patch<RollupField>(`/fields/rollups/${id}`, data).then(r => r.data),
  deleteRollup: (id: string) => api.delete(`/fields/rollups/${id}`).then(r => r.data),
  derived: (workItemId: string) => api.get<{ formulas: any; rollups: any }>(`/fields/derived/${workItemId}`).then(r => r.data),
  testFormula: (formula: string, sample: any) => api.post('/fields/test-formula', { formula, sample }).then(r => r.data),
  validateFormula: (formula: string) => api.post('/fields/validate', { formula }).then(r => r.data),
  recomputeAll: (spaceId?: string) => api.post('/fields/recompute-all', { spaceId }).then(r => r.data),
  meta: () => api.get<{ fields: any[]; numberFunctions: string[]; stringFunctions: string[]; dateFunctions: string[] }>('/fields/meta').then(r => r.data),
};

export const templateApi = {
  list: (params?: any) => api.get<WorkItemTemplate[]>('/templates', { params }).then(r => r.data),
  get: (id: string) => api.get<WorkItemTemplate>(`/templates/${id}`).then(r => r.data),
  create: (data: any) => api.post<WorkItemTemplate>('/templates', data).then(r => r.data),
  apply: (id: string, data: any) => api.post(`/templates/${id}/apply`, data).then(r => r.data),
  remove: (id: string) => api.delete(`/templates/${id}`).then(r => r.data),
};

export const treeApi = {
  get: (params?: any) => api.get<TreeNode[]>('/tree', { params }).then(r => r.data),
  stats: (params?: any) => api.get<any>('/tree/stats', { params }).then(r => r.data),
};

export const automationApi = {
  rules: (params?: any) => api.get<AutomationRule[]>('/automation/rules', { params }).then(r => r.data),
  get: (id: string) => api.get<AutomationRule>(`/automation/rules/${id}`).then(r => r.data),
  create: (data: any) => api.post<AutomationRule>('/automation/rules', data).then(r => r.data),
  update: (id: string, data: any) => api.patch<AutomationRule>(`/automation/rules/${id}`, data).then(r => r.data),
  remove: (id: string) => api.delete(`/automation/rules/${id}`).then(r => r.data),
  toggle: (id: string) => api.post(`/automation/rules/${id}/toggle`).then(r => r.data),
  run: (id: string, context: any) => api.post(`/automation/rules/${id}/run`, { context }).then(r => r.data),
  test: (id: string, context: any) => api.post(`/automation/rules/${id}/test`, { context }).then(r => r.data),
  meta: {
    triggers: () => api.get<any[]>('/automation/meta/triggers').then(r => r.data),
    conditions: () => api.get<any[]>('/automation/meta/conditions').then(r => r.data),
    actions: () => api.get<any[]>('/automation/meta/actions').then(r => r.data),
  },
  logs: (params?: any) => api.get<any[]>('/automation/logs', { params }).then(r => r.data),
};

export const webhookApi = {
  configs: (params?: any) => api.get<WebhookConfig[]>('/webhooks/configs', { params }).then(r => r.data),
  get: (id: string) => api.get<WebhookConfig>(`/webhooks/configs/${id}`).then(r => r.data),
  create: (data: any) => api.post<WebhookConfig>('/webhooks/configs', data).then(r => r.data),
  update: (id: string, data: any) => api.patch<WebhookConfig>(`/webhooks/configs/${id}`, data).then(r => r.data),
  remove: (id: string) => api.delete(`/webhooks/configs/${id}`).then(r => r.data),
  test: (id: string, payload?: any) => api.post(`/webhooks/configs/${id}/test`, { payload }).then(r => r.data),
  logs: (params?: any) => api.get<any[]>('/webhooks/logs', { params }).then(r => r.data),
};

export const importApi = {
  // V1.17 wizard endpoints
  resources: () => api.get<{ resources: ImportResource[]; aliases: Record<string, string[]> }>('/imports/resources').then(r => r.data),
  templateUrl: (resource: string) => `/api/imports/template/${resource}`,
  preview: (formData: FormData) => api.post<{ columns: string[]; rows: any[]; total: number; mapping: ImportMapping[]; resource: string; fileName: string }>('/imports/preview', formData, { headers: { 'Content-Type': 'multipart/form-data' } }).then(r => r.data),
  previewJson: (resource: string, csvText: string) => api.post<{ columns: string[]; rows: any[]; total: number; mapping: ImportMapping[]; resource: string; fileName: string }>('/imports/preview', { resource, csvText }).then(r => r.data),
  execute: (data: { resource: string; mapping: ImportMapping[]; data: any[]; name?: string; fileName?: string }) => api.post<{ job: ImportJob; result: { total: number; succeeded: number; failed: number; errors: any[] } }>('/imports/execute', data).then(r => r.data),
  // legacy
  jobs: (params?: any) => api.get<ImportJob[]>('/imports/jobs', { params }).then(r => r.data),
  get: (id: string) => api.get<ImportJob>(`/imports/jobs/${id}`).then(r => r.data),
  create: (data: any) => api.post<ImportJob>('/imports/jobs', data).then(r => r.data),
  parseCsv: (csv: string) => api.post<{ rows: any[]; total: number; columns: string[] }>('/imports/parse-csv', { csv }).then(r => r.data),
};

// V1.23 文件上传 (评论图片)
export const uploadApi = {
  upload: (file: File) => {
    const fd = new FormData();
    fd.append('file', file);
    return api.post<{ ok: boolean; url: string; filename: string; originalName: string; size: number; mimetype: string }>('/uploads', fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }).then(r => r.data);
  },
};

export interface ImportResource {
  key: string;
  label: string;
  fields: { value: string; label: string; required?: boolean; hint?: string }[];
}
export interface ImportMapping {
  csvColumn: string;
  dbField: string;
}

export const handoverApi = {
  list: (params?: any) => api.get<any[]>('/handover', { params }).then(r => r.data),
  preview: (userId: string) => api.get<any>(`/handover/preview/${userId}`).then(r => r.data),
  execute: (data: any) => api.post<any>('/handover', data).then(r => r.data),
};

// ========== V1.5 P2 AI 人力分析 + 基线 + MCP ==========
export interface ResourceAnalysisResult {
  startDate: string; endDate: string;
  totalCapacity: number; totalAllocated: number; teamUtilization: number; healthScore: number;
  users: Array<{
    userId: string; userName: string; totalHours: number; capacity: number; utilization: number;
    level: 'overload' | 'busy' | 'normal' | 'idle';
    activeCount: number; overdueCount: number; p0Count: number; unassignedP0Count: number;
    risks: any[]; suggestions: string[];
  }>;
  teamRisks: any[];
  suggestions: string[];
}
export interface Baseline {
  id: string; spaceId?: string; iterationId?: string; iterationName?: string;
  name: string; description: string; baselineType: string;
  snapshot: string; itemCount: number; totalEstimate: number;
  createdBy?: string; createdAt: string;
}

export const resourceAnalysisApi = {
  analyze: (startDate: string, endDate: string, spaceId?: string) =>
    api.post<ResourceAnalysisResult>('/analysis/analyze', { startDate, endDate, spaceId }).then(r => r.data),
  history: (spaceId?: string, limit?: number) =>
    api.get<any[]>('/analysis/history', { params: { spaceId, limit } }).then(r => r.data),
  teamOverview: (spaceId?: string) =>
    api.get<any[]>('/analysis/team-overview', { params: { spaceId } }).then(r => r.data),
};

export const baselineApi = {
  list: (params?: any) => api.get<Baseline[]>('/baselines', { params }).then(r => r.data),
  get: (id: string) => api.get<Baseline>(`/baselines/${id}`).then(r => r.data),
  create: (data: any) => api.post<Baseline>('/baselines', data).then(r => r.data),
  compare: (id: string) => api.get<{ baseline: Baseline; changes: any; stats: any }>(`/baselines/${id}/compare`).then(r => r.data),
  remove: (id: string) => api.delete(`/baselines/${id}`).then(r => r.data),
};

export const mcpApi = {
  info: () => api.get<any>('/mcp').then(r => r.data),
  tools: () => api.get<{ tools: any[] }>('/mcp/tools').then(r => r.data),
  call: (name: string, args: any) => api.post<{ tool: string; args: any; result: any }>(`/mcp/tools/${name}`, args).then(r => r.data),
  resources: () => api.get<{ resources: any[] }>('/mcp/resources').then(r => r.data),
  promptTemplates: () => api.get<{ templates: any[] }>('/mcp/prompt-templates').then(r => r.data),
};

// ========== V1.6 测试管理 ==========
export const testApi = {
  // 用例
  cases: (params?: any) => api.get<any[]>('/tests/cases', { params }).then(r => r.data),
  getCase: (id: string) => api.get<any>(`/tests/cases/${id}`).then(r => r.data),
  createCase: (data: any) => api.post<any>('/tests/cases', data).then(r => r.data),
  updateCase: (id: string, data: any) => api.patch<any>(`/tests/cases/${id}`, data).then(r => r.data),
  removeCase: (id: string) => api.delete(`/tests/cases/${id}`).then(r => r.data),
  addCaseBug: (caseId: string, data: any) => api.post(`/tests/cases/${caseId}/bugs`, data).then(r => r.data),
  removeCaseBug: (caseId: string, bugId: string) => api.delete(`/tests/cases/${caseId}/bugs/${bugId}`).then(r => r.data),
  // 计划
  plans: (params?: any) => api.get<any[]>('/tests/plans', { params }).then(r => r.data),
  getPlan: (id: string) => api.get<any>(`/tests/plans/${id}`).then(r => r.data),
  createPlan: (data: any) => api.post<any>('/tests/plans', data).then(r => r.data),
  updatePlan: (id: string, data: any) => api.patch<any>(`/tests/plans/${id}`, data).then(r => r.data),
  removePlan: (id: string) => api.delete(`/tests/plans/${id}`).then(r => r.data),
  addCasesToPlan: (id: string, data: { caseIds: string[]; assignee?: string; assigneeName?: string }) =>
    api.post(`/tests/plans/${id}/cases`, data).then(r => r.data),
  removeCaseFromPlan: (id: string, caseId: string) => api.delete(`/tests/plans/${id}/cases/${caseId}`).then(r => r.data),
  updatePlanCase: (id: string, caseId: string, data: any) =>
    api.patch(`/tests/plans/${id}/cases/${caseId}`, data).then(r => r.data),
  // 执行
  runs: (params?: any) => api.get<any[]>('/tests/runs', { params }).then(r => r.data),
  createRun: (planId: string, data: any) => api.post<any>(`/tests/plans/${planId}/runs`, data).then(r => r.data),
  updateRun: (id: string, data: any) => api.patch<any>(`/tests/runs/${id}`, data).then(r => r.data),
  // 统计
  stats: () => api.get<any>('/tests/stats').then(r => r.data),
};

// ========== V1.6 企业版 SSO ==========
export const ssoApi = {
  // 租户
  listTenants: () => api.get<any[]>('/sso/tenants').then(r => r.data),
  createTenant: (data: any) => api.post<any>('/sso/tenants', data).then(r => r.data),
  updateTenant: (id: string, data: any) => api.patch<any>(`/sso/tenants/${id}`, data).then(r => r.data),
  deleteTenant: (id: string) => api.delete(`/sso/tenants/${id}`),
  tenantStats: (id: string) => api.get<any>(`/sso/tenants/${id}/stats`).then(r => r.data),
  // SSO 配置
  getSettings: (tenantId: string) => api.get<any[]>(`/sso/tenants/${tenantId}/settings`).then(r => r.data),
  upsertSetting: (tenantId: string, provider: string, data: any) =>
    api.put<any>(`/sso/tenants/${tenantId}/settings/${provider}`, data).then(r => r.data),
  deleteSetting: (tenantId: string, provider: string) =>
    api.delete(`/sso/tenants/${tenantId}/settings/${provider}`),
  // OAuth
  feishuLoginUrl: (tenantId: string) =>
    api.get<{ authUrl: string; state: string }>(`/sso/oauth/feishu/login`, { params: { tenantId } }).then(r => r.data),
  demoLogin: (provider: string, data: any) =>
    api.post<any>(`/sso/oauth/${provider}/demo-login`, data).then(r => r.data),
  // 日志
  logs: (params?: any) => api.get<any[]>('/sso/logs', { params }).then(r => r.data),
};

// ========== LLM 大模型设置 ==========
export const llmSettingsApi = {
  list: () => api.get<{ providers: any[]; settings: any[]; status: any }>('/llm-settings').then(r => r.data),
  get: (provider: string) => api.get<any>(`/llm-settings/${provider}`).then(r => r.data),
  upsert: (provider: string, data: any) => api.put<any>(`/llm-settings/${provider}`, data).then(r => r.data),
  remove: (provider: string) => api.delete(`/llm-settings/${provider}`),
  test: (provider: string, data: any) => api.post<any>(`/llm-settings/${provider}/test`, data).then(r => r.data),
  setPrimary: (provider: string) => api.post<any>(`/llm-settings/${provider}/primary`).then(r => r.data),
  testChat: (data: any) => api.post<any>('/llm-settings/test-chat', data).then(r => r.data),
  // 模型管理
  listModels: (provider: string) => api.get<{ builtin: string[]; custom: string[]; current: string; all: string[] }>(`/llm-settings/${provider}/models`).then(r => r.data),
  switchModel: (provider: string, model: string) => api.post<{ ok: boolean; model: string; provider: string; currentModel: string; displayName: string; status: any }>(`/llm-settings/${provider}/switch-model`, { model }).then(r => r.data),
  // 切换主 provider（厂商）：把该 provider 设为 primary + enabled
  activateProvider: (provider: string) => api.post<{ ok: boolean; provider: string; displayName: string; model: string; status: any }>(`/llm-settings/${provider}/activate`, {}).then(r => r.data),
  addCustomModel: (provider: string, model: string) => api.post<any>(`/llm-settings/${provider}/custom-models`, { model }).then(r => r.data),
  removeCustomModel: (provider: string, model: string) => api.delete<any>(`/llm-settings/${provider}/custom-models/${encodeURIComponent(model)}`).then(r => r.data),
};

// ========== V1.7 客户/车型/联系人/项目 ==========
export interface Customer {
  id: string; code: string; name: string; shortName: string;
  type: string; industry: string; contact: string; phone: string;
  email: string; address: string; description: string; status: string;
  createdAt: string; updatedAt: string;
  contacts?: Contact[]; projects?: Project[]; _count?: { projects: number; contacts: number; workItems: number };
}
export interface CarModel {
  id: string; code: string; name: string; brand: string;
  series: string; launchYear: number; segment: string; platform: string;
  description: string; status: string;
  createdAt: string; updatedAt: string;
  _count?: { projects: number; workItems: number };
}
export interface Contact {
  id: string; customerId: string; name: string; role: string;
  department: string; phone: string; email: string; feishuId: string;
  note: string; primary: boolean;
  createdAt: string; updatedAt: string;
  customer?: { id: string; name: string; shortName: string; code: string };
}
export interface Project {
  id: string; code: string; name: string; description: string;
  customerId: string; carModelId: string; pmUserId: string;
  pmUserName: string; startDate: string; endDate: string;
  status: string; billingType: string; contractAmount: number;
  budgetHours: number; consumedHours: number; risk: string;
  progress: number; tags: string; createdBy: string;
  createdAt: string; updatedAt: string;
  customer?: { id: string; name: string; shortName: string; code: string };
  carModel?: { id: string; name: string; code: string; brand: string };
  workItems?: any[]; _count?: { workItems: number };
}

export const customerApi = {
  list: (params?: any) => api.get<Customer[]>('/customers', { params }).then(r => r.data),
  get: (id: string) => api.get<Customer>(`/customers/${id}`).then(r => r.data),
  create: (data: any) => api.post<Customer>('/customers', data).then(r => r.data),
  update: (id: string, data: any) => api.patch<Customer>(`/customers/${id}`, data).then(r => r.data),
  remove: (id: string) => api.delete(`/customers/${id}`).then(r => r.data),
  stats: () => api.get<any>('/customers/_stats/summary').then(r => r.data),
};

export const carModelApi = {
  list: (params?: any) => api.get<CarModel[]>('/car-models', { params }).then(r => r.data),
  get: (id: string) => api.get<CarModel>(`/car-models/${id}`).then(r => r.data),
  create: (data: any) => api.post<CarModel>('/car-models', data).then(r => r.data),
  update: (id: string, data: any) => api.patch<CarModel>(`/car-models/${id}`, data).then(r => r.data),
  remove: (id: string) => api.delete(`/car-models/${id}`).then(r => r.data),
  byBrand: () => api.get<any>('/car-models/_stats/by-brand').then(r => r.data),
};

export const contactApi = {
  list: (params?: any) => api.get<Contact[]>('/contacts', { params }).then(r => r.data),
  get: (id: string) => api.get<Contact>(`/contacts/${id}`).then(r => r.data),
  create: (data: any) => api.post<Contact>('/contacts', data).then(r => r.data),
  batch: (contacts: any[]) => api.post<any>('/contacts/batch', { contacts }).then(r => r.data),
  update: (id: string, data: any) => api.patch<Contact>(`/contacts/${id}`, data).then(r => r.data),
  remove: (id: string) => api.delete(`/contacts/${id}`).then(r => r.data),
};

export const projectApi = {
  list: (params?: any) => api.get<Project[]>('/projects', { params }).then(r => r.data),
  get: (id: string) => api.get<Project>(`/projects/${id}`).then(r => r.data),
  create: (data: any) => api.post<Project>('/projects', data).then(r => r.data),
  update: (id: string, data: any) => api.patch<Project>(`/projects/${id}`, data).then(r => r.data),
  remove: (id: string) => api.delete(`/projects/${id}`).then(r => r.data),
  stats: () => api.get<any>('/projects/_stats/summary').then(r => r.data),
};

// V1.7.1 外部依赖
export const dependencyApi = {
  list: (params?: any) => api.get<any[]>('/dependencies', { params }).then(r => r.data),
  get: (id: string) => api.get<any>(`/dependencies/${id}`).then(r => r.data),
  create: (data: any) => api.post<any>('/dependencies', data).then(r => r.data),
  update: (id: string, data: any) => api.patch<any>(`/dependencies/${id}`, data).then(r => r.data),
  remove: (id: string) => api.delete(`/dependencies/${id}`).then(r => r.data),
  ready: (id: string) => api.post(`/dependencies/${id}/ready`, {}).then(r => r.data),
  stats: () => api.get<any>('/dependencies/stats/summary').then(r => r.data),
};