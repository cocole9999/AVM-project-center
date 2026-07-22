import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ReactFlow, ReactFlowProvider, Background, Controls, MiniMap,
  addEdge, useNodesState, useEdgesState, Connection, Edge, Node,
  Panel, MarkerType,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import {
  Card, Button, Space, message, Modal, Form, Input, Select, InputNumber, Switch,
  Tag, Drawer, Tabs, Divider, Empty, Tooltip, Result,
} from 'antd';
import {
  SaveOutlined, ArrowLeftOutlined, PlusOutlined, SettingOutlined,
  PlayCircleOutlined, CheckCircleOutlined, StopOutlined, AuditOutlined,
  GatewayOutlined,
} from '@ant-design/icons';
import { flowApi } from '../api';
import type { NodeFlow, FlowNode, FlowTransition } from '../types';

const NODE_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  start: { bg: '#f6ffed', border: '#52c41a', text: '#389e0d' },
  end: { bg: '#f5f5f5', border: '#8c8c8c', text: '#595959' },
  normal: { bg: '#e6f4ff', border: '#1677ff', text: '#0958d9' },
  review: { bg: '#fff7e6', border: '#fa8c16', text: '#d46b08' },
  gate: { bg: '#f9f0ff', border: '#722ed1', text: '#531dab' },
};

const NODE_ICONS: Record<string, any> = {
  start: PlayCircleOutlined,
  end: StopOutlined,
  normal: CheckCircleOutlined,
  review: AuditOutlined,
  gate: GatewayOutlined,
};

// React Flow 节点数据结构
interface RFNode {
  id: string;
  type: 'avmNode';
  position: { x: number; y: number };
  data: {
    label: string;
    nodeType: string;
    statusValue: string;
    description: string;
    slaHours?: number | null;
    reviewType?: string | null;
    reviewRule?: string;
    dodItems?: string;
  };
}

const nodeTypes = {
  avmNode: AvmFlowNode,
};

