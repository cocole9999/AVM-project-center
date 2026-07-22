/**
 * AI 人力分析
 * 来源 PRD §AI 能力·AI 人力分析
 */
import { useEffect, useState } from 'react';
import { Card, Row, Col, Statistic, Tag, Progress, Avatar, Alert, Space, Button, Spin, DatePicker, List, Badge, Divider, Empty } from 'antd';
import {
  ReloadOutlined, BulbOutlined, UserOutlined, WarningOutlined,
} from '@ant-design/icons';
import dayjs, { type Dayjs } from 'dayjs';
import { resourceAnalysisApi } from '../api';

const LEVEL_COLOR: Record<string, string> = {
  overload: '#ff4d4f', busy: '#faad14', normal: '#52c41a', idle: '#bfbfbf',
};
const LEVEL_LABEL: Record<string, string> = {
  overload: '过载', busy: '饱和', normal: '正常', idle: '偏闲',
};
const RISK_COLOR: Record<string, string> = {
  high: '#ff4d4f', medium: '#faad14', low: '#1890ff',
};

interface Props { userId?: string }

export function AnalysisPage({ userId: _userId }: Props) {
  const [range, setRange] = useState<[Dayjs, Dayjs]>(() => [dayjs().startOf('week'), dayjs().startOf('week').add(13, 'day')]);
  const [analysis, setAnalysis] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await resourceAnalysisApi.analyze(range[0].format('YYYY-MM-DD'), range[1].format('YYYY-MM-DD'));
      setAnalysis(r);
    } catch (e: any) {
      setError(e.message || String(e));
    }
    setLoading(false);
  };

  const loadHistory = async () => {
    try {
      const h = await resourceAnalysisApi.history();
      setHistory(h);
    } catch {}
  };

  useEffect(() => { load(); loadHistory(); }, [range[0].valueOf(), range[1].valueOf()]);

  if (error) {
    return (
      <div style={{ padding: 24 }}>
        <Alert type="error" message="加载失败" description={error} showIcon />
        <Button onClick={load} style={{ marginTop: 12 }}>重试</Button>
      </div>
    );
  }

  if (loading && !analysis) {
    return <div style={{ padding: 40, textAlign: 'center' }}><Spin tip="加载分析中..." /></div>;
  }

  if (!analysis) {
    return <div style={{ padding: 40, textAlign: 'center' }}><Empty description="暂无分析数据" /></div>;
  }

  const healthColor = analysis.healthScore >= 80 ? '#52c41a' : analysis.healthScore >= 60 ? '#faad14' : '#ff4d4f';
  const healthText = analysis.healthScore >= 80 ? '健康' : analysis.healthScore >= 60 ? '需关注' : '风险';

  return (
    <div>
      {/* 顶部健康卡片 */}
      <Card style={{ borderRadius: 8, marginBottom: 12, background: `linear-gradient(135deg, ${healthColor}10 0%, ${healthColor}05 100%)` }}>
        <Row align="middle" gutter={24}>
          <Col>
            <Statistic
              title="团队健康分"
              value={analysis.healthScore ?? 0}
              suffix="/ 100"
              valueStyle={{ color: healthColor, fontSize: 32, fontWeight: 600 }}
            />
            <Tag color={healthColor} style={{ marginTop: 8, fontSize: 13 }}>{healthText}</Tag>
          </Col>
          <Col>
            <Statistic title="总工时" value={analysis.totalAllocated ?? 0} suffix="h" />
          </Col>
          <Col>
            <Statistic title="总容量" value={analysis.totalCapacity ?? 0} suffix="h" />
          </Col>
          <Col>
            <Statistic
              title="团队利用率"
              value={analysis.teamUtilization ?? 0}
              suffix="%"
              valueStyle={{ color: (analysis.teamUtilization ?? 0) > 100 ? '#ff4d4f' : '#1890ff' }}
            />
          </Col>
          <Col flex="auto" style={{ textAlign: 'right' }}>
            <Space size={8}>
              <DatePicker.RangePicker value={range} onChange={(v) => v && v[0] && v[1] && setRange([v[0], v[1]])} />
              <Button icon={<ReloadOutlined />} onClick={load}>刷新</Button>
            </Space>
          </Col>
        </Row>
      </Card>

      {/* 加载中浮层 */}
      {loading && (
        <div style={{ textAlign: 'center', padding: 20 }}><Spin /></div>
      )}

      {/* 智能建议 */}
      {analysis.suggestions && analysis.suggestions.length > 0 && (
        <Alert
          icon={<BulbOutlined />}
          message="AI 智能建议"
          description={
            <ul style={{ margin: 0, paddingLeft: 20 }}>
              {analysis.suggestions.map((s: string, i: number) => <li key={i}>{s}</li>)}
            </ul>
          }
          type={analysis.healthScore >= 80 ? 'success' : analysis.healthScore >= 60 ? 'warning' : 'error'}
          showIcon
          style={{ marginBottom: 12, borderRadius: 8 }}
        />
      )}

      {/* 团队级风险 */}
      {analysis.teamRisks && analysis.teamRisks.length > 0 && (
        <Card size="small" title={<Space><WarningOutlined />团队级风险</Space>} style={{ marginBottom: 12, borderRadius: 8 }}>
          <List
            dataSource={analysis.teamRisks}
            renderItem={(r: any) => (
              <List.Item style={{ padding: '8px 0' }}>
                <Tag color={RISK_COLOR[r.level]}>{r.level === 'high' ? '高' : r.level === 'medium' ? '中' : '低'}</Tag>
                <span style={{ flex: 1 }}>{r.description}</span>
                {r.affected && r.affected.length > 0 && (
                  <span style={{ fontSize: 12, color: '#999' }}>
                    影响：{r.affected.join('、')}
                  </span>
                )}
              </List.Item>
            )}
          />
        </Card>
      )}

      {/* 人员列表 */}
      <Row gutter={12}>
        {analysis.users.map((u: any) => {
          const levelColor = LEVEL_COLOR[u.level] || '#999';
          return (
            <Col key={u.userId + u.userName} span={8} style={{ marginBottom: 12 }}>
              <Card
                size="small"
                title={
                  <Space>
                    <Avatar size="small" style={{ backgroundColor: levelColor }} icon={<UserOutlined />} />
                    <span>{u.userName}</span>
                    <Tag color={u.level === 'overload' ? 'red' : u.level === 'busy' ? 'orange' : u.level === 'idle' ? 'default' : 'green'}>
                      {LEVEL_LABEL[u.level] || u.level}
                    </Tag>
                    {u.overdueCount > 0 && <Badge count={u.overdueCount} title="超期" />}
                  </Space>
                }
                extra={<span style={{ fontSize: 12, color: '#999' }}>@{u.userId}</span>}
                style={{ borderRadius: 8 }}
              >
                <div style={{ textAlign: 'center', marginBottom: 12 }}>
                  <Progress
                    type="circle"
                    percent={Math.min(150, u.utilization || 0)}
                    size={80}
                    strokeColor={levelColor}
                    format={p => `${p}%`}
                  />
                  <div style={{ marginTop: 8, fontSize: 12, color: '#666' }}>
                    {u.totalHours}h / {u.capacity}h
                  </div>
                </div>
                <Row gutter={8} style={{ fontSize: 12 }}>
                  <Col span={8}><Statistic title="进行中" value={u.activeCount || 0} valueStyle={{ fontSize: 14 }} /></Col>
                  <Col span={8}><Statistic title="P0" value={u.p0Count || 0} valueStyle={{ fontSize: 14, color: u.p0Count > 0 ? '#ff4d4f' : undefined }} /></Col>
                  <Col span={8}><Statistic title="超期" value={u.overdueCount || 0} valueStyle={{ fontSize: 14, color: u.overdueCount > 0 ? '#ff4d4f' : undefined }} /></Col>
                </Row>
                {u.risks && u.risks.length > 0 && (
                  <div>
                    <Divider style={{ margin: '8px 0' }} />
                    {u.risks.map((r: any, i: number) => (
                      <div key={i} style={{ fontSize: 12, color: RISK_COLOR[r.level], marginBottom: 2 }}>
                        <Tag color={RISK_COLOR[r.level]} style={{ marginRight: 4 }}>{r.level === 'high' ? '高' : r.level === 'medium' ? '中' : '低'}</Tag>
                        {r.description}
                      </div>
                    ))}
                  </div>
                )}
                {u.suggestions && u.suggestions.length > 0 && (
                  <div>
                    <Divider style={{ margin: '8px 0' }} />
                    <div style={{ fontSize: 12 }}>
                      <BulbOutlined style={{ color: '#1890ff' }} /> 建议：
                      {u.suggestions.map((s: string, i: number) => <div key={i} style={{ marginLeft: 16, color: '#666' }}>• {s}</div>)}
                    </div>
                  </div>
                )}
              </Card>
            </Col>
          );
        })}
      </Row>

      {/* 分析历史 */}
      {history.length > 0 && (
        <Card size="small" title="历史分析记录" style={{ borderRadius: 8, marginTop: 12 }}>
          <List
            dataSource={history}
            renderItem={(h: any) => (
              <List.Item>
                <Space>
                  <Tag>{new Date(h.createdAt).toLocaleString('zh-CN')}</Tag>
                  <span>健康分：<b style={{ color: h.healthScore >= 80 ? '#52c41a' : h.healthScore >= 60 ? '#faad14' : '#ff4d4f' }}>{h.healthScore}</b></span>
                  <span>风险用户：<b>{h.riskCount}</b></span>
                </Space>
              </List.Item>
            )}
          />
        </Card>
      )}
    </div>
  );
}
