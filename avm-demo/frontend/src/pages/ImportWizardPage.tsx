/**
 * V1.17 数据导入向导 (5 步)
 *
 * Step 1: 选资源 (7 类: 客户/车型/项目/工作项/联系人/依赖/用户)
 * Step 2: 上传 (CSV / xlsx / xls, 最多 20MB, 或粘贴 CSV)
 * Step 3: 字段映射 (CSV 列 → 库字段, 智能 autoMap, 手动调整)
 * Step 4: 预览校验 (前 50 行 + 错误高亮)
 * Step 5: 执行导入 (同步执行 + 进度 + 成功/失败统计)
 *
 * 历史记录 Tab: 列出所有 import job, 可看结果
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Card, Steps, Button, Space, Select, Upload, Table, Tag, Alert, Form, App, Statistic, Row, Col,
  Tabs, Radio, Progress, Tooltip, Modal, Empty, Divider, Result, Input,
} from 'antd';
import {
  InboxOutlined, FileTextOutlined, DownloadOutlined, CheckCircleOutlined,
  CloseCircleOutlined, SyncOutlined, ReloadOutlined, ArrowLeftOutlined, ArrowRightOutlined,
  RobotOutlined, ShopOutlined, CarOutlined, ProjectOutlined, ProfileOutlined,
  UserOutlined, TeamOutlined, PartitionOutlined, ImportOutlined, EyeOutlined, ThunderboltOutlined,
  LockOutlined, CalendarOutlined,
} from '@ant-design/icons';
import { importApi, ImportResource, ImportMapping } from '../api';
import { useAuth } from '../AuthContext';

const { Dragger } = Upload;

// 资源图标 + 描述
const RESOURCE_META: Record<string, { icon: JSX.Element; color: string; desc: string }> = {
  customers:     { icon: <ShopOutlined />,       color: '#1677ff', desc: '客户档案 (代码 / 名称 / 联系人)' },
  car_models:    { icon: <CarOutlined />,        color: '#52c41a', desc: '车型库 (品牌 / 系列 / 上市年份)' },
  projects:      { icon: <ProjectOutlined />,    color: '#fa8c16', desc: '项目 (依赖客户 + 车型 code)' },
  work_items:    { icon: <ProfileOutlined />,    color: '#722ed1', desc: '工作项 (需求/任务/缺陷/版本)' },
  contacts:      { icon: <TeamOutlined />,       color: '#13c2c2', desc: '联系人 (依赖客户 code)' },
  dependencies:  { icon: <PartitionOutlined />,  color: '#eb2f96', desc: '外部依赖 (可关联工作项)' },
  users:         { icon: <UserOutlined />,       color: '#f5222d', desc: '系统用户 (需初始密码 ≥ 6 位)' },
  iterations:    { icon: <CalendarOutlined />,   color: '#a0d911', desc: '迭代/版本' },
};

interface PreviewResult {
  columns: string[];
  rows: any[];
  total: number;
  mapping: ImportMapping[];
  resource: string;
  fileName: string;
}

interface ExecuteResult {
  total: number;
  succeeded: number;
  failed: number;
  errors: any[];
}

interface ImportJob {
  id: string;
  name: string;
  resource: string;
  fileName: string;
  status: string;
  total: number;
  processed: number;
  succeeded: number;
  failed: number;
  createdAt: string;
  finishedAt?: string;
  errors?: string;
}

export function ImportWizardPage() {
  const { user: me } = useAuth();
  const { message, modal } = App.useApp();
  const [step, setStep] = useState(0);
  const [resources, setResources] = useState<ImportResource[]>([]);
  const [aliases, setAliases] = useState<Record<string, string[]>>({});
  const [selected, setSelected] = useState<string>('');
  const [uploadMethod, setUploadMethod] = useState<'file' | 'paste'>('file');
  const [pasteText, setPasteText] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [mapping, setMapping] = useState<ImportMapping[]>([]);
  const [editableRows, setEditableRows] = useState<any[]>([]);
  const [executing, setExecuting] = useState(false);
  const [execProgress, setExecProgress] = useState(0);
  const [execResult, setExecResult] = useState<ExecuteResult | null>(null);
  const [jobs, setJobs] = useState<ImportJob[]>([]);
  const [jobDetail, setJobDetail] = useState<ImportJob | null>(null);
  const pollRef = useRef<any>(null);

  const isAdmin = me?.role === 'tenant_admin' || me?.role === 'space_admin';

  // 加载资源 + 别名
  useEffect(() => {
    importApi.resources().then(r => {
      setResources(r.resources);
      setAliases(r.aliases);
    }).catch(e => message.error('加载资源失败: ' + e.message));
  }, []);

  // 加载历史任务
  useEffect(() => {
    if (step === 5 || jobDetail) loadJobs();
  }, [step, jobDetail]);

  const loadJobs = async () => {
    try {
      const list = await importApi.jobs({ limit: 30 });
      setJobs(list);
    } catch {}
  };

  const reset = () => {
    setStep(0);
    setSelected('');
    setFile(null);
    setPasteText('');
    setPreview(null);
    setMapping([]);
    setEditableRows([]);
    setExecuting(false);
    setExecProgress(0);
    setExecResult(null);
  };

  // Step 0 → 1
  const goSelect = () => {
    if (!selected) {
      message.warning('请选择要导入的资源类型');
      return;
    }
    setStep(1);
  };

  // Step 1 → 2 (上传/解析)
  const doPreview = async () => {
    if (uploadMethod === 'file' && !file) {
      message.warning('请选择文件');
      return;
    }
    if (uploadMethod === 'paste' && !pasteText.trim()) {
      message.warning('请粘贴 CSV 内容');
      return;
    }
    try {
      let r: PreviewResult;
      if (uploadMethod === 'file' && file) {
        const fd = new FormData();
        fd.append('file', file);
        fd.append('resource', selected);
        r = await importApi.preview(fd);
      } else {
        r = await importApi.previewJson(selected, pasteText);
      }
      setPreview(r);
      setMapping(r.mapping);
      setEditableRows(r.rows);
      setStep(2);
    } catch (e: any) {
      message.error('解析失败: ' + e.message);
    }
  };

  // 调整单行映射
  const updateMapping = (csvColumn: string, dbField: string) => {
    setMapping(prev => prev.map(m => m.csvColumn === csvColumn ? { ...m, dbField } : m));
  };

  // Step 2 → 3 (校验通过)
  const goMappingDone = () => {
    const used = new Set<string>();
    const duplicates: string[] = [];
    for (const m of mapping) {
      if (!m.dbField) continue;
      if (used.has(m.dbField)) duplicates.push(m.dbField);
      used.add(m.dbField);
    }
    if (duplicates.length > 0) {
      message.error('字段映射重复: ' + duplicates.join(', '));
      return;
    }
    // 检查必填字段
    const requiredFields = resources.find(r => r.key === selected)?.fields.filter(f => f.required).map(f => f.value) || [];
    const mappedFields = mapping.filter(m => m.dbField).map(m => m.dbField);
    const missing = requiredFields.filter(f => !mappedFields.includes(f));
    if (missing.length > 0) {
      message.error('必填字段未映射: ' + missing.join(', '));
      return;
    }
    setStep(3);
  };

  // 校验预览行
  const validatedRows = useMemo(() => {
    if (!preview) return [];
    const fieldDefs = resources.find(r => r.key === selected)?.fields || [];
    const requiredSet = new Set(fieldDefs.filter(f => f.required).map(f => f.value));
    return editableRows.map((row, idx) => {
      const issues: string[] = [];
      const mapped: any = {};
      for (const m of mapping) {
        if (m.dbField) {
          const v = row[m.csvColumn];
          if (requiredSet.has(m.dbField) && (!v || String(v).trim() === '')) {
            issues.push(`缺少必填: ${m.dbField}`);
          }
          mapped[m.dbField] = v;
        }
      }
      return { ...row, _idx: idx, _issues: issues, _ok: issues.length === 0 };
    });
  }, [editableRows, mapping, preview, resources, selected]);

  // Step 3 → 4 (执行)
  const doExecute = async () => {
    setExecuting(true);
    setStep(4);
    setExecProgress(0);
    setExecResult(null);
    try {
      // 模拟进度
      const tick = setInterval(() => setExecProgress(p => Math.min(p + 8, 90)), 200);
      // 客户端只传用户编辑过的行（去 _issues/_ok/_idx）
      const cleanRows = editableRows.map(r => {
        const out: any = {};
        for (const k of Object.keys(r)) if (!k.startsWith('_')) out[k] = r[k];
        return out;
      });
      const resp = await importApi.execute({
        resource: selected,
        mapping,
        data: cleanRows,
        fileName: preview?.fileName || 'inline.csv',
        name: `${RESOURCE_META[selected] ? selected : ''} 导入 ${new Date().toLocaleString('zh-CN')}`,
      });
      clearInterval(tick);
      setExecProgress(100);
      setExecResult(resp.result);
      setExecuting(false);
      message.success(`导入完成: 成功 ${resp.result.succeeded} 条, 失败 ${resp.result.failed} 条`);
      loadJobs();
    } catch (e: any) {
      setExecuting(false);
      message.error('导入失败: ' + e.message);
    }
  };

  // 下载模板
  const downloadTemplate = (resource: string) => {
    window.open(importApi.templateUrl(resource), '_blank');
  };

  const selectedResource = resources.find(r => r.key === selected);

  if (!isAdmin) {
    return (
      <Card>
        <div style={{ textAlign: 'center', padding: 60 }}>
          <LockIcon />
          <div style={{ marginTop: 16, fontSize: 16, color: '#999' }}>
            数据导入需要 space_admin / tenant_admin 权限
          </div>
          <div style={{ marginTop: 8, fontSize: 13, color: '#bbb' }}>
            当前角色: {me?.role || '未登录'}
          </div>
        </div>
      </Card>
    );
  }

  return (
    <div>
      {/* 顶部标题 */}
      <Card style={{ marginBottom: 16 }}>
        <Space style={{ fontSize: 18, fontWeight: 500 }}>
          <ImportOutlined style={{ color: '#1677ff' }} />
          <span>数据导入向导</span>
          <Tag color="blue">V1.17</Tag>
        </Space>
        <div style={{ marginTop: 8, color: '#666', fontSize: 13 }}>
          支持 CSV / Excel (xlsx/xls) / 手动粘贴 — 智能识别 200+ 字段别名, 7 大资源批量导入
        </div>
      </Card>

      <Tabs
        defaultActiveKey="wizard"
        items={[
          {
            key: 'wizard',
            label: <span><ThunderboltOutlined /> 导入向导</span>,
            children: (
              <>
                <Card style={{ marginBottom: 16 }}>
                  <Steps
                    current={step}
                    items={[
                      { title: '选资源', icon: <ShopOutlined /> },
                      { title: '上传文件', icon: <InboxOutlined /> },
                      { title: '字段映射', icon: <RobotOutlined /> },
                      { title: '预览校验', icon: <EyeOutlined /> },
                      { title: '执行导入', icon: <SyncOutlined spin={executing} /> },
                    ]}
                  />
                </Card>

                {/* Step 0: 选资源 */}
                {step === 0 && (
                  <Card title="第 1 步：选择要导入的资源" extra={
                    <Button onClick={reset} icon={<ReloadOutlined />}>重置</Button>
                  }>
                    <Row gutter={[16, 16]}>
                      {resources.map(r => {
                        const meta = RESOURCE_META[r.key] || { icon: <FileTextOutlined />, color: '#666', desc: '' };
                        const isSelected = selected === r.key;
                        return (
                          <Col span={6} key={r.key}>
                            <Card
                              hoverable
                              onClick={() => setSelected(r.key)}
                              style={{
                                borderColor: isSelected ? meta.color : undefined,
                                background: isSelected ? `${meta.color}10` : undefined,
                                transition: 'all 0.2s',
                              }}
                            >
                              <Space>
                                <div style={{
                                  fontSize: 28, color: meta.color,
                                  background: `${meta.color}20`,
                                  width: 56, height: 56, borderRadius: 8,
                                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                                }}>{meta.icon}</div>
                                <div>
                                  <div style={{ fontSize: 16, fontWeight: 500 }}>{r.label}</div>
                                  <div style={{ fontSize: 12, color: '#999', marginTop: 2 }}>{r.fields.length} 个字段</div>
                                </div>
                                {isSelected && <CheckCircleOutlined style={{ color: meta.color, fontSize: 20 }} />}
                              </Space>
                              <div style={{ marginTop: 12, color: '#666', fontSize: 13 }}>{meta.desc}</div>
                              <div style={{ marginTop: 8 }}>
                                {r.fields.slice(0, 4).map(f => (
                                  <Tag key={f.value} color={f.required ? 'red' : 'default'} style={{ fontSize: 11 }}>
                                    {f.label}{f.required && '*'}
                                  </Tag>
                                ))}
                                {r.fields.length > 4 && <Tag style={{ fontSize: 11 }}>+{r.fields.length - 4}</Tag>}
                              </div>
                            </Card>
                          </Col>
                        );
                      })}
                    </Row>
                    <Divider />
                    <div style={{ textAlign: 'right' }}>
                      <Button type="primary" size="large" disabled={!selected} onClick={goSelect}>
                        下一步：上传文件 <ArrowRightOutlined />
                      </Button>
                    </div>
                  </Card>
                )}

                {/* Step 1: 上传 */}
                {step === 1 && selectedResource && (
                  <Card title={`第 2 步：上传 ${selectedResource.label} 数据`} extra={
                    <Button onClick={() => setStep(0)} icon={<ArrowLeftOutlined />}>上一步</Button>
                  }>
                    <Row gutter={16} style={{ marginBottom: 16 }}>
                      <Col span={12}>
                        <Alert
                          message={
                            <Space>
                              <span>推荐流程：</span>
                              <Button size="small" icon={<DownloadOutlined />} onClick={() => downloadTemplate(selected)}>
                                下载 {selectedResource.label} 模板
                              </Button>
                            </Space>
                          }
                          description="模板含示例数据 + 字段说明。编辑后保存为 CSV 或 xlsx 上传。"
                          type="info"
                          showIcon
                        />
                      </Col>
                      <Col span={12}>
                        <Alert
                          message={`必填字段: ${selectedResource.fields.filter(f => f.required).map(f => f.label).join(' / ')}`}
                          type="warning"
                          showIcon
                        />
                      </Col>
                    </Row>

                    <Radio.Group value={uploadMethod} onChange={e => setUploadMethod(e.target.value)} style={{ marginBottom: 16 }}>
                      <Radio.Button value="file">📄 上传文件 (CSV / xlsx / xls)</Radio.Button>
                      <Radio.Button value="paste">📋 粘贴 CSV 文本</Radio.Button>
                    </Radio.Group>

                    {uploadMethod === 'file' ? (
                      <Dragger
                        accept=".csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
                        beforeUpload={(f) => { setFile(f); return false; }}
                        showUploadList={false}
                        maxCount={1}
                        style={{ padding: '20px 0' }}
                      >
                        <p className="ant-upload-drag-icon" style={{ marginBottom: 8 }}>
                          <InboxOutlined style={{ color: '#1677ff' }} />
                        </p>
                        <p className="ant-upload-text">
                          {file ? `已选择: ${file.name} (${(file.size / 1024).toFixed(1)} KB)` : '点击或拖拽文件到此区域上传'}
                        </p>
                        <p className="ant-upload-hint" style={{ fontSize: 12 }}>
                          支持 .csv / .xlsx / .xls，单文件最大 20MB
                        </p>
                      </Dragger>
                    ) : (
                      <Input.TextArea
                        value={pasteText}
                        onChange={e => setPasteText(e.target.value)}
                        placeholder="客户全称,客户编码,简称,类型,行业,主联系人,电话,邮箱&#10;吉利银河 L7 项目组,GEELY-GALAXY-L7,银河L7,internal,整车,张三,13800001111,zs@example.com"
                        rows={10}
                        style={{ fontFamily: 'monospace' }}
                      />
                    )}

                    <Divider />
                    <div style={{ textAlign: 'right' }}>
                      <Space>
                        <Button onClick={() => setStep(0)}>上一步</Button>
                        <Button type="primary" size="large" onClick={doPreview} disabled={uploadMethod === 'file' ? !file : !pasteText.trim()}>
                          解析并预览 <ArrowRightOutlined />
                        </Button>
                      </Space>
                    </div>
                  </Card>
                )}

                {/* Step 2: 字段映射 */}
                {step === 2 && preview && selectedResource && (
                  <Card title={`第 3 步：字段映射 (${preview.columns.length} 列 → ${selectedResource.label})`} extra={
                    <Space>
                      <Tag icon={<RobotOutlined />} color="blue">智能识别 {preview.mapping.filter(m => m.dbField).length} / {preview.mapping.length}</Tag>
                      <Button onClick={() => setStep(1)} icon={<ArrowLeftOutlined />}>上一步</Button>
                    </Space>
                  }>
                    <Alert
                      message="系统已根据 200+ 字段别名 (中英文) 自动匹配，下拉框可手动调整或留空忽略该列"
                      type="success"
                      showIcon
                      style={{ marginBottom: 16 }}
                    />
                    <Table
                      rowKey="csvColumn"
                      dataSource={mapping}
                      pagination={false}
                      size="middle"
                      columns={[
                        {
                          title: 'CSV 列名', dataIndex: 'csvColumn', width: 200,
                          render: (c) => <Tag color="cyan">{c}</Tag>,
                        },
                        {
                          title: '映射到', dataIndex: 'dbField', width: 280,
                          render: (v, r) => (
                            <Select
                              style={{ width: '100%' }}
                              value={v || undefined}
                              allowClear
                              placeholder="(不导入)"
                              onChange={(val) => updateMapping(r.csvColumn, val || '')}
                              options={[
                                ...selectedResource.fields.map(f => ({
                                  value: f.value,
                                  label: (
                                    <span>
                                      {f.label}
                                      {f.required && <span style={{ color: 'red' }}> *</span>}
                                    </span>
                                  ),
                                })),
                                { value: '__SKIP__', label: <span style={{ color: '#999' }}>— 跳过此列 —</span> },
                              ]}
                            />
                          ),
                        },
                        {
                          title: '示例值', width: 240,
                          render: (_, r) => {
                            const row = preview.rows.find(row => row[r.csvColumn] !== undefined);
                            return <span style={{ color: '#666', fontFamily: 'monospace', fontSize: 12 }}>{String(row?.[r.csvColumn] || '').slice(0, 40) || '—'}</span>;
                          },
                        },
                        {
                          title: '智能建议', width: 180,
                          render: (_, r) => {
                            const matched = aliases[r.csvColumn] ? Object.entries(aliases).find(([k, v]) => v.some(a => a.toLowerCase() === r.csvColumn.toLowerCase() || a === r.csvColumn)) : null;
                            if (!matched && !r.dbField) return <span style={{ color: '#bbb', fontSize: 12 }}>未识别</span>;
                            if (matched) return <Tag color="green" style={{ fontSize: 11 }}>≈ {matched[0]}</Tag>;
                            return <Tag color="blue" style={{ fontSize: 11 }}>已映射</Tag>;
                          },
                        },
                      ]}
                    />
                    <Divider />
                    <div style={{ textAlign: 'right' }}>
                      <Space>
                        <Button onClick={() => setStep(1)}>上一步</Button>
                        <Button type="primary" size="large" onClick={goMappingDone}>
                          校验并预览 <ArrowRightOutlined />
                        </Button>
                      </Space>
                    </div>
                  </Card>
                )}

                {/* Step 3: 预览校验 */}
                {step === 3 && preview && (
                  <Card title={`第 4 步：数据预览 (共 ${preview.total} 行, 显示前 50 行)`} extra={
                    <Space>
                      <Tag color="green" icon={<CheckCircleOutlined />}>通过 {validatedRows.filter(r => r._ok).length}</Tag>
                      <Tag color="red" icon={<CloseCircleOutlined />}>异常 {validatedRows.filter(r => !r._ok).length}</Tag>
                      <Button onClick={() => setStep(2)} icon={<ArrowLeftOutlined />}>上一步</Button>
                    </Space>
                  }>
                    {validatedRows.some(r => !r._ok) && (
                      <Alert
                        message={`检测到 ${validatedRows.filter(r => !r._ok).length} 行数据异常, 可继续导入 (失败的行会跳过)`}
                        type="warning"
                        showIcon
                        style={{ marginBottom: 16 }}
                      />
                    )}
                    <Table
                      size="small"
                      dataSource={validatedRows}
                      rowKey="_idx"
                      scroll={{ x: true }}
                      pagination={{ pageSize: 20 }}
                      columns={[
                        ...preview.columns.map(c => ({
                          title: <span><Tag color="cyan" style={{ marginRight: 0 }}>{c}</Tag></span>,
                          dataIndex: c,
                          key: c,
                          width: 140,
                          ellipsis: true,
                        })),
                        {
                          title: '校验', width: 90, fixed: 'right' as const,
                          render: (_, r) => (
                            r._ok
                              ? <Tag color="success" icon={<CheckCircleOutlined />}>OK</Tag>
                              : <Tooltip title={r._issues.join('; ')}><Tag color="error" icon={<CloseCircleOutlined />}>异常</Tag></Tooltip>
                          ),
                        },
                      ]}
                    />
                    <Divider />
                    <div style={{ textAlign: 'right' }}>
                      <Space>
                        <Button onClick={() => setStep(2)}>上一步</Button>
                        <Button type="primary" size="large" danger={validatedRows.some(r => !r._ok)} onClick={doExecute}>
                          确认导入 {editableRows.length} 条 <ArrowRightOutlined />
                        </Button>
                      </Space>
                    </div>
                  </Card>
                )}

                {/* Step 4: 执行 */}
                {step === 4 && (
                  <Card>
                    {executing && (
                      <div style={{ textAlign: 'center', padding: 40 }}>
                        <Progress type="circle" percent={execProgress} />
                        <div style={{ marginTop: 24, fontSize: 16 }}>正在导入 {selectedResource?.label} ...</div>
                        <div style={{ marginTop: 8, color: '#999', fontSize: 13 }}>
                          共 {editableRows.length} 条数据，后台逐条处理
                        </div>
                      </div>
                    )}
                    {!executing && execResult && (
                      <Result
                        status={execResult.failed === 0 ? 'success' : execResult.succeeded === 0 ? 'error' : 'warning'}
                        title={
                          execResult.failed === 0
                            ? `全部导入成功！共 ${execResult.succeeded} 条`
                            : execResult.succeeded === 0
                              ? `导入失败 ${execResult.failed} 条`
                              : `部分成功: ${execResult.succeeded} 成功 / ${execResult.failed} 失败`
                        }
                        subTitle={
                          <Space size="large" style={{ marginTop: 12 }}>
                            <Statistic title="总条数" value={execResult.total} />
                            <Statistic title="成功" value={execResult.succeeded} valueStyle={{ color: '#52c41a' }} />
                            <Statistic title="失败" value={execResult.failed} valueStyle={{ color: '#cf1322' }} />
                          </Space>
                        }
                        extra={[
                          <Button key="reset" onClick={reset} type="primary" icon={<ImportOutlined />}>
                            继续导入
                          </Button>,
                          <Button key="jobs" onClick={() => { reset(); loadJobs(); }}>
                            查看历史任务
                          </Button>,
                        ]}
                      >
                        {execResult.errors.length > 0 && (
                          <Card size="small" title={`失败明细 (${execResult.errors.length})`} style={{ marginTop: 16, textAlign: 'left' }}>
                            <Table
                              size="small"
                              dataSource={execResult.errors.slice(0, 20)}
                              rowKey="row"
                              pagination={false}
                              columns={[
                                { title: '行号', dataIndex: 'row', width: 80, render: (r) => <Tag color="red">#{r + 1}</Tag> },
                                { title: '错误', dataIndex: 'error', render: (e) => <span style={{ color: '#cf1322', fontFamily: 'monospace', fontSize: 12 }}>{e}</span> },
                              ]}
                            />
                          </Card>
                        )}
                      </Result>
                    )}
                  </Card>
                )}
              </>
            ),
          },
          {
            key: 'history',
            label: <span><FileTextOutlined /> 历史任务 ({jobs.length})</span>,
            children: (
              <Card extra={<Button icon={<ReloadOutlined />} onClick={loadJobs}>刷新</Button>}>
                <Table
                  rowKey="id"
                  dataSource={jobs}
                  size="middle"
                  pagination={{ pageSize: 15 }}
                  columns={[
                    { title: '任务名', dataIndex: 'name', render: (n, r) => (
                      <Space>
                        <Tag color={RESOURCE_META[r.resource]?.color || 'default'}>{RESOURCE_META[r.resource]?.icon || null}</Tag>
                        <span>{n}</span>
                      </Space>
                    )},
                    { title: '资源', dataIndex: 'resource', width: 100, render: (k) => <Tag>{k}</Tag> },
                    { title: '文件', dataIndex: 'fileName', width: 180, ellipsis: true },
                    { title: '状态', dataIndex: 'status', width: 110, render: (s) => (
                      <Tag color={s === 'done' ? 'success' : s === 'processing' ? 'processing' : s === 'failed' ? 'error' : 'default'}>
                        {s === 'done' ? '已完成' : s === 'processing' ? '进行中' : s === 'failed' ? '失败' : s}
                      </Tag>
                    )},
                    { title: '总数', dataIndex: 'total', width: 80 },
                    { title: '成功', dataIndex: 'succeeded', width: 80, render: (n) => <span style={{ color: '#52c41a' }}>{n || 0}</span> },
                    { title: '失败', dataIndex: 'failed', width: 80, render: (n) => <span style={{ color: n > 0 ? '#cf1322' : '#999' }}>{n || 0}</span> },
                    { title: '创建', dataIndex: 'createdAt', width: 160, render: (t) => new Date(t).toLocaleString('zh-CN') },
                    { title: '操作', width: 80, render: (_, r) => (
                      <Button size="small" icon={<EyeOutlined />} onClick={async () => {
                        const detail = await importApi.get(r.id);
                        setJobDetail(detail);
                      }}>详情</Button>
                    )},
                  ]}
                />
                {jobs.length === 0 && <Empty description="暂无导入任务" style={{ padding: 40 }} />}
              </Card>
            ),
          },
        ]}
      />

      {/* 任务详情 Modal */}
      <Modal
        title={jobDetail ? `${jobDetail.name} - 详情` : ''}
        open={!!jobDetail}
        onCancel={() => setJobDetail(null)}
        footer={null}
        width={700}
      >
        {jobDetail && (
          <>
            <Row gutter={16} style={{ marginBottom: 16 }}>
              <Col span={6}><Statistic title="总数" value={jobDetail.total} /></Col>
              <Col span={6}><Statistic title="已处理" value={jobDetail.processed || 0} /></Col>
              <Col span={6}><Statistic title="成功" value={jobDetail.succeeded || 0} valueStyle={{ color: '#52c41a' }} /></Col>
              <Col span={6}><Statistic title="失败" value={jobDetail.failed || 0} valueStyle={{ color: '#cf1322' }} /></Col>
            </Row>
            <div style={{ marginBottom: 12 }}>
              <Tag>资源: {jobDetail.resource}</Tag>
              <Tag>文件: {jobDetail.fileName}</Tag>
              <Tag>状态: {jobDetail.status}</Tag>
            </div>
            {jobDetail.errors && jobDetail.errors !== '[]' && (() => {
              try {
                const errs = JSON.parse(jobDetail.errors);
                if (errs.length === 0) return null;
                return (
                  <Card size="small" title={`失败明细 (${errs.length})`}>
                    <Table
                      size="small"
                      dataSource={errs.slice(0, 30)}
                      rowKey="row"
                      pagination={false}
                      columns={[
                        { title: '行', dataIndex: 'row', width: 80 },
                        { title: '错误', dataIndex: 'error' },
                      ]}
                    />
                  </Card>
                );
              } catch { return null; }
            })()}
          </>
        )}
      </Modal>
    </div>
  );
}

function LockIcon() {
  return <LockOutlined style={{ fontSize: 48, color: '#ccc' }} />;
}
