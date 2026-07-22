/**
 * 甘特图 (V1.9)
 * 列表式：左侧工作项列表 + 右侧时间条
 * - 按项目/时间范围过滤
 * - 日/周/月 三档缩放
 * - 有排期画实色条（按状态着色）
 * - 无排期画虚线 + "未排期" tag
 * - hover 看详情，点击跳工作项详情
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Card, Select, Button, Space, Tag, Tooltip, Statistic, Row, Col, App,
  Segmented, Empty, Switch, Badge, Avatar, Modal, DatePicker, Form, Input, Spin,
} from 'antd';
import { useNavigate } from 'react-router-dom';
import {
  ReloadOutlined, FilterOutlined, ProjectOutlined, CalendarOutlined,
  ClockCircleOutlined, CheckCircleOutlined, FireOutlined, HistoryOutlined, DownloadOutlined, CopyOutlined,
} from '@ant-design/icons';
import dayjs, { Dayjs } from 'dayjs';
import { Link } from 'react-router-dom';
import { workItemApi, projectApi, workItemApi as _wia, iterationApi } from '../api';
import { useAuth } from '../AuthContext';
import { BurndownChart } from '../components/BurndownChart';

type Scale = 'day' | 'week' | 'month';
const SCALE_PX: Record<Scale, number> = { day: 40, week: 22, month: 12 };

const TYPE_COLOR: Record<string, string> = {
  requirement: '#722ed1',
  task: '#1677ff',
  bug: '#cf1322',
  release: '#52c41a',
};
const TYPE_LABEL: Record<string, string> = {
  requirement: '需求', task: '任务', bug: '缺陷', release: '发布',
};
const PRIORITY_COLOR: Record<string, string> = {
  P0: 'red', P1: 'orange', P2: 'blue', P3: 'default',
};
const STATUS_COLOR: Record<string, string> = {
  '待领取': 'default', '进行中': 'processing', '开发中': 'processing', '修复中': 'orange',
  '已完成': 'success', '已关闭': 'default', '已驳回': 'red', '已发布': 'green',
  '已验收': 'cyan', '规划中': 'default', '待评审': 'default', '待修复': 'orange',
};

interface GanttItem {
  id: string; key: string; title: string; type: string; status: string; priority: string;
  assignee?: string | null; estimate?: number | null; actualHours?: number | null;
  planStart?: string | null; planEnd?: string | null;
  actualStart?: string | null; actualEnd?: string | null;
  hasSchedule: boolean;
  project?: { code: string; name: string };
  iteration?: { id: string; name: string } | null;
  // V1.12.1: relations
  relatedFrom?: { id: string; toId: string; relationType: string }[];
  relatedTo?: { id: string; fromId: string; relationType: string }[];
}

interface GanttProject {
  id: string; code: string; name: string; status: string;
  startDate: string; endDate: string;
}

interface GanttRelation {
  id: string; fromId: string; toId: string; type: string;
}

export function GanttPage() {
  const { message } = App.useApp();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [projects, setProjects] = useState<{ code: string; name: string }[]>([]);
  const [selectedProject, setSelectedProject] = useState<string | undefined>('AVM-GALAXY-L7-2026');
  const [scale, setScale] = useState<Scale>('week');
  const [showUnscheduled, setShowUnscheduled] = useState(true);
  const [data, setData] = useState<{ projects: GanttProject[]; items: GanttItem[]; relations?: GanttRelation[]; summary: any; dateRange: { from: string; to: string } } | null>(null);
  const [showRelations, setShowRelations] = useState(true);  // V1.12.1
  const [loading, setLoading] = useState(false);

  // V1.9.1 拖拽状态
  const [drag, setDrag] = useState<{
    id: string; type: 'move' | 'resize-start' | 'resize-end';
    startX: number; origStart: number; origEnd: number;  // 原始 startDay / endDay
    item: GanttItem;
  } | null>(null);
  const [editingItem, setEditingItem] = useState<GanttItem | null>(null);
  const [editForm] = Form.useForm();

  // V1.28 迭代回顾
  const [iterations, setIterations] = useState<any[]>([]);
  const [retroIteration, setRetroIteration] = useState<string | undefined>();
  const [retroOpen, setRetroOpen] = useState(false);
  const [retroData, setRetroData] = useState<any>(null);
  const [retroLoading, setRetroLoading] = useState(false);
  const openRetrospective = async () => {
    if (!retroIteration) return;
    setRetroOpen(true);
    setRetroLoading(true);
    try {
      const data = await iterationApi.retrospective(retroIteration);
      setRetroData(data);
    } catch (e: any) {
      message.error('生成回顾失败: ' + e.message);
    } finally {
      setRetroLoading(false);
    }
  };
  const downloadRetro = () => {
    if (!retroData) return;
    const blob = new Blob([retroData.report || ''], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${retroData.iteration?.name || 'retrospective'}_回顾.md`;
    a.click();
    URL.revokeObjectURL(url);
  };
  const copyRetro = () => {
    if (!retroData) return;
    navigator.clipboard.writeText(retroData.report || '').then(
      () => message.success('已复制 Markdown'),
      () => message.error('复制失败')
    );
  };

  // 加载项目列表
  useEffect(() => {
    projectApi.list().then((list: any[]) => {
      setProjects(list.map((p: any) => ({ code: p.code, name: p.name })));
    }).catch(() => {});
    iterationApi.list().then((list: any[]) => {
      setIterations(list);
      const active = list.find((i: any) => i.status === 'active');
      if (active && !retroIteration) setRetroIteration(active.id);
    }).catch(() => {});
  }, []);

  const load = async () => {
    setLoading(true);
    try {
      const params: any = {};
      if (selectedProject) params.projectCode = selectedProject;
      params.includeUnscheduled = showUnscheduled ? 'true' : 'false';
      const d = await workItemApi.gantt(params);
      setData(d);
    } catch (e: any) {
      message.error('加载失败：' + e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [selectedProject, showUnscheduled]);

  // 计算时间刻度（必须在 useEffect 之前定义，否则 TDZ）
  const { dayList, totalDays, totalWidth, fromDate, toDate } = useMemo(() => {
    if (!data) return { dayList: [] as Dayjs[], totalDays: 0, totalWidth: 0, fromDate: null as Dayjs | null, toDate: null as Dayjs | null };
    const from = dayjs(data.dateRange.from);
    const to = dayjs(data.dateRange.to);
    const days = to.diff(from, 'day') + 1;
    const list: Dayjs[] = [];
    for (let i = 0; i < days; i++) list.push(from.add(i, 'day'));
    return { dayList: list, totalDays: days, totalWidth: days * SCALE_PX[scale], fromDate: from, toDate: to };
  }, [data, scale]);

  // V1.9.1 拖拽全局事件
  useEffect(() => {
    if (!drag || !fromDate || !totalDays) return;

    const onMove = (e: MouseEvent) => {
      // 1px = 1/totalWidth of totalDays，totalWidth = totalDays * SCALE_PX[scale]
      // day offset = (e.clientX - drag.startX) / SCALE_PX[scale]
      const deltaPx = e.clientX - drag.startX;
      const deltaDays = Math.round(deltaPx / SCALE_PX[scale]);
      let newStart = drag.origStart;
      let newEnd = drag.origEnd;
      if (drag.type === 'move') {
        newStart = drag.origStart + deltaDays;
        newEnd = drag.origEnd + deltaDays;
      } else if (drag.type === 'resize-start') {
        newStart = Math.min(drag.origStart + deltaDays, drag.origEnd);
      } else if (drag.type === 'resize-end') {
        newEnd = Math.max(drag.origEnd + deltaDays, drag.origStart);
      }
      // 实时更新 data 中对应 item 的 planStart/planEnd
      setData(d => d ? {
        ...d,
        items: d.items.map(it => it.id === drag.id ? {
          ...it,
          planStart: fromDate.add(newStart, 'day').toISOString(),
          planEnd: fromDate.add(newEnd, 'day').toISOString(),
        } : it),
      } : d);
    };

    const onUp = async () => {
      const cur = drag;
      setDrag(null);
      // 找到当前 data 中的 item
      if (!data) return;
      const it = data.items.find(i => i.id === cur.id);
      if (!it || !it.planStart || !it.planEnd) return;
      const orig = cur.item;
      if (it.planStart === orig.planStart && it.planEnd === orig.planEnd) return; // 没动
      try {
        await workItemApi.update(cur.id, {
          planStart: it.planStart,
          planEnd: it.planEnd,
          actor: user?.displayName || '我',
        } as any);
        message.success(`✓ ${cur.item.key} 排期已更新`);
      } catch (e: any) {
        // 回滚
        setData(d => d ? {
          ...d,
          items: d.items.map(x => x.id === cur.id ? orig : x),
        } : d);
        message.error('保存失败：' + e.message);
      }
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [drag, fromDate, totalDays, scale, data, user, message]);

  // 双击时间条 → 打开编辑 Modal（精确改 planStart/planEnd）
  const openEditModal = (item: GanttItem) => {
    setEditingItem(item);
    editForm.setFieldsValue({
      planStart: item.planStart ? dayjs(item.planStart) : null,
      planEnd: item.planEnd ? dayjs(item.planEnd) : null,
    });
  };

  const saveEdit = async () => {
    if (!editingItem) return;
    try {
      const values = await editForm.validateFields();
      await workItemApi.update(editingItem.id, {
        planStart: values.planStart ? values.planStart.toISOString() : null,
        planEnd: values.planEnd ? values.planEnd.toISOString() : null,
        actor: user?.displayName || '我',
      } as any);
      message.success(`✓ ${editingItem.key} 排期已更新`);
      setEditingItem(null);
      load();
    } catch (e: any) {
      if (e.errorFields) return; // 校验失败
      message.error('保存失败：' + e.message);
    }
  };

  // 月份分组（用于月标签）
  const monthMarkers = useMemo(() => {
    if (!dayList.length) return [] as { left: number; label: string }[];
    const markers: { left: number; label: string }[] = [];
    let lastMonth = -1;
    dayList.forEach((d, i) => {
      const m = d.month();
      if (m !== lastMonth) {
        markers.push({ left: i * SCALE_PX[scale], label: d.format('YYYY/MM') });
        lastMonth = m;
      }
    });
    return markers;
  }, [dayList, scale]);

  // 工作项位置（按 planStart/planEnd 算 left% + width%）
  const positionOf = (item: GanttItem) => {
    if (!fromDate || !toDate || !item.planStart || !item.planEnd) return null;
    const s = dayjs(item.planStart);
    const e = dayjs(item.planEnd);
    const startDay = Math.max(0, s.diff(fromDate, 'day'));
    const endDay = Math.min(totalDays - 1, e.diff(fromDate, 'day'));
    if (endDay < startDay) return null;
    return {
      left: (startDay / totalDays) * 100,
      width: ((endDay - startDay + 1) / totalDays) * 100,
      startDay, endDay,
    };
  };

  const today = dayjs();
  const todayOffset = fromDate ? (today.diff(fromDate, 'day') / totalDays) * 100 : -1;

  return (
    <div>
      {/* 顶部工具栏 */}
      <Card style={{ marginBottom: 16 }} bodyStyle={{ padding: 16 }}>
        <Space wrap size="middle" style={{ width: '100%', justifyContent: 'space-between' }}>
          <Space wrap>
            <Select
              placeholder="选择项目"
              style={{ width: 280 }}
              value={selectedProject}
              onChange={setSelectedProject}
              allowClear
              options={[
                { value: undefined, label: '🌐 全部项目' },
                ...projects.map(p => ({ value: p.code, label: `${p.code} - ${p.name}` })),
              ]}
            />
            <Segmented
              options={[{ label: '日', value: 'day' }, { label: '周', value: 'week' }, { label: '月', value: 'month' }]}
              value={scale}
              onChange={(v) => setScale(v as Scale)}
            />
            <Space>
              <span style={{ fontSize: 13, color: '#666' }}>显示未排期</span>
              <Switch size="small" checked={showUnscheduled} onChange={setShowUnscheduled} />
            </Space>
            <Space>
              <span style={{ fontSize: 13, color: '#666' }}>显示依赖连线</span>
              <Switch size="small" checked={showRelations} onChange={setShowRelations} />
            </Space>
            <Button icon={<ReloadOutlined />} onClick={load} loading={loading}>刷新</Button>
            <Select
              placeholder="选择迭代"
              style={{ width: 200 }}
              value={retroIteration}
              onChange={setRetroIteration}
              allowClear
              options={iterations.map((i: any) => ({ value: i.id, label: `${i.name}${i.status === 'active' ? ' (进行中)' : ''}` }))}
            />
            <Button icon={<HistoryOutlined />} onClick={openRetrospective} disabled={!retroIteration}>迭代回顾</Button>
          </Space>
          {data && (
            <Space>
              <Badge count={data.summary.scheduledCount} showZero color="green" />
              <span style={{ fontSize: 12, color: '#999' }}>已排期</span>
              <Badge count={data.summary.unscheduledCount} showZero color="default" />
              <span style={{ fontSize: 12, color: '#999' }}>未排期</span>
            </Space>
          )}
        </Space>
      </Card>

      {/* 统计 */}
      {data && (
        <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
          <Col span={6}>
            <Card><Statistic title="项目数" value={data.summary.projectCount} prefix={<ProjectOutlined />} /></Card>
          </Col>
          <Col span={6}>
            <Card><Statistic title="工作项总数" value={data.summary.itemCount} /></Card>
          </Col>
          <Col span={6}>
            <Card>
              <Statistic
                title="已排期"
                value={data.summary.scheduledCount}
                valueStyle={{ color: '#52c41a' }}
                prefix={<CheckCircleOutlined />}
              />
            </Card>
          </Col>
          <Col span={6}>
            <Card>
              <Statistic
                title="未排期"
                value={data.summary.unscheduledCount}
                valueStyle={{ color: data.summary.unscheduledCount > 0 ? '#fa8c16' : '#999' }}
                prefix={<ClockCircleOutlined />}
              />
            </Card>
          </Col>
        </Row>
      )}

      {/* V1.28 燃尽图 */}
      <div style={{ marginBottom: 16 }}>
        <BurndownChart />
      </div>

      {/* 甘特图主体 */}
      <Card
        title={
          <Space>
            <CalendarOutlined style={{ color: '#1677ff' }} />
            <span>甘特图</span>
            {data && data.dateRange.from && (
              <Tag color="blue">{data.dateRange.from} ~ {data.dateRange.to}</Tag>
            )}
            <Tag color="purple">{totalDays} 天</Tag>
          </Space>
        }
        bodyStyle={{ padding: 0 }}
        loading={loading}
      >
        {!data || data.items.length === 0 ? (
          <Empty style={{ padding: 60 }} description="该范围无工作项" />
        ) : (
          <div style={{ display: 'flex' }}>
            {/* 左侧工作项列表（固定列） */}
            <div style={{ width: 360, flexShrink: 0, borderRight: '1px solid #f0f0f0' }}>
              {/* 表头 */}
              <div style={{
                height: 56, padding: '0 12px', background: '#fafafa',
                display: 'flex', alignItems: 'center', fontWeight: 500, fontSize: 13,
                borderBottom: '1px solid #f0f0f0',
              }}>
                工作项 ({data.items.length})
              </div>
              {/* 行 */}
              {data.items.map((item) => (
                <Link
                  key={item.id}
                  to={`/work-items/${item.type}/${item.id}`}
                  style={{ color: 'inherit', display: 'block' }}
                >
                  <div style={{
                    height: 44, padding: '0 12px', borderBottom: '1px solid #f5f5f5',
                    display: 'flex', alignItems: 'center', gap: 8, fontSize: 12,
                    background: item.hasSchedule ? '#fff' : '#fafafa',
                    cursor: 'pointer',
                  }}
                    onMouseEnter={(e) => e.currentTarget.style.background = '#f0f5ff'}
                    onMouseLeave={(e) => e.currentTarget.style.background = item.hasSchedule ? '#fff' : '#fafafa'}
                  >
                    <Tag color={TYPE_COLOR[item.type]} style={{ margin: 0, minWidth: 36, textAlign: 'center' }}>
                      {TYPE_LABEL[item.type]}
                    </Tag>
                    <span style={{ fontFamily: 'monospace', fontSize: 11, color: '#999', minWidth: 60 }}>
                      {item.key}
                    </span>
                    <Tooltip title={item.title}>
                      <span style={{
                        flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        color: item.hasSchedule ? '#333' : '#bbb',
                        fontStyle: item.hasSchedule ? 'normal' : 'italic',
                      }}>
                        {item.title}
                      </span>
                    </Tooltip>
                    <Tag color={STATUS_COLOR[item.status] || 'default'} style={{ margin: 0, fontSize: 10 }}>
                      {item.status}
                    </Tag>
                  </div>
                </Link>
              ))}
            </div>

            {/* 右侧时间区域（横向滚动） */}
            <div style={{ flex: 1, overflowX: 'auto', overflowY: 'hidden' }}>
              {/* 月份标签 */}
              <div style={{
                height: 28, background: '#fafafa', borderBottom: '1px solid #f0f0f0',
                position: 'relative', minWidth: totalWidth,
              }}>
                {monthMarkers.map((m, i) => (
                  <div key={i} style={{
                    position: 'absolute', left: m.left, top: 0, height: '100%',
                    padding: '4px 8px', fontSize: 11, fontWeight: 500, color: '#666',
                    borderLeft: '1px solid #e8e8e8',
                  }}>
                    {m.label}
                  </div>
                ))}
              </div>

              {/* 日标签 */}
              <div style={{
                height: 28, background: '#fafafa', borderBottom: '1px solid #f0f0f0',
                position: 'relative', minWidth: totalWidth,
              }}>
                {dayList.map((d, i) => {
                  const dow = d.day();
                  const isWeekend = dow === 0 || dow === 6;
                  return (
                    <div key={i} style={{
                      position: 'absolute', left: i * SCALE_PX[scale], top: 0,
                      width: SCALE_PX[scale], height: '100%',
                      textAlign: 'center', fontSize: 10,
                      color: isWeekend ? '#bbb' : '#666',
                      background: isWeekend ? '#f5f5f5' : 'transparent',
                      borderLeft: '1px solid #f0f0f0',
                      paddingTop: 6,
                    }}>
                      {scale === 'day' && d.format('D')}
                      {scale === 'week' && ['日', '一', '二', '三', '四', '五', '六'][dow]}
                      {scale === 'month' && (d.date() === 1 ? d.format('M/D') : '')}
                    </div>
                  );
                })}
              </div>

              {/* 工作项行 */}
              <div style={{ position: 'relative', minWidth: totalWidth }}>
                {/* 今天竖线 */}
                {todayOffset >= 0 && todayOffset <= 100 && (
                  <div style={{
                    position: 'absolute', left: `${todayOffset}%`, top: 0, bottom: 0,
                    width: 2, background: '#ff4d4f', zIndex: 5, pointerEvents: 'none',
                  }}>
                    <div style={{
                      position: 'absolute', top: -22, left: -16, width: 32, textAlign: 'center',
                      background: '#ff4d4f', color: '#fff', fontSize: 10, borderRadius: 2, padding: '1px 0',
                    }}>今天</div>
                  </div>
                )}

                {/* V1.12.1: 依赖连线 SVG 叠加层 (画在时间条之下, 但在背景之上) */}
                {showRelations && data.relations && data.relations.length > 0 && (
                  <svg
                    style={{ position: 'absolute', top: 0, left: 0, width: totalWidth, height: data.items.length * 44, zIndex: 2, pointerEvents: 'none' }}
                    width={totalWidth}
                    height={data.items.length * 44}
                  >
                    <defs>
                      {/* 箭头标记 */}
                      <marker id="arrow-blocks" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                        <path d="M 0 0 L 10 5 L 0 10 z" fill="#cf1322" />
                      </marker>
                      <marker id="arrow-relates" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                        <path d="M 0 0 L 10 5 L 0 10 z" fill="#1677ff" />
                      </marker>
                      <marker id="arrow-duplicates" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                        <path d="M 0 0 L 10 5 L 0 10 z" fill="#8c8c8c" />
                      </marker>
                    </defs>
                    {(() => {
                      // 索引 itemId -> rowIndex
                      const rowMap: Record<string, number> = {};
                      data.items.forEach((it, idx) => { rowMap[it.id] = idx; });
                      // 算 pos
                      const posMap: Record<string, { left: number; width: number; startDay: number; endDay: number } | null> = {};
                      data.items.forEach(it => { posMap[it.id] = positionOf(it); });
                      return data.relations.map(rel => {
                        const fromIdx = rowMap[rel.fromId];
                        const toIdx = rowMap[rel.toId];
                        if (fromIdx === undefined || toIdx === undefined) return null;
                        const fromPos = posMap[rel.fromId];
                        const toPos = posMap[rel.toId];
                        if (!fromPos || !toPos) return null;
                        // from 是被依赖方(前置任务), to 是后置任务
                        // 箭头: from 的 right → to 的 left
                        const x1 = (fromPos.left + fromPos.width) / 100 * totalWidth;
                        const y1 = fromIdx * 44 + 22;
                        const x2 = toPos.left / 100 * totalWidth;
                        const y2 = toIdx * 44 + 22;
                        // 颜色按 type
                        const color = rel.type === 'blocks' ? '#cf1322' : rel.type === 'relates' ? '#1677ff' : '#8c8c8c';
                        const marker = rel.type === 'blocks' ? 'url(#arrow-blocks)' : rel.type === 'relates' ? 'url(#arrow-relates)' : 'url(#arrow-duplicates)';
                        // 贝塞尔折线 (L 形)
                        const midX = (x1 + x2) / 2;
                        const path = `M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2 - 6} ${y2}`;
                        return (
                          <g key={rel.id}>
                            <path d={path} fill="none" stroke={color} strokeWidth={1.5} strokeDasharray={rel.type === 'relates' ? '4 2' : ''} markerEnd={marker} opacity={0.7} />
                          </g>
                        );
                      });
                    })()}
                  </svg>
                )}

                {/* 行 + 时间条 */}
                {data.items.map((item) => {
                  const pos = positionOf(item);
                  return (
                    <div key={item.id} style={{
                      height: 44, position: 'relative', borderBottom: '1px solid #f5f5f5',
                      background: item.hasSchedule ? 'transparent' : 'repeating-linear-gradient(45deg, transparent, transparent 5px, #fafafa 5px, #fafafa 10px)',
                    }}>
                      {/* 周末背景 */}
                      {dayList.map((d, i) => {
                        const dow = d.day();
                        if (dow !== 0 && dow !== 6) return null;
                        return (
                          <div key={i} style={{
                            position: 'absolute', left: i * SCALE_PX[scale], top: 0, bottom: 0,
                            width: SCALE_PX[scale], background: '#fafafa', opacity: 0.5, pointerEvents: 'none',
                          }} />
                        );
                      })}
                      {/* 时间条 */}
                      {pos && item.hasSchedule && (
                        <Tooltip title={
                          <div>
                            <div><b>{item.key} {item.title}</b></div>
                            <div>状态: {item.status} | 优先级: {item.priority}</div>
                            <div>负责人: {item.assignee || '未指派'}</div>
                            <div>计划: {item.planStart?.slice(0, 10)} ~ {item.planEnd?.slice(0, 10)}</div>
                            {item.actualStart && <div>实际: {item.actualStart.slice(0, 10)} {item.actualEnd ? `~ ${item.actualEnd.slice(0, 10)}` : '~ 进行中'}</div>}
                            {item.estimate && <div>估分: {item.estimate}h {item.actualHours ? `(实际 ${item.actualHours}h)` : ''}</div>}
                            <div style={{ marginTop: 4, color: '#999', fontSize: 11 }}>💡 拖拽改时间 · 双击精确编辑 · 单击进详情</div>
                          </div>
                        }>
                          <div
                            style={{
                              position: 'absolute',
                              left: `${pos.left}%`,
                              width: `${pos.width}%`,
                              top: 8, bottom: 8,
                              background: drag?.id === item.id ? '#fa8c16' : (TYPE_COLOR[item.type] || '#1677ff'),
                              borderRadius: 4,
                              border: `1px solid ${STATUS_COLOR[item.status] === 'red' ? '#cf1322' : TYPE_COLOR[item.type]}`,
                              boxShadow: drag?.id === item.id ? '0 0 8px rgba(250,140,22,0.6)' : (STATUS_COLOR[item.status] === 'red' ? '0 0 4px #cf1322' : 'none'),
                              display: 'flex', alignItems: 'center', paddingLeft: 10,
                              fontSize: 10, color: '#fff', overflow: 'hidden',
                              whiteSpace: 'nowrap', textOverflow: 'ellipsis',
                              cursor: drag?.id === item.id
                                ? (drag.type === 'move' ? 'grabbing' : 'col-resize')
                                : 'grab',
                              opacity: 0.9,
                              userSelect: 'none',
                            }}
                            onMouseDown={(e) => {
                              if (e.button !== 0) return; // 只左键
                              // 区分区域：左/右 8px 算 resize，中间 36px 算 move
                              const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
                              const xRel = e.clientX - rect.left;
                              const type = xRel < 10 ? 'resize-start'
                                : xRel > rect.width - 10 ? 'resize-end'
                                : 'move';
                              e.preventDefault();
                              e.stopPropagation();
                              const startDay = item.planStart ? dayjs(item.planStart).diff(fromDate!, 'day') : 0;
                              const endDay = item.planEnd ? dayjs(item.planEnd).diff(fromDate!, 'day') : 0;
                              setDrag({
                                id: item.id,
                                type,
                                startX: e.clientX,
                                origStart: startDay,
                                origEnd: endDay,
                                item: { ...item },
                              });
                            }}
                            onClick={(e) => {
                              // 只有没在拖拽时单击才跳转
                              if (!drag) {
                                e.stopPropagation();
                                navigate(`/work-items/${item.type}/${item.id}`);
                              }
                            }}
                            onDoubleClick={(e) => {
                              e.stopPropagation();
                              openEditModal(item);
                            }}
                          >
                            {/* 左侧 resize 手柄 */}
                            <div
                              style={{
                                position: 'absolute', left: 0, top: 0, bottom: 0, width: 8,
                                cursor: 'col-resize',
                              }}
                              onMouseDown={(e) => {
                                if (e.button !== 0) return;
                                e.stopPropagation();
                                e.preventDefault();
                                const startDay = item.planStart ? dayjs(item.planStart).diff(fromDate!, 'day') : 0;
                                const endDay = item.planEnd ? dayjs(item.planEnd).diff(fromDate!, 'day') : 0;
                                setDrag({
                                  id: item.id,
                                  type: 'resize-start',
                                  startX: e.clientX,
                                  origStart: startDay,
                                  origEnd: endDay,
                                  item: { ...item },
                                });
                              }}
                            />
                            {/* 右侧 resize 手柄 */}
                            <div
                              style={{
                                position: 'absolute', right: 0, top: 0, bottom: 0, width: 8,
                                cursor: 'col-resize',
                              }}
                              onMouseDown={(e) => {
                                if (e.button !== 0) return;
                                e.stopPropagation();
                                e.preventDefault();
                                const startDay = item.planStart ? dayjs(item.planStart).diff(fromDate!, 'day') : 0;
                                const endDay = item.planEnd ? dayjs(item.planEnd).diff(fromDate!, 'day') : 0;
                                setDrag({
                                  id: item.id,
                                  type: 'resize-end',
                                  startX: e.clientX,
                                  origStart: startDay,
                                  origEnd: endDay,
                                  item: { ...item },
                                });
                              }}
                            />
                            {pos.width > 8 && (
                              <span style={{ textShadow: '0 1px 2px rgba(0,0,0,0.3)', pointerEvents: 'none' }}>
                                {item.priority && <Tag color={PRIORITY_COLOR[item.priority]} style={{ marginRight: 4, fontSize: 9, lineHeight: '14px', padding: '0 4px' }}>{item.priority}</Tag>}
                                {item.assignee && <span>{item.assignee}</span>}
                              </span>
                            )}
                          </div>
                        </Tooltip>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </Card>

      {/* 底部图例 */}
      {data && data.items.length > 0 && (
        <Card style={{ marginTop: 16 }} bodyStyle={{ padding: 12 }}>
          <Space size="large" wrap>
            <span style={{ fontSize: 12, color: '#666' }}>类型：</span>
            {Object.entries(TYPE_LABEL).map(([k, label]) => (
              <Tag key={k} color={TYPE_COLOR[k]} style={{ margin: 0 }}>{label}</Tag>
            ))}
            <span style={{ fontSize: 12, color: '#666', marginLeft: 16 }}>优先级：</span>
            {Object.keys(PRIORITY_COLOR).map(p => (
              <Tag key={p} color={PRIORITY_COLOR[p]} style={{ margin: 0 }}>{p}</Tag>
            ))}
            <span style={{ fontSize: 12, color: '#999', marginLeft: 16 }}>
              💡 拖动 = 改时间 · 双击 = 精确编辑 · 单击 = 进详情
            </span>
            {/* V1.12.1: 依赖连线图例 */}
            <span style={{ fontSize: 12, color: '#999', marginLeft: 16 }}>
              <span style={{ display: 'inline-block', width: 14, height: 2, background: '#cf1322', verticalAlign: 'middle', marginRight: 4 }} />阻塞
              <span style={{ display: 'inline-block', width: 14, height: 2, background: '#1677ff', verticalAlign: 'middle', margin: '0 4px 0 12px', borderTop: '1px dashed #1677ff' }} />关联
              <span style={{ display: 'inline-block', width: 14, height: 2, background: '#8c8c8c', verticalAlign: 'middle', margin: '0 4px 0 12px' }} />重复
            </span>
          </Space>
        </Card>
      )}

      {/* V1.9.1 精确编辑 Modal */}
      <Modal
        title={editingItem ? `编辑排期 — ${editingItem.key} ${editingItem.title}` : ''}
        open={!!editingItem}
        onCancel={() => setEditingItem(null)}
        onOk={saveEdit}
        okText="保存"
        cancelText="取消"
        destroyOnClose
      >
        <Form form={editForm} layout="vertical">
          <Form.Item name="planStart" label="计划开始" rules={[{ required: true, message: '请选择开始日期' }]}>
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="planEnd" label="计划结束" rules={[
            { required: true, message: '请选择结束日期' },
            ({ getFieldValue }) => ({
              validator(_, value) {
                if (!value || !getFieldValue('planStart') || value.isAfter(getFieldValue('planStart'))) {
                  return Promise.resolve();
                }
                return Promise.reject(new Error('结束日期必须晚于开始日期'));
              },
            }),
          ]}>
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
          <div style={{ color: '#999', fontSize: 12 }}>
            💡 拖动时间条可以快速粗调，双击可以精确编辑
          </div>
        </Form>
      </Modal>

      {/* V1.28 迭代回顾 Modal */}
      <Modal
        title={<Space><HistoryOutlined /> {retroData?.iteration?.name || '迭代回顾'}</Space>}
        open={retroOpen}
        onCancel={() => setRetroOpen(false)}
        width={820}
        footer={
          retroData ? [
            <Button key="copy" icon={<CopyOutlined />} onClick={copyRetro}>复制 MD</Button>,
            <Button key="dl" icon={<DownloadOutlined />} onClick={downloadRetro}>下载 MD</Button>,
            <Button key="close" type="primary" onClick={() => setRetroOpen(false)}>关闭</Button>,
          ] : [<Button key="close" onClick={() => setRetroOpen(false)}>关闭</Button>]
        }
      >
        {retroLoading ? <div style={{ textAlign: 'center', padding: 60 }}><Spin /></div>
          : retroData && retroData.summary ? (
            <>
              {/* 摘要卡片 */}
              <Row gutter={12} style={{ marginBottom: 16 }}>
                <Col span={5}><Card size="small"><Statistic title="规划/完成" value={`${retroData.summary.doneCount}/${retroData.summary.totalItems}`} valueStyle={{ fontSize: 18 }} /></Card></Col>
                <Col span={5}><Card size="small"><Statistic title="完成率" value={`${retroData.summary.completionRate}%`} valueStyle={{ fontSize: 18, color: retroData.summary.completionRate >= 80 ? '#52c41a' : retroData.summary.completionRate >= 50 ? '#faad14' : '#f5222d' }} /></Card></Col>
                <Col span={5}><Card size="small"><Statistic title="延期项" value={retroData.summary.overdueCount} valueStyle={{ fontSize: 18, color: retroData.summary.overdueCount > 0 ? '#f5222d' : '#999' }} /></Card></Col>
                <Col span={5}><Card size="small"><Statistic title="P0/P1 紧急" value={retroData.summary.criticalCount} valueStyle={{ fontSize: 18, color: retroData.summary.criticalCount > 0 ? '#faad14' : '#999' }} /></Card></Col>
                <Col span={4}><Card size="small"><Statistic title="工时偏差" value={`${retroData.summary.totalEstimate}h / ${retroData.summary.totalActual}h`} valueStyle={{ fontSize: 14 }} /></Card></Col>
              </Row>
              {/* Markdown 内容 */}
              <div style={{ maxHeight: 500, overflow: 'auto', lineHeight: 1.7, background: '#fafafa', borderRadius: 6, padding: 12 }}>
                {renderRetroMarkdown(retroData.report || '')}
              </div>
            </>
          ) : <Empty description="无数据" />}
      </Modal>
    </div>
  );
}

// V1.28 简单 markdown 渲染 (用于回顾报告)
function renderRetroMarkdown(md: string) {
  const lines = md.split('\n');
  return lines.map((line, i) => {
    if (line.startsWith('# ')) return <h1 key={i} style={{ fontSize: 20, marginTop: 12 }}>{line.slice(2)}</h1>;
    if (line.startsWith('## ')) return <h2 key={i} style={{ fontSize: 16, marginTop: 14, borderBottom: '1px solid #e8e8e8', paddingBottom: 4 }}>{line.slice(3)}</h2>;
    if (line.startsWith('### ')) return <h3 key={i} style={{ fontSize: 14, marginTop: 10, color: '#1677ff' }}>{line.slice(4)}</h3>;
    if (line.startsWith('| ') && line.endsWith('|')) {
      const cells = line.split('|').map(c => c.trim()).filter(c => c);
      if (cells.every(c => /^[-:]+$/.test(c))) return null;
      return <div key={i} style={{ display: 'flex', borderBottom: '1px solid #f0f0f0', padding: '4px 0' }}>{cells.map((c, j) => <div key={j} style={{ flex: 1, padding: '0 8px' }}>{c}</div>)}</div>;
    }
    if (line.match(/^[-*]\s/)) return <div key={i} style={{ paddingLeft: 16 }}>• {line.replace(/^[-*]\s/, '')}</div>;
    if (/^\d+\.\s/.test(line)) return <div key={i} style={{ paddingLeft: 16 }}>{line}</div>;
    if (line.startsWith('> ')) return <div key={i} style={{ color: '#666', fontStyle: 'italic', paddingLeft: 8, borderLeft: '3px solid #d9d9d9', margin: '4px 0' }}>{line.slice(2)}</div>;
    if (line.trim() === '---') return <hr key={i} style={{ margin: '12px 0', border: 0, borderTop: '1px dashed #d9d9d9' }} />;
    if (!line.trim()) return <br key={i} />;
    return <p key={i} style={{ margin: '4px 0' }}>{line}</p>;
  });
}
