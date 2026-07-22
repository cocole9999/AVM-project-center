/**
 * 树形视图
 * 来源 PRD §视图指南·树形视图
 * 功能：父子层级 / 折叠展开 / 进度条 / 状态徽章 / 跳转详情
 */
import { useEffect, useState } from 'react';
import { Card, Select, Space, Empty, Spin, Tag, Progress, Statistic, Row, Col, Button, Tooltip, Switch } from 'antd';
import { ApartmentOutlined, ProjectOutlined, ReloadOutlined, ExpandAltOutlined, CompressOutlined, CameraOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import { treeApi, type TreeNode, workbenchApi, baselineApi } from '../api';
import { useAuth } from '../AuthContext';

const TYPE_LABEL: Record<string, { label: string; color: string; icon: string }> = {
  requirement: { label: '需求', color: 'blue', icon: '📋' },
  task: { label: '任务', color: 'cyan', icon: '✅' },
  bug: { label: '缺陷', color: 'red', icon: '🐛' },
  release: { label: '版本', color: 'purple', icon: '🚀' },
};
const STATUS_COLOR: Record<string, string> = {
  '待评审': 'default', '已规划': 'cyan', '开发中': 'blue', '进行中': 'processing',
  '测试中': 'purple', '验收中': 'gold', '已完成': 'success', '已关闭': 'default',
  '已驳回': 'error', '已发布': 'success', '已验收': 'success', '待开发': 'cyan',
  '待修复': 'orange', '修复中': 'processing', '待领取': 'default', '待处理': 'default',
  '自测中': 'purple',
};
const PRIORITY_COLOR: Record<string, string> = {
  P0: 'red', P1: 'orange', P2: 'blue', P3: 'default',
};

export function TreeViewPage() {
  const [type, setType] = useState('requirement');
  const [tree, setTree] = useState<TreeNode[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [expandedAll, setExpandedAll] = useState(true);
  const [showProgress, setShowProgress] = useState(true);
  const { user } = useAuth();
  const [baselines, setBaselines] = useState<any[]>([]);
  const [selectedBaselineId, setSelectedBaselineId] = useState<string | undefined>(undefined);
  const [baselineMap, setBaselineMap] = useState<Record<string, { planStart: string; planEnd: string }>>({});
  const navigate = useNavigate();

  useEffect(() => {
    if (user) workbenchApi.me(user.username).catch(() => {});
  }, [user]);

  const load = async () => {
    setLoading(true);
    try {
      const [t, s] = await Promise.all([treeApi.get({ type }), treeApi.stats({ type })]);
      setTree(t);
      setStats(s);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [type]);

  useEffect(() => { baselineApi.list().then(setBaselines).catch(() => {}); }, []);

  useEffect(() => {
    if (!selectedBaselineId) { setBaselineMap({}); return; }
    baselineApi.compare(selectedBaselineId).then((r: any) => {
      const m: Record<string, { planStart: string; planEnd: string }> = {};
      const snap: any[] = JSON.parse(r.baseline.snapshot);
      for (const s of snap) {
        if (s.planStart && s.planEnd) m[s.itemId] = { planStart: s.planStart, planEnd: s.planEnd };
      }
      setBaselineMap(m);
    }).catch(() => setBaselineMap({}));
  }, [selectedBaselineId]);

  return (
    <div>
      {/* 顶部统计 */}
      {stats && (
        <Row gutter={12} style={{ marginBottom: 12 }}>
          <Col span={6}>
            <Card size="small" style={{ borderRadius: 8 }}>
              <Statistic title="工作项总数" value={stats.total} prefix={<ProjectOutlined />} />
            </Card>
          </Col>
          <Col span={6}>
            <Card size="small" style={{ borderRadius: 8 }}>
              <Statistic
                title="总估分"
                value={stats.totalEstimate}
                suffix="点"
                valueStyle={{ color: '#1890ff' }}
              />
            </Card>
          </Col>
          <Col span={6}>
            <Card size="small" style={{ borderRadius: 8 }}>
              <Statistic
                title="总实际工时"
                value={stats.totalActual}
                suffix="h"
                valueStyle={{ color: '#52c41a' }}
              />
            </Card>
          </Col>
          <Col span={6}>
            <Card size="small" style={{ borderRadius: 8 }}>
              <Statistic
                title="工时利用率"
                value={stats.totalEstimate ? Math.round(stats.totalActual / stats.totalEstimate * 100) : 0}
                suffix="%"
                valueStyle={{ color: stats.totalActual > stats.totalEstimate ? '#ff4d4f' : '#52c41a' }}
              />
            </Card>
          </Col>
        </Row>
      )}

      <Card
        title={
          <Space>
            <ApartmentOutlined />
            <span>树形视图（{TYPE_LABEL[type]?.label || type}）</span>
          </Space>
        }
        extra={
          <Space>
            <Select
              value={type}
              onChange={setType}
              style={{ width: 120 }}
              options={[
                { value: 'requirement', label: '需求' },
                { value: 'task', label: '任务' },
                { value: 'bug', label: '缺陷' },
                { value: 'release', label: '版本' },
              ]}
            />
            <Tooltip title="基线对比">
              <Select
                size="small"
                style={{ minWidth: 160 }}
                placeholder="对比基线"
                allowClear
                value={selectedBaselineId}
                onChange={setSelectedBaselineId}
                options={baselines.map((b: any) => ({ value: b.id, label: `📷 ${b.name}` }))}
                suffixIcon={<CameraOutlined />}
              />
            </Tooltip>
            <Tooltip title="显示进度条">
              <Space size={4}>
                <span style={{ fontSize: 12 }}>进度</span>
                <Switch size="small" checked={showProgress} onChange={setShowProgress} />
              </Space>
            </Tooltip>
            <Tooltip title={expandedAll ? '全部折叠' : '全部展开'}>
              <Button
                size="small"
                icon={expandedAll ? <CompressOutlined /> : <ExpandAltOutlined />}
                onClick={() => setExpandedAll(!expandedAll)}
              />
            </Tooltip>
            <Button size="small" icon={<ReloadOutlined />} onClick={load}>刷新</Button>
          </Space>
        }
        style={{ borderRadius: 8 }}
        styles={{ body: { padding: 12, maxHeight: 'calc(100vh - 320px)', overflow: 'auto' } }}
      >
        {loading ? (
          <div style={{ textAlign: 'center', padding: 40 }}><Spin /></div>
        ) : tree.length === 0 ? (
          <Empty description="该类型暂无根工作项" />
        ) : (
          tree.map(node => (
            <TreeNodeView
              key={node.id}
              node={node}
              depth={0}
              defaultExpand={expandedAll}
              showProgress={showProgress}
              baselineMap={selectedBaselineId ? baselineMap : {}}
              onClick={(id, t) => navigate(`/work-items/${t}/${id}`)}
            />
          ))
        )}
      </Card>
    </div>
  );
}

function TreeNodeView({ node, depth, defaultExpand, showProgress, baselineMap, onClick }: {
  node: TreeNode; depth: number; defaultExpand: boolean; showProgress: boolean;
  baselineMap: Record<string, { planStart: string; planEnd: string }>;
  onClick: (id: string, type: string) => void;
}) {
  const [expanded, setExpanded] = useState(defaultExpand);
  const meta = TYPE_LABEL[node.type] || { label: node.type, color: 'default', icon: '📌' };
  const statusColor = STATUS_COLOR[node.status] || 'default';
  const priorityColor = PRIORITY_COLOR[node.priority] || 'default';

  return (
    <div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          padding: '8px 12px',
          paddingLeft: 12 + depth * 24,
          background: depth === 0 ? '#fafafa' : 'transparent',
          borderRadius: 4,
          cursor: 'pointer',
          borderBottom: '1px solid #f5f5f5',
        }}
        onClick={() => onClick(node.id, node.type)}
        onContextMenu={(e) => { e.preventDefault(); setExpanded(!expanded); }}
      >
        {/* 展开/折叠 */}
        <div style={{ width: 20, flexShrink: 0 }}>
          {node.hasChildren && (
            <span
              onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}
              style={{ cursor: 'pointer', userSelect: 'none', color: '#999' }}
            >
              {expanded ? '▼' : '▶'}
            </span>
          )}
        </div>

        {/* 类型图标 */}
        <span style={{ fontSize: 16, marginRight: 8 }}>{meta.icon}</span>

        {/* Key */}
        <Tag color={priorityColor} style={{ marginRight: 8, minWidth: 70, textAlign: 'center' }}>{node.key}</Tag>

        {/* 标题 */}
        <span style={{ flex: 1, fontSize: 13, color: depth === 0 ? '#000' : '#333' }}>
          {node.title}
        </span>

        {/* 状态 */}
        <Tag color={statusColor} style={{ marginRight: 8 }}>{node.status}</Tag>

        {/* 负责人 */}
        {node.assignee && (
          <span style={{ fontSize: 12, color: '#666', marginRight: 12, minWidth: 60 }}>
            👤 {node.assignee}
          </span>
        )}

        {/* 进度条 */}
        {showProgress && (
          <div style={{ width: 120, marginRight: 12 }}>
            {node.estimate ? (
              <Tooltip title={`${node.actualHours || 0}h / ${node.estimate}h`}>
                <Progress
                  percent={node.progress}
                  size="small"
                  strokeColor={node.progress >= 100 ? '#52c41a' : '#1890ff'}
                  format={p => `${p}%`}
                />
              </Tooltip>
            ) : (
              <span style={{ fontSize: 11, color: '#bfbfbf' }}>未排期</span>
            )}
          </div>
        )}

        {/* 子项数 */}
        {node.childCount > 0 && (
          <Tag color="blue" style={{ marginRight: 0 }}>
            {node.childCount} 子项
          </Tag>
        )}

        {/* 基线偏差徽章 */}
        {Object.keys(baselineMap).length > 0 && (() => {
          const base = baselineMap[node.id];
          if (!base || !node.planStart || !node.planEnd) return null;
          const startDiff = dayjs(node.planStart).diff(dayjs(base.planStart), 'day');
          const endDiff = dayjs(node.planEnd).diff(dayjs(base.planEnd), 'day');
          if (startDiff === 0 && endDiff === 0) {
            return <Tag color="success" style={{ marginLeft: 6 }}>符合基线</Tag>;
          }
          if (endDiff > 0) {
            return <Tag color="error" style={{ marginLeft: 6 }}>滞后 {endDiff} 天</Tag>;
          }
          if (endDiff < 0) {
            return <Tag color="processing" style={{ marginLeft: 6 }}>提前 {Math.abs(endDiff)} 天</Tag>;
          }
          return null;
        })()}
      </div>

      {expanded && node.children.map(child => (
        <TreeNodeView
          key={child.id}
          node={child}
          depth={depth + 1}
          defaultExpand={defaultExpand}
          showProgress={showProgress}
          baselineMap={baselineMap}
          onClick={onClick}
        />
      ))}
    </div>
  );
}
