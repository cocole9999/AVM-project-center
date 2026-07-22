// 工作项状态机（按类型）
export const STATUS_BY_TYPE = {
  requirement: {
    values: ['待评审', '已规划', '开发中', '测试中', '验收中', '已验收', '已关闭'],
    initial: '待评审',
    terminal: ['已关闭'],
  },
  task: {
    values: ['待领取', '进行中', '自测中', '已完成'],
    initial: '待领取',
    terminal: ['已完成'],
  },
  bug: {
    values: ['待修复', '修复中', '待验证', '已关闭', '已驳回'],
    initial: '待修复',
    terminal: ['已关闭', '已驳回'],
  },
  release: {
    values: ['规划中', '集成中', '发布中', '已发布'],
    initial: '规划中',
    terminal: ['已发布'],
  },
} as const;

export const PRIORITY_OPTIONS = ['P0', 'P1', 'P2', 'P3'];
export const SEVERITY_OPTIONS = ['S0', 'S1', 'S2', 'S3'];
export const TYPE_OPTIONS = ['requirement', 'task', 'bug', 'release'];
export const RELATION_TYPES = ['关联', '阻塞', '重复', '引用'];

export const TYPE_LABEL: Record<string, string> = {
  requirement: '需求',
  task: '任务',
  bug: '缺陷',
  release: '版本',
};

export const PRIORITY_COLOR: Record<string, string> = {
  P0: 'red',
  P1: 'orange',
  P2: 'blue',
  P3: 'default',
};

export const SEVERITY_COLOR: Record<string, string> = {
  S0: 'red',
  S1: 'orange',
  S2: 'gold',
  S3: 'default',
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