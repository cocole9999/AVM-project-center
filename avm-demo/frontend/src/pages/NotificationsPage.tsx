/**
 * 通知中心
 * 来源 PRD §基础使用·通知中心
 * 功能：分类筛选、批量已读、自动扫描临期/超期
 */
import { useEffect, useState } from 'react';
import { Card, List, Tag, Empty, Tabs, Button, Space, Spin, Badge, Avatar, Popconfirm, App, Tooltip } from 'antd';
import {
  BellOutlined, CheckOutlined, ThunderboltOutlined, FireOutlined,
  UserAddOutlined, EditOutlined, MessageOutlined, SettingOutlined, DeleteOutlined,
  ReloadOutlined, PlusOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { notificationApi, aiApi, type Notification } from '../api';

interface Props {
  userId?: string;
}

const TYPE_META: Record<string, { label: string; color: string; icon: any }> = {
  mention: { label: '@提及', color: 'blue', icon: <MessageOutlined /> },
  assign: { label: '指派', color: 'cyan', icon: <UserAddOutlined /> },
  due_soon: { label: '临期', color: 'orange', icon: <ThunderboltOutlined /> },
  overdue: { label: '超期', color: 'red', icon: <FireOutlined /> },
  status_change: { label: '状态变更', color: 'purple', icon: <EditOutlined /> },
  review: { label: '评审', color: 'geekblue', icon: <CheckOutlined /> },
  comment: { label: '评论', color: 'magenta', icon: <MessageOutlined /> },
  system: { label: '系统', color: 'green', icon: <SettingOutlined /> },
};

const LEVEL_COLOR: Record<string, string> = {
  info: '#1890ff', warning: '#faad14', error: '#ff4d4f', success: '#52c41a',
};

export function NotificationsPage({ userId = 'zhangsan' }: Props) {
  const { message } = App.useApp();
  const [filter, setFilter] = useState<'all' | 'unread' | 'read'>('all');
  const [list, setList] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [unreadCount, setUnreadCount] = useState(0);
  const [creatingTask, setCreatingTask] = useState<string | null>(null);
  const navigate = useNavigate();

  const load = async () => {
    setLoading(true);
    try {
      const [data, count] = await Promise.all([
        notificationApi.list(userId, filter),
        notificationApi.unreadCount(userId),
      ]);
      setList(data);
      setUnreadCount(count.count);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [userId, filter]);

  const handleMarkRead = async (n: Notification) => {
    await notificationApi.markRead(n.id);
    await load();
  };

  const handleMarkAllRead = async () => {
    await notificationApi.markAllRead(userId);
    message.success('已全部标为已读');
    await load();
  };

  const handleCreateFollowUp = async (n: Notification, e: React.MouseEvent) => {
    e.stopPropagation();
    setCreatingTask(n.id);
    try {
      const r = await aiApi.createFollowUp(n.id, { assignee: userId });
      message.success(`已创建跟进任务 ${r.workItem.key}: ${r.workItem.title}`);
      await load();
    } catch (err: any) {
      message.error('创建跟进任务失败：' + err.message);
    } finally {
      setCreatingTask(null);
    }
  };

  const handleScanDue = async () => {
    try {
      const r = await notificationApi.scanDue();
      message.success(`扫描完成，新增 ${r.created} 条通知`);
      await load();
    } catch {
      message.error('扫描失败');
    }
  };

  const groupedByType: Record<string, Notification[]> = {};
  for (const n of list) {
    if (!groupedByType[n.type]) groupedByType[n.type] = [];
    groupedByType[n.type].push(n);
  }

  return (
    <div>
      <Card
        title={
          <Space>
            <BellOutlined />
            <span>通知中心</span>
            {unreadCount > 0 && <Badge count={unreadCount} />}
          </Space>
        }
        extra={
          <Space>
            <Button icon={<ReloadOutlined />} onClick={handleScanDue}>
              扫描临期/超期
            </Button>
            <Popconfirm title="确定全部标为已读？" onConfirm={handleMarkAllRead}>
              <Button icon={<CheckOutlined />} disabled={unreadCount === 0}>全部已读</Button>
            </Popconfirm>
          </Space>
        }
        style={{ borderRadius: 8 }}
      >
        <Tabs
          activeKey={filter}
          onChange={(k) => setFilter(k as any)}
          items={[
            { key: 'all', label: `全部 (${list.length})` },
            { key: 'unread', label: `未读 (${unreadCount})` },
            { key: 'read', label: '已读' },
          ]}
        />
        {loading ? (
          <div style={{ textAlign: 'center', padding: 40 }}><Spin /></div>
        ) : list.length === 0 ? (
          <Empty description="暂无通知" />
        ) : (
          <List
            itemLayout="horizontal"
            dataSource={list}
            renderItem={(n) => {
              const meta = TYPE_META[n.type] || { label: n.type, color: 'default', icon: <BellOutlined /> };
              return (
                <List.Item
                  style={{
                    cursor: n.link ? 'pointer' : 'default',
                    background: n.read ? 'transparent' : '#f0f5ff',
                    padding: '12px 16px',
                    borderRadius: 6,
                    marginBottom: 4,
                  }}
                  onClick={() => {
                    if (!n.read) handleMarkRead(n);
                    if (n.link) navigate(n.link);
                  }}
                  actions={!n.read ? [
                    <Button key="task" type="link" size="small" icon={<PlusOutlined />}
                      loading={creatingTask === n.id}
                      onClick={(e) => handleCreateFollowUp(n, e)}>
                      创建跟进任务
                    </Button>,
                    <Button key="r" type="link" size="small" onClick={(e) => { e.stopPropagation(); handleMarkRead(n); }}>标为已读</Button>,
                  ] : [
                    <Tooltip key="t" title={n.createdAt}>
                      <span style={{ fontSize: 12, color: '#999' }}>{new Date(n.createdAt).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
                    </Tooltip>,
                  ]}
                >
                  <List.Item.Meta
                    avatar={
                      <Avatar
                        style={{ backgroundColor: LEVEL_COLOR[n.level] || '#1890ff' }}
                        icon={meta.icon}
                      />
                    }
                    title={
                      <Space>
                        <Tag color={meta.color}>{meta.label}</Tag>
                        <span style={{ fontWeight: n.read ? 400 : 500 }}>{n.title}</span>
                        {!n.read && <Badge status="processing" />}
                      </Space>
                    }
                    description={n.content}
                  />
                </List.Item>
              );
            }}
          />
        )}
      </Card>
    </div>
  );
}
