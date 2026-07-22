import React, { useState } from 'react';
import {
  Table, Tag, Avatar, Space, Button, Dropdown, Tooltip, Progress, App as AntdApp,
  Modal, Select, Input, Form, Empty, Alert,
} from 'antd';
import {
  DeleteOutlined, MoreOutlined, LinkOutlined,
  CheckOutlined, CloseOutlined, ThunderboltOutlined, UserOutlined, TagOutlined, BlockOutlined, CalendarOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import type { WorkItem, WorkItemType } from '../types';
import { PRIORITY_COLOR, STATUS_COLOR, TYPE_COLOR, TYPE_LABEL } from '../types';
import { workItemApi, iterationApi, userApi } from '../api';

interface Props {
  items: WorkItem[];
  loading: boolean;
  onStatusChange: (id: string, status: string) => void;
  onDelete: (id: string) => void;
  onRefresh: () => void;
  onOpenItem?: (item: WorkItem) => void;  // V1.29 j/k 浏览 + e 跳转
}

export function TableView({ items, loading, onStatusChange, onDelete, onRefresh, onOpenItem }: Props) {
  const { message, modal } = AntdApp.useApp();
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
  const [batchOpen, setBatchOpen] = useState(false);
  const [batchField, setBatchField] = useState<'status' | 'priority' | 'assignee' | 'module' | 'iterationId'>('status');
  const [batchValue, setBatchValue] = useState<any>(undefined);
  const [submitting, setSubmitting] = useState(false);
  const [iterations, setIterations] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [batchForm] = Form.useForm();

  // V1.29 j/k 浏览 + e 编辑: 全局 keydown (WorkItemsPage 已过滤输入框, 这里只处理表格)
  React.useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;
      if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return;
      if (!items || items.length === 0) return;
      if (e.key === 'j' || e.key === 'k' || e.key === 'e') {
        e.preventDefault();
        const currentKey = selectedRowKeys[0] as string | undefined;
        const currentIdx = items.findIndex(it => String(it.id) === String(currentKey));
        let nextIdx = currentIdx;
        if (e.key === 'j') nextIdx = currentIdx < 0 ? 0 : Math.min(currentIdx + 1, items.length - 1);
        else if (e.key === 'k') nextIdx = currentIdx < 0 ? 0 : Math.max(currentIdx - 1, 0);
        const next = items[nextIdx];
        if (!next) return;
        if (e.key === 'e' && onOpenItem) {
          onOpenItem(next);
        } else {
          setSelectedRowKeys([next.id]);
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [items, selectedRowKeys, onOpenItem]);

  // 打开批量操作时拉可选数据
  const openBatch = async (field: typeof batchField) => {
    setBatchField(field);
    setBatchOpen(true);
    setBatchValue(undefined);
    batchForm.resetFields();
    if (field === 'iterationId' && iterations.length === 0) {
      try { setIterations(await iterationApi.list()); } catch {}
    }
    if (field === 'assignee' && users.length === 0) {
      try { setUsers(await userApi.list()); } catch {}
    }
  };

  const submitBatch = async () => {
    if (selectedRowKeys.length === 0) {
      message.warning('请先选择工作项');
      return;
    }
    if (batchValue === undefined || batchValue === null || batchValue === '') {
      message.warning('请选择目标值');
      return;
    }
    setSubmitting(true);
    try {
      const result = await workItemApi.batchUpdate(
        selectedRowKeys.map(k => String(k)),
        { [batchField]: batchValue }
      );
      message.success(`✅ 已更新 ${result.updated} 条工作项 (${batchField} → ${batchValue})`);
      setBatchOpen(false);
      setSelectedRowKeys([]);
      onRefresh();
    } catch (e: any) {
      message.error('批量更新失败: ' + e.message);
    } finally {
      setSubmitting(false);
    }
  };

  const batchDelete = () => {
    if (selectedRowKeys.length === 0) return;
    modal.confirm({
      title: `确定删除 ${selectedRowKeys.length} 个工作项？`,
      content: '此操作不可撤销',
      okText: '删除',
      okButtonProps: { danger: true },
      onOk: async () => {
        let ok = 0, fail = 0;
        for (const id of selectedRowKeys) {
          try { await workItemApi.delete(String(id)); ok++; } catch { fail++; }
        }
        message.success(`已删除 ${ok} 个${fail ? `, 失败 ${fail}` : ''}`);
        setSelectedRowKeys([]);
        onRefresh();
      },
    });
  };

  const columns: ColumnsType<WorkItem> = [
    {
      title: '编号',
      dataIndex: 'key',
      key: 'key',
      width: 100,
      fixed: 'left',
      render: (key, item) => (
        <Space>
          <Tag color={TYPE_COLOR[item.type]}>{key}</Tag>
        </Space>
      ),
    },
    {
      title: '类型',
      dataIndex: 'type',
      key: 'type',
      width: 80,
      render: (t: string) => <Tag color={TYPE_COLOR[t]}>{TYPE_LABEL[t as keyof typeof TYPE_LABEL]}</Tag>,
      filters: Object.keys(TYPE_LABEL).map(k => ({ text: TYPE_LABEL[k as keyof typeof TYPE_LABEL], value: k })),
      onFilter: (v, item) => item.type === v,
    },
    {
      title: '标题',
      dataIndex: 'title',
      key: 'title',
      ellipsis: true,
      render: (t, item) => (
        <a href={`/work-items/${item.type}/${item.id}`} style={{ color: '#1677ff' }}>
          {t}
        </a>
      ),
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 110,
      render: (s: string) => <Tag color={STATUS_COLOR[s]}>{s}</Tag>,
    },
    {
      title: '优先级',
      dataIndex: 'priority',
      key: 'priority',
      width: 80,
      render: (p: string) => <Tag color={PRIORITY_COLOR[p]}>{p}</Tag>,
      sorter: (a, b) => a.priority.localeCompare(b.priority),
    },
    {
      title: '负责人',
      dataIndex: 'assignee',
      key: 'assignee',
      width: 100,
      render: (a?: string) => a ? <Space size={4}><Avatar size="small" style={{ background: '#1677ff' }}>{a[0]}</Avatar>{a}</Space> : <span style={{ color: '#ccc' }}>未指派</span>,
    },
    {
      title: '模块',
      dataIndex: 'module',
      key: 'module',
      width: 120,
      ellipsis: true,
    },
    {
      title: '估分',
      dataIndex: 'estimate',
      key: 'estimate',
      width: 80,
      sorter: (a, b) => (a.estimate || 0) - (b.estimate || 0),
      render: (v?: number) => v != null ? v : <span style={{ color: '#ccc' }}>-</span>,
    },
    {
      title: '工时进度',
      key: 'progress',
      width: 140,
      render: (_, item) => {
        if (!item.estimate) return <span style={{ color: '#ccc' }}>-</span>;
        const percent = Math.min(100, Math.round(((item.actualHours || 0) / item.estimate) * 100));
        return (
          <Tooltip title={`实际 ${item.actualHours || 0} / 估分 ${item.estimate}`}>
            <Progress
              percent={percent}
              size="small"
              status={percent > 100 ? 'exception' : 'normal'}
              strokeColor={percent > 100 ? '#ff4d4f' : '#1677ff'}
            />
          </Tooltip>
        );
      },
    },
    {
      title: '计划起止',
      key: 'plan',
      width: 180,
      render: (_, item) => {
        if (!item.planStart || !item.planEnd) return <span style={{ color: '#ccc' }}>-</span>;
        return (
          <span style={{ fontSize: 12 }}>
            {dayjs(item.planStart).format('MM-DD')} ~ {dayjs(item.planEnd).format('MM-DD')}
          </span>
        );
      },
    },
    {
      title: '迭代',
      dataIndex: ['iteration', 'name'],
      key: 'iteration',
      width: 140,
      render: (_, item) => item.iteration ? <Tag color="cyan">{item.iteration.name}</Tag> : <span style={{ color: '#ccc' }}>-</span>,
    },
    {
      title: '关联',
      key: 'related',
      width: 70,
      render: (_, item) => (
        <Space size={4}>
          {item._count?.children ? <Tag color="blue">{item._count.children}子</Tag> : null}
        </Space>
      ),
    },
    {
      title: '操作',
      key: 'action',
      width: 80,
      fixed: 'right',
      render: (_, item) => (
        <Dropdown
          menu={{
            items: [
              { key: 'del', label: '删除', icon: <DeleteOutlined />, danger: true, onClick: () => onDelete(item.id) },
            ],
          }}
        >
          <Button type="text" icon={<MoreOutlined />} />
        </Dropdown>
      ),
    },
  ];

  // 字段对应的可选值
  const FIELD_OPTIONS: Record<typeof batchField, { label: string; value: string }[]> = {
    status: [
      { label: '待处理', value: '待处理' },
      { label: '进行中', value: '进行中' },
      { label: '已完成', value: '已完成' },
      { label: '已关闭', value: '已关闭' },
      { label: '已阻塞', value: '已阻塞' },
    ],
    priority: [
      { label: 'P0', value: 'P0' },
      { label: 'P1', value: 'P1' },
      { label: 'P2', value: 'P2' },
      { label: 'P3', value: 'P3' },
    ],
    assignee: [],  // 从 users 拉
    module: [],  // 自由输入
    iterationId: [],  // 从 iterations 拉
  };

  return (
    <>
      <Table
        rowKey="id"
        dataSource={items}
        columns={columns}
        loading={loading}
        size="middle"
        rowSelection={{
          selectedRowKeys,
          onChange: setSelectedRowKeys,
        }}
        scroll={{ x: 1400 }}
        pagination={{
          showSizeChanger: true,
          showTotal: t => `共 ${t} 条`,
          pageSize: 20,
        }}
      />

      {/* V1.18 浮动批量操作栏 — 选中时从底部浮出 */}
      {selectedRowKeys.length > 0 && (
        <div style={{
          position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
          background: '#fff', borderRadius: 12, padding: '12px 20px',
          boxShadow: '0 8px 24px rgba(0,0,0,0.15), 0 2px 8px rgba(0,0,0,0.08)',
          border: '1px solid #e0e0e0',
          display: 'flex', alignItems: 'center', gap: 12,
          zIndex: 100,
        }}>
          <Tag color="blue" style={{ fontSize: 13, padding: '4px 12px' }}>
            <CheckOutlined /> 已选 {selectedRowKeys.length} 项
          </Tag>
          <Button type="text" onClick={() => setSelectedRowKeys([])} icon={<CloseOutlined />}>
            取消
          </Button>
          <span style={{ width: 1, height: 24, background: '#e0e0e0' }} />
          <Button icon={<ThunderboltOutlined />} onClick={() => openBatch('status')}>改状态</Button>
          <Button icon={<TagOutlined />} onClick={() => openBatch('priority')}>改优先级</Button>
          <Button icon={<UserOutlined />} onClick={() => openBatch('assignee')}>改负责人</Button>
          <Button icon={<BlockOutlined />} onClick={() => openBatch('module')}>改模块</Button>
          <Button icon={<CalendarOutlined />} onClick={() => openBatch('iterationId')}>改迭代</Button>
          <span style={{ width: 1, height: 24, background: '#e0e0e0' }} />
          <Button danger icon={<DeleteOutlined />} onClick={batchDelete}>删除</Button>
        </div>
      )}

      {/* 批量更新 Modal */}
      <Modal
        title={`批量更新 — ${batchField === 'status' ? '状态' : batchField === 'priority' ? '优先级' : batchField === 'assignee' ? '负责人' : batchField === 'module' ? '模块' : '迭代'}`}
        open={batchOpen}
        onCancel={() => setBatchOpen(false)}
        onOk={submitBatch}
        okText="应用"
        cancelText="取消"
        confirmLoading={submitting}
        destroyOnClose
      >
        <Alert
          message={`将把 ${selectedRowKeys.length} 个工作项的 [${batchField}] 字段更新为所选值`}
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
        />
        <Form form={batchForm} layout="vertical">
          <Form.Item label="目标值" required>
            {batchField === 'assignee' ? (
              <Select
                showSearch
                placeholder="选择负责人"
                value={batchValue}
                onChange={setBatchValue}
                optionFilterProp="label"
                options={users.map(u => ({ value: u.username, label: `${u.displayName} (${u.username})` }))}
              />
            ) : batchField === 'iterationId' ? (
              <Select
                showSearch
                placeholder="选择迭代 (不改为空迭代: 不选)"
                allowClear
                value={batchValue}
                onChange={setBatchValue}
                optionFilterProp="label"
                options={iterations.map(i => ({ value: i.id, label: i.name }))}
              />
            ) : batchField === 'module' ? (
              <Input
                placeholder="输入模块名 (如: AVM 透明底盘 / HMI 渲染)"
                value={batchValue || ''}
                onChange={e => setBatchValue(e.target.value)}
              />
            ) : (
              <Select
                placeholder="选择值"
                value={batchValue}
                onChange={setBatchValue}
                options={FIELD_OPTIONS[batchField as 'status' | 'priority']}
              />
            )}
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
