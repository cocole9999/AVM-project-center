/**
 * 工作台 - 个人首页
 * 来源 PRD §基础使用·工作台
 * 展示：核心指标、我负责的、临期提醒、本周负荷、待评审、最近通知
 */
import { useEffect, useState } from 'react';
import { Card, Row, Col, Tag, List, Avatar, Progress, Empty, Space, Button, Spin, Statistic, Badge, Tooltip, Divider } from 'antd';
import {
  ClockCircleOutlined, FireOutlined, CheckCircleOutlined, AlertOutlined,
  ThunderboltOutlined, BellOutlined, CalendarOutlined, FireFilled,
  RiseOutlined, FallOutlined, UserOutlined, ProjectOutlined,
} from '@ant-design/icons';
import { Link, useNavigate } from 'react-router-dom';
import { workbenchApi, type WorkbenchData } from '../api';
import { useAuth } from '../AuthContext';

const cardStyle: React.CSSProperties = { borderRadius: 8, boxShadow: '0 1px 4px rgba(0,0,0,0.06)' };
const headerStyle: React.CSSProperties = { fontSize: 15, fontWeight: 500, paddingBottom: 8 };

const PRIORITY_COLOR: Record<string, string> = {
  P0: 'red', P1: 'orange', P2: 'blue', P3: 'default',
};
const STATUS_COLOR: Record<string, string> = {
  '待评审': 'default', '已规划': 'cyan', '开发中': 'blue', '进行中': 'processing',
  '测试中': 'purple', '验收中': 'gold', '已完成': 'success', '已关闭': 'default',
  '已驳回': 'error', '已发布': 'success', '已验收': 'success', '待开发': 'cyan',
  '待修复': 'orange', '修复中': 'processing', '待领取': 'default', '待处理': 'default',
  '自测中': 'purple',
};
const TYPE_ICON: Record<string, string> = {
  requirement: '📋', task: '✅', bug: '🐛', release: '🚀',
};
const NOTIF_LEVEL_COLOR: Record<string, string> = {
  info: 'blue', warning: 'orange', error: 'red', success: 'green',
};

interface Props {
  userId?: string;
}

