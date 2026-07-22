import { useEffect, useState } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Card, Form, Input, Select, Button, Space, message, Row, Col, Divider, Empty, Tabs,
} from 'antd';
import { ArrowLeftOutlined, SaveOutlined, EyeOutlined } from '@ant-design/icons';
import { chartApi, dashboardApi } from '../api';
import type { ChartConfig, Dashboard } from '../types';
import { EChart, buildEChartsOption } from '../components/EChart';

const CHART_TYPES = [
  { value: 'bar', label: '柱状图' },
  { value: 'horizontalBar', label: '条形图' },
  { value: 'line', label: '折线图' },
  { value: 'area', label: '面积图' },
  { value: 'pie', label: '饼图' },
  { value: 'funnel', label: '漏斗图' },
  { value: 'gauge', label: '仪表盘' },
  { value: 'radar', label: '雷达图' },
  { value: 'scatter', label: '散点图' },
  { value: 'sankey', label: '桑基图' },
  { value: 'treemap', label: '矩形树图' },
  { value: 'sunburst', label: '旭日图' },
  { value: 'waterfall', label: '瀑布图' },
  { value: 'heatmap', label: '热力图' },
  { value: 'matrix', label: '矩阵图' },
  { value: 'table', label: '表格' },
];

const SOURCES = [
  { value: 'work_items', label: '工作项' },
  { value: 'activities', label: '活动流' },
  { value: 'comments', label: '评论' },
];

const DIMENSION_FIELDS = [
  { value: 'type', label: '类型' },
  { value: 'status', label: '状态' },
  { value: 'priority', label: '优先级' },
  { value: 'severity', label: '严重程度' },
  { value: 'assignee', label: '负责人' },
  { value: 'reporter', label: '创建人' },
  { value: 'module', label: '模块' },
  { value: 'iteration', label: '迭代' },
  { value: 'labels', label: '标签' },
];

const MEASURE_FIELDS = [
  { value: 'id', label: '计数 (count)' },
  { value: 'estimate', label: '估分' },
  { value: 'actualHours', label: '实际工时' },
  { value: 'storyPoints', label: '故事点' },
];

const AGGREGATIONS = [
  { value: 'count', label: '计数' },
  { value: 'countDistinct', label: '去重计数' },
  { value: 'sum', label: '求和' },
  { value: 'avg', label: '平均' },
  { value: 'max', label: '最大' },
  { value: 'min', label: '最小' },
];

// 容错: 后端 computeChartData 已 JSON.parse 过 (返回对象), 但 DB/直接返回的可能是字符串
function parseJsonField(v: any, fallback: any = null): any {
  if (v == null) return fallback;
  if (typeof v === 'string') {
    try { return JSON.parse(v); } catch { return fallback; }
  }
  return v;
}

