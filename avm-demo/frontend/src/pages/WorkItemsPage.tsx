import { useEffect, useState, useMemo, useCallback } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import {
  Card, Segmented, Button, Input, Select, Space, Tag, Modal, Form, DatePicker,
  Dropdown, message, Tooltip, Empty, Avatar,
} from 'antd';
import {
  PlusOutlined, ReloadOutlined, FilterOutlined, TableOutlined, DownloadOutlined,
  AppstoreOutlined, BarChartOutlined, MoreOutlined, DeleteOutlined,
  RobotOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { workItemApi, metaApi, aiApi } from '../api';
import { downloadBlob, getFilenameFromResponse } from '../utils/download';
import type { WorkItem, WorkItemType, MetaOptions } from '../types';
import { PRIORITY_COLOR, STATUS_COLOR, TYPE_COLOR, TYPE_LABEL } from '../types';
import { TableView } from '../views/TableView';
import { KanbanView } from '../views/KanbanView';
import { GanttView } from '../views/GanttView';

export function WorkItemsPage() {
  const { type = 'requirement' } = useParams<{ type: WorkItemType }>();
  const navigate = useNavigate();
  const location = useLocation();

  const [items, setItems] = useState<WorkItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [options, setOptions] = useState<MetaOptions | null>(null);
  const [view, setView] = useState<'table' | 'kanban' | 'gantt'>('table');

  // 从 URL query 读 view
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const v = params.get('view');
    if (v === 'kanban' || v === 'gantt' || v === 'table') setView(v);
  }, [location.search]);

  // 切换 view 时同步到 URL
  const handleViewChange = (v: any) => {
    setView(v);
    const params = new URLSearchParams(location.search);
    params.set('view', v);
    navigate({ search: params.toString() }, { replace: true });
  };

  // 筛选条件
  const [filterStatus, setFilterStatus] = useState<string | undefined>();
  const [filterPriority, setFilterPriority] = useState<string | undefined>();
  const [filterAssignee, setFilterAssignee] = useState<string | undefined>();
  const [filterIteration, setFilterIteration] = useState<string | undefined>();
  const [exporting, setExporting] = useState(false);

  const handleExport = async (format: 'xlsx' | 'csv') => {
    setExporting(true);
    try {
      const params: any = { format };
      if (type) params.type = type;
      if (filterStatus) params.status = filterStatus;
      if (filterPriority) params.priority = filterPriority;
      if (filterAssignee) params.assignee = filterAssignee;
      const blob = await aiApi.exportWorkItems(params);
      const filename = getFilenameFromResponse((blob as any)?.headers, `work-items-${type || 'all'}-${new Date().toISOString().slice(0,10)}.${format}`);
      downloadBlob(blob as Blob, filename);
    } catch (e: any) {
      message.error('导出失败：' + e.message);
    } finally {
      setExporting(false);
    }
  };
  const [searchText, setSearchText] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = { type };
      if (filterStatus) params.status = filterStatus;
      if (filterPriority) params.priority = filterPriority;
      if (filterAssignee) params.assignee = filterAssignee;
      if (filterIteration) params.iterationId = filterIteration;
      if (searchText) params.q = searchText;
      const data = await workItemApi.list(params);
      setItems(data);
    } catch (e: any) {
      message.error('加载失败：' + e.message);
    } finally {
      setLoading(false);
    }
  }, [type, filterStatus, filterPriority, filterAssignee, filterIteration, searchText]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { metaApi.options().then(setOptions); }, []);

  // 当 type 变化时清掉不适用筛选
  useEffect(() => {
    setFilterStatus(undefined);
  }, [type]);

  const statusList = options?.statusByType[type as WorkItemType]?.values || [];

  // 创建
  const [createOpen, setCreateOpen] = useState(false);
  const [form] = Form.useForm();
  const [aiFilling, setAiFilling] = useState(false);
  const [aiSuggesting, setAiSuggesting] = useState(false);
  const [creating, setCreating] = useState(false);

  const handleAiFill = async () => {
    try {
      const v = await form.validateFields(['title']);
      if (!v.title) {
        message.warning('请先输入标题');
        return;
      }
      setAiFilling(true);
      const r = await aiApi.aiFillWorkItem({ title: v.title, type: type as string, hint: '' });
      if (r.filled) {
        const f = r.filled;
        form.setFieldsValue({
          type: f.type || type,
          priority: f.priority || 'P2',
          description: f.description || '',
          estimate: f.estimate || undefined,
          assignee: f.assignee || undefined,
        });
        message.success(r.reasoning || 'AI 已补全字段');
      }
    } catch (e: any) {
      if (e.errorFields) return; // 表单校验失败
      message.error('AI 填充失败：' + e.message);
    } finally {
      setAiFilling(false);
    }
  };

  const handleAiSuggestAssignee = async () => {
    try {
      const v = await form.validateFields(['title', 'priority']);
      if (!v.title) { message.warning('请先输入标题'); return; }
      setAiSuggesting(true);
      const r = await aiApi.aiSuggestAssignee({
        title: v.title, type: type as string, priority: v.priority || 'P2',
      });
      if (r.assignee) {
        form.setFieldValue('assignee', r.assignee);
        message.success(`AI 推荐: ${r.assignee} — ${r.reasoning || ''}`);
      }
    } catch (e: any) {
      if (e.errorFields) return;
      message.error('AI 推荐失败：' + e.message);
    } finally {
      setAiSuggesting(false);
    }
  };

  const handleCreate = async () => {
    try {
      const values = await form.validateFields();
      setCreating(true);
      await workItemApi.create({
        type: type as WorkItemType,
        title: values.title,
        description: values.description || '',
        priority: values.priority || 'P2',
        assignee: values.assignee || undefined,
        module: values.module || undefined,
        estimate: values.estimate,
        planStart: values.planRange?.[0]?.toISOString(),
        planEnd: values.planRange?.[1]?.toISOString(),
      });
      message.success('创建成功');
      setCreateOpen(false);
      form.resetFields();
      load();
      // 通知其他页面
      window.dispatchEvent(new CustomEvent('avm-data-changed'));
    } catch (e: any) {
      if (e.errorFields) return;
      message.error('创建失败：' + (e.message || ''));
    }
  };

  const handleDelete = async (id: string) => {
    Modal.confirm({
      title: '确认删除',
      content: '删除后无法恢复',
      okType: 'danger',
      onOk: async () => {
        await workItemApi.delete(id);
        message.success('已删除');
        load();
      },
    });
  };

  const handleStatusChange = async (id: string, status: string) => {
    try {
      await workItemApi.update(id, { status });
      message.success(`已流转到 ${status}`);
      load();
    } catch (e: any) {
      message.error('流转失败：' + e.message);
    }
  };

  const renderItemLink = (item: WorkItem) => (
    <a onClick={() => navigate(`/work-items/${item.type}/${item.id}`)}>
      <Tag color={TYPE_COLOR[item.type]} style={{ marginRight: 6 }}>{item.key}</Tag>
      {item.title}
    </a>
  );

  return (
    <div>
      <Card
        size="small"
        style={{ marginBottom: 12 }}
        styles={{ body: { padding: 12 } }}
      >
        <Space wrap>
          <Segmented
            value={view}
            onChange={handleViewChange}
            options={[
              { value: 'table', label: <span><TableOutlined /> 表格</span> },
              { value: 'kanban', label: <span><AppstoreOutlined /> 看板</span> },
              { value: 'gantt', label: <span><BarChartOutlined /> 甘特</span> },
            ]}
          />
          <Input.Search
            placeholder="搜索标题 / 编号"
            style={{ width: 220 }}
            value={searchText}
            onChange={e => setSearchText(e.target.value)}
            onSearch={() => load()}
          />
          <Select
            placeholder="状态"
            allowClear
            style={{ width: 140 }}
            value={filterStatus}
            onChange={setFilterStatus}
            options={statusList.map(s => ({ value: s, label: <Tag color={STATUS_COLOR[s]}>{s}</Tag> }))}
          />
          <Select
            placeholder="优先级"
            allowClear
            style={{ width: 110 }}
            value={filterPriority}
            onChange={setFilterPriority}
            options={['P0', 'P1', 'P2', 'P3'].map(p => ({ value: p, label: <Tag color={PRIORITY_COLOR[p]}>{p}</Tag> }))}
          />
          <Select
            placeholder="负责人"
            allowClear
            style={{ width: 130 }}
            value={filterAssignee}
            onChange={setFilterAssignee}
            options={[...new Set(items.map(i => i.assignee).filter(Boolean))].map(a => ({ value: a, label: a }))}
          />
          <Button icon={<ReloadOutlined />} onClick={load}>刷新</Button>
          <Dropdown
            menu={{
              items: [
                { key: 'xlsx', label: '导出 Excel (.xlsx)', onClick: () => handleExport('xlsx') },
                { key: 'csv', label: '导出 CSV (.csv)', onClick: () => handleExport('csv') },
              ],
            }}
          >
            <Button icon={<DownloadOutlined />} loading={exporting}>导出</Button>
          </Dropdown>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
            新建{TYPE_LABEL[type as WorkItemType]}
          </Button>
        </Space>
      </Card>

      <Card styles={{ body: { padding: view === 'kanban' ? 12 : 0 } }}>
        {items.length === 0 && !loading ? (
          <Empty description="暂无数据，点击右上角创建第一条记录" />
        ) : view === 'table' ? (
          <TableView items={items} loading={loading} onStatusChange={handleStatusChange} onDelete={handleDelete} onRefresh={load} onOpenItem={(it) => navigate(`/work-items/${it.type}/${it.id}`)} />
        ) : view === 'kanban' ? (
          <KanbanView items={items} statusList={statusList} onStatusChange={handleStatusChange} onClickItem={(it) => navigate(`/work-items/${it.type}/${it.id}`)} />
        ) : (
          <GanttView items={items} onClickItem={(it) => navigate(`/work-items/${it.type}/${it.id}`)} />
        )}
      </Card>

      <Modal
        title={`新建${TYPE_LABEL[type as WorkItemType]}`}
        open={createOpen}
        onCancel={() => setCreateOpen(false)}
        onOk={handleCreate}
        okText="创建"
        width={680}
        footer={[
          <Button key="ai" icon={<ThunderboltOutlined />} onClick={handleAiFill} loading={aiFilling}>
            AI 帮我填
          </Button>,
          <Button key="cancel" onClick={() => setCreateOpen(false)}>取消</Button>,
          <Button key="ok" type="primary" loading={creating} onClick={handleCreate}>创建</Button>,
        ]}
      >
        <Form form={form} layout="vertical" initialValues={{ priority: 'P2' }}>
          <Form.Item label="标题" name="title" rules={[{ required: true, message: '请输入标题' }]}>
            <Input placeholder="一句话描述清楚这个工作项" />
          </Form.Item>
          <Form.Item label="详细描述" name="description">
            <Input.TextArea rows={4} placeholder="补充背景、验收标准等" />
          </Form.Item>
          <Space>
            <Form.Item label="优先级" name="priority" style={{ width: 110 }}>
              <Select options={['P0', 'P1', 'P2', 'P3'].map(p => ({ value: p }))} />
            </Form.Item>
            <Form.Item label="负责人" name="assignee" style={{ width: 140 }}>
              <Select
                allowClear
                placeholder="选择"
                options={['张三', '李四', '王五', '赵六', '钱七', '孙八', '周九'].map(p => ({ value: p }))}
                dropdownRender={(menu) => (
                  <>
                    {menu}
                    <div style={{ padding: 4, borderTop: '1px solid #f0f0f0' }}>
                      <Button type="link" size="small" icon={<RobotOutlined />} onClick={handleAiSuggestAssignee} loading={aiSuggesting}>
                        AI 推荐负责人
                      </Button>
                    </div>
                  </>
                )}
              />
            </Form.Item>
            <Form.Item label="模块" name="module" style={{ width: 160 }}>
              <Input placeholder="如：登录模块" />
            </Form.Item>
            <Form.Item label="估分" name="estimate" style={{ width: 100 }}>
              <Input type="number" placeholder="故事点" />
            </Form.Item>
          </Space>
          <Form.Item label="计划时间" name="planRange">
            <DatePicker.RangePicker style={{ width: '100%' }} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}