export function WorkbenchPage({ userId }: Props) {
  const { user } = useAuth();
  const effectiveUserId = userId || user?.username || '';
  const [data, setData] = useState<WorkbenchData | null>(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    if (!effectiveUserId) return;
    setLoading(true);
    workbenchApi.me(effectiveUserId)
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [userId]);

  if (loading) {
    return <div style={{ padding: 40, textAlign: 'center' }}><Spin tip="加载工作台..." /></div>;
  }
  if (!data) {
    return <Empty description="暂无数据" />;
  }

  const m = data.metrics;
  const utilizationColor = m.weekUtilization > 100 ? '#ff4d4f' : m.weekUtilization > 80 ? '#faad14' : m.weekUtilization > 30 ? '#52c41a' : '#bfbfbf';

  return (
    <div>
      {/* 顶部欢迎 + 概览 */}
      <Card style={{ ...cardStyle, marginBottom: 12, background: 'linear-gradient(135deg, #1890ff10 0%, #722ed110 100%)' }}>
        <Row align="middle" gutter={16}>
          <Col flex="auto">
            <Space size={12} align="center">
              <Avatar size={48} style={{ backgroundColor: '#1890ff' }} icon={<UserOutlined />} />
              <div>
                <div style={{ fontSize: 18, fontWeight: 500 }}>
                  欢迎回来，{userId === 'admin' ? '管理员' : userId === 'pm' ? '产品负责人' : '同事'}
                </div>
                <div style={{ fontSize: 12, color: '#999', marginTop: 4 }}>
                  今天是 {new Date().toLocaleDateString('zh-CN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                </div>
              </div>
            </Space>
          </Col>
          <Col>
            <Space size={20}>
              <Statistic title="本周工时" value={m.weekHours} suffix={`/ ${m.weekCapacity}h`} valueStyle={{ fontSize: 20 }} />
              <Statistic
                title="本周负荷"
                value={m.weekUtilization}
                suffix="%"
                valueStyle={{ color: utilizationColor, fontSize: 20 }}
              />
              <Statistic title="我的工作项" value={m.total} valueStyle={{ fontSize: 20 }} />
            </Space>
          </Col>
        </Row>
      </Card>

      {/* 关键指标卡片 */}
      <Row gutter={12} style={{ marginBottom: 12 }}>
        <Col span={4}>
          <Card size="small" style={cardStyle}>
            <Statistic
              title="待开始"
              value={m.toStart}
              prefix={<ClockCircleOutlined style={{ color: '#1890ff' }} />}
              valueStyle={{ color: '#1890ff' }}
            />
          </Card>
        </Col>
        <Col span={4}>
          <Card size="small" style={cardStyle}>
            <Statistic
              title="进行中"
              value={m.inProgress}
              prefix={<ThunderboltOutlined style={{ color: '#722ed1' }} />}
              valueStyle={{ color: '#722ed1' }}
            />
          </Card>
        </Col>
        <Col span={4}>
          <Card size="small" style={cardStyle}>
            <Statistic
              title="已完成"
              value={m.completed}
              prefix={<CheckCircleOutlined style={{ color: '#52c41a' }} />}
              valueStyle={{ color: '#52c41a' }}
            />
          </Card>
        </Col>
        <Col span={4}>
          <Card size="small" style={cardStyle}>
            <Statistic
              title="临期"
              value={m.dueSoon}
              prefix={<FireOutlined style={{ color: '#faad14' }} />}
              valueStyle={{ color: '#faad14' }}
            />
          </Card>
        </Col>
        <Col span={4}>
          <Card size="small" style={cardStyle}>
            <Statistic
              title="超期"
              value={m.overdue}
              prefix={<AlertOutlined style={{ color: '#ff4d4f' }} />}
              valueStyle={{ color: '#ff4d4f' }}
            />
          </Card>
        </Col>
        <Col span={4}>
          <Card size="small" style={cardStyle}>
            <Statistic
              title="待评审"
              value={data.myPendingReviews.length}
              prefix={<ProjectOutlined style={{ color: '#13c2c2' }} />}
              valueStyle={{ color: '#13c2c2' }}
            />
          </Card>
        </Col>
      </Row>

      <Row gutter={12}>
        {/* 左侧：临期/超期 + 我负责的 */}
        <Col span={16}>
          {m.overdue > 0 && (
            <Card
              size="small"
              title={
                <Space>
                  <FireFilled style={{ color: '#ff4d4f' }} />
                  <span style={headerStyle}>超期提醒（{m.overdue}）</span>
                </Space>
              }
              style={{ ...cardStyle, marginBottom: 12, borderColor: '#ffccc7' }}
              extra={<Button type="link" size="small" onClick={() => navigate('/work-items/task')}>查看全部</Button>}
            >
              <List
                size="small"
                dataSource={data.myOverdue}
                renderItem={(item: any) => (
                  <List.Item
                    actions={[
                      <Tag color="red" key="overdue">超期 {Math.ceil((Date.now() - new Date(item.planEnd).getTime()) / 86400000)} 天</Tag>,
                    ]}
                  >
                    <List.Item.Meta
                      avatar={<span style={{ fontSize: 18 }}>{TYPE_ICON[item.type]}</span>}
                      title={
                        <Link to={`/work-items/${item.type}/${item.id}`}>
                          <Tag color={PRIORITY_COLOR[item.priority]}>{item.key}</Tag>
                          {item.title}
                        </Link>
                      }
                      description={<span style={{ fontSize: 12, color: '#999' }}>计划完成：{new Date(item.planEnd).toLocaleDateString('zh-CN')}</span>}
                    />
                  </List.Item>
                )}
              />
            </Card>
          )}

          <Card
            size="small"
            title={<Space><ClockCircleOutlined style={{ color: '#faad14' }} /><span style={headerStyle}>我负责的（{data.myAssigned.length}）</span></Space>}
            style={{ ...cardStyle, marginBottom: 12 }}
            extra={<Button type="link" size="small" onClick={() => navigate('/work-items/task')}>查看全部</Button>}
          >
            {data.myAssigned.length === 0 ? (
              <Empty description="暂无任务" image={Empty.PRESENTED_IMAGE_SIMPLE} />
            ) : (
              <List
                size="small"
                dataSource={data.myAssigned}
                renderItem={(item: any) => (
                  <List.Item>
                    <List.Item.Meta
                      avatar={<span style={{ fontSize: 18 }}>{TYPE_ICON[item.type]}</span>}
                      title={
                        <Link to={`/work-items/${item.type}/${item.id}`}>
                          <Tag color={PRIORITY_COLOR[item.priority]}>{item.key}</Tag>
                          {item.title}
                        </Link>
                      }
                      description={
                        <Space size={8}>
                          <Tag color={STATUS_COLOR[item.status]}>{item.status}</Tag>
                          {item.planEnd && (
                            <span style={{ fontSize: 12, color: new Date(item.planEnd) < new Date() ? '#ff4d4f' : '#999' }}>
                              <CalendarOutlined /> {new Date(item.planEnd).toLocaleDateString('zh-CN')}
                            </span>
                          )}
                        </Space>
                      }
                    />
                  </List.Item>
                )}
              />
            )}
          </Card>

          {data.myPendingReviews.length > 0 && (
            <Card
              size="small"
              title={<Space><ProjectOutlined style={{ color: '#13c2c2' }} /><span style={headerStyle}>待我评审（{data.myPendingReviews.length}）</span></Space>}
              style={cardStyle}
            >
              <List
                size="small"
                dataSource={data.myPendingReviews}
                renderItem={(r: any) => (
                  <List.Item>
                    <List.Item.Meta
                      avatar={<Avatar style={{ backgroundColor: '#13c2c2' }} icon={<ProjectOutlined />} />}
                      title={<Link to={`/reviews/${r.id}`}>{r.title}</Link>}
                      description={
                        <Space>
                          <Tag color="cyan">{r.reviewType?.toUpperCase()}</Tag>
                          <span style={{ fontSize: 12 }}>{r.workItem?.key} {r.workItem?.title}</span>
                        </Space>
                      }
                    />
                  </List.Item>
                )}
              />
            </Card>
          )}
        </Col>

        {/* 右侧：本周负荷 + 最近通知 */}
        <Col span={8}>
          <Card
            size="small"
            title={<Space><RiseOutlined style={{ color: '#1890ff' }} /><span style={headerStyle}>本周负荷</span></Space>}
            style={cardStyle}
          >
            <div style={{ textAlign: 'center', padding: '12px 0' }}>
              <Progress
                type="circle"
                percent={Math.min(100, m.weekUtilization)}
                strokeColor={utilizationColor}
                format={p => `${p}%`}
                size={120}
              />
              <div style={{ marginTop: 12, fontSize: 13, color: '#666' }}>
                <Space split={<Divider type="vertical" />}>
                  <span><span style={{ color: utilizationColor, fontWeight: 500 }}>{m.weekHours}h</span> 已分配</span>
                  <span>{m.weekCapacity}h 容量</span>
                </Space>
              </div>
              <div style={{ marginTop: 8 }}>
                {m.weekUtilization > 100 && <Tag color="red" icon={<FireOutlined />}>过载</Tag>}
                {m.weekUtilization > 80 && m.weekUtilization <= 100 && <Tag color="orange">饱和</Tag>}
                {m.weekUtilization >= 30 && m.weekUtilization <= 80 && <Tag color="green">正常</Tag>}
                {m.weekUtilization < 30 && <Tag color="default">偏闲</Tag>}
              </div>
            </div>
            <Button block onClick={() => navigate('/resources')}>查看人员排期</Button>
          </Card>

          <Card
            size="small"
            title={
              <Space>
                <BellOutlined style={{ color: '#faad14' }} />
                <span style={headerStyle}>最近通知</span>
                {data.myUnreadNotifs.length > 0 && <Badge count={data.myUnreadNotifs.length} />}
              </Space>
            }
            style={{ ...cardStyle, marginTop: 12 }}
            extra={<Button type="link" size="small" onClick={() => navigate('/notifications')}>全部</Button>}
          >
            {data.myUnreadNotifs.length === 0 ? (
              <Empty description="暂无未读通知" image={Empty.PRESENTED_IMAGE_SIMPLE} />
            ) : (
              <List
                size="small"
                dataSource={data.myUnreadNotifs}
                renderItem={(n) => (
                  <List.Item style={{ cursor: 'pointer' }} onClick={() => navigate(n.link || '/notifications')}>
                    <List.Item.Meta
                      avatar={<Avatar size="small" style={{ backgroundColor: NOTIF_LEVEL_COLOR[n.level] || '#1890ff' }} icon={<BellOutlined />} />}
                      title={<span style={{ fontSize: 13 }}>{n.title}</span>}
                      description={<Tooltip title={n.createdAt}><span style={{ fontSize: 11, color: '#999' }}>{new Date(n.createdAt).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}</span></Tooltip>}
                    />
                  </List.Item>
                )}
              />
            )}
          </Card>
        </Col>
      </Row>
    </div>
  );
}
