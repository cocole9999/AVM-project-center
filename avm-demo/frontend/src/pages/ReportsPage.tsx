/**
 * V1.20 周报/月报生成器
 *
 * 选时间范围 (周/月/季度/自定义) + 过滤 (按人/项目) → 调接口
 * 后端返回 Markdown → 前端 marked 转 HTML → 美化展示
 * 一键导出: HTML / 打印 PDF / 复制 MD
 */
import { useEffect, useMemo, useState } from 'react';
import {
  Card, Form, Select, DatePicker, Button, Space, Tag, Spin, Empty, message,
  Radio, Tabs, Modal, Statistic, Row, Col, Tooltip, Result,
} from 'antd';
import {
  FileTextOutlined, DownloadOutlined, PrinterOutlined, CopyOutlined,
  ReloadOutlined, CalendarOutlined, CheckCircleOutlined,
  Html5Outlined, FileMarkdownOutlined, RocketOutlined,
  ProjectOutlined, FireOutlined, AlertOutlined, HistoryOutlined,
} from '@ant-design/icons';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import dayjs, { Dayjs } from 'dayjs';
import { aiApi, userApi, projectApi } from '../api';
import { downloadBlob } from '../utils/download';

// 配置 marked — 启用 GFM, 表格/任务列表
marked.setOptions({ gfm: true, breaks: false });

const REPORT_CSS = `
.report-content {
  font-family: -apple-system, BlinkMacSystemFont, 'PingFang SC', 'Microsoft YaHei', sans-serif;
  line-height: 1.7;
  color: #1f1f1f;
  max-width: 960px;
  margin: 0 auto;
  padding: 8px 4px;
}
.report-content h1 { font-size: 28px; font-weight: 600; color: #1677ff; border-bottom: 2px solid #1677ff; padding-bottom: 12px; margin: 24px 0 20px; }
.report-content h2 { font-size: 22px; font-weight: 600; color: #1677ff; margin: 28px 0 14px; padding-left: 12px; border-left: 4px solid #1677ff; }
.report-content h3 { font-size: 18px; font-weight: 600; color: #262626; margin: 20px 0 10px; }
.report-content h4 { font-size: 16px; font-weight: 600; color: #595959; margin: 16px 0 8px; }
.report-content p { margin: 10px 0; }
.report-content blockquote {
  margin: 12px 0; padding: 10px 16px;
  background: #f0f5ff; border-left: 4px solid #1677ff;
  color: #444; border-radius: 4px;
}
.report-content blockquote p { margin: 4px 0; }
.report-content ul, .report-content ol { margin: 10px 0; padding-left: 28px; }
.report-content li { margin: 4px 0; }
.report-content table { width: 100%; border-collapse: collapse; margin: 16px 0; font-size: 14px; }
.report-content th, .report-content td { border: 1px solid #e8e8e8; padding: 8px 12px; text-align: left; }
.report-content th { background: #fafafa; font-weight: 600; color: #262626; }
.report-content tr:nth-child(even) td { background: #fafafa; }
.report-content code { background: #f5f5f5; padding: 2px 6px; border-radius: 3px; font-family: 'Consolas', 'Monaco', monospace; font-size: 13px; color: #d63384; }
.report-content pre { background: #1e1e1e; color: #d4d4d4; padding: 16px; border-radius: 6px; overflow-x: auto; }
.report-content pre code { background: transparent; color: inherit; padding: 0; }
.report-content hr { border: 0; border-top: 1px dashed #d9d9d9; margin: 24px 0; }
.report-content a { color: #1677ff; text-decoration: none; }
.report-content a:hover { text-decoration: underline; }
.report-content strong { font-weight: 600; color: #262626; }
.report-content em { font-style: italic; color: #595959; }
.report-content .emoji { font-size: 1.1em; margin-right: 4px; }
`;

// 把 emoji 前置 — 让 list 看着不那么挤
function enhanceMarkdown(md: string): string {
  return md;
}

