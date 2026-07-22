import { useEffect, useState } from 'react';
import { Card, Row, Col, Statistic, Progress, Tag, List, Avatar, Empty, Button, Modal, Skeleton, Space, App, message, Tooltip } from 'antd';
import {
  CheckCircleOutlined, ClockCircleOutlined, FireOutlined, BugOutlined,
  ProjectOutlined, RiseOutlined, FileTextOutlined, CopyOutlined, HistoryOutlined, EyeOutlined,
} from '@ant-design/icons';
import { Link } from 'react-router-dom';
import dayjs from 'dayjs';
import { metaApi, iterationApi, workItemApi, aiApi } from '../api';
import type { WorkItem, Iteration } from '../types';
import { PRIORITY_COLOR, STATUS_COLOR, TYPE_COLOR, TYPE_LABEL } from '../types';
import { WorkloadByUser } from '../components/WorkloadByUser';

const REPORT_TYPE_LABEL: Record<string, string> = {
  week: '周报', month: '月报', quarter: '季报', custom: '自定义',
};
const REPORT_TYPE_COLOR: Record<string, string> = {
  week: 'blue', month: 'purple', quarter: 'magenta', custom: 'cyan',
};

export function DashboardPage() {
  const { message } = App.useApp();
  const [stats, setStats] = useState<any>(null);
  const [iterations, setIterations] = useState<Iteration[]>([]);
  const [recentItems, setRecentItems] = useState<WorkItem[]>([]);
  const [overdueItems, setOverdueItems] = useState<WorkItem[]>([]);
  const [reportOpen, setReportOpen] = useState(false);
  const [report, setReport] = useState<string>('');
  const [reportSummary, setReportSummary] = useState<any>(null);
  const [generating, setGenerating] = useState(false);
  const [reportPeriod, setReportPeriod] = useState<'week' | 'month'>('week');
  // V1.26 默认显示最近一份报告
  const [latestReport, setLatestReport] = useState<any>(null);
  const [latestLoading, setLatestLoading] = useState(false);

  const loadLatestReport = async () => {
    setLatestLoading(true);
    try {
      const r: any = await aiApi.latestReport();
      setLatestReport(r.report);
    } catch {
      setLatestReport(null);
    } finally {
      setLatestLoading(false);
    }
  };

  useEffect(() => {
    metaApi.stats().then(setStats);
    iterationApi.list().then(setIterations);
    workItemApi.list({}).then(items => {
      setRecentItems(items.slice(0, 8));
      const now = dayjs();
      setOverdueItems(items
        .filter(i => i.planEnd && dayjs(i.planEnd).isBefore(now) && !['已完成', '已关闭', '已驳回', '已发布', '已验收'].includes(i.status))
        .slice(0, 6));
    });
    loadLatestReport();
  }, []);

  const activeIter = iterations.find(i => i.status === 'active');

  const generateReport = async () => {
    setReportOpen(true);
    setGenerating(true);
    setReport('');
    setReportSummary(null);
    try {
      const r = reportPeriod === 'month'
        ? await aiApi.monthlyReport({ period: 'month' })
        : await aiApi.weeklyReport({ period: 'week' });
      setReport(r.report || '');
      setReportSummary(r.summary);
      // V1.26: 生成后刷新最近一份报告
      loadLatestReport();
    } catch (e: any) {
      setReport('❌ 生成失败：' + e.message);
    } finally {
      setGenerating(false);
    }
  };

  const copyReport = () => {
    navigator.clipboard.writeText(report).then(
      () => message.success('已复制到剪贴板'),
      () => message.error('复制失败')
    );
  };

  // 简单 markdown 渲染（标题/列表/加粗）
  const renderMarkdown = (md: string) => {
    const lines = md.split('\n');
    return lines.map((line, i) => {
      if (line.startsWith('# ')) return <h1 key={i} style={{ fontSize: 22, marginTop: 12 }}>{line.slice(2)}</h1>;
      if (line.startsWith('## ')) return <h2 key={i} style={{ fontSize: 18, marginTop: 16, borderBottom: '1px solid #f0f0f0', paddingBottom: 4 }}>{line.slice(3)}</h2>;
      if (line.startsWith('### ')) return <h3 key={i} style={{ fontSize: 15, marginTop: 12, color: '#1677ff' }}>{line.slice(4)}</h3>;
      if (line.startsWith('| ')) {
        // 表格行
        const cells = line.split('|').map(c => c.trim()).filter(c => c);
        if (cells.every(c => /^[-:]+$/.test(c))) return null;
        return <div key={i} style={{ display: 'flex', borderBottom: '1px solid #f0f0f0', padding: '4px 0' }}>{cells.map((c, j) => <div key={j} style={{ flex: 1, padding: '0 8px' }}>{renderInline(c)}</div>)}</div>;
      }
      if (line.match(/^[-*]\s/)) return <div key={i} style={{ paddingLeft: 16 }}>• {renderInline(line.replace(/^[-*]\s/, ''))}</div>;
      if (/^\d+\.\s/.test(line)) return <div key={i} style={{ paddingLeft: 16 }}>{renderInline(line)}</div>;
      if (!line.trim()) return <br key={i} />;
      return <p key={i} style={{ margin: '4px 0' }}>{renderInline(line)}</p>;
    });
  };

  const renderInline = (text: string) => {
    const parts: any[] = [];
    const re = /\*\*([^*]+)\*\*|`([^`]+)`/g;
    let last = 0;
    let m;
    while ((m = re.exec(text)) !== null) {
      if (m.index > last) parts.push(text.slice(last, m.index));
      if (m[1]) parts.push(<b key={parts.length}>{m[1]}</b>);
      if (m[2]) parts.push(<code key={parts.length} style={{ background: '#f5f5f5', padding: '0 4px', borderRadius: 2 }}>{m[2]}</code>);
      last = re.lastIndex;
    }
    if (last < text.length) parts.push(text.slice(last));
    return <>{parts}</>;
  };

  return (
    <div>
      <Row gutter={[16, 16]}>
        <Col span={6}>
          <Card>
            <Statistic
              title="总工作项"
              value={stats?.total || 0}
              prefix={<ProjectOutlined style={{ color: '#1677ff' }} />}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="P0 / P1 紧急项"
              value={(stats?.byPriority?.P0 || 0) + (stats?.byPriority?.P1 || 0)}
              prefix={<FireOutlined style={{ color: '#ff4d4f' }} />}
              valueStyle={{ color: '#ff4d4f' }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="未关闭缺陷"
              value={stats?.byType?.bug || 0}
              prefix={<BugOutlined style={{ color: '#fa541c' }} />}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="活跃迭代"
              value={iterations.filter(i => i.status === 'active').length}
              prefix={<RiseOutlined style={{ color: '#52c41a' }} />}
            />
          </Card>
        </Col>
      </Row>

      <Card
        style={{ marginTop: 16 }}
        title={
          <Space>
            <FileTextOutlined style={{ color: '#1677ff' }} />
            <span>AI 周报 / 月报</span>
            {latestReport && (
              <Tag color={REPORT_TYPE_COLOR[latestReport.type] || 'default'}>
                {REPORT_TYPE_LABEL[latestReport.type] || latestReport.type}
              </Tag>
            )}
          </Space>
        }
        extra={
          <Space>
            <Button.Group>
              <Button type={reportPeriod === 'week' ? 'primary' : 'default'} size="small" onClick={() => setReportPeriod('week')}>周报</Button>
              <Button type={reportPeriod === 'month' ? 'primary' : 'default'} size="small" onClick={() => setReportPeriod('month')}>月报</Button>
            </Button.Group>
            <Button type="primary" icon={<FileTextOutlined />} onClick={generateReport} loading={generating}>
              生成{reportPeriod === 'week' ? '周' : '月'}报
            </Button>
          </Space>
        }
      >
        {latestLoading ? (
          <Skeleton active paragraph={{ rows: 3 }} />
        ) : latestReport && latestReport.summary ? (
          <>
            {/* 默认摘要区 */}
            <Row gutter={12} style={{ marginBottom: 12 }}>
              <Col span={4}>
                <Statistic title="项目总数" value={latestReport.summary.projectCount || 0}
                  prefix={<ProjectOutlined style={{ color: '#1677ff' }} />} valueStyle={{ fontSize: 20 }} />
              </Col>
              <Col span={5}>
                <Statistic title="高风险项目" value={latestReport.summary.highRiskCount || 0}
                  prefix={<FireOutlined style={{ color: '#ff4d4f' }} />}
                  valueStyle={{ fontSize: 20, color: (latestReport.summary.highRiskCount || 0) > 0 ? '#ff4d4f' : '#999' }} />
              </Col>
              <Col span={5}>
                <Statistic title="新增/完成" value={`${latestReport.summary.newItemCount || 0} / ${latestReport.summary.completedItemCount || 0}`}
                  prefix={<CheckCircleOutlined style={{ color: '#52c41a' }} />} valueStyle={{ fontSize: 20 }} />
              </Col>
              <Col span={5}>
                <Statistic title="P0/P1 紧急" value={latestReport.summary.criticalItemCount || 0}
                  prefix={<FireOutlined style={{ color: '#faad14' }} />}
                  valueStyle={{ fontSize: 20, color: (latestReport.summary.criticalItemCount || 0) > 0 ? '#faad14' : '#999' }} />
              </Col>
              <Col span={5}>
                <Statistic title="团队活动" value={latestReport.summary.activityCount || 0}
                  prefix={<HistoryOutlined style={{ color: '#722ed1' }} />} valueStyle={{ fontSize: 20 }} />
              </Col>
            </Row>

            {/* 元信息 */}
            <div style={{
              background: '#fafafa', border: '1px solid #f0f0f0', borderRadius: 4,
              padding: '6px 12px', marginBottom: 12, fontSize: 12, color: '#666',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8,
            }}>
              <Space size="small" wrap>
                <span>📅 报告周期: <b>{latestReport.periodLabel}</b></span>
                <span>🕒 生成于: <b>{dayjs(latestReport.createdAt).format('YYYY-MM-DD HH:mm')}</b></span>
                <span>👤 {latestReport.createdBy || '系统'}</span>
                {latestReport.llmModel && <Tag color="purple" style={{ marginLeft: 4 }}>AI 润色 · {latestReport.llmModel}</Tag>}
                {!latestReport.llmModel && <Tag style={{ marginLeft: 4 }}>模板生成</Tag>}
              </Space>
              <Space size="small">
                <Button size="small" type="link" icon={<EyeOutlined />} onClick={() => {
                  setReport(latestReport.content);
                  setReportSummary(latestReport.summary);
                  setReportOpen(true);
                }}>查看全文</Button>
                <Button size="small" type="link" icon={<CopyOutlined />} onClick={() => {
                  navigator.clipboard.writeText(latestReport.content).then(
                    () => message.success('已复制 Markdown'),
                    () => message.error('复制失败')
                  );
                }}>复制</Button>
                <Link to="/reports">
                  <Button size="small" type="link" icon={<HistoryOutlined />}>历史</Button>
                </Link>
              </Space>
            </div>

            {/* 折叠预览 */}
            <div style={{ maxHeight: 200, overflow: 'auto', border: '1px solid #f0f0f0', borderRadius: 4, padding: '8px 12px', background: '#fff' }}>
              {renderMarkdown(latestReport.content)}
            </div>
          </>
        ) : (
          <Empty description='点击右上角"生成周报/月报"，AI 会基于项目数据自动生成 Markdown 报告（可直接复制到飞书/邮件）' />
        )}
      </Card>

      <Modal
        title={<Space><FileTextOutlined /> {reportPeriod === 'week' ? '周报' : '月报'} {reportSummary && <Tag color="blue">{reportSummary.projectCount} 个项目 · {reportSummary.highRiskCount} 高风险 · {reportSummary.criticalItemCount} P0/P1</Tag>}</Space>}
        open={reportOpen}
        onCancel={() => setReportOpen(false)}
        width={820}
        footer={[
          <Button key="copy" icon={<CopyOutlined />} onClick={copyReport}>复制全文</Button>,
          <Button key="close" type="primary" onClick={() => setReportOpen(false)}>关闭</Button>,
        ]}
      >
        {generating ? (
          <Skeleton active paragraph={{ rows: 12 }} />
        ) : (
          <div style={{ maxHeight: 600, overflow: 'auto', padding: '0 8px', lineHeight: 1.7 }}>
            {renderMarkdown(report)}
          </div>
        )}
      </Modal>

      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col span={14}>
          <Card title="状态分布" extra={<Link to="/dashboard">查看完整报告</Link>}>
            {stats?.byStatus ? (
              <Row gutter={[12, 12]}>
                {Object.entries(stats.byStatus).map(([status, count]: any) => {
                  const total = stats.total || 1;
                  const percent = Math.round((count / total) * 100);
                  return (
                    <Col span={12} key={status}>
                      <div style={{ marginBottom: 8 }}>
                        <span style={{ marginRight: 8 }}>
                          <Tag color={STATUS_COLOR[status] || 'default'}>{status}</Tag>
                          <b>{count}</b>
                          <span style={{ color: '#999', marginLeft: 8 }}>({percent}%)</span>
                        </span>
                      </div>
                      <Progress percent={percent} showInfo={false} strokeColor={
                        STATUS_COLOR[status] === 'red' ? '#ff4d4f' :
                        STATUS_COLOR[status] === 'orange' ? '#fa8c16' :
                        STATUS_COLOR[status] === 'blue' ? '#1677ff' :
                        STATUS_COLOR[status] === 'green' ? '#52c41a' :
                        STATUS_COLOR[status] === 'purple' ? '#722ed1' : '#1677ff'
                      } />
                    </Col>
                  );
                })}
              </Row>
            ) : <Empty />}
          </Card>
        </Col>

        <Col span={10}>
          <HealthDimensionCard />
        </Col>

        <Col span={10}>
          <Card title={activeIter ? `当前迭代：${activeIter.name}` : '当前迭代'}>
            {activeIter ? (
              <>
                <p style={{ color: '#666' }}>{activeIter.goal}</p>
                <div style={{ marginBottom: 8 }}>
                  <ClockCircleOutlined /> {dayjs(activeIter.startDate).format('MM-DD')} ~ {dayjs(activeIter.endDate).format('MM-DD')}
                </div>
                <Progress
                  percent={(() => {
                    const now = dayjs();
                    const start = dayjs(activeIter.startDate);
                    const end = dayjs(activeIter.endDate);
                    if (now.isBefore(start)) return 0;
                    if (now.isAfter(end)) return 100;
                    return Math.round(now.diff(start, 'day') / end.diff(start, 'day') * 100);
                  })()}
                  strokeColor="#52c41a"
                />
                <div style={{ marginTop: 16, fontSize: 13, color: '#666' }}>
                  <CheckCircleOutlined /> 已规划迭代 {iterations.length} 个
                </div>
              </>
            ) : <Empty />}
          </Card>
        </Col>
      </Row>

      {/* V1.29 团队工作量分布 */}
      <div style={{ marginTop: 16 }}>
        <WorkloadByUser />
      </div>

      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col span={12}>
          <Card title="最近更新">
            <List
              size="small"
              dataSource={recentItems}
              renderItem={item => (
                <List.Item>
                  <List.Item.Meta
                    avatar={<Avatar style={{ background: TYPE_COLOR[item.type] }} size="small">
                      {TYPE_LABEL[item.type][0]}
                    </Avatar>}
                    title={
                      <Link to={`/work-items/${item.type}/${item.id}`}>
                        <Tag color={TYPE_COLOR[item.type]}>{item.key}</Tag>
                        {item.title}
                      </Link>
                    }
                    description={
                      <span style={{ fontSize: 12, color: '#999' }}>
                        <Tag color={STATUS_COLOR[item.status]} style={{ marginRight: 4 }}>{item.status}</Tag>
                        <Tag color={PRIORITY_COLOR[item.priority]}>{item.priority}</Tag>
                        {item.assignee && <span style={{ marginLeft: 4 }}>@{item.assignee}</span>}
                      </span>
                    }
                  />
                </List.Item>
              )}
            />
          </Card>
        </Col>

        <Col span={12}>
          <Card title={<><FireOutlined /> 临期/延期工作项</>}>
            {overdueItems.length === 0 ? (
              <Empty description="无临期项 🎉" />
            ) : (
              <List
                size="small"
                dataSource={overdueItems}
                renderItem={item => {
                  const days = dayjs().diff(dayjs(item.planEnd), 'day');
                  return (
                    <List.Item>
                      <List.Item.Meta
                        avatar={<Avatar style={{ background: 'red' }} size="small">!</Avatar>}
                        title={
                          <Link to={`/work-items/${item.type}/${item.id}`}>
                            <Tag color="red">超期 {days} 天</Tag>
                            {item.title}
                          </Link>
                        }
                        description={
                          <span>
                            <Tag color={TYPE_COLOR[item.type]}>{item.key}</Tag>
                            <Tag color={PRIORITY_COLOR[item.priority]}>{item.priority}</Tag>
                            <Tag color={STATUS_COLOR[item.status]}>{item.status}</Tag>
                          </span>
                        }
                      />
                    </List.Item>
                  );
                }}
              />
            )}
          </Card>
        </Col>
      </Row>
    </div>
  );
}

// V1.28 客户/车型维度健康度卡片
function HealthDimensionCard() {
  const [by, setBy] = useState<'customer' | 'carModel'>('customer');
  const [data, setData] = useState<any>(null);
  useEffect(() => {
    metaApi.health(by).then(setData).catch(() => setData({ items: [] }));
  }, [by]);
  return (
    <Card
      title={
        <Space>
          <span>健康度维度</span>
          <span style={{ fontSize: 12, color: '#999' }}>(按{by === 'customer' ? '客户' : '车型'})</span>
        </Space>
      }
      extra={
        <Space size={4}>
          <Button size="small" type={by === 'customer' ? 'primary' : 'default'} onClick={() => setBy('customer')}>客户</Button>
          <Button size="small" type={by === 'carModel' ? 'primary' : 'default'} onClick={() => setBy('carModel')}>车型</Button>
        </Space>
      }
    >
      {data && data.items && data.items.length > 0 ? (
        <List
          size="small"
          dataSource={data.items.slice(0, 8)}
          renderItem={(it: any) => (
            <List.Item style={{ padding: '6px 0' }}>
              <List.Item.Meta
                title={
                  <span style={{ fontSize: 13 }}>
                    {it.name}
                    {it.brand && <Tag color="blue" style={{ marginLeft: 4, fontSize: 10 }}>{it.brand}</Tag>}
                  </span>
                }
                description={
                  <Space size={4} style={{ fontSize: 11 }}>
                    <Tag>{it.projectCount} 项目</Tag>
                    <Tag color="blue">{it.workItemCount} 工作项</Tag>
                    {it.highRiskCount > 0 && <Tag color="red">高风险 {it.highRiskCount}</Tag>}
                  </Space>
                }
              />
            </List.Item>
          )}
        />
      ) : <Empty description="无数据" />}
    </Card>
  );
}