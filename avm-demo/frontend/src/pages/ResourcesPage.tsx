/**
 * 资源管理 (V1.8.3)
 * - 人员负荷：按时间窗统计每个人总工时 / 利用率 / 状态（满载/繁忙/正常/闲置）
 * - 热力图：每天 × 每人，单元格颜色深度表示当日小时数
 * - 排期分配：详细任务分配表
 */
import { useEffect, useMemo, useState } from 'react';
import {
  Card, Row, Col, Statistic, Tag, Space, DatePicker, Button, Table, Empty, App,
  Avatar, Tooltip, Progress, Segmented, List, Badge, Divider,
} from 'antd';
import {
  TeamOutlined, ReloadOutlined, FireOutlined, ClockCircleOutlined, ThunderboltOutlined,
  UserOutlined, FireFilled, SmileOutlined,
} from '@ant-design/icons';
import dayjs, { Dayjs } from 'dayjs';
import { resourceApi } from '../api';
import { useAuth } from '../AuthContext';
import type { ResourceAllocation, ResourceLoadUser } from '../types';

const { RangePicker } = DatePicker;

type Level = 'overload' | 'busy' | 'normal' | 'idle';
const LEVEL_META: Record<Level, { label: string; color: string; icon: React.ReactNode }> = {
  overload: { label: '满载', color: 'red', icon: <FireFilled /> },
  busy: { label: '繁忙', color: 'orange', icon: <FireOutlined /> },
  normal: { label: '正常', color: 'blue', icon: <ClockCircleOutlined /> },
  idle: { label: '闲置', color: 'default', icon: <SmileOutlined /> },
};

const PRESETS = [
  { label: '本周', days: 7 },
  { label: '本月', days: 30 },
  { label: '下月', days: -30 },
  { label: '本季度', days: 90 },
];

function getDateRange(preset: number): [Dayjs, Dayjs] {
  if (preset === -30) {
    return [dayjs().add(1, 'day'), dayjs().add(30, 'day')];
  }
  return [dayjs(), dayjs().add(preset, 'day')];
}

