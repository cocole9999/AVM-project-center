/**
 * V1.28 工作项依赖图谱
 * - 有向图: 节点 = 工作项, 边 = relations (blocks/relates-to/duplicates)
 * - echarts graph + 力导向布局
 */
import React, { useEffect, useState } from 'react';
import ReactECharts from 'echarts-for-react';
import { Spin, Empty, Tag, Space, Slider, Button, message } from 'antd';
import { ShareAltOutlined } from '@ant-design/icons';
import { workItemApi } from '../api';

interface Node { id: string; key: string; title: string; status: string; type: string; priority?: string; kind?: string; owner?: string; expectedDate?: string | null; blocker?: string }
interface Edge { from: string; to: string; relationType: string }

const STATUS_COLOR: Record<string, string> = {
  '已完成': '#52c41a', '已关闭': '#bfbfbf', '已驳回': '#f5222d', '已发布': '#722ed1', '已验收': '#13c2c2',
  '进行中': '#1677ff', '开发中': '#1677ff', '修复中': '#fa8c16', '集成中': '#722ed1',
  '待领取': '#d9d9d9', '待处理': '#d9d9d9', '规划中': '#d9d9d9',
  'ready': '#52c41a', 'preparing': '#1677ff', 'pending': '#d9d9d9', 'blocked': '#f5222d', 'cancelled': '#bfbfbf',
};
const REL_COLOR: Record<string, string> = {
  'blocks': '#f5222d',
  'relates-to': '#1677ff',
  'duplicates': '#faad14',
  'parent-child': '#52c41a',
  'requires': '#fa541c',  // V1.29 外部依赖边 (橙色)
};
const EXT_ICON: Record<string, string> = {
  '台架': '🛠️', '实车': '🚗', '车模': '🎨', 'SDB': '💾', 'UE': '🎮', 'UI': '🎨', '标定': '⚙️', '其他': '📦',
};

export function DependencyGraph({ workItemId }: { workItemId: string }) {
  const [data, setData] = useState<{ nodes: Node[]; edges: Edge[]; rootId: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [depth, setDepth] = useState(3);

  const load = (d: number) => {
    setLoading(true);
    fetch(`/api/work-items/${workItemId}/dependency-graph?depth=${d}`, { headers: { Authorization: `Bearer ${localStorage.getItem('avm_token') || ''}` } })
      .then(r => r.json())
      .then(d => setData(d))
      .catch(err => message.error('加载失败: ' + err.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(depth); }, [workItemId, depth]);

  if (loading) return <div style={{ textAlign: 'center', padding: 40 }}><Spin /></div>;
  if (!data || data.nodes.length === 0) return <Empty description="无依赖关系" />;

  // V1.29 进一步简化: 去掉 legend / categories / emphasis, 避免 echarts viewCoordSys 内部报错
  const option = {
    tooltip: {
      formatter: (p: any) => {
        if (p.dataType === 'edge') return `${p.data.relationType}: ${p.data.source} → ${p.data.target}`;
        const n = p.data;
        if (n.kind === 'ext') {
          return `<b>${EXT_ICON[n.type] || '📦'} ${n.title}</b><br/>类型: ${n.type}<br/>状态: ${n.status}<br/>负责人: ${n.owner || '未指派'}${n.blocker ? `<br/>⚠️ 卡点: ${n.blocker}` : ''}`;
        }
        return `<b>${n.key}</b><br/>${n.title}<br/>状态: ${n.status}<br/>类型: ${n.type}`;
      },
    },
    series: [{
      type: 'graph',
      layout: 'force',
      roam: true,
      draggable: true,
      data: data.nodes.map(n => ({
        id: n.id,
        name: n.kind === 'ext' ? `${EXT_ICON[n.type] || '📦'} ${n.key}` : n.key,
        symbolSize: n.kind === 'ext' ? 40 : 30,
        itemStyle: { color: STATUS_COLOR[n.status] || '#999' },
        label: { show: true, fontSize: 10, color: '#333' },
      })),
      links: data.edges.map(e => ({
        source: e.from,
        target: e.to,
        lineStyle: { color: REL_COLOR[e.relationType] || '#999', width: 1.5, curveness: 0.1 },
      })),
      force: { repulsion: 300, edgeLength: 120, gravity: 0.1 },
    }],
  };

  return (
    <div>
      <Space style={{ marginBottom: 12 }}>
        <span>深度:</span>
        <Slider min={1} max={6} value={depth} onChange={setDepth} style={{ width: 160 }} />
        <Tag color="blue">节点 {data.nodes.length}</Tag>
        <Tag color="purple">边 {data.edges.length}</Tag>
        <Button size="small" icon={<ShareAltOutlined />} onClick={() => load(depth)}>刷新</Button>
      </Space>
      <div style={{ border: '1px solid #f0f0f0', borderRadius: 4, padding: 8 }}>
        <ReactECharts option={option} style={{ height: 480 }} notMerge lazyUpdate />
      </div>
    </div>
  );
}