function AvmFlowNode({ data, selected }: any) {
  const colors = NODE_COLORS[data.nodeType] || NODE_COLORS.normal;
  const Icon = NODE_ICONS[data.nodeType] || CheckCircleOutlined;
  return (
    <div style={{
      background: colors.bg,
      border: `2px solid ${selected ? '#1677ff' : colors.border}`,
      borderRadius: 8,
      padding: '10px 14px',
      minWidth: 160,
      boxShadow: selected ? '0 4px 12px rgba(0,0,0,0.15)' : '0 1px 3px rgba(0,0,0,0.1)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
        <Icon style={{ color: colors.text, fontSize: 16 }} />
        <div style={{ fontWeight: 500, fontSize: 13, color: colors.text }}>{data.label}</div>
      </div>
      {data.statusValue && (
        <Tag color={colors.border} style={{ fontSize: 11, margin: 0 }}>{data.statusValue}</Tag>
      )}
      {data.reviewType && (
        <Tag color="orange" style={{ fontSize: 11, marginLeft: 4 }}>{data.reviewType.toUpperCase()}</Tag>
      )}
      {data.slaHours ? <div style={{ fontSize: 11, color: '#999', marginTop: 4 }}>SLA: {data.slaHours}h</div> : null}
    </div>
  );
}

export function FlowEditorPage() {
  return (
    <ReactFlowProvider>
      <FlowEditorInner />
    </ReactFlowProvider>
  );
}

function FlowEditorInner() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [flow, setFlow] = useState<NodeFlow | null>(null);
  const [rfNodes, setRfNodes, onNodesChange] = useNodesState<RFNode>([]);
  const [rfEdges, setRfEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [selectedNode, setSelectedNode] = useState<RFNode | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [form] = Form.useForm();
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [reactFlowInstance, setReactFlowInstance] = useState<any>(null);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const data = await flowApi.get(id);
      setFlow(data);
      setRfNodes((data.nodes || []).map(n => ({
        id: n.id,
        type: 'avmNode',
        position: { x: n.positionX, y: n.positionY },
        data: {
          label: n.name,
          nodeType: n.nodeType,
          statusValue: n.statusValue || '',
          description: n.description,
          slaHours: n.slaHours,
          reviewType: n.reviewType,
          reviewRule: n.reviewRule,
          dodItems: n.dodItems,
        },
      })));
      setRfEdges((data.transitions || []).map(t => ({
        id: t.id,
        source: t.fromNodeId,
        target: t.toNodeId,
        label: t.label || undefined,
        markerEnd: { type: MarkerType.ArrowClosed },
        style: { stroke: t.isDefault ? '#1677ff' : '#999', strokeWidth: t.isDefault ? 2 : 1.5 },
      })));
    } catch (e: any) {
      message.error('加载失败：' + e.message);
    }
  }, [id, setRfNodes, setRfEdges]);

  useEffect(() => { load(); }, [load]);

  const onConnect = useCallback((params: Connection) => {
    setRfEdges((eds) => addEdge({
      ...params,
      markerEnd: { type: MarkerType.ArrowClosed },
      label: '',
    }, eds));
  }, [setRfEdges]);

  const onNodeClick = useCallback((_: any, node: any) => {
    setSelectedNode(node);
    form.setFieldsValue({
      name: node.data.label,
      nodeType: node.data.nodeType,
      statusValue: node.data.statusValue,
      description: node.data.description,
      slaHours: node.data.slaHours,
      reviewType: node.data.reviewType,
      reviewRule: node.data.reviewRule || 'majority',
    });
    setDrawerOpen(true);
  }, [form]);

  const handleAddNode = (type: string) => {
    if (!reactFlowInstance) return;
    const center = reactFlowInstance.screenToFlowPosition({
      x: window.innerWidth / 2 - 200,
      y: window.innerHeight / 2 - 100,
    });
    const tempId = `tmp_${Date.now()}`;
    const newNode: RFNode = {
      id: tempId,
      type: 'avmNode',
      position: center,
      data: {
        label: type === 'start' ? '开始' : type === 'end' ? '结束' : type === 'review' ? '评审节点' : '新节点',
        nodeType: type,
        statusValue: type === 'start' ? '初始' : type === 'end' ? '已结束' : '',
        description: '',
      },
    };
    setRfNodes((nds) => [...nds, newNode as any]);
  };

  const handleSave = async () => {
    if (!flow) return;
    try {
      const payload = {
        ...flow,
        nodes: rfNodes.map(n => ({
          id: n.id.startsWith('tmp_') ? undefined : n.id,
          name: n.data.label,
          nodeType: n.data.nodeType,
          description: n.data.description || '',
          positionX: n.position.x,
          positionY: n.position.y,
          statusValue: n.data.statusValue || null,
          roles: '',
          requiredFields: '',
          slaHours: n.data.slaHours,
          dodItems: n.data.dodItems || '',
          reviewType: n.data.reviewType || null,
          reviewRule: n.data.reviewRule || 'majority',
        })),
        transitions: rfEdges.map(e => ({
          id: e.id.startsWith('xy-edge__') ? undefined : e.id,
          fromNodeId: e.source,
          toNodeId: e.target,
          condition: '',
          label: typeof e.label === 'string' ? e.label : '',
          isDefault: false,
        })),
      };
      // 关键：连线引用临时节点ID的，保存前映射到新节点ID
      // 这里简化：保存时一次性整体替换，由后端重建
      const updated = await flowApi.update(flow.id, payload);
      message.success('已保存');
      setFlow(updated);
      load();
    } catch (e: any) {
      message.error('保存失败：' + e.message);
    }
  };

  const handleDeleteNode = () => {
    if (!selectedNode) return;
    setRfNodes(nds => nds.filter(n => n.id !== selectedNode.id));
    setRfEdges(eds => eds.filter(e => e.source !== selectedNode.id && e.target !== selectedNode.id));
    setDrawerOpen(false);
    setSelectedNode(null);
  };

  const handleUpdateNode = async () => {
    try {
      const values = await form.validateFields();
      setRfNodes(nds => nds.map(n => n.id === selectedNode!.id ? {
        ...n,
        data: {
          ...n.data,
          label: values.name,
          nodeType: values.nodeType,
          statusValue: values.statusValue || '',
          description: values.description || '',
          slaHours: values.slaHours,
          reviewType: values.reviewType,
          reviewRule: values.reviewRule,
        },
      } : n));
      message.success('已更新（记得保存）');
      setDrawerOpen(false);
    } catch (e: any) {
      if (e.errorFields) return;
    }
  };

  if (!flow) return <Card loading />;

  return (
    <div>
      <Card style={{ marginBottom: 12 }} styles={{ body: { padding: 12 } }}>
        <Space>
          <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/flows')}>返回</Button>
          <span style={{ fontSize: 16, fontWeight: 500 }}>{flow.name}</span>
          <Tag color="blue">{flow.workType}</Tag>
          <Divider type="vertical" />
          <Tooltip title="普通节点"><Button size="small" icon={<CheckCircleOutlined />} onClick={() => handleAddNode('normal')}>添加普通节点</Button></Tooltip>
          <Tooltip title="评审节点"><Button size="small" icon={<AuditOutlined />} onClick={() => handleAddNode('review')}>评审</Button></Tooltip>
          <Tooltip title="门径节点"><Button size="small" icon={<GatewayOutlined />} onClick={() => handleAddNode('gate')}>门径</Button></Tooltip>
          <Tooltip title="开始"><Button size="small" icon={<PlayCircleOutlined />} onClick={() => handleAddNode('start')}>开始</Button></Tooltip>
          <Tooltip title="结束"><Button size="small" icon={<StopOutlined />} onClick={() => handleAddNode('end')}>结束</Button></Tooltip>
          <Divider type="vertical" />
          <Button type="primary" icon={<SaveOutlined />} onClick={handleSave}>保存</Button>
        </Space>
      </Card>

      <Card styles={{ body: { padding: 0, height: 'calc(100vh - 220px)' } }}>
        <div ref={wrapperRef} style={{ width: '100%', height: '100%' }}>
          <ReactFlow
            nodes={rfNodes}
            edges={rfEdges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={onNodeClick}
            onInit={setReactFlowInstance}
            nodeTypes={nodeTypes as any}
            fitView
            proOptions={{ hideAttribution: true }}
          >
            <Background gap={16} />
            <Controls />
            <MiniMap nodeStrokeWidth={3} pannable zoomable />
            <Panel position="top-right">
              <Card size="small" style={{ width: 200, fontSize: 12 }} styles={{ body: { padding: 8 } }}>
                <div style={{ marginBottom: 6, fontWeight: 500 }}>节点类型图例</div>
                {Object.entries(NODE_COLORS).map(([type, c]) => (
                  <div key={type} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                    <div style={{ width: 14, height: 14, background: c.bg, border: `1px solid ${c.border}`, borderRadius: 3 }} />
                    <span>{type}</span>
                  </div>
                ))}
                <Divider style={{ margin: '6px 0' }} />
                <div style={{ color: '#999' }}>
                  💡 提示：拖动节点、拖拽连线端点连接
                </div>
              </Card>
            </Panel>
          </ReactFlow>
        </div>
      </Card>

      <Drawer
        title={selectedNode ? `编辑节点: ${selectedNode.data.label}` : ''}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        width={420}
        extra={
          <Space>
            <Button danger onClick={handleDeleteNode}>删除</Button>
            <Button type="primary" onClick={handleUpdateNode}>应用</Button>
          </Space>
        }
      >
        <Form form={form} layout="vertical">
          <Form.Item label="节点名称" name="name" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item label="节点类型" name="nodeType">
            <Select options={[
              { value: 'start', label: '开始' },
              { value: 'normal', label: '普通' },
              { value: 'review', label: '评审' },
              { value: 'gate', label: '门径' },
              { value: 'end', label: '结束' },
            ]} />
          </Form.Item>
          <Form.Item label="状态值（与 WorkItem.status 对应）" name="statusValue">
            <Input placeholder="如：开发中" />
          </Form.Item>
          <Form.Item label="SLA（小时）" name="slaHours">
            <InputNumber style={{ width: '100%' }} min={0} />
          </Form.Item>
          <Form.Item label="描述" name="description">
            <Input.TextArea rows={2} />
          </Form.Item>
          {selectedNode?.data.nodeType === 'review' && (
            <>
              <Divider>评审配置</Divider>
              <Form.Item label="评审类型" name="reviewType">
                <Select options={[
                  { value: 'tr', label: 'TR 技术评审' },
                  { value: 'dcp', label: 'DCP 决策评审' },
                  { value: 'qr', label: 'QR 质量评审' },
                ]} />
              </Form.Item>
              <Form.Item label="通过规则" name="reviewRule">
                <Select options={[
                  { value: 'all', label: '全员通过' },
                  { value: 'majority', label: '多数通过' },
                  { value: 'weighted', label: '加权通过' },
                ]} />
              </Form.Item>
            </>
          )}
        </Form>
      </Drawer>
    </div>
  );
}