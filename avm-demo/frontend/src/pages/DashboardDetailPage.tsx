import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, Button, Space, message, Empty, Modal, Spin, Tabs } from 'antd';
import { ArrowLeftOutlined, PlusOutlined, EditOutlined, ReloadOutlined } from '@ant-design/icons';
import { dashboardApi, chartApi } from '../api';
import type { Dashboard, ChartConfig } from '../types';
import { EChart, buildEChartsOption } from '../components/EChart';

export function DashboardDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [chartData, setChartData] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const d = await dashboardApi.get(id);
      setDashboard(d);
      // 并行计算所有图表
      const data: Record<string, any> = {};
      await Promise.all((d.charts || []).map(async c => {
        try {
          data[c.id] = await chartApi.compute(c.id);
        } catch {
          data[c.id] = null;
        }
      }));
      setChartData(data);
    } catch (e: any) {
      message.error('加载失败：' + e.message);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  if (loading || !dashboard) return <Card loading={loading}><Empty /></Card>;

  return (
    <div>
      <Card style={{ marginBottom: 12 }} styles={{ body: { padding: 12 } }}>
        <Space>
          <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/dashboards')}>返回</Button>
          <span style={{ fontSize: 16, fontWeight: 500 }}>{dashboard.name}</span>
          <span style={{ color: '#666', fontSize: 13 }}>{dashboard.description}</span>
          <Button icon={<ReloadOutlined />} onClick={load}>刷新数据</Button>
          <Button type="primary" icon={<PlusOutlined />}
            onClick={() => navigate(`/charts/new?dashboardId=${dashboard.id}`)}>
            添加图表
          </Button>
        </Space>
      </Card>

      {(dashboard.charts || []).length === 0 ? (
        <Card><Empty description="暂无图表，点击右上角添加" /></Card>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))', gap: 12 }}>
          {(dashboard.charts || []).map(chart => {
            const data = chartData[chart.id];
            const option = data ? buildEChartsOption(chart.chartType, data, JSON.parse(chart.options || '{}')) : null;
            return (
              <Card
                key={chart.id}
                size="small"
                title={chart.name}
                extra={
                  <Button size="small" type="text" icon={<EditOutlined />}
                    onClick={() => navigate(`/charts/${chart.id}`)}>编辑</Button>
                }
              >
                {option ? (
                  <EChart option={option} height={300} />
                ) : (
                  <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="加载中或无数据" />
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}