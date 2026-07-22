import { useEffect, useState } from 'react';
import { Layout, Menu, theme, Badge, Avatar, Tag, Input, AutoComplete, Dropdown, Space, List, Empty, Button, message, notification as antdNotification, Tooltip, Modal } from 'antd';
import {
  AppstoreOutlined, TableOutlined, ProjectOutlined, BarChartOutlined,
  SettingOutlined, BellOutlined, UserOutlined, TeamOutlined, RocketOutlined,
  PartitionOutlined, AuditOutlined, FundProjectionScreenOutlined, RobotOutlined,
  AppstoreAddOutlined, ScheduleOutlined, StarOutlined, StarFilled, SearchOutlined,
  ApartmentOutlined, FunctionOutlined, ThunderboltOutlined, CalculatorOutlined, ApiOutlined, FileExcelOutlined, FileTextOutlined, SwapOutlined, ToolOutlined, ProfileOutlined, LineChartOutlined, CameraOutlined, BulbOutlined, ExperimentOutlined, HeartOutlined, BankOutlined, CarOutlined, ShopOutlined, ProjectOutlined as ProjectIcon, ImportOutlined,
  CheckOutlined, FireOutlined, LogoutOutlined, CalendarOutlined, SmileOutlined, WifiOutlined, DisconnectOutlined,
} from '@ant-design/icons';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { iterationApi, metaApi, notificationApi, searchApi, favoriteApi, spaceApi, type SpaceType, type Favorite } from './api';
import type { Iteration } from './types';
import { useAuth } from './AuthContext';
import { GlobalAIAssistant } from './components/GlobalAIAssistant';
import { wsClient } from './services/ws';

const { Header, Sider, Content } = Layout;

