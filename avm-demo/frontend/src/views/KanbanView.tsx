import { useMemo, useState } from 'react';
import {
  Card, Tag, Avatar, Space, Empty, Tooltip, Progress, App as AntdApp,
  Row, Col, Statistic,
} from 'antd';
import {
  DndContext, DragOverlay, useDraggable, useDroppable,
  PointerSensor, useSensor, useSensors, DragEndEvent, DragStartEvent,
} from '@dnd-kit/core';
import {
  ClockCircleOutlined, CheckCircleOutlined, FireOutlined, ExclamationCircleOutlined,
  ProjectOutlined, ShopOutlined, FieldTimeOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import type { WorkItem } from '../types';
import { PRIORITY_COLOR, STATUS_COLOR, TYPE_COLOR } from '../types';

interface Props {
  items: WorkItem[];
  statusList: string[];
  onStatusChange: (id: string, status: string) => void;
  onClickItem: (item: WorkItem) => void;
}

export function KanbanView({ items, statusList, onStatusChange, onClickItem }: Props) {
  const { message } = AntdApp.useApp();
  const [activeId, setActiveId] = useState<string | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  // V1.19 KPI 概览
  const kpi = useMemo(() => {
    const now = dayjs();
    const done = items.filter(i => ['已完成', '已关闭', '已验收', '已发布', '已修复'].includes(i.status));
    const inProgress = items.filter(i => i.status === '进行中' || i.status === '开发中');
    const blocked = items.filter(i => i.status === '已阻塞');
    const overdue = items.filter(i =>
      i.planEnd && now.isAfter(dayjs(i.planEnd)) && !['已完成', '已关闭', '已验收', '已发布', '已修复'].includes(i.status)
    );
    const totalEstimate = items.reduce((s, i) => s + (i.estimate || 0), 0);
    return {
      total: items.length,
      done: done.length,
      inProgress: inProgress.length,
      blocked: blocked.length,
      overdue: overdue.length,
      totalEstimate,
    };
  }, [items]);

  const grouped = useMemo(() => {
    const map: Record<string, WorkItem[]> = {};
    statusList.forEach(s => { map[s] = []; });
    items.forEach(item => {
      if (map[item.status]) map[item.status].push(item);
      else map[item.status] = [item];
    });
    return map;
  }, [items, statusList]);

  const activeItem = items.find(i => i.id === activeId);

  const handleDragStart = (e: DragStartEvent) => {
    setActiveId(String(e.active.id));
  };

  const handleDragEnd = (e: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = e;
    if (!over) return;
    const newStatus = String(over.id);
    const item = items.find(i => i.id === active.id);
    if (!item || item.status === newStatus) return;
    onStatusChange(String(active.id), newStatus);
    message.success(`${item.key} 已流转到 ${newStatus}`);
  };

  return (
    <div>
      {/* V1.19 顶部 KPI 概览 — 一眼看清迭代状态 */}
      <Row gutter={12} style={{ marginBottom: 12 }}>
        <Col span={4}>
          <Card size="small" styles={{ body: { padding: '12px 16px' } }}>
            <Statistic
              title="总计"
              value={kpi.total}
              prefix={<ProjectOutlined style={{ color: '#1677ff' }} />}
            />
          </Card>
        </Col>
        <Col span={4}>
          <Card size="small" styles={{ body: { padding: '12px 16px' } }}>
            <Statistic
              title="已完成"
              value={kpi.done}
              prefix={<CheckCircleOutlined style={{ color: '#52c41a' }} />}
              valueStyle={{ color: '#52c41a' }}
            />
          </Card>
        </Col>
        <Col span={4}>
          <Card size="small" styles={{ body: { padding: '12px 16px' } }}>
            <Statistic
              title="进行中"
              value={kpi.inProgress}
              prefix={<ClockCircleOutlined style={{ color: '#1677ff' }} />}
              valueStyle={{ color: '#1677ff' }}
            />
          </Card>
        </Col>
        <Col span={4}>
          <Card size="small" styles={{ body: { padding: '12px 16px' } }}>
            <Statistic
              title="已阻塞"
              value={kpi.blocked}
              prefix={<ExclamationCircleOutlined style={{ color: '#faad14' }} />}
              valueStyle={{ color: kpi.blocked > 0 ? '#faad14' : '#999' }}
            />
          </Card>
        </Col>
        <Col span={4}>
          <Card size="small" styles={{ body: { padding: '12px 16px' } }}>
            <Statistic
              title="超期"
              value={kpi.overdue}
              prefix={<FireOutlined style={{ color: '#ff4d4f' }} />}
              valueStyle={{ color: kpi.overdue > 0 ? '#ff4d4f' : '#999' }}
            />
          </Card>
        </Col>
        <Col span={4}>
          <Card size="small" styles={{ body: { padding: '12px 16px' } }}>
            <Statistic
              title="总估分"
              value={kpi.totalEstimate}
              suffix="SP"
              valueStyle={{ color: '#722ed1' }}
            />
          </Card>
        </Col>
      </Row>

      <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <div style={{
          display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 8,
        }}>
          {statusList.map(status => {
            const list = grouped[status] || [];
            const colOverdue = list.filter(i => i.planEnd && dayjs().isAfter(dayjs(i.planEnd)) && !['已完成', '已关闭', '已验收', '已发布', '已修复'].includes(i.status)).length;
            return (
              <KanbanColumn
                key={status}
                status={status}
                items={list}
                overdue={colOverdue}
                onClickItem={onClickItem}
              />
            );
          })}
        </div>
        <DragOverlay>
          {activeItem ? <KanbanCard item={activeItem} dragging onClickItem={onClickItem} /> : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}

function KanbanColumn({ status, items, overdue, onClickItem }: { status: string; items: WorkItem[]; overdue: number; onClickItem: (i: WorkItem) => void }) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  const totalEstimate = items.reduce((s, i) => s + (i.estimate || 0), 0);

  return (
    <div
      ref={setNodeRef}
      style={{
        flex: '0 0 280px',
        background: isOver ? '#e6f4ff' : '#f5f5f5',
        borderRadius: 8,
        padding: 12,
        minHeight: 400,
        transition: 'background 0.2s',
        border: isOver ? '2px dashed #1677ff' : '2px solid transparent',
      }}
    >
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        marginBottom: 12, paddingBottom: 8, borderBottom: `2px solid ${STATUS_COLOR[status] === 'blue' ? '#1677ff' : STATUS_COLOR[status] === 'green' ? '#52c41a' : '#d9d9d9'}`,
      }}>
        <Space>
          <Tag color={STATUS_COLOR[status]} style={{ fontSize: 13, padding: '2px 10px', margin: 0 }}>{status}</Tag>
          <span style={{ color: '#999', fontSize: 12 }}>{items.length}</span>
          {overdue > 0 && (
            <Tooltip title={`本列 ${overdue} 个超期`}>
              <Tag color="red" style={{ margin: 0, fontSize: 11 }}>超 {overdue}</Tag>
            </Tooltip>
          )}
        </Space>
        {totalEstimate > 0 && (
          <Tooltip title={`总估分 ${totalEstimate}`}>
            <span style={{ color: '#1677ff', fontSize: 12, fontWeight: 500 }}>{totalEstimate} SP</span>
          </Tooltip>
        )}
      </div>

      {items.length === 0 ? (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={<span style={{ fontSize: 12, color: '#ccc' }}>拖入卡片</span>} />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {items.map(item => (
            <KanbanCard key={item.id} item={item} onClickItem={onClickItem} />
          ))}
        </div>
      )}
    </div>
  );
}

