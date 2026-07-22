/**
 * V1.28 燃尽图
 * - 双折线: 理想剩余 vs 实际剩余
 * - 数据: GET /api/iterations/:id/burndown
 */
import React, { useEffect, useState } from 'react';
import ReactECharts from 'echarts-for-react';
import { Select, Spin, Empty, Card, Space, Tag } from 'antd';
import { iterationApi } from '../api';

interface BurndownData {
  iteration: { id: string; name: string; startDate: string; endDate: string; totalEstimate: number };
  daily: Array<{ date: string; plannedRemaining: number; actualRemaining: number }>;
}

export function BurndownChart() {
  const [iterations, setIterations] = useState<any[]>([]);
  const [selected, setSelected] = useState<string | undefined>();
  const [data, setData] = useState<BurndownData | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    iterationApi.list().then((list: any[]) => {
      setIterations(list);
      const active = list.find((i: any) => i.status === 'active') || list[0];
      if (active) setSelected(active.id);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!selected) return;
    setLoading(true);
    iterationApi.burndown(selected)
      .then((d: any) => setData(d))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [selected]);

  const option = data ? {
    tooltip: { trigger: 'axis' },
    legend: { top: 0, left: 'center', textStyle: { fontSize: 11 }, itemGap: 24 },
    grid: { left: 65, right: 20, top: 28, bottom: 35 },
    xAxis: {
      type: 'category',
      data: data.daily.map((_d, i) => data.daily[i].date.slice(5)),
      axisLabel: { fontSize: 10, rotate: data.daily.length > 10 ? 45 : 0, interval: data.daily.length > 10 ? 1 : 0, overflow: 'truncate', width: 50 },
    },
    yAxis: { type: 'value', min: 0, max: Math.ceil((data.iteration.totalEstimate || 10) * 1.1), axisLabel: { fontSize: 10 } },
    series: [
      { name: '理想剩余', type: 'line', data: data.daily.map(d => d.plannedRemaining), smooth: true, color: '#1677ff', lineStyle: { type: 'dashed', width: 1.5 } },
      { name: '实际剩余', type: 'line', data: data.daily.map(d => d.actualRemaining), smooth: true, color: '#52c41a', lineStyle: { width: 1.5 }, areaStyle: { color: 'rgba(82,196,26,0.08)' } },
    ],
  } : {};

  return (
    <Card size="small" title={
      <Space>
        <span>📉 燃尽图</span>
        <Select
          value={selected}
          onChange={setSelected}
          style={{ minWidth: 180 }}
          placeholder="选择迭代"
          size="small"
        >
          {iterations.map(i => (
            <Select.Option key={i.id} value={i.id}>
              {i.name} {i.status === 'active' && <Tag color="green">进行中</Tag>}
            </Select.Option>
          ))}
        </Select>
      </Space>
    }>
      {loading ? <div style={{ textAlign: 'center', padding: 40 }}><Spin /></div>
        : !data ? <Empty description="无数据" />
        : data.daily.length === 0 ? <Empty description="迭代内无工作项" />
        : <>
            <div style={{ fontSize: 11, color: '#666', marginBottom: 8 }}>
              总估分: <b>{data.iteration.totalEstimate}h</b> · 周期: {data.iteration.startDate.slice(0, 10)} ~ {data.iteration.endDate.slice(0, 10)}
            </div>
            <ReactECharts key={selected} option={option} style={{ height: 280 }} notMerge />
          </>}
    </Card>
  );
}
