/**
 * V1.13 审计日志页面
 *
 * - 列表（按 entity / actor / action / 时间 筛选）
 * - 统计卡（按 entity / actor 聚合, 近 7 天）
 * - 详情 Drawer（显示 changes diff + meta）
 * - 跳转 entity 详情（点击 entityId 跳对应页面）
 */
import { useEffect, useMemo, useState } from 'react';
import {
  Card, Table, Tag, Button, Space, Drawer, Descriptions, Select, DatePicker, Input,
  App, Statistic, Row, Col, Empty, Tooltip, Segmented, Timeline,
} from 'antd';
import {
  AuditOutlined, ReloadOutlined, UserOutlined, FilterOutlined,
  EyeOutlined, ProjectOutlined, ShopOutlined, CarOutlined, ContactsOutlined,
  ToolOutlined, LoginOutlined, LogoutOutlined, EditOutlined, PlusOutlined, DeleteOutlined,
  ApiOutlined,
} from '@ant-design/icons';
import dayjs, { Dayjs } from 'dayjs';
import { useNavigate } from 'react-router-dom';
import { auditApi, AuditLog, AuditChange, AuditMeta } from '../api';
import { useAuth } from '../AuthContext';

const ENTITY_OPTIONS = [
  { value: 'project', label: '项目', color: 'blue', icon: <ProjectOutlined /> },
  { value: 'customer', label: '客户', color: 'cyan', icon: <ShopOutlined /> },
  { value: 'carModel', label: '车型', color: 'geekblue', icon: <CarOutlined /> },
  { value: 'workItem', label: '工作项', color: 'purple', icon: <ToolOutlined /> },
  { value: 'contact', label: '联系人', color: 'magenta', icon: <ContactsOutlined /> },
  { value: 'dependency', label: '外部依赖', color: 'orange', icon: <ApiOutlined /> },
  { value: 'user', label: '用户', color: 'red', icon: <UserOutlined /> },
  { value: 'auth', label: '认证', color: 'gold', icon: <LoginOutlined /> },
];

const ACTION_META: Record<string, { label: string; color: string; icon: any }> = {
  create: { label: '创建', color: 'green', icon: <PlusOutlined /> },
  update: { label: '更新', color: 'blue', icon: <EditOutlined /> },
  delete: { label: '删除', color: 'red', icon: <DeleteOutlined /> },
  status_change: { label: '状态变更', color: 'orange', icon: <EditOutlined /> },
  login: { label: '登录', color: 'green', icon: <LoginOutlined /> },
  logout: { label: '登出', color: 'default', icon: <LogoutOutlined /> },
  login_failed: { label: '登录失败', color: 'red', icon: <LoginOutlined /> },
  import: { label: '导入', color: 'purple', icon: <ApiOutlined /> },
  export: { label: '导出', color: 'cyan', icon: <ApiOutlined /> },
  toggle: { label: '启停', color: 'gold', icon: <EditOutlined /> },
  assign: { label: '分配', color: 'blue', icon: <UserOutlined /> },
};

function entityColor(entity: string): string {
  return ENTITY_OPTIONS.find(e => e.value === entity)?.color || 'default';
}

function entityLabel(entity: string): string {
  return ENTITY_OPTIONS.find(e => e.value === entity)?.label || entity;
}

function actionMeta(action: string) {
  return ACTION_META[action] || { label: action, color: 'default', icon: <EditOutlined /> };
}

function roleColor(role?: string | null): string {
  if (!role) return 'default';
  if (role.includes('admin')) return 'red';
  if (role === 'biz_admin') return 'blue';
  return 'default';
}

function getEntityLink(entity: string, entityId: string): string | null {
  switch (entity) {
    case 'project': return `/projects/${entityId}`;
    case 'customer': return `/customers/${entityId}`;
    case 'carModel': return `/car-models/${entityId}`;
    case 'workItem': return null;  // work-item detail 需要 type 路径
    case 'contact': return `/customers?contact=${entityId}`;
    case 'dependency': return `/dependencies`;
    case 'user': return `/users`;
    case 'auth': return null;
    default: return null;
  }
}