function KanbanCard({ item, dragging, onClickItem }: { item: WorkItem; dragging?: boolean; onClickItem: (i: WorkItem) => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: item.id });
  const now = dayjs();
  const isOverdue = item.planEnd && now.isAfter(dayjs(item.planEnd)) && !['已完成', '已关闭', '已验收', '已发布', '已修复'].includes(item.status);
  const dueDays = item.planEnd ? now.diff(dayjs(item.planEnd), 'day') : 0;
  const projectShort = item.project?.name || item.customer?.shortName;

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      style={{
        background: '#fff',
        padding: 10,
        borderRadius: 6,
        boxShadow: dragging || isDragging ? '0 4px 12px rgba(0,0,0,0.15)' : '0 1px 3px rgba(0,0,0,0.08)',
        cursor: 'grab',
        opacity: isDragging ? 0.3 : 1,
        borderLeft: isOverdue ? '3px solid #ff4d4f' : `3px solid ${TYPE_COLOR[item.type] === 'blue' ? '#1677ff' : TYPE_COLOR[item.type] === 'red' ? '#ff4d4f' : TYPE_COLOR[item.type] === 'cyan' ? '#13c2c2' : '#722ed1'}`,
        userSelect: 'none',
      }}
      onClick={(e) => {
        e.stopPropagation();
        if (!isDragging) onClickItem(item);
      }}
    >
      <div style={{ marginBottom: 6 }}>
        <Space size={4} wrap>
          <Tag color={TYPE_COLOR[item.type]} style={{ margin: 0, fontSize: 11 }}>{item.key}</Tag>
          <Tag color={PRIORITY_COLOR[item.priority]} style={{ margin: 0, fontSize: 11 }}>{item.priority}</Tag>
          {isOverdue && <Tag color="red" style={{ margin: 0, fontSize: 11 }}>超期</Tag>}
        </Space>
      </div>
      <div style={{
        fontSize: 13, lineHeight: 1.5, color: '#333',
        marginBottom: 8,
        display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical',
        overflow: 'hidden',
      }}>
        {item.title}
      </div>

      {/* V1.19: 显示项目/客户 + 截止日 + 模块 */}
      <div style={{ fontSize: 11, color: '#666', marginBottom: 6, display: 'flex', flexDirection: 'column', gap: 3 }}>
        {projectShort && (
          <Tooltip title={item.project ? `项目: ${item.project.name}` : `客户: ${item.customer?.name || ''}`}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              {item.project ? <ProjectOutlined /> : <ShopOutlined />}
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{projectShort}</span>
            </span>
          </Tooltip>
        )}
        {item.planEnd && (
          <Tooltip title={`计划截止: ${dayjs(item.planEnd).format('YYYY-MM-DD')}`}>
            <span style={{
              display: 'flex', alignItems: 'center', gap: 4,
              color: isOverdue ? '#ff4d4f' : (dueDays > -3 ? '#faad14' : '#999'),
              fontWeight: isOverdue ? 500 : 'normal',
            }}>
              <FieldTimeOutlined />
              <span>{dayjs(item.planEnd).format('MM-DD')}</span>
              {isOverdue && <span style={{ color: '#ff4d4f' }}>({Math.abs(dueDays)}天)</span>}
              {!isOverdue && dueDays >= 0 && dueDays <= 3 && <span style={{ color: '#faad14' }}>(还{dueDays === 0 ? '今天' : `${dueDays}天`})</span>}
            </span>
          </Tooltip>
        )}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11, color: '#999' }}>
        <Space size={4}>
          {item.assignee ? (
            <Tooltip title={item.assignee}>
              <Avatar size="20" style={{ background: '#1677ff', fontSize: 11 }}>
                {item.assignee[0]}
              </Avatar>
            </Tooltip>
          ) : (
            <Avatar size="20" style={{ background: '#ccc' }}>?</Avatar>
          )}
          {item.module && <span style={{ maxWidth: 80, overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.module}</span>}
        </Space>
        {item.estimate != null && (
          <span style={{ color: '#1677ff' }}>{item.estimate}SP</span>
        )}
      </div>
      {item.estimate && item.actualHours != null && (
        <Progress
          percent={Math.min(100, Math.round((item.actualHours / item.estimate) * 100))}
          size="small" showInfo={false}
          strokeColor={item.actualHours > item.estimate ? '#ff4d4f' : '#1677ff'}
          style={{ marginTop: 6, marginBottom: 0 }}
        />
      )}
    </div>
  );
}