interface ReportData {
  ok: boolean;
  period: { start: string; end: string; label: string };
  summary: {
    projectCount: number;
    highRiskCount: number;
    newItemCount: number;
    completedItemCount: number;
    criticalItemCount: number;
    activityCount: number;
  };
  report: string;
  llmModel: string | null;
}

export function ReportsPage() {
  const [form] = Form.useForm();
  const [reportType, setReportType] = useState<'week' | 'month' | 'quarter' | 'custom'>('week');
  const [dateRange, setDateRange] = useState<[Dayjs, Dayjs] | null>(null);
  const [userFilter, setUserFilter] = useState<string | undefined>();
  const [projectFilter, setProjectFilter] = useState<string | undefined>();
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<ReportData | null>(null);
  const [rawMd, setRawMd] = useState<string>('');
  const [renderedHtml, setRenderedHtml] = useState<string>('');
  const [users, setUsers] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);

  useEffect(() => {
    userApi.list().then(setUsers).catch(() => {});
    projectApi.list().then(setProjects).catch(() => {});
  }, []);

  // 渲染 MD → HTML
  useEffect(() => {
    if (rawMd) {
      const html = marked.parse(enhanceMarkdown(rawMd)) as string;
      setRenderedHtml(DOMPurify.sanitize(html));
    }
  }, [rawMd]);

  const generate = async () => {
    setLoading(true);
    try {
      const params: any = { period: reportType };
      if (reportType === 'custom' && dateRange) {
        params.startDate = dateRange[0].toISOString();
        params.endDate = dateRange[1].toISOString();
      }
      if (userFilter) params.user = userFilter;
      if (projectFilter) params.projectCode = projectFilter;
      // 月报/季报 → /monthly-report; 周报 → /weekly-report; 自定义默认周报
      const isLongPeriod = reportType === 'month' || reportType === 'quarter';
      const r = isLongPeriod
        ? await aiApi.monthlyReport(params)
        : await aiApi.weeklyReport(params);
      setData(r);
      setRawMd(r.report);
      message.success(`报告生成完成 ${r.llmModel ? '(AI 润色)' : '(模板)'}`);
    } catch (e: any) {
      message.error('生成失败: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  // 下载 HTML
  const downloadHtml = () => {
    if (!data || !rawMd) return;
    const filename = `AVM-${data.period.label.replace(/[\\/\\s]/g, '_')}-${dayjs().format('YYYYMMDD')}.html`;
    const fullHtml = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<title>${filename}</title>
<style>
  body { background: #f5f5f5; margin: 0; padding: 32px; }
  .container { max-width: 1000px; margin: 0 auto; background: #fff; padding: 48px 64px; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.08); }
  .meta { color: #999; font-size: 13px; margin-bottom: 24px; }
  ${REPORT_CSS}
</style>
</head>
<body>
<div class="container">
  <div class="meta">由 AVM 平台自动生成 · ${dayjs().format('YYYY-MM-DD HH:mm:ss')}</div>
  <div class="report-content">${renderedHtml}</div>
</div>
</body>
</html>`;
    const blob = new Blob([fullHtml], { type: 'text/html;charset=utf-8' });
    downloadBlob(blob, filename);
    message.success('HTML 文件已下载');
  };

  // 下载 MD
  const downloadMd = () => {
    if (!data || !rawMd) return;
    const filename = `AVM-${data.period.label.replace(/[\\/\\s]/g, '_')}-${dayjs().format('YYYYMMDD')}.md`;
    const blob = new Blob([rawMd], { type: 'text/markdown;charset=utf-8' });
    downloadBlob(blob, filename);
    message.success('Markdown 文件已下载');
  };

  // 打印 PDF
  const printPdf = () => {
    if (!data) return;
    const win = window.open('', '_blank');
    if (!win) {
      message.error('请允许弹窗以使用打印功能');
      return;
    }
    win.document.write(`<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<title>AVM 报告 - ${data.period.label}</title>
<style>
  @page { size: A4; margin: 15mm; }
  body { background: #fff; }
  ${REPORT_CSS}
</style>
</head>
<body>
<div class="report-content">${renderedHtml}</div>
<script>
  window.onload = () => {
    setTimeout(() => { window.print(); }, 500);
  };
</script>
</body>
</html>`);
    win.document.close();
  };

  // 复制 MD
  const copyMd = async () => {
    if (!rawMd) return;
    try {
      await navigator.clipboard.writeText(rawMd);
      message.success('Markdown 已复制到剪贴板');
    } catch {
      message.error('复制失败，请检查浏览器权限');
    }
  };

  return (
    <div>
      <Card style={{ marginBottom: 16 }}>
        <Space style={{ fontSize: 18, fontWeight: 500 }}>
          <FileTextOutlined style={{ color: '#1677ff' }} />
          <span>周报 / 月报生成</span>
          <Tag color="blue">V1.20</Tag>
        </Space>
        <div style={{ marginTop: 8, color: '#666', fontSize: 13 }}>
          基于项目真实数据自动汇总 (项目/工作项/活动)，支持 AI 润色。HTML 格式化显示 + 一键下载/打印。
        </div>
      </Card>

      <Card style={{ marginBottom: 16 }}>
        <Form form={form} layout="inline">
          <Form.Item label="报告类型" required>
            <Radio.Group value={reportType} onChange={e => setReportType(e.target.value)}>
              <Radio.Button value="week"><CalendarOutlined /> 周报</Radio.Button>
              <Radio.Button value="month"><HistoryOutlined /> 月报</Radio.Button>
              <Radio.Button value="quarter"><HistoryOutlined /> 季报</Radio.Button>
              <Radio.Button value="custom"><CalendarOutlined /> 自定义</Radio.Button>
            </Radio.Group>
          </Form.Item>
          {reportType === 'custom' && (
            <Form.Item label="时间范围">
              <DatePicker.RangePicker
                value={dateRange as any}
                onChange={(d) => setDateRange(d as any)}
              />
            </Form.Item>
          )}
          <Form.Item label="按人">
            <Select
              placeholder="全部"
              allowClear
              style={{ width: 140 }}
              value={userFilter}
              onChange={setUserFilter}
              showSearch
              optionFilterProp="label"
              options={users.map(u => ({ value: u.username, label: `${u.displayName} (${u.username})` }))}
            />
          </Form.Item>
          <Form.Item label="按项目">
            <Select
              placeholder="全部"
              allowClear
              style={{ width: 200 }}
              value={projectFilter}
              onChange={setProjectFilter}
              showSearch
              optionFilterProp="label"
              options={projects.map(p => ({ value: p.code, label: `${p.code} ${p.name}` }))}
            />
          </Form.Item>
          <Form.Item>
            <Button type="primary" icon={<RocketOutlined />} onClick={generate} loading={loading} size="large">
              生成报告
            </Button>
          </Form.Item>
        </Form>
      </Card>

      {loading && (
        <Card>
          <div style={{ textAlign: 'center', padding: 40 }}>
            <Spin size="large" />
            <div style={{ marginTop: 16, color: '#666' }}>正在汇总项目数据...</div>
          </div>
        </Card>
      )}

      {!loading && data && (
        <>
          {/* 摘要卡片 */}
          <Row gutter={12} style={{ marginBottom: 16 }}>
            <Col span={4}>
              <Card size="small">
                <Statistic
                  title="项目总数"
                  value={data.summary.projectCount}
                  prefix={<ProjectOutlined style={{ color: '#1677ff' }} />}
                />
              </Card>
            </Col>
            <Col span={4}>
              <Card size="small">
                <Statistic
                  title="高风险项目"
                  value={data.summary.highRiskCount}
                  prefix={<FireOutlined style={{ color: '#ff4d4f' }} />}
                  valueStyle={{ color: data.summary.highRiskCount > 0 ? '#ff4d4f' : '#999' }}
                />
              </Card>
            </Col>
            <Col span={4}>
              <Card size="small">
                <Statistic
                  title="新增工作项"
                  value={data.summary.newItemCount}
                  prefix={<CheckCircleOutlined style={{ color: '#52c41a' }} />}
                  valueStyle={{ color: '#52c41a' }}
                />
              </Card>
            </Col>
            <Col span={4}>
              <Card size="small">
                <Statistic
                  title="完成工作项"
                  value={data.summary.completedItemCount}
                  prefix={<CheckCircleOutlined style={{ color: '#52c41a' }} />}
                  valueStyle={{ color: data.summary.completedItemCount > 0 ? '#52c41a' : '#999' }}
                />
              </Card>
            </Col>
            <Col span={4}>
              <Card size="small">
                <Statistic
                  title="P0/P1 紧急"
                  value={data.summary.criticalItemCount}
                  prefix={<AlertOutlined style={{ color: '#faad14' }} />}
                  valueStyle={{ color: data.summary.criticalItemCount > 0 ? '#faad14' : '#999' }}
                />
              </Card>
            </Col>
            <Col span={4}>
              <Card size="small">
                <Statistic
                  title="团队活动"
                  value={data.summary.activityCount}
                  prefix={<HistoryOutlined />}
                />
              </Card>
            </Col>
          </Row>

          <Card
            title={
              <Space>
                <FileTextOutlined />
                <span>{data.period.label} 报告</span>
                {data.llmModel && <Tag color="purple">AI 润色 ({data.llmModel})</Tag>}
                {!data.llmModel && <Tag>模板生成</Tag>}
              </Space>
            }
            extra={
              <Space>
                <Tooltip title="复制 Markdown 文本">
                  <Button icon={<CopyOutlined />} onClick={copyMd}>复制 MD</Button>
                </Tooltip>
                <Tooltip title="下载 .md 源文件">
                  <Button icon={<FileMarkdownOutlined />} onClick={downloadMd}>下载 MD</Button>
                </Tooltip>
                <Tooltip title="下载 .html 文件, 可在浏览器中查看">
                  <Button icon={<Html5Outlined />} onClick={downloadHtml}>下载 HTML</Button>
                </Tooltip>
                <Tooltip title="打开浏览器打印对话框, 可保存为 PDF">
                  <Button type="primary" icon={<PrinterOutlined />} onClick={printPdf}>打印 PDF</Button>
                </Tooltip>
                <Button icon={<ReloadOutlined />} onClick={generate}>重新生成</Button>
              </Space>
            }
          >
            <Tabs
              defaultActiveKey="preview"
              items={[
                {
                  key: 'preview',
                  label: <span><Html5Outlined /> HTML 预览</span>,
                  children: (
                    <div className="report-content" dangerouslySetInnerHTML={{ __html: renderedHtml }} style={reportContentStyle} />
                  ),
                },
                {
                  key: 'md',
                  label: <span><FileMarkdownOutlined /> Markdown 源</span>,
                  children: (
                    <pre style={{
                      background: '#fafafa', padding: 16, borderRadius: 6,
                      maxHeight: 600, overflow: 'auto', fontSize: 13, lineHeight: 1.6,
                      fontFamily: 'Consolas, Monaco, monospace',
                    }}>{rawMd}</pre>
                  ),
                },
              ]}
            />
          </Card>
        </>
      )}

      {!loading && !data && (
        <Card>
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={
              <div>
                <div style={{ marginBottom: 8 }}>选择时间范围和过滤条件, 点击「生成报告」开始</div>
                <div style={{ fontSize: 12, color: '#999' }}>
                  报告包含: 项目健康度 / 新增工作项 / 完成工作项 / 紧急待办 / 高风险项目 / 团队活动
                </div>
              </div>
            }
          />
        </Card>
      )}
    </div>
  );
}

const reportContentStyle: React.CSSProperties = {
  fontFamily: '-apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif',
  lineHeight: 1.7,
  color: '#1f1f1f',
  maxWidth: 960,
  margin: '0 auto',
  padding: '8px 4px',
};
