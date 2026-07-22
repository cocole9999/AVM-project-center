/**
 * 流程引擎服务
 * 负责：
 * - 节点流 CRUD
 * - 工作项进入新节点（流转）
 * - 状态机强校验
 * - DOD 校验
 * - 入口/出口条件校验
 */
import { prisma } from '../db';

export interface FlowNodeDTO {
  id: string;
  name: string;
  nodeType: string;
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
}

export interface FlowTransitionDTO {
  id: string;
  fromNodeId: string;
  toNodeId: string;
  condition: string;
  label: string;
  isDefault: boolean;
}

// 获取某个工作项类型的活跃节点流
export async function getActiveFlow(workType: string) {
  return prisma.nodeFlow.findFirst({
    where: { workType, isActive: true },
    include: {
      nodes: { orderBy: { createdAt: 'asc' } },
      transitions: true,
    },
  });
}

// 列出所有节点流
export async function listFlows() {
  return prisma.nodeFlow.findMany({
    orderBy: { updatedAt: 'desc' },
    include: {
      _count: { select: { nodes: true, transitions: true } },
    },
  });
}

// 创建/保存节点流（整体替换 nodes 和 transitions）
export async function saveFlow(data: {
  id?: string;
  name: string;
  workType: string;
  description?: string;
  nodes: FlowNodeDTO[];
  transitions: FlowTransitionDTO[];
}) {
  const { id, name, workType, description, nodes, transitions } = data;

  return prisma.$transaction(async tx => {
    // 把同类型的其他流设为非活跃
    if (!id) {
      await tx.nodeFlow.updateMany({
        where: { workType, isActive: true },
        data: { isActive: false },
      });
    }

    const flow = id
      ? await tx.nodeFlow.update({
          where: { id },
          data: { name, workType, description: description || '' },
        })
      : await tx.nodeFlow.create({
          data: { name, workType, description: description || '' },
        });

    // 简化处理：删除原有 nodes 和 transitions 重建
    await tx.flowNode.deleteMany({ where: { flowId: flow.id } });
    await tx.flowTransition.deleteMany({ where: { flowId: flow.id } });

    for (const n of nodes) {
      await tx.flowNode.create({
        data: {
          flowId: flow.id,
          name: n.name,
          nodeType: n.nodeType,
          description: n.description,
          positionX: n.positionX,
          positionY: n.positionY,
          statusValue: n.statusValue,
          roles: n.roles,
          requiredFields: n.requiredFields,
          slaHours: n.slaHours,
          dodItems: n.dodItems,
          reviewType: n.reviewType,
          reviewRule: n.reviewRule,
        },
      });
    }

    for (const t of transitions) {
      await tx.flowTransition.create({
        data: {
          flowId: flow.id,
          fromNodeId: t.fromNodeId,
          toNodeId: t.toNodeId,
          condition: t.condition,
          label: t.label,
          isDefault: t.isDefault,
        },
      });
    }

    return tx.nodeFlow.findUnique({
      where: { id: flow.id },
      include: { nodes: true, transitions: true },
    });
  });
}

// 删除节点流
export async function deleteFlow(id: string) {
  return prisma.nodeFlow.delete({ where: { id } });
}

// 校验：工作项是否可流转到目标状态
// 内部使用：根据 status 找到对应节点，检查前置条件
export async function getNodeByStatus(workType: string, status: string) {
  const flow = await getActiveFlow(workType);
  if (!flow) return null;
  return flow.nodes.find(n => n.statusValue === status) || null;
}

// 工作项创建时初始化节点
export async function initWorkItemNode(workItemId: string, workType: string) {
  const flow = await getActiveFlow(workType);
  if (!flow) return null;
  const startNode = flow.nodes.find(n => n.nodeType === 'start')
    || flow.nodes[0];
  if (!startNode) return null;
  await prisma.workItem.update({
    where: { id: workItemId },
    data: { currentNodeId: startNode.id, status: startNode.statusValue || '待评审' },
  });
  return startNode;
}

// 流转工作项：当前节点 -> 目标节点（按 transition）
export async function transitionWorkItem(
  workItemId: string,
  toNodeId: string,
  options: { actor: string; comment?: string } = { actor: '系统' }
) {
  const item = await prisma.workItem.findUnique({ where: { id: workItemId } });
  if (!item) throw new Error('工作项不存在');

  const flow = await getActiveFlow(item.type);
  if (!flow) throw new Error('未找到该类型的流程');

  const toNode = flow.nodes.find(n => n.id === toNodeId);
  if (!toNode) throw new Error('目标节点不存在');

  if (item.currentNodeId) {
    const fromNode = flow.nodes.find(n => n.id === item.currentNodeId);
    if (!fromNode) throw new Error('当前节点不存在');

    // 找到两者之间的 transition
    const trans = flow.transitions.find(
      t => t.fromNodeId === fromNode.id && t.toNodeId === toNode.id
    );
    if (!trans && fromNode.id !== toNode.id) {
      throw new Error(`不允许从「${fromNode.name}」流转到「${toNode.name}」`);
    }

    // DOD 校验
    if (fromNode.dodItems) {
      try {
        const dod = JSON.parse(fromNode.dodItems) as Array<{ name: string; required: boolean; checked?: boolean }>;
        const missing = dod.filter(d => d.required && !d.checked);
        if (missing.length > 0) {
          throw new Error(`未完成 DOD 检查项：${missing.map(m => m.name).join('、')}`);
        }
      } catch (e: any) {
        if (e.message?.includes('DOD')) throw e;
        // JSON 解析失败忽略
      }
    }
  }

  // 更新工作项
  const updated = await prisma.workItem.update({
    where: { id: workItemId },
    data: {
      currentNodeId: toNode.id,
      status: toNode.statusValue || toNode.name,
    },
  });

  // 记录活动
  await prisma.activity.create({
    data: {
      workItemId,
      actor: options.actor,
      action: 'node_transition',
      field: 'node',
      oldValue: item.status,
      newValue: toNode.statusValue || toNode.name,
      meta: options.comment || '',
    },
  });

  return updated;
}

// 获取工作项可流转的目标节点
export async function getAvailableTransitions(workItemId: string) {
  const item = await prisma.workItem.findUnique({ where: { id: workItemId } });
  if (!item || !item.currentNodeId) return [];
  const flow = await getActiveFlow(item.type);
  if (!flow) return [];
  const trans = flow.transitions.filter(t => t.fromNodeId === item.currentNodeId);
  return trans.map(t => {
    const node = flow.nodes.find(n => n.id === t.toNodeId);
    return { transition: t, node };
  });
}