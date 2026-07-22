import { useEffect, useMemo, useState } from 'react';
import { Tag, Tooltip, Space, Empty, Button, Select } from 'antd';
import { LeftOutlined, RightOutlined, CameraOutlined } from '@ant-design/icons';
import dayjs, { Dayjs } from 'dayjs';
import type { WorkItem } from '../types';
import { PRIORITY_COLOR, STATUS_COLOR, TYPE_COLOR } from '../types';
import { baselineApi } from '../api';

interface Props {
  items: WorkItem[];
  onClickItem: (item: WorkItem) => void;
}

type Unit = 'day' | 'week' | 'month';
const UNIT_WIDTH: Record<Unit, number> = { day: 36, week: 90, month: 200 };
const UNIT_LABEL: Record<Unit, string> = { day: '日', week: '周', month: '月' };

export function GanttView({ items, onClickItem }: Props) {
  const [unit, setUnit] = useState<Unit>('week');
  const [offsetDays, setOffsetDays] = useState(0);
  const [baselines, setBaselines] = useState<any[]>([]);
  const [selectedBaselineId, setSelectedBaselineId] = useState<string | undefined>(undefined);
  const [baselineMap, setBaselineMap] = useState<Record<string, { planStart: string; planEnd: string }>>({});

  useEffect(() => {
    baselineApi.list().then(setBaselines).catch(() => {});
  }, []);

  useEffect(() => {
    if (!selectedBaselineId) { setBaselineMap({}); return; }
    baselineApi.compare(selectedBaselineId).then((r: any) => {
      const m: Record<string, { planStart: string; planEnd: string }> = {};
      const snap: any[] = JSON.parse(r.baseline.snapshot);
      for (const s of snap) {
        if (s.planStart && s.planEnd) {
          m[s.itemId] = { planStart: s.planStart, planEnd: s.planEnd };
        }
      }
      setBaselineMap(m);
    }).catch(() => setBaselineMap({}));
  }, [selectedBaselineId]);

  // 过滤有排期的项
  const scheduled = useMemo(() => items.filter(i => i.planStart && i.planEnd), [items]);
  const unscheduled = useMemo(() => items.filter(i => !i.planStart || !i.planEnd), [items]);

  // 计算时间范围
  const { rangeStart, rangeEnd, totalUnits } = useMemo(() => {
    if (scheduled.length === 0) {
      const now = dayjs();
      return {
        rangeStart: now.startOf('week'),
        rangeEnd: now.add(4, 'week').endOf('week'),
        totalUnits: 28,
      };
    }
    let min = dayjs(scheduled[0].planStart!);
    let max = dayjs(scheduled[0].planEnd!);
    scheduled.forEach(i => {
      if (dayjs(i.planStart!).isBefore(min)) min = dayjs(i.planStart!);
      if (dayjs(i.planEnd!).isAfter(max)) max = dayjs(i.planEnd!);
    });
    // 补前后余量
    min = min.subtract(3, 'day').startOf('day');
    max = max.add(3, 'day').endOf('day');

    let units = 0;
    if (unit === 'day') units = max.diff(min, 'day');
    else if (unit === 'week') units = Math.ceil(max.diff(min, 'week', true));
    else units = max.diff(min, 'month') + 1;

    return { rangeStart: min, rangeEnd: max, totalUnits: Math.max(units, 8) };
  }, [scheduled, unit]);

  const visibleStart = rangeStart.add(offsetDays, 'day');
  const cellWidth = UNIT_WIDTH[unit];

  const timeAxis = useMemo(() => {
    const cells: { label: string; isFirst: boolean; isWeekend: boolean; date: Dayjs }[] = [];
    for (let i = 0; i < totalUnits; i++) {
      const d = unit === 'day' ? visibleStart.add(i, 'day')
              : unit === 'week' ? visibleStart.add(i, 'week').startOf('week')
              : visibleStart.add(i, 'month').startOf('month');
      const label = unit === 'day' ? d.format('MM-DD')
                  : unit === 'week' ? `W${d.week()} ${d.format('MM/DD')}`
                  : d.format('YYYY/MM');
      cells.push({
        label,
        isFirst: i === 0,
        isWeekend: unit === 'day' ? (d.day() === 0 || d.day() === 6) : false,
        date: d,
      });
    }
    return cells;
  }, [unit, visibleStart, totalUnits]);

  const todayOffset = dayjs().diff(visibleStart, 'day');
  const todayLeft = (todayOffset / (unit === 'day' ? 1 : unit === 'week' ? 7 : 30)) * cellWidth;

  return (
    <div style={{ padding: 16 }}>
      <div style={{ marginBottom: 12, display: 'flex', justifyContent: 'space-between' }}>
        <Space>
          <span style={{ color: '#666' }}>视图：</span>
          {(['day', 'week', 'month'] as Unit[]).map(u => (
            <Button
              key={u}
              size="small"
              type={unit === u ? 'primary' : 'default'}
              onClick={() => { setUnit(u); setOffsetDays(0); }}
            >
              {UNIT_LABEL[u]}
            </Button>
          ))}
        </Space>
        <Space>
          <Button size="small" icon={<LeftOutlined />} onClick={() => setOffsetDays(d => d - (unit === 'day' ? 7 : unit === 'week' ? 14 : 30))}>前移</Button>
          <Button size="small" onClick={() => setOffsetDays(0)}>今天</Button>
          <Button size="small" icon={<RightOutlined />} onClick={() => setOffsetDays(d => d + (unit === 'day' ? 7 : unit === 'week' ? 14 : 30))}>后移</Button>
        </Space>
        <Space>
          <CameraOutlined style={{ color: '#722ed1' }} />
          <span style={{ fontSize: 12, color: '#666' }}>对比基线：</span>
          <Select
            size="small"
            style={{ minWidth: 180 }}
            placeholder="选择基线"
            allowClear
            value={selectedBaselineId}
            onChange={setSelectedBaselineId}
            options={baselines.map((b: any) => ({ value: b.id, label: `${b.name} (${dayjs(b.createdAt).format('MM-DD')})` }))}
          />
          {selectedBaselineId && <Tag color="purple">基线对比中</Tag>}
        </Space>
      </div>

      {scheduled.length === 0 ? (
        <Empty description="暂无有排期的工作项" />
      ) : (
        <div style={{ overflow: 'auto', maxHeight: 'calc(100vh - 280px)' }}>
          <div style={{ minWidth: 320 + cellWidth * totalUnits }}>
            {/* 时间轴 */}
            <div style={{ display: 'flex', position: 'sticky', top: 0, zIndex: 2, background: '#fafafa', borderBottom: '1px solid #e8e8e8' }}>
              <div style={{
                width: 320, flexShrink: 0, padding: '8px 12px',
                fontWeight: 500, fontSize: 13, color: '#333',
                borderRight: '1px solid #e8e8e8',
              }}>
                工作项 ({scheduled.length})
              </div>
              <div style={{ display: 'flex', position: 'relative' }}>
                {timeAxis.map((cell, i) => (
                  <div key={i} style={{
                    width: cellWidth,
                    flexShrink: 0,
                    textAlign: 'center',
                    padding: '8px 4px',
                    fontSize: 12,
                    color: cell.isWeekend ? '#bbb' : '#666',
                    borderRight: '1px solid #f0f0f0',
                    background: cell.isWeekend ? '#fafafa' : 'transparent',
                  }}>
                    {cell.label}
                  </div>
                ))}
                {/* 今日线 */}
                {todayOffset >= 0 && todayOffset <= totalUnits * (unit === 'day' ? 1 : unit === 'week' ? 7 : 30) && (
                  <div style={{
                    position: 'absolute',
                    left: todayLeft,
                    top: 0, bottom: 0,
                    width: 2, background: '#ff4d4f',
                    zIndex: 1,
                  }}>
                    <div style={{
                      position: 'absolute', top: -2, left: -16,
                      fontSize: 10, color: '#ff4d4f', fontWeight: 'bold',
                    }}>今日</div>
                  </div>
                )}
              </div>
            </div>

            {/* 行 */}
            {scheduled.map(item => {
              const start = dayjs(item.planStart!);
              const end = dayjs(item.planEnd!);
              const offsetUnits = unit === 'day' ? start.diff(visibleStart, 'day')
                                : unit === 'week' ? start.diff(visibleStart, 'week', true)
                                : start.diff(visibleStart, 'month', true);
              const duration = unit === 'day' ? end.diff(start, 'day') + 1
                             : unit === 'week' ? end.diff(start, 'week', true) + 0.5
                             : end.diff(start, 'month', true) + 0.3;
              const left = Math.max(0, offsetUnits * cellWidth);
              const width = Math.max(cellWidth * 0.6, duration * cellWidth);
              const actualStart = item.actualStart ? dayjs(item.actualStart) : null;
              const actualEnd = item.actualEnd ? dayjs(item.actualEnd) : null;
              const progress = actualStart && actualEnd
                ? Math.min(100, Math.round((actualEnd.diff(actualStart, 'day') / Math.max(1, end.diff(start, 'day'))) * 100))
                : item.actualHours && item.estimate
                  ? Math.min(100, Math.round((item.actualHours / item.estimate) * 100))
                  : null;

              return (
                <div key={item.id} style={{ display: 'flex', borderBottom: '1px solid #f5f5f5', minHeight: 44 }}>
                  <div
                    onClick={() => onClickItem(item)}
                    style={{
                      width: 320, flexShrink: 0,
                      padding: '8px 12px', cursor: 'pointer',
                      borderRight: '1px solid #e8e8e8',
                      display: 'flex', alignItems: 'center', gap: 6,
                    }}
                  >
                    <Tag color={TYPE_COLOR[item.type]} style={{ margin: 0 }}>{item.key}</Tag>
                    <span style={{
                      fontSize: 13, color: '#333',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      flex: 1,
                    }}>
                      {item.title}
                    </span>
                    <Tag color={STATUS_COLOR[item.status]} style={{ margin: 0 }}>{item.status}</Tag>
                  </div>
                  <div style={{ position: 'relative', flex: 1, background: '#fff' }}>
                    {/* 周末背景 */}
                    {unit === 'day' && timeAxis.map((cell, i) => cell.isWeekend ? (
                      <div key={i} style={{
                        position: 'absolute', left: i * cellWidth, top: 0, bottom: 0,
                        width: cellWidth, background: '#fafafa',
                      }} />
                    ) : null)}
                    {/* 今日线（行内） */}
                    {todayOffset >= 0 && (
                      <div style={{
                        position: 'absolute',
                        left: todayLeft,
                        top: 0, bottom: 0,
                        width: 2, background: '#ff4d4f', opacity: 0.4,
                      }} />
                    )}
                    {/* 基线对比条（虚线） */}
                    {selectedBaselineId && baselineMap[item.id] && (() => {
                      const bStart = dayjs(baselineMap[item.id].planStart);
                      const bEnd = dayjs(baselineMap[item.id].planEnd);
                      const bOffsetUnits = unit === 'day' ? bStart.diff(visibleStart, 'day')
                                            : unit === 'week' ? bStart.diff(visibleStart, 'week', true)
                                            : bStart.diff(visibleStart, 'month', true);
                      const bDuration = unit === 'day' ? bEnd.diff(bStart, 'day') + 1
                                        : unit === 'week' ? bEnd.diff(bStart, 'week', true) + 0.5
                                        : bEnd.diff(bStart, 'month', true) + 0.3;
                      const bLeft = Math.max(0, bOffsetUnits * cellWidth);
                      const bWidth = Math.max(cellWidth * 0.6, bDuration * cellWidth);
                      return (
                        <Tooltip title={
                          <div>
                            <div>基线计划</div>
                            <div>{bStart.format('YYYY-MM-DD')} ~ {bEnd.format('YYYY-MM-DD')}</div>
                          </div>
                        }>
                          <div style={{
                            position: 'absolute',
                            left: bLeft, top: 2,
                            width: bWidth, height: 6,
                            border: '1.5px dashed #722ed1',
                            background: 'rgba(114, 46, 209, 0.08)',
                            borderRadius: 2,
                            pointerEvents: 'none',
                          }} />
                        </Tooltip>
                      );
                    })()}
                    {/* 条形 */}
                    <Tooltip title={
                      <div>
                        <div>{item.title}</div>
                        <div>计划：{start.format('YYYY-MM-DD')} ~ {end.format('YYYY-MM-DD')}</div>
                        {item.actualStart && <div>实际开始：{dayjs(item.actualStart).format('YYYY-MM-DD')}</div>}
                        {item.actualEnd && <div>实际结束：{dayjs(item.actualEnd).format('YYYY-MM-DD')}</div>}
                        {item.assignee && <div>负责人：{item.assignee}</div>}
                      </div>
                    }>
                      <div
                        onClick={() => onClickItem(item)}
                        style={{
                          position: 'absolute',
                          left, top: 8, width,
                          height: 28,
                          background: TYPE_COLOR[item.type] === 'red' ? '#ff7875'
                                    : TYPE_COLOR[item.type] === 'blue' ? '#69b1ff'
                                    : TYPE_COLOR[item.type] === 'cyan' ? '#5cdbd3'
                                    : '#b37feb',
                          borderRadius: 4,
                          cursor: 'pointer',
                          boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                          overflow: 'hidden',
                          borderLeft: `3px solid ${PRIORITY_COLOR[item.priority] === 'red' ? '#cf1322' : '#1677ff'}`,
                        }}
                      >
                        {/* 进度 */}
                        {progress != null && progress > 0 && (
                          <div style={{
                            position: 'absolute', left: 0, top: 0, bottom: 0,
                            width: `${progress}%`,
                            background: 'rgba(0,0,0,0.15)',
                          }} />
                        )}
                        <div style={{
                          padding: '4px 8px', fontSize: 11, color: '#fff',
                          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                        }}>
                          {item.title}
                        </div>
                      </div>
                    </Tooltip>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {unscheduled.length > 0 && (
        <div style={{ marginTop: 16, padding: 12, background: '#fafafa', borderRadius: 6 }}>
          <div style={{ fontSize: 12, color: '#999', marginBottom: 6 }}>
            未排期 ({unscheduled.length})
          </div>
          <Space wrap>
            {unscheduled.slice(0, 10).map(item => (
              <Tag key={item.id} color={TYPE_COLOR[item.type]} style={{ cursor: 'pointer' }} onClick={() => onClickItem(item)}>
                {item.key} {item.title}
              </Tag>
            ))}
            {unscheduled.length > 10 && <span style={{ color: '#999' }}>等 {unscheduled.length - 10} 项...</span>}
          </Space>
        </div>
      )}
    </div>
  );
}