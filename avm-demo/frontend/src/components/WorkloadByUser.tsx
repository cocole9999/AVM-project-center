/**
 * V1.29 工作量按人分布
 * - 柱状图: 估分 vs 实际工时, 按 assignee
 * - 数据: GET /api/work-items/workload-by-user
 */
import React, { useEffect, useState } from 'react';
import ReactECharts from 'echarts-for-react';
import { Select, Spin, Empty, Card, Space, Tag } from 'antd';
import { workItemApi, projectApi, iterationApi } from '../api';

export function WorkloadByUser() {
  const [data, setData] = useState<{ byUser: any[]; totalItems: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [projects, setProjects] = useState<any[]>([]);
  const [iterations, setIterations] = useState<any[]>([]);
  const [projectCode, setProjectCode] = useState<string | undefined>();
  const [iterationId, setIterationId] = useState<string | undefined>();

  useEffect(() => {
    projectApi.list().then((list: any[]) => setProjects(list.map((p: any) => ({ value: p.code, label: p.code })))).catch(() => {});
    iterationApi.list().then((list: any[]) => setIterations(list.map((i: any) => ({ value: i.id, label: i.name })))).catch(() => {});
  }, []);

  const load = () => {
    setLoading(true);
    workItemApi.workloadByUser({ projectCode, iterationId })
      .then(setData)
      .catch(() => setData({ byUser: [], totalItems: 0 }))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [projectCode, iterationId]);

  if (loading) return <div style={{ textAlign: 'center', padding: 40 }}><Spin /></div>;
  if (!data || data.byUser.length === 0) return <Empty description="无工作量数据" />;

  const sorted = data.byUser;
  const option = {
    grid: { left: 50, right: 16, top: 30, bottom: 60 },
    tooltip: {
      trigger: 'axis',
      formatter: (params: any[]) => {
        const i = params[0].dataIndex;
        const u = sorted[i];
        return `<b>${u.user}</b><br/>` +
          `估分: <b>${u.totalEstimate}h</b><br/>` +
          `实际: <b>${u.totalActual}h</b><br/>` +
          `工作项: ${u.itemCount} (完成 ${u.doneCount} · 延期 ${u.overdueCount})`;
      },
    },
    legend: { top: 0, right: 0, textStyle: { fontSize: 11 } },
    xAxis: { type: 'category', data: sorted.map(u => u.user), axisLabel: { fontSize: 10, rotate: sorted.length > 6 ? 30 : 0, interval: 0 } },
    yAxis: { type: 'value', name: '小时', axisLabel: { fontSize: 10 } },
    series: [
      { name: '估分', type: 'bar', data: sorted.map(u => u.totalEstimate), itemStyle: { color: '#1677ff' } },
      { name: '实际工时', type: 'bar', data: sorted.map(u => u.totalActual), itemStyle: { color: '#52c41a' } },
    ],
  };

  return (
    <Card
      size="small"
      title={
        <Space>
          <span>👥 团队工作量分布 (估分 vs 实际)</span>
          <Tag color="blue">共 {data.totalItems} 工作项</Tag>
        </Space>
      }
      extra={
        <Space size={4} wrap>
          <Select
            size="small"
            placeholder="按项目过滤"
            value={projectCode}
            onChange={setProjectCode}
            allowClear
            style={{ width: 160 }}
            options={projects}
          />
          <Select
            size="small"
            placeholder="按迭代过滤"
            value={iterationId}
            onChange={setIterationId}
            allowClear
            style={{ width: 160 }}
            options={iterations}
          />
        </Space>
      }
    >
      <ReactECharts option={option} style={{ height: 280 }} notMerge lazyUpdate />
    </Card>
  );
}
