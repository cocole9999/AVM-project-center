/**
 * V1.28 工作量趋势图
 * - 折线图: estimate + actualHours 随时间变化
 * - 用 echarts-for-react (依赖已有)
 */
import React, { useEffect, useState } from 'react';
import ReactECharts from 'echarts-for-react';
import { Spin } from 'antd';
import { workItemApi } from '../api';

interface Point {
  date: string;
  estimate: number | null;
  actualHours: number | null;
  action: string;
}

export function WorkloadTrend({ workItemId }: { workItemId: string }) {
  const [points, setPoints] = useState<Point[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    workItemApi.estimateHistory(workItemId)
      .then(r => setPoints(r.points || []))
      .catch(() => setPoints([]))
      .finally(() => setLoading(false));
  }, [workItemId]);

  if (loading) return <div style={{ textAlign: 'center', padding: 24 }}><Spin /></div>;
  if (points.length === 0) {
    return <div style={{ textAlign: 'center', color: '#999', padding: 16, fontSize: 12 }}>暂无变更历史</div>;
  }

  const dates = points.map(p => p.date);
  const estimates = points.map(p => p.estimate);
  const actuals = points.map(p => p.actualHours);

  const option = {
    grid: { left: 40, right: 16, top: 28, bottom: 28 },
    tooltip: { trigger: 'axis' },
    legend: { top: 0, right: 0, textStyle: { fontSize: 11 } },
    xAxis: {
      type: 'category',
      data: dates,
      axisLabel: { fontSize: 10, rotate: dates.length > 8 ? 30 : 0 },
    },
    yAxis: { type: 'value', name: '小时', axisLabel: { fontSize: 10 } },
    series: [
      {
        name: '估分',
        type: 'line',
        data: estimates,
        smooth: true,
        itemStyle: { color: '#1677ff' },
        connectNulls: true,
      },
      {
        name: '实际工时',
        type: 'line',
        data: actuals,
        smooth: true,
        itemStyle: { color: '#52c41a' },
        connectNulls: true,
      },
    ],
  };

  return (
    <div style={{ marginTop: 8 }}>
      <ReactECharts option={option} style={{ height: 180 }} notMerge lazyUpdate />
    </div>
  );
}