export function ResourcesPage() {
  const { user } = useAuth();
  const { message } = App.useApp();
  const [preset, setPreset] = useState<number>(30);
  const [range, setRange] = useState<[Dayjs, Dayjs]>(getDateRange(30));
  const [loadData, setLoadData] = useState<{ workingDays: string[]; users: ResourceLoadUser[] } | null>(null);
  const [allocations, setAllocations] = useState<ResourceAllocation[]>([]);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<'load' | 'gantt' | 'list'>('load');

  const load = async () => {
    setLoading(true);
    try {
      const [ld, all] = await Promise.all([
        resourceApi.load(range[0].format('YYYY-MM-DD'), range[1].format('YYYY-MM-DD')),
        resourceApi.allocations({
          startDate: range[0].format('YYYY-MM-DD'),
          endDate: range[1].format('YYYY-MM-DD'),
        }),
      ]);
      setLoadData(ld);
      setAllocations(all);
    } catch (e: any) {
      message.error('加载失败：' + e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [range]);

  const stats = useMemo(() => {
    if (!loadData) return null;
    const users = loadData.users;
    return {
      total: users.length,
      overload: users.filter(u => u.level === 'overload').length,
      busy: users.filter(u => u.level === 'busy').length,
      normal: users.filter(u => u.level === 'normal').length,
      idle: users.filter(u => u.level === 'idle').length,
      totalHours: users.reduce((s, u) => s + u.totalHours, 0),
      avgUtil: users.length ? Math.round(users.reduce((s, u) => s + u.utilization, 0) / users.length) : 0,
    };
  }, [loadData]);

  const heatmap = useMemo(() => {
    if (!loadData) return null;
    const days = loadData.workingDays;
    const users = loadData.users;
    const visibleDays = days.slice(0, 12);
    return { days: visibleDays, users };
  }, [loadData]);

  const colorOfHours = (h: number) => {
    if (h === 0) return '#f5f5f5';
    if (h < 2) return '#d6e4ff';
    if (h < 4) return '#91caff';
    if (h < 6) return '#69b1ff';
    if (h < 8) return '#1677ff';
    return '#0958d9';
  };

  return (
    <div>
      <Card style={{ marginBottom: 16 }} bodyStyle={{ padding: 16 }}>
        <Space wrap size="middle" style={{ width: '100%', justifyContent: 'space-between' }}>
          <Space wrap>
            <Segmented
              options={PRESETS.map(p => ({ label: p.label, value: p.days }))}
              value={preset}
              onChange={(v) => { setPreset(v as number); setRange(getDateRange(v as number)); }}
            />
            <RangePicker
              value={range}
              onChange={(r) => { if (r && r[0] && r[1]) { setRange([r[0], r[1]]); setPreset(0); } }}
              allowClear={false}
            />
            <Button icon={<ReloadOutlined />} onClick={load} loading={loading}>刷新</Button>
          </Space>
          <Space>
            <Tag color="blue" icon={<TeamOutlined />}>
              {range[0].format('YYYY-MM-DD')} ~ {range[1].format('YYYY-MM-DD')}
            </Tag>
            {user && <Tag color="purple">@{user.displayName || user.username}</Tag>}
          </Space>
        </Space>
      </Card>

      {stats && (
        <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
          <Col span={4}>
            <Card>
              <Statistic title="总人员" value={stats.total} prefix={<TeamOutlined />} />
            </Card>
          </Col>
          <Col span={4}>
            <Card>
              <Statistic
                title="满载/超载"
                value={stats.overload + stats.busy}
                valueStyle={{ color: '#cf1322' }}
                prefix={<FireFilled />}
              />
            </Card>
          </Col>
          <Col span={4}>
            <Card>
              <Statistic
                title="正常"
                value={stats.normal}
                valueStyle={{ color: '#1677ff' }}
                prefix={<ClockCircleOutlined />}
              />
            </Card>
          </Col>
          <Col span={4}>
            <Card>
              <Statistic
                title="闲置"
                value={stats.idle}
                valueStyle={{ color: '#999' }}
                prefix={<SmileOutlined />}
              />
            </Card>
          </Col>
          <Col span={4}>
            <Card>
              <Statistic title="总排期工时" value={stats.totalHours} suffix="h" />
            </Card>
          </Col>
          <Col span={4}>
            <Card>
              <Statistic
                title="平均利用率"
                value={stats.avgUtil}
                suffix="%"
                valueStyle={{ color: stats.avgUtil > 100 ? '#cf1322' : stats.avgUtil > 80 ? '#fa8c16' : '#52c41a' }}
              />
            </Card>
          </Col>
        </Row>
      )}

      <Card
        title={<Space><ThunderboltOutlined /> 资源管理</Space>}
        extra={
          <Segmented
            value={tab}
            onChange={(v) => setTab(v as any)}
            options={[
              { label: '负荷列表', value: 'load' },
              { label: '热力图', value: 'gantt' },
              { label: '排期明细', value: 'list' },
            ]}
          />
        }
        loading={loading}
      >
        {tab === 'load' && loadData && (
          loadData.users.length === 0 ? <Empty description="该时间窗内无排期数据" /> : (
            <List
              dataSource={loadData.users.sort((a, b) => b.utilization - a.utilization)}
              renderItem={(u) => {
                const meta = LEVEL_META[u.level as Level];
                return (
                  <List.Item key={u.userId}>
                    <List.Item.Meta
                      avatar={
                        <Badge color={meta.color} dot offset={[-4, 36]}>
                          <Avatar style={{ background: '#1677ff' }} icon={<UserOutlined />} />
                        </Badge>
                      }
                      title={
                        <Space>
                          <span style={{ fontWeight: 500 }}>{u.userName}</span>
                          <Tag color={meta.color} icon={meta.icon}>{meta.label}</Tag>
                          <Tag>{u.items.length} 个任务</Tag>
                          <Tag color="purple">{u.totalHours}h 总</Tag>
                        </Space>
                      }
                      description={
                        <div>
                          <Progress
                            percent={Math.min(u.utilization, 150)}
                            strokeColor={
                              u.level === 'overload' ? '#cf1322' :
                              u.level === 'busy' ? '#fa8c16' :
                              u.level === 'idle' ? '#d9d9d9' : '#1677ff'
                            }
                            format={() => `${u.utilization}%`}
                          />
                          <span style={{ fontSize: 12, color: '#999' }}>
                            日均 {u.avgDaily}h · 峰值 {u.maxDaily.toFixed(1)}h
                          </span>
                        </div>
                      }
                    />
                  </List.Item>
                );
              }}
            />
          )
        )}

        {tab === 'gantt' && heatmap && (
          heatmap.days.length === 0 ? <Empty description="无工作日" /> : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ borderCollapse: 'separate', borderSpacing: 4, width: '100%' }}>
                <thead>
                  <tr>
                    <th style={{ minWidth: 120, textAlign: 'left', position: 'sticky', left: 0, background: '#fff' }}>人员</th>
                    {heatmap.days.map(d => {
                      const date = dayjs(d);
                      return (
                        <th key={d} style={{ minWidth: 40, fontSize: 11, color: '#333' }}>
                          <div>{date.format('MM-DD')}</div>
                          <div style={{ fontSize: 9, color: '#bbb' }}>{['日', '一', '二', '三', '四', '五', '六'][date.day()]}</div>
                        </th>
                      );
                    })}
                    <th style={{ minWidth: 60, textAlign: 'right', fontSize: 12 }}>总工时</th>
                    <th style={{ minWidth: 60, textAlign: 'right', fontSize: 12 }}>利用率</th>
                  </tr>
                </thead>
                <tbody>
                  {heatmap.users.map(u => (
                    <tr key={u.userId}>
                      <td style={{ position: 'sticky', left: 0, background: '#fff', textAlign: 'left', fontWeight: 500, fontSize: 13 }}>
                        <Tag color={LEVEL_META[u.level as Level].color} style={{ marginRight: 4 }}>
                          {LEVEL_META[u.level as Level].label}
                        </Tag>
                        {u.userName}
                      </td>
                      {heatmap.days.map(d => {
                        const h = u.dailyHours[d] || 0;
                        return (
                          <td key={d} style={{ padding: 0 }}>
                            <Tooltip title={`${u.userName} · ${d} · ${h.toFixed(1)}h`}>
                              <div
                                style={{
                                  width: 36,
                                  height: 28,
                                  background: colorOfHours(h),
                                  borderRadius: 4,
                                  textAlign: 'center',
                                  lineHeight: '28px',
                                  fontSize: 10,
                                  color: h > 4 ? '#fff' : '#666',
                                  cursor: 'pointer',
                                }}
                              >
                                {h > 0 ? h.toFixed(1) : ''}
                              </div>
                            </Tooltip>
                          </td>
                        );
                      })}
                      <td style={{ textAlign: 'right', fontSize: 12, fontWeight: 500 }}>{u.totalHours}h</td>
                      <td style={{ textAlign: 'right', fontSize: 12 }}>
                        <span style={{ color: u.utilization > 100 ? '#cf1322' : u.utilization > 80 ? '#fa8c16' : '#52c41a' }}>
                          {u.utilization}%
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <Divider />
              <Space size="small" wrap>
                <span style={{ fontSize: 12, color: '#999' }}>颜色深度：</span>
                {[0, 1, 3, 5, 7, 9].map(h => (
                  <Space key={h} size={4}>
                    <div style={{ width: 16, height: 16, background: colorOfHours(h), borderRadius: 2 }} />
                    <span style={{ fontSize: 11, color: '#666' }}>{h === 0 ? '空' : `${h}h+`}</span>
                  </Space>
                ))}
              </Space>
            </div>
          )
        )}

        {tab === 'list' && (
          allocations.length === 0 ? <Empty description="无排期记录" /> : (
            <Table
              dataSource={allocations}
              rowKey="id"
              size="small"
              pagination={{ pageSize: 20 }}
              columns={[
                { title: '人员', dataIndex: 'userName', width: 120 },
                {
                  title: '工作项',
                  dataIndex: 'workItemKey',
                  width: 200,
                  render: (key: string, r: any) => (
                    <Space direction="vertical" size={0}>
                      <Tag color="blue">{key}</Tag>
                      <span style={{ fontSize: 12 }}>{r.workItemTitle}</span>
                    </Space>
                  ),
                },
                { title: '类型', dataIndex: 'type', width: 80, render: (t: string) => <Tag>{t}</Tag> },
                {
                  title: '时间',
                  width: 200,
                  render: (_: any, r: any) => `${dayjs(r.startDate).format('MM-DD')} ~ ${dayjs(r.endDate).format('MM-DD')}`,
                },
                { title: '工时', dataIndex: 'allocatedHours', width: 80, render: (h: number) => <Tag color="purple">{h}h</Tag> },
                { title: '状态', dataIndex: 'status', width: 80, render: (s: string) => <Tag>{s}</Tag> },
              ]}
            />
          )
        )}
      </Card>
    </div>
  );
}