export default function App() {
  const { user, token: authToken, logout } = useAuth();
  const CURRENT_USER = user?.username || '';
  const [collapsed, setCollapsed] = useState(false);
  const [iterations, setIterations] = useState<Iteration[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [spaces, setSpaces] = useState<SpaceType[]>([]);
  const [currentSpace, setCurrentSpace] = useState<SpaceType | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [searchQ, setSearchQ] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [favorites, setFavorites] = useState<Favorite[]>([]);
  const location = useLocation();
  const navigate = useNavigate();
  const { token: themeToken } = theme.useToken();

  useEffect(() => {
    iterationApi.list().then(setIterations).catch(() => {});
    metaApi.stats().then(setStats).catch(() => {});
    spaceApi.list().then(s => {
      setSpaces(s);
      setCurrentSpace(s[0] || null);
    }).catch(() => {});
    // 通知
    const refreshNotifs = () => notificationApi.unreadCount(CURRENT_USER).then(r => setUnreadCount(r.count)).catch(() => {});
    refreshNotifs();
    const t = setInterval(refreshNotifs, 30000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    favoriteApi.list(CURRENT_USER).then(setFavorites).catch(() => {});
  }, []);

  // V1.15: WebSocket 实时通知
  const [wsStatus, setWsStatus] = useState<string>('idle');
  useEffect(() => {
    if (!authToken) { wsClient.disconnect(); return; }
    wsClient.connect(authToken);
    const offStatus = wsClient.onStatusChange(setWsStatus);
    const offNotif = wsClient.on('notification', (msg) => {
      const n = msg.notification;
      if (!n) return;
      // 增加未读计数
      setUnreadCount(c => c + 1);
      // 顶部 toast
      const kindIcon = n.kind === 'mention' ? '💬' : n.kind === 'handover' ? '🔄' : n.kind === 'dep_overdue' ? '📦' : n.kind === 'risk_alert' ? '🚨' : '🔔';
      antdNotification.open({
        message: `${kindIcon} ${n.title || '新通知'}`,
        description: (n.content || '').slice(0, 120),
        placement: 'topRight',
        duration: 6,
        btn: n.link ? (
          <Button type="primary" size="small" onClick={() => navigate(n.link)}>
            查看 →
          </Button>
        ) : undefined,
        onClick: () => { if (n.link) navigate(n.link); },
      });
    });
    return () => { offStatus(); offNotif(); };
  }, [authToken, navigate]);

  // 登出时断开 ws
  useEffect(() => {
    if (!authToken) wsClient.disconnect();
  }, [authToken]);

  // V1.28 全局键盘快捷键
  const [helpOpen, setHelpOpen] = useState(false);
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // 排除输入框/可编辑元素
      const target = e.target as HTMLElement;
      const isEditable = target && (
        target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable
      );
      // Esc 总是处理
      if (e.key === 'Escape') {
        // Modal 关闭由 antd 自己处理
        return;
      }
      // 输入框内: 不响应其他快捷键
      if (isEditable) return;
      // 修饰键: 不响应 (留给浏览器)
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      switch (e.key) {
        case '/':
          e.preventDefault();
          const searchInput = document.querySelector('input[placeholder*="搜索"]') as HTMLInputElement;
          if (searchInput) searchInput.focus();
          break;
        case '?':
          e.preventDefault();
          setHelpOpen(true);
          break;
        case 'g':
          // 'g' 后面跟另一个键形成组合 (j/k/gg/d/w/i/n)
          // 简单实现: 记录 lastG, 800ms 内接受
          const lastG = (window as any).__avm_lastG || 0;
          if (Date.now() - lastG < 800) {
            (window as any).__avm_lastG = 0;
          } else {
            (window as any).__avm_lastG = Date.now();
            return;
          }
          break;
        case 'd':
          if ((window as any).__avm_lastG && Date.now() - (window as any).__avm_lastG < 800) {
            (window as any).__avm_lastG = 0;
            navigate('/dashboard');
          }
          break;
        case 'w':
          if ((window as any).__avm_lastG && Date.now() - (window as any).__avm_lastG < 800) {
            (window as any).__avm_lastG = 0;
            navigate('/workbench');
          }
          break;
        case 'i':
          if ((window as any).__avm_lastG && Date.now() - (window as any).__avm_lastG < 800) {
            (window as any).__avm_lastG = 0;
            navigate('/imports');
          }
          break;
        case 'r':
          if ((window as any).__avm_lastG && Date.now() - (window as any).__avm_lastG < 800) {
            (window as any).__avm_lastG = 0;
            navigate('/reports');
          }
          break;
        case 'a':
          if ((window as any).__avm_lastG && Date.now() - (window as any).__avm_lastG < 800) {
            (window as any).__avm_lastG = 0;
            navigate('/audit-logs');
          }
          break;
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [navigate]);

  // 从 URL 推断当前选中菜单
  const getSelectedKey = () => {
    const path = location.pathname;
    if (path.startsWith('/workbench')) return 'workbench';
    if (path.startsWith('/dashboard')) return 'dashboard';
    if (path.startsWith('/work-items/requirement')) return 'requirement';
    if (path.startsWith('/work-items/task')) return 'task';
    if (path.startsWith('/work-items/bug')) return 'bug';
    if (path.startsWith('/work-items/release')) return 'release';
    if (path.startsWith('/flows')) return 'flows';
    if (path.startsWith('/reviews')) return 'reviews';
    if (path.startsWith('/dashboards') || path.startsWith('/charts')) return 'dashboards';
    if (path.startsWith('/ai')) return 'ai';
    if (path.startsWith('/notifications')) return 'notifications';
    if (path.startsWith('/resources')) return 'resources';
    if (path.startsWith('/tree')) return 'tree';
    if (path.startsWith('/fields')) return 'fields';
    if (path.startsWith('/automation')) return 'automation';
    if (path.startsWith('/analysis')) return 'analysis';
    if (path.startsWith('/baselines')) return 'baselines';
    if (path.startsWith('/mcp')) return 'mcp';
    if (path.startsWith('/tests')) return 'tests';
    if (path.startsWith('/tenants')) return 'tenants';
    if (path.startsWith('/llm-settings')) return 'llm-settings';
    if (path.startsWith('/customers')) return 'customers';
    if (path.startsWith('/car-models')) return 'car-models';
    if (path.startsWith('/projects')) return 'projects';
    if (path.startsWith('/dependencies')) return 'dependencies';
    if (path.startsWith('/resources')) return 'resources';
    if (path.startsWith('/gantt')) return 'gantt';
    if (path.startsWith('/users')) return 'users';
    if (path.startsWith('/audit-logs')) return 'audit-logs';
    if (path.startsWith('/imports')) return 'imports';
    if (path.startsWith('/reports')) return 'reports';
    return 'workbench';
  };

  const selectedKey = getSelectedKey();

  const getTitle = () => {
    switch (selectedKey) {
      case 'workbench': return '我的工作台';
      case 'dashboard': return '项目仪表盘';
      case 'requirement': return '需求管理';
      case 'task': return '任务管理';
      case 'bug': return '缺陷管理';
      case 'release': return '版本管理';
      case 'flows': return '流程引擎';
      case 'reviews': return '评审中心';
      case 'dashboards': return '度量仪表盘';
      case 'ai': return 'AI 智能助理';
      case 'notifications': return '通知中心';
      case 'resources': return '人员排期';
      case 'tree': return '树形视图';
      case 'fields': return '字段配置';
      case 'automation': return '自动化';
      case 'analysis': return 'AI 人力分析';
      case 'baselines': return '基线管理';
      case 'mcp': return 'MCP Server';
      case 'tests': return '测试管理';
      case 'tenants': return '企业管理';
      case 'llm-settings': return '大模型设置';
      case 'customers': return '客户管理';
      case 'car-models': return '车型库';
      case 'projects': return '项目管理';
      case 'dependencies': return '外部依赖';
      case 'resources': return '资源管理';
      case 'gantt': return '甘特图';
      case 'users': return '用户管理';
      case 'audit-logs': return '审计日志';
      case 'imports': return '数据导入';
      case 'reports': return '周报月报';
      default: return '';
    }
  };

  // 全局搜索
  const handleSearch = async (q: string) => {
    setSearchQ(q);
    if (!q.trim()) {
      setSearchResults([]);
      return;
    }
    try {
      const r = await searchApi.search(q);
      setSearchResults(r.results);
    } catch {
      setSearchResults([]);
    }
  };

  const handleMarkAllRead = async () => {
    await notificationApi.markAllRead(CURRENT_USER);
    setUnreadCount(0);
    message.success('已全部标为已读');
  };

  const handleToggleFav = async (fav: Favorite) => {
    await favoriteApi.remove(fav.id);
    setFavorites(prev => prev.filter(f => f.id !== fav.id));
    message.success('已取消收藏');
  };

  // 通知下拉面板
  const notifPanel = (
    <div style={{ width: 360, background: '#fff', borderRadius: 8, boxShadow: '0 4px 12px rgba(0,0,0,0.15)', padding: 12, maxHeight: 480, overflow: 'auto' }}>
      <Space style={{ marginBottom: 8, width: '100%', justifyContent: 'space-between' }}>
        <span style={{ fontWeight: 500 }}>未读通知（{unreadCount}）</span>
        <Button type="link" size="small" onClick={handleMarkAllRead} disabled={unreadCount === 0}>全部已读</Button>
      </Space>
      <Button type="link" block onClick={() => { navigate('/notifications'); }}>
        打开通知中心
      </Button>
    </div>
  );

  // 收藏下拉
  const favPanel = (
    <div style={{ width: 360, background: '#fff', borderRadius: 8, boxShadow: '0 4px 12px rgba(0,0,0,0.15)', padding: 12, maxHeight: 480, overflow: 'auto' }}>
      <Space style={{ marginBottom: 8, width: '100%', justifyContent: 'space-between' }}>
        <span style={{ fontWeight: 500 }}>我的收藏（{favorites.length}）</span>
        <Button type="link" size="small" onClick={() => navigate('/workbench')}>工作台管理</Button>
      </Space>
      {favorites.length === 0 ? (
        <Empty description="暂无收藏" image={Empty.PRESENTED_IMAGE_SIMPLE} />
      ) : (
        <List
          size="small"
          dataSource={favorites}
          renderItem={(f) => (
            <List.Item
              style={{ cursor: 'pointer', padding: '6px 8px' }}
              actions={[<StarFilled key="s" style={{ color: '#faad14' }} onClick={(e) => { e.stopPropagation(); handleToggleFav(f); }} />]}
              onClick={() => navigate(f.link)}
            >
              <List.Item.Meta
                title={<span style={{ fontSize: 13 }}>{f.title}</span>}
                description={<span style={{ fontSize: 11, color: '#999' }}>{f.subtitle}</span>}
              />
            </List.Item>
          )}
        />
      )}
    </div>
  );

  // 空间切换
  const spaceMenu = {
    items: spaces.map(s => ({
      key: s.id,
      label: (
        <Space onClick={() => setCurrentSpace(s)}>
          <AppstoreAddOutlined />
          <span>{s.name}</span>
          {currentSpace?.id === s.id && <CheckOutlined style={{ color: themeToken.colorPrimary }} />}
        </Space>
      ),
    })),
  };

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider collapsible collapsed={collapsed} onCollapse={setCollapsed} theme="light" width={232}>
        <div style={{
          height: 56, margin: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
          borderBottom: `1px solid ${themeToken.colorBorderSecondary}`,
          gap: 8,
        }}>
          <RocketOutlined style={{ fontSize: 22, color: themeToken.colorPrimary }} />
          {!collapsed && (
            <span style={{ fontSize: 16, fontWeight: 600 }}>AVM 项目中心</span>
          )}
        </div>

        <Menu
          mode="inline"
          selectedKeys={[selectedKey]}
          defaultOpenKeys={['grp-work']}
          inlineCollapsed={collapsed}
          style={{ borderRight: 0 }}
          items={[
            // ========== 1. 工作区 (每天用) ==========
            {
              key: 'grp-home',
              type: 'group',
              label: collapsed ? null : <span style={{ fontSize: 11, color: '#999', fontWeight: 500, letterSpacing: 0.5 }}>工作区</span>,
              children: [
                { key: 'workbench', icon: <AppstoreOutlined />, label: <Link to="/workbench">工作台</Link> },
                { key: 'dashboard', icon: <BarChartOutlined />, label: <Link to="/dashboard">项目仪表盘</Link> },
              ],
            },
            // ========== 2. 工作项 (核心实体) ==========
            {
              key: 'grp-work',
              type: 'group',
              label: collapsed ? null : <span style={{ fontSize: 11, color: '#999', fontWeight: 500, letterSpacing: 0.5 }}>工作项</span>,
              children: [
                {
                  key: 'work',
                  icon: <ProjectOutlined />,
                  label: '工作项',
                  children: [
                    { key: 'requirement', label: <Link to="/work-items/requirement">需求</Link> },
                    { key: 'task', label: <Link to="/work-items/task">任务</Link> },
                    { key: 'bug', label: <Link to="/work-items/bug">缺陷</Link> },
                    { key: 'release', label: <Link to="/work-items/release">版本</Link> },
                  ],
                },
                { key: 'gantt', icon: <CalendarOutlined />, label: <Link to="/gantt">甘特图</Link> },
                { key: 'tree', icon: <ApartmentOutlined />, label: <Link to="/tree">树形视图</Link> },
                { key: 'dependencies', icon: <ToolOutlined />, label: <Link to="/dependencies">外部依赖</Link> },
                { key: 'resources', icon: <ScheduleOutlined />, label: <Link to="/resources">人员排期</Link> },
              ],
            },
            // ========== 3. 度量与报告 ==========
            {
              key: 'grp-metrics',
              type: 'group',
              label: collapsed ? null : <span style={{ fontSize: 11, color: '#999', fontWeight: 500, letterSpacing: 0.5 }}>度量与报告</span>,
              children: [
                { key: 'reports', icon: <FileTextOutlined />, label: <Link to="/reports">周报月报</Link> },
                { key: 'dashboards', icon: <FundProjectionScreenOutlined />, label: <Link to="/dashboards">度量仪表盘</Link> },
                { key: 'reviews', icon: <AuditOutlined />, label: <Link to="/reviews">评审中心</Link> },
                { key: 'tests', icon: <ExperimentOutlined />, label: <Link to="/tests">测试管理</Link> },
                { key: 'analysis', icon: <LineChartOutlined />, label: <Link to="/analysis">AI 人力分析</Link> },
              ],
            },
            // ========== 4. 流程配置 (低频但重要) ==========
            {
              key: 'grp-flow',
              type: 'group',
              label: collapsed ? null : <span style={{ fontSize: 11, color: '#999', fontWeight: 500, letterSpacing: 0.5 }}>流程配置</span>,
              children: [
                { key: 'flows', icon: <PartitionOutlined />, label: <Link to="/flows">流程引擎</Link> },
                { key: 'automation', icon: <ThunderboltOutlined />, label: <Link to="/automation">无代码自动化</Link> },
                { key: 'fields', icon: <FunctionOutlined />, label: <Link to="/fields">字段配置</Link> },
              ],
            },
            // ========== 5. 空间与数据 (管理员) ==========
            {
              key: 'grp-data',
              type: 'group',
              label: collapsed ? null : <span style={{ fontSize: 11, color: '#999', fontWeight: 500, letterSpacing: 0.5 }}>空间与数据</span>,
              children: [
                { key: 'projects', icon: <ProjectIcon />, label: <Link to="/projects">项目管理</Link> },
                { key: 'tenants', icon: <BankOutlined />, label: <Link to="/tenants">企业管理</Link> },
                { key: 'customers', icon: <ShopOutlined />, label: <Link to="/customers">客户管理</Link> },
                { key: 'car-models', icon: <CarOutlined />, label: <Link to="/car-models">车型库</Link> },
                { key: 'imports', icon: <ImportOutlined />, label: <Link to="/imports">数据导入</Link> },
                { key: 'baselines', icon: <CameraOutlined />, label: <Link to="/baselines">基线管理</Link> },
              ],
            },
            // ========== 6. 系统管理 (管理员) ==========
            {
              key: 'grp-system',
              type: 'group',
              label: collapsed ? null : <span style={{ fontSize: 11, color: '#999', fontWeight: 500, letterSpacing: 0.5 }}>系统管理</span>,
              children: [
                { key: 'users', icon: <UserOutlined />, label: <Link to="/users">用户管理</Link> },
                { key: 'audit-logs', icon: <AuditOutlined />, label: <Link to="/audit-logs">审计日志</Link> },
                { key: 'llm-settings', icon: <ApiOutlined />, label: <Link to="/llm-settings">大模型设置</Link> },
                { key: 'mcp', icon: <ApiOutlined />, label: <Link to="/mcp">MCP Server</Link> },
              ],
            },
          ]}
        />

        {!collapsed && iterations.length > 0 && (
          <div style={{ padding: '12px 16px', marginTop: 16, borderTop: `1px solid ${themeToken.colorBorderSecondary}` }}>
            <div style={{ fontSize: 12, color: themeToken.colorTextTertiary, marginBottom: 8 }}>
              <TeamOutlined /> 当前迭代
            </div>
            {iterations.filter(i => i.status === 'active').map(i => (
              <div key={i.id} style={{
                padding: 8, borderRadius: 6, background: themeToken.colorFillTertiary,
                marginBottom: 6, fontSize: 13,
              }}>
                <div style={{ fontWeight: 500 }}>{i.name}</div>
                <div style={{ fontSize: 11, color: themeToken.colorTextTertiary, marginTop: 4 }}>
                  {new Date(i.startDate).toLocaleDateString('zh-CN')} ~ {new Date(i.endDate).toLocaleDateString('zh-CN')}
                </div>
              </div>
            ))}
          </div>
        )}
      </Sider>

      <Layout>
        <Header style={{
          padding: '0 24px', background: '#fff',
          borderBottom: `1px solid ${themeToken.colorBorderSecondary}`,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <Space>
            <div style={{ fontSize: 16, fontWeight: 500 }}>{getTitle()}</div>
            {currentSpace && (
              <Dropdown menu={spaceMenu} trigger={['click']}>
                <Button type="text" icon={<AppstoreAddOutlined />}>
                  {currentSpace.name} ▾
                </Button>
              </Dropdown>
            )}
          </Space>

          <Space size={16} style={{ flex: 1, justifyContent: 'flex-end' }}>
            {/* 全局搜索 */}
            <AutoComplete
              style={{ width: 280 }}
              value={searchQ}
              onChange={handleSearch}
              placeholder="搜索工作项/迭代/图表/人员..."
              allowClear
            >
              <Input
                prefix={<SearchOutlined style={{ color: '#999' }} />}
                size="middle"
              />
            </AutoComplete>
            {searchResults.length > 0 && (
              <div style={{ position: 'absolute', top: 56, right: 320, zIndex: 1000, background: '#fff', borderRadius: 8, boxShadow: '0 4px 12px rgba(0,0,0,0.15)', width: 480, maxHeight: 480, overflow: 'auto' }}>
                <List
                  size="small"
                  dataSource={searchResults}
                  renderItem={(r: any) => (
                    <List.Item style={{ cursor: 'pointer', padding: '8px 12px' }} onClick={() => { navigate(r.link); setSearchQ(''); setSearchResults([]); }}>
                      <List.Item.Meta
                        avatar={<Tag color="blue">{r.type}</Tag>}
                        title={<span style={{ fontSize: 13 }}>{r.title}</span>}
                        description={<span style={{ fontSize: 11, color: '#999' }}>{r.subtitle}</span>}
                      />
                    </List.Item>
                  )}
                />
              </div>
            )}

            {stats && (
              <div style={{ fontSize: 13, color: themeToken.colorTextSecondary }}>
                共 <b style={{ color: themeToken.colorPrimary }}>{stats.total}</b> 个工作项
                {' · '}P0 <Badge color="red" text={stats.byPriority.P0 || 0} />
                {' · '}P1 <Badge color="orange" text={stats.byPriority.P1 || 0} />
              </div>
            )}

            {/* 收藏 */}
            <Dropdown popupRender={() => favPanel} trigger={['click']}>
              <StarOutlined style={{ fontSize: 18, cursor: 'pointer' }} />
            </Dropdown>

            {/* 通知 */}
            <Dropdown popupRender={() => notifPanel} trigger={['click']}>
              <Badge count={unreadCount} size="small">
                <BellOutlined style={{ fontSize: 18, cursor: 'pointer' }} />
              </Badge>
            </Dropdown>
            {/* V1.15: ws 状态指示 */}
            <Tooltip title={wsStatus === 'connected' ? '实时通知已连接' : wsStatus === 'connecting' ? '连接中…' : '通知离线 (将自动重连)'}>
              {wsStatus === 'connected' ? <WifiOutlined style={{ fontSize: 14, color: '#52c41a' }} /> : <DisconnectOutlined style={{ fontSize: 14, color: wsStatus === 'connecting' ? '#faad14' : '#bfbfbf' }} />}
            </Tooltip>

            <Dropdown
              menu={{
                items: [
                  {
                    key: 'info',
                    label: (
                      <div style={{ padding: '4px 0' }}>
                        <div style={{ fontWeight: 500 }}>{user?.displayName}</div>
                        <div style={{ fontSize: 12, color: '#999' }}>@{user?.username} · {user?.role}</div>
                      </div>
                    ),
                    disabled: true,
                  },
                  { type: 'divider' },
                  {
                    key: 'logout',
                    icon: <LogoutOutlined />,
                    label: '退出登录',
                    onClick: () => {
                      logout();
                      message.success('已退出');
                      navigate('/login', { replace: true });
                    },
                  },
                ],
              }}
            >
              <Space style={{ cursor: 'pointer' }}>
                <Avatar style={{ background: themeToken.colorPrimary }} icon={<UserOutlined />} />
                <span style={{ fontSize: 13 }}>{user?.displayName}</span>
              </Space>
            </Dropdown>
          </Space>
        </Header>

        <Content style={{ margin: 16 }}>
          <Outlet />
        </Content>
      </Layout>
      {/* 全局 AI 助理：悬浮按钮 + Ctrl+K 唤起，跨页面可用 */}
      <GlobalAIAssistant />

      {/* V1.28 键盘快捷键帮助 */}
      <Modal
        title={<Space><RocketOutlined /> 键盘快捷键</Space>}
        open={helpOpen}
        onCancel={() => setHelpOpen(false)}
        footer={<Button type="primary" onClick={() => setHelpOpen(false)}>知道了</Button>}
        width={520}
      >
        <div style={{ fontSize: 13, lineHeight: 2 }}>
          <div><b>导航</b>（g + 字母）</div>
          <div style={{ paddingLeft: 16, color: '#666' }}>
            <div><kbd>g d</kbd> → 仪表盘</div>
            <div><kbd>g w</kbd> → 工作台</div>
            <div><kbd>g i</kbd> → 数据导入</div>
            <div><kbd>g r</kbd> → AI 报告</div>
            <div><kbd>g a</kbd> → 审计日志</div>
          </div>
          <div style={{ marginTop: 8 }}><b>全局</b></div>
          <div style={{ paddingLeft: 16, color: '#666' }}>
            <div><kbd>/</kbd> → 聚焦顶部搜索框</div>
            <div><kbd>?</kbd> → 显示本帮助</div>
            <div><kbd>Esc</kbd> → 关闭弹窗/Menu/抽屉</div>
          </div>
          <div style={{ marginTop: 8, color: '#999', fontSize: 12 }}>
            💡 在输入框/可编辑元素内时，所有快捷键自动让位给文本编辑
          </div>
        </div>
      </Modal>
    </Layout>
  );
}