export function AuditLogsPage() {
  const { message } = App.useApp();
  const navigate = useNavigate();
  const { user: me } = useAuth();
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [detail, setDetail] = useState<AuditLog | null>(null);
  const [entityFilter, setEntityFilter] = useState<string | undefined>();
  const [actionFilter, setActionFilter] = useState<string | undefined>();
  const [actorFilter, setActorFilter] = useState<string | undefined>();
  const [range, setRange] = useState<[Dayjs, Dayjs] | null>(null);
  const [pageSize, setPageSize] = useState(50);
  const [page, setPage] = useState(1);
  const [stats, setStats] = useState<any>(null);
  const [view, setView] = useState<'table' | 'timeline'>('table');

  const isAdmin = me?.role === 'tenant_admin';

  const load = async () => {
    setLoading(true);
    try {
      const params: any = { limit: pageSize, offset: (page - 1) * pageSize };
      if (entityFilter) params.entity = entityFilter;
      if (actionFilter) params.action = actionFilter;
      if (actorFilter) params.actor = actorFilter;
      if (range) {
        params.from = range[0].startOf('day').toISOString();
        params.to = range[1].endOf('day').toISOString();
      }
      const data = await auditApi.list(params);
      setLogs(data.items);
      setTotal(data.total);
    } catch (e: any) {
      message.error('加载失败：' + e.message);
    } finally {
      setLoading(false);
    }
  };

  const loadStats = async () => {
    try {
      setStats(await auditApi.stats(7));
    } catch {}
  };

  useEffect(() => { load(); }, [entityFilter, actionFilter, actorFilter, range, pageSize, page]);
  useEffect(() => { loadStats(); }, []);

  if (!isAdmin) {
    return (
      <Card>
        <div style={{ textAlign: 'center', padding: 60 }}>
          <AuditOutlined style={{ fontSize: 48, color: '#ccc' }} />
          <div style={{ marginTop: 16, fontSize: 16, color: '#999' }}>
            审计日志仅限租户管理员（tenant_admin）访问
          </div>
          <div style={{ marginTop: 8, fontSize: 13, color: '#bbb' }}>
            当前角色: {me?.role}
          </div>
        </div>
      </Card>
    );
  }

  return (
    <div>
      {/* 统计卡 */}
      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col span={6}>
          <Card>
            <Statistic
              title="近 7 天记录"
              value={stats?.total || 0}
              prefix={<AuditOutlined />}
              valueStyle={{ color: '#1677ff' }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <div style={{ fontSize: 13, color: '#666', marginBottom: 8 }}>实体分布</div>
            <Space wrap>
              {Object.entries(stats?.byEntity || {}).slice(0, 5).map(([k, v]: any) => (
                <Tag key={k} color={entityColor(k)}>{entityLabel(k)} × {v}</Tag>
              ))}
            </Space>
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <div style={{ fontSize: 13, color: '#666', marginBottom: 8 }}>操作类型</div>
            <Space wrap>
              {Object.entries(stats?.byAction || {}).slice(0, 5).map(([k, v]: any) => {
                const m = actionMeta(k);
                return <Tag key={k} color={m.color}>{m.label} × {v}</Tag>;
              })}
            </Space>
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <div style={{ fontSize: 13, color: '#666', marginBottom: 8 }}>Top 操作人</div>
            <Space wrap>
              {(stats?.topActors || []).slice(0, 3).map(([k, v]: any) => (
                <Tag key={k} icon={<UserOutlined />} color="blue">{k} × {v}</Tag>
              ))}
            </Space>
          </Card>
        </Col>
      </Row>

      <Card
        title={<Space><AuditOutlined /><span>审计日志</span><Tag color="blue">{total} 条</Tag></Space>}
        extra={
          <Space>
            <Segmented
              value={view}
              onChange={(v) => setView(v as any)}
              options={[{ label: '表格', value: 'table' }, { label: '时间线', value: 'timeline' }]}
            />
            <Button icon={<ReloadOutlined />} onClick={() => { load(); loadStats(); }} loading={loading}>刷新</Button>
          </Space>
        }
      >
        {/* 筛选 */}
        <Space wrap style={{ marginBottom: 16 }}>
          <Select
            placeholder="实体类型"
            allowClear style={{ width: 140 }}
            value={entityFilter}
            onChange={setEntityFilter}
            options={ENTITY_OPTIONS.map(e => ({ value: e.value, label: e.label }))}
          />
          <Select
            placeholder="操作类型"
            allowClear style={{ width: 140 }}
            value={actionFilter}
            onChange={setActionFilter}
            options={Object.entries(ACTION_META).map(([k, v]) => ({ value: k, label: v.label }))}
          />
          <Input.Search
            placeholder="操作人 (精确)"
            allowClear style={{ width: 180 }}
            onSearch={setActorFilter}
            onChange={(e) => !e.target.value && setActorFilter(undefined)}
          />
          <DatePicker.RangePicker
            value={range}
            onChange={(v) => setRange(v as any)}
            placeholder={['开始', '结束']}
          />
          {(entityFilter || actionFilter || actorFilter || range) && (
            <Button size="small" onClick={() => {
              setEntityFilter(undefined);
              setActionFilter(undefined);
              setActorFilter(undefined);
              setRange(null);
            }}>清空筛选</Button>
          )}
        </Space>

        {view === 'table' ? (
          <Table
            rowKey="id"
            loading={loading}
            dataSource={logs}
            size="small"
            pagination={{
              current: page, pageSize, total,
              showSizeChanger: true, showTotal: (t) => `共 ${t} 条`,
              onChange: (p, ps) => { setPage(p); setPageSize(ps); },
            }}
            columns={[
              {
                title: '时间', dataIndex: 'createdAt', width: 160,
                render: (t) => <Tooltip title={dayjs(t).format('YYYY-MM-DD HH:mm:ss')}>
                  <span style={{ fontFamily: 'monospace', fontSize: 12 }}>{dayjs(t).format('MM-DD HH:mm:ss')}</span>
                </Tooltip>,
              },
              {
                title: '实体', dataIndex: 'entity', width: 100,
                render: (e) => <Tag color={entityColor(e)}>{entityLabel(e)}</Tag>,
              },
              {
                title: '操作', dataIndex: 'action', width: 100,
                render: (a) => {
                  const m = actionMeta(a);
                  return <Tag color={m.color} icon={m.icon}>{m.label}</Tag>;
                },
              },
              {
                title: '操作人', dataIndex: 'actor', width: 140,
                render: (a, r) => (
                  <Space size={4}>
                    <UserOutlined style={{ color: '#999' }} />
                    <span>{a}</span>
                    {r.actorRole && <Tag color={roleColor(r.actorRole)} style={{ fontSize: 10, margin: 0 }}>{r.actorRole}</Tag>}
                  </Space>
                ),
              },
              {
                title: '摘要', width: 'auto',
                render: (_, r) => {
                  const meta: AuditMeta = r.meta ? JSON.parse(r.meta) : {};
                  const changes: AuditChange[] = r.changes ? JSON.parse(r.changes) : [];
                  return (
                    <div>
                      <div>{meta.summary || '-'}</div>
                      {changes.length > 0 && (
                        <div style={{ fontSize: 11, color: '#999', marginTop: 2 }}>
                          {changes.length} 项变化: {changes.slice(0, 3).map(c => c.field).join(', ')}{changes.length > 3 ? '...' : ''}
                        </div>
                      )}
                    </div>
                  );
                },
              },
              {
                title: '', width: 100, fixed: 'right',
                render: (_, r) => (
                  <Space size={4}>
                    <Button size="small" icon={<EyeOutlined />} onClick={() => setDetail(r)}>详情</Button>
                    {getEntityLink(r.entity, r.entityId) && (
                      <Button size="small" type="link" onClick={() => navigate(getEntityLink(r.entity, r.entityId)!)}>
                        跳转
                      </Button>
                    )}
                  </Space>
                ),
              },
            ]}
          />
        ) : (
          <Timeline
            mode="left"
            items={logs.slice(0, 100).map(l => {
              const meta: AuditMeta = l.meta ? JSON.parse(l.meta) : {};
              const am = actionMeta(l.action);
              return {
                color: am.color === 'red' ? 'red' : am.color === 'green' ? 'green' : am.color === 'orange' ? 'orange' : 'blue',
                dot: am.icon,
                label: <span style={{ fontFamily: 'monospace', fontSize: 12 }}>{dayjs(l.createdAt).format('MM-DD HH:mm:ss')}</span>,
                children: (
                  <div>
                    <Space size={4} wrap>
                      <Tag color={entityColor(l.entity)}>{entityLabel(l.entity)}</Tag>
                      <Tag color={am.color}>{am.label}</Tag>
                      <span style={{ fontSize: 12 }}><UserOutlined /> {l.actor}</span>
                      {l.actorRole && <Tag color={roleColor(l.actorRole)} style={{ fontSize: 10 }}>{l.actorRole}</Tag>}
                    </Space>
                    <div style={{ marginTop: 4 }}>{meta.summary || '-'}</div>
                  </div>
                ),
              };
            })}
          />
        )}
      </Card>

      {/* 详情 Drawer */}
      <Drawer
        title={detail ? `审计详情 - ${entityLabel(detail.entity)} ${actionMeta(detail.action).label}` : ''}
        open={!!detail}
        onClose={() => setDetail(null)}
        width={680}
      >
        {detail && (() => {
          const meta: AuditMeta = detail.meta ? JSON.parse(detail.meta) : {};
          const changes: AuditChange[] = detail.changes ? JSON.parse(detail.changes) : [];
          return (
            <>
              <Descriptions column={1} size="small" bordered>
                <Descriptions.Item label="时间">{dayjs(detail.createdAt).format('YYYY-MM-DD HH:mm:ss')}</Descriptions.Item>
                <Descriptions.Item label="实体">
                  <Tag color={entityColor(detail.entity)}>{entityLabel(detail.entity)}</Tag>
                </Descriptions.Item>
                <Descriptions.Item label="实体 ID"><code style={{ fontSize: 11 }}>{detail.entityId}</code></Descriptions.Item>
                <Descriptions.Item label="操作">
                  <Tag color={actionMeta(detail.action).color}>{actionMeta(detail.action).label}</Tag>
                </Descriptions.Item>
                <Descriptions.Item label="操作人">
                  <Space>
                    <UserOutlined /> {detail.actor}
                    {detail.actorRole && <Tag color={roleColor(detail.actorRole)}>{detail.actorRole}</Tag>}
                  </Space>
                </Descriptions.Item>
                <Descriptions.Item label="IP / UA">
                  {meta.ip && <Tag>{meta.ip}</Tag>}
                  {meta.userAgent && <span style={{ fontSize: 11, color: '#999' }}>{meta.userAgent}</span>}
                </Descriptions.Item>
                {meta.summary && <Descriptions.Item label="摘要">{meta.summary}</Descriptions.Item>}
              </Descriptions>

              {changes.length > 0 && (
                <div style={{ marginTop: 16 }}>
                  <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 8 }}>字段变更 ({changes.length})</div>
                  <Table
                    rowKey={(r) => r.field}
                    size="small"
                    pagination={false}
                    dataSource={changes}
                    columns={[
                      { title: '字段', dataIndex: 'field', width: 160 },
                      { title: '原值', dataIndex: 'oldValue', render: (v) => <span style={{ color: '#cf1322' }}>{v == null ? <em>∅</em> : String(v)}</span> },
                      { title: '新值', dataIndex: 'newValue', render: (v) => <span style={{ color: '#52c41a' }}>{v == null ? <em>∅</em> : String(v)}</span> },
                    ]}
                  />
                </div>
              )}

              {Object.keys(meta).filter(k => !['ip', 'method', 'path', 'userAgent', 'summary'].includes(k)).length > 0 && (
                <div style={{ marginTop: 16 }}>
                  <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 8 }}>元数据</div>
                  <pre style={{ background: '#fafafa', padding: 8, borderRadius: 4, fontSize: 11, overflow: 'auto' }}>
                    {JSON.stringify(meta, null, 2)}
                  </pre>
                </div>
              )}
            </>
          );
        })()}
      </Drawer>
    </div>
  );
}
