import { useEffect, useState } from 'react';
import { Card, Table, Tag, Button, Space, Modal, Form, Input, Select, message, Tooltip } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, PartitionOutlined, EyeOutlined, ThunderboltOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { flowApi, aiApi } from '../api';
import type { NodeFlow } from '../types';

const TYPE_LABEL: Record<string, string> = {
  requirement: '需求', task: '任务', bug: '缺陷', release: '版本',
};

const TYPE_COLOR: Record<string, string> = {
  requirement: 'blue', task: 'cyan', bug: 'red', release: 'purple',
};

export function FlowsPage() {
  const [flows, setFlows] = useState<NodeFlow[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<NodeFlow | null>(null);
  const [form] = Form.useForm();
  const [aiFilling, setAiFilling] = useState(false);
  const navigate = useNavigate();

  const handleAiFill = async () => {
    try {
      const v = await form.validateFields(['name']);
      if (!v.name) { message.warning('请先输入流程名称'); return; }
      setAiFilling(true);
      const r = await aiApi.aiFillForm('flow', { name: v.name, workType: v.workType });
      if (r.filled) {
        form.setFieldsValue({
          workType: r.filled.workType || undefined,
          description: r.filled.description || undefined,
        });
        message.success(r.reasoning || 'AI 已补全字段');
      }
    } catch (e: any) {
      if (e.errorFields) return;
      message.error('AI 填充失败：' + e.message);
    } finally {
      setAiFilling(false);
    }
  };

  const load = async () => {
    setLoading(true);
    try {
      const data = await flowApi.list();
      setFlows(data);
    } catch (e: any) {
      message.error('加载失败：' + e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleEdit = (flow: NodeFlow) => {
    setEditing(flow);
    form.setFieldsValue(flow);
    setModalOpen(true);
  };

  const handleCreate = () => {
    setEditing(null);
    form.resetFields();
    setModalOpen(true);
  };

  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      if (editing) {
        // 直接打开编辑器
        navigate(`/flows/${editing.id}`);
        setModalOpen(false);
      } else {
        // 创建空流程
        const created = await flowApi.create({ ...values, nodes: [], transitions: [] });
        message.success('流程已创建，开始编排节点');
        navigate(`/flows/${created.id}`);
      }
    } catch (e: any) {
      if (e.errorFields) return;
      message.error('操作失败：' + e.message);
    }
  };

  const handleDelete = (flow: NodeFlow) => {
    Modal.confirm({
      title: '确认删除',
      content: `删除「${flow.name}」？该操作不可恢复`,
      okType: 'danger',
      onOk: async () => {
        try {
          await flowApi.delete(flow.id);
          message.success('已删除');
          load();
        } catch (e: any) {
          message.error('删除失败：' + e.message);
        }
      },
    });
  };

  return (
    <div>
      <Card style={{ marginBottom: 12 }} styles={{ body: { padding: 12 } }}>
        <Space>
          <span style={{ fontSize: 16, fontWeight: 500 }}>
            <PartitionOutlined /> 节点流管理
          </span>
          <span style={{ color: '#999' }}>为每类工作项定义生命周期与流转规则</span>
          <Button type="primary" icon={<PlusOutlined />} onClick={handleCreate}>
            新建节点流
          </Button>
        </Space>
      </Card>

      <Card>
        <Table
          rowKey="id"
          dataSource={flows}
          loading={loading}
          pagination={false}
          columns={[
            {
              title: '名称',
              dataIndex: 'name',
              render: (v, r) => (
                <a onClick={() => navigate(`/flows/${r.id}`)}>
                  <Tag color={TYPE_COLOR[r.workType]} style={{ marginRight: 6 }}>{TYPE_LABEL[r.workType]}</Tag>
                  {v}
                </a>
              ),
            },
            { title: '工作项类型', dataIndex: 'workType', width: 120, render: (t) => <Tag color={TYPE_COLOR[t]}>{TYPE_LABEL[t]}</Tag> },
            { title: '描述', dataIndex: 'description', ellipsis: true },
            { title: '节点数', dataIndex: ['_count', 'nodes'], width: 80, align: 'center', render: (n) => <Tag color="blue">{n || 0}</Tag> },
            { title: '连线数', dataIndex: ['_count', 'transitions'], width: 80, align: 'center', render: (n) => <Tag>{n || 0}</Tag> },
            { title: '状态', dataIndex: 'isActive', width: 80, render: (a) => a ? <Tag color="green">已激活</Tag> : <Tag>未激活</Tag> },
            { title: '更新时间', dataIndex: 'updatedAt', width: 160, render: (t) => new Date(t).toLocaleString('zh-CN') },
            {
              title: '操作', width: 200, fixed: 'right',
              render: (_, r) => (
                <Space>
                  <Tooltip title="编辑">
                    <Button size="small" icon={<EditOutlined />} onClick={() => handleEdit(r)}>编辑</Button>
                  </Tooltip>
                  <Tooltip title="查看">
                    <Button size="small" icon={<EyeOutlined />} onClick={() => navigate(`/flows/${r.id}`)} />
                  </Tooltip>
                  <Button size="small" danger icon={<DeleteOutlined />} onClick={() => handleDelete(r)} />
                </Space>
              ),
            },
          ]}
        />
      </Card>

      <Modal
        title={editing ? '编辑流程信息' : '新建节点流'}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={handleSave}
        okText={editing ? '打开编辑器' : '创建并打开'}
        footer={
          editing ? null : (
            <Space>
              <Button icon={<ThunderboltOutlined />} onClick={handleAiFill} loading={aiFilling}>
                AI 帮我填
              </Button>
              <Button onClick={() => setModalOpen(false)}>取消</Button>
              <Button type="primary" onClick={handleSave}>
                {editing ? '打开编辑器' : '创建并打开'}
              </Button>
            </Space>
          )
        }
      >
        <Form form={form} layout="vertical">
          <Form.Item label="流程名称" name="name" rules={[{ required: true, message: '请输入流程名称' }]}>
            <Input placeholder="如：需求标准流程" />
          </Form.Item>
          <Form.Item label="工作项类型" name="workType" rules={[{ required: true, message: '请选择类型' }]}>
            <Select
              disabled={!!editing}
              options={Object.entries(TYPE_LABEL).map(([k, v]) => ({ value: k, label: v }))}
              placeholder="选择关联的工作项类型"
            />
          </Form.Item>
          <Form.Item label="描述" name="description">
            <Input.TextArea rows={3} placeholder="描述此流程的用途和适用场景" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}