export function ChartEditorPage() {
  const { id } = useParams<{ id: string }>();
  const [params] = useSearchParams();
  const dashboardId = params.get('dashboardId');
  const navigate = useNavigate();
  const [dashboards, setDashboards] = useState<Dashboard[]>([]);
  const [chart, setChart] = useState<ChartConfig | null>(null);
  const [form] = Form.useForm();
  const [preview, setPreview] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    dashboardApi.list().then(setDashboards);
    if (id && id !== 'new') {
      chartApi.get(id).then(c => {
        setChart(c);
        const dims = parseJsonField(c.dimensions, []);
        const meas = parseJsonField(c.measures, []);
        const opts = parseJsonField(c.options, {});
        form.setFieldsValue({
          name: c.name,
          chartType: c.chartType,
          source: c.source,
          dashboardId: c.dashboardId,
          dimension: dims[0]?.field,
          dimensionAlias: dims[0]?.alias,
          measure: meas[0]?.field,
          measureAgg: meas[0]?.aggregation,
          measureAlias: meas[0]?.alias,
          title: opts.title,
        });
        handlePreview(form.getFieldsValue());
      });
    } else {
      form.setFieldsValue({ chartType: 'bar', source: 'work_items', measure: 'id', measureAgg: 'count', dashboardId });
    }
  }, [id]);

  const handlePreview = async (values?: any) => {
    const v = values || await form.validateFields();
    const config = {
      name: v.name || '预览',
      chartType: v.chartType,
      source: v.source,
      dimensions: JSON.stringify([{ field: v.dimension, alias: v.dimensionAlias || v.dimension }]),
      measures: JSON.stringify([{ field: v.measure, aggregation: v.measureAgg, alias: v.measureAlias || v.measureAgg }]),
      options: JSON.stringify({ title: v.title }),
    };
    setLoading(true);
    try {
      const data = await chartApi.preview(config);
      setPreview(data);
    } catch (e: any) {
      message.error('预览失败：' + e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      const v = await form.validateFields();
      const payload = {
        name: v.name,
        chartType: v.chartType,
        source: v.source,
        dashboardId: v.dashboardId || null,
        dimensions: JSON.stringify([{ field: v.dimension, alias: v.dimensionAlias || v.dimension }]),
        measures: JSON.stringify([{ field: v.measure, aggregation: v.measureAgg, alias: v.measureAlias || v.measureAgg }]),
        filters: '[]',
        options: JSON.stringify({ title: v.title }),
        position: 0,
      };
      if (id && id !== 'new') {
        await chartApi.update(id, payload);
        message.success('已更新');
      } else {
        const created = await chartApi.create(payload);
        message.success('已创建');
        navigate(`/charts/${created.id}`);
        return;
      }
      if (v.dashboardId) {
        navigate(`/dashboards/${v.dashboardId}`);
      }
    } catch (e: any) {
      if (e.errorFields) return;
      message.error('保存失败：' + e.message);
    }
  };

  const option = preview ? buildEChartsOption(form.getFieldValue('chartType'), preview, parseJsonField(preview.chart?.options, {})) : null;

  return (
    <div>
      <Card style={{ marginBottom: 12 }} styles={{ body: { padding: 12 } }}>
        <Space>
          <Button icon={<ArrowLeftOutlined />} onClick={() => navigate(-1)}>返回</Button>
          <span style={{ fontSize: 16, fontWeight: 500 }}>
            {id && id !== 'new' ? '编辑图表' : '新建图表'}
          </span>
          <Button icon={<EyeOutlined />} onClick={() => handlePreview()}>预览</Button>
          <Button type="primary" icon={<SaveOutlined />} onClick={handleSave}>保存</Button>
        </Space>
      </Card>

      <Row gutter={12}>
        <Col span={10}>
          <Card title="配置">
            <Form form={form} layout="vertical" onValuesChange={() => handlePreview()}>
              <Form.Item label="图表名称" name="name" rules={[{ required: true }]}>
                <Input placeholder="如：状态分布" />
              </Form.Item>
              <Form.Item label="归属仪表盘" name="dashboardId">
                <Select allowClear placeholder="选择仪表盘" options={dashboards.map(d => ({ value: d.id, label: d.name }))} />
              </Form.Item>
              <Form.Item label="图表类型" name="chartType" rules={[{ required: true }]}>
                <Select options={CHART_TYPES} />
              </Form.Item>
              <Form.Item label="数据源" name="source" rules={[{ required: true }]}>
                <Select options={SOURCES} />
              </Form.Item>
              <Divider>维度（X 轴 / 分组）</Divider>
              <Form.Item label="维度字段" name="dimension" rules={[{ required: true }]}>
                <Select options={DIMENSION_FIELDS} placeholder="如：type" />
              </Form.Item>
              <Form.Item label="显示名" name="dimensionAlias">
                <Input placeholder="如：类型" />
              </Form.Item>
              <Divider>指标（Y 轴 / 度量）</Divider>
              <Form.Item label="指标字段" name="measure" rules={[{ required: true }]}>
                <Select options={MEASURE_FIELDS} />
              </Form.Item>
              <Form.Item label="聚合方式" name="measureAgg" rules={[{ required: true }]}>
                <Select options={AGGREGATIONS} />
              </Form.Item>
              <Form.Item label="显示名" name="measureAlias">
                <Input placeholder="如：数量" />
              </Form.Item>
              <Form.Item label="标题" name="title">
                <Input placeholder="可选" />
              </Form.Item>
            </Form>
          </Card>
        </Col>
        <Col span={14}>
          <Card title="实时预览" extra={loading ? '加载中...' : `${preview?.rows?.length || 0} 条数据`}>
            {option ? (
              <EChart option={option} height={500} />
            ) : (
              <Empty description="调整左侧配置查看预览" />
            )}
          </Card>
        </Col>
      </Row>
    </div>
  );
}