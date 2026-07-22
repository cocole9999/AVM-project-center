import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  Card, Descriptions, Tag, Avatar, Space, Button, Select, Input, DatePicker, Checkbox,
  Tabs, message, Modal, Empty, Timeline, Tooltip, Form, Spin, Progress, Divider, Upload,
  Row, Col, Statistic, Alert, App, Drawer,
} from 'antd';
import {
  ArrowLeftOutlined, EditOutlined, SaveOutlined, CloseOutlined, PlusOutlined,
  DeleteOutlined, UserOutlined, LinkOutlined, CommentOutlined, HistoryOutlined, CopyOutlined,
  FlagOutlined, FieldTimeOutlined, BranchesOutlined, RobotOutlined, FireOutlined,
  ProjectOutlined, BankOutlined, CarOutlined, ToolOutlined, CheckCircleOutlined, ClockCircleOutlined, WarningOutlined, AuditOutlined, ReloadOutlined, PictureOutlined, UploadOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { workItemApi, commentApi, activityApi, metaApi, aiApi, flowApi, dependencyApi, mentionApi, auditApi, uploadApi } from '../api';
import type { WorkItem, WorkItemType, MetaOptions, Activity } from '../types';
import { PRIORITY_COLOR, STATUS_COLOR, TYPE_COLOR, TYPE_LABEL } from '../types';
import { WorkloadTrend } from '../components/WorkloadTrend';
import { DependencyGraph } from '../components/DependencyGraph';

export function WorkItemDetailPage() {
  const { id, type } = useParams<{ id: string; type: WorkItemType }>();
  const navigate = useNavigate();
  const [item, setItem] = useState<WorkItem | null>(null);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [options, setOptions] = useState<MetaOptions | null>(null);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState(false);
  const [commentText, setCommentText] = useState('');
  const [mentionOpts, setMentionOpts] = useState<Array<{ value: string; label: any; data: any }>>([]);
  // V1.21: AI 拆解状态
  const [decomposeData, setDecomposeData] = useState<{ ok: boolean; llmModel: string | null; parent: any; subtasks: any[]; note?: string } | null>(null);
  const [decomposeSelected, setDecomposeSelected] = useState<number[]>([]);
  const [creatingSubtasks, setCreatingSubtasks] = useState(false);
  const [form] = Form.useForm();

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const data = await workItemApi.get(id);
      setItem(data);
      form.setFieldsValue({
        title: data.title,
        description: data.description,
        status: data.status,
        priority: data.priority,
        severity: data.severity,
        assignee: data.assignee,
        module: data.module,
        estimate: data.estimate,
        actualHours: data.actualHours,
        planRange: data.planStart && data.planEnd ? [dayjs(data.planStart), dayjs(data.planEnd)] : null,
        labels: data.labels,
      });
      const acts = await activityApi.list(id);
      setActivities(acts);
    } catch (e: any) {
      message.error('加载失败：' + e.message);
    } finally {
      setLoading(false);
    }
  }, [id, form]);

  useEffect(() => {
    load();
    metaApi.options().then(setOptions);
  }, [load]);

  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      await workItemApi.update(id!, {
        title: values.title,
        description: values.description,
        status: values.status,
        priority: values.priority,
        severity: values.severity || null,
        assignee: values.assignee,
        module: values.module,
        estimate: values.estimate,
        actualHours: values.actualHours,
        planStart: values.planRange?.[0]?.toISOString(),
        planEnd: values.planRange?.[1]?.toISOString(),
        labels: values.labels || '',
        actor: '我',
      });
      message.success('保存成功');
      setEditing(false);
      load();
    } catch (e: any) {
      if (e.errorFields) return;
      message.error('保存失败：' + (e.message || ''));
    }
  };

  // V1.23: 评论图片附件
  const [commentImage, setCommentImage] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);

  const handleImageUpload = async (file: File) => {
    setUploadingImage(true);
    try {
      const r = await uploadApi.upload(file);
      setCommentImage(r.url);
      message.success(`图片已上传 (${(r.size / 1024).toFixed(1)} KB)`);
    } catch (e: any) {
      message.error('上传失败: ' + e.message);
    } finally {
      setUploadingImage(false);
    }
    return false;  // 阻止 antd Upload 自动上传
  };

  const handleAddComment = async () => {
    if (!commentText.trim() && !commentImage) {
      message.warning('请输入评论内容或上传图片');
      return;
    }
    if (!id) return;
    const res: any = await commentApi.create(id, commentText.trim(), '我', commentImage || undefined);
    setCommentText('');
    setCommentImage(null);
    if (res?.mentionCount > 0) {
      message.success(`✓ 评论已添加 (提及 ${res.mentionCount} 人，已发送通知)`);
    } else {
      message.success('评论已添加');
    }
    load();
  };

  // 搜索 @ 联想
  const handleMentionSearch = async (q: string) => {
    if (q === undefined || q === null) {
      // @ 刚输入, 弹出最近用户
      try {
        const list = await mentionApi.search('');
        setMentionOpts(list.map(u => ({ value: u.displayName, label: u.mentionText, data: u })));
      } catch { setMentionOpts([]); }
      return;
    }
    try {
      const list = await mentionApi.search(q);
      setMentionOpts(list.map(u => ({ value: u.displayName, label: u.mentionText, data: u })));
    } catch { setMentionOpts([]); }
  };

  // 渲染评论内容: 高亮 @提及
  const renderCommentContent = (content: string) => {
    if (!content) return null;
    const parts: any[] = [];
    const re = /@["']?([\u4e00-\u9fa5\w\s（）()\.\-]+?)["']?(?=\s|$|[,，。.!？?；;:\n])/g;
    let last = 0;
    let m;
    while ((m = re.exec(content)) !== null) {
      if (m.index > last) {
        parts.push(content.slice(last, m.index));
      }
      parts.push(
        <Tag key={`m-${m.index}`} color="blue" style={{ margin: 0, padding: '0 6px' }}>{m[0]}</Tag>
      );
      last = m.index + m[0].length;
    }
    if (last < content.length) parts.push(content.slice(last));
    return <span style={{ whiteSpace: 'pre-wrap' }}>{parts}</span>;
  };

  // V1.19: 复制工作项 — 复用标题/描述/优先级/估分/模块/客户/车型等，状态重置为待处理
  const handleCopy = async () => {
    if (!item) return;
    try {
      const newItem = await workItemApi.create({
        type: item.type,
        title: `${item.title} (副本)`,
        description: item.description || '',
        priority: item.priority,
        assignee: item.assignee || undefined,
        reporter: '我',
        module: item.module || undefined,
        estimate: item.estimate || undefined,
        // 不复制状态/计划时间 — 让 PM 重新设置
      });
      message.success(`已复制为 ${newItem.key}: ${newItem.title}`);
      navigate(`/work-items/${newItem.type}/${newItem.id}`);
    } catch (e: any) {
      message.error('复制失败: ' + e.message);
    }
  };

  const handleDelete = async () => {
    Modal.confirm({
      title: '确认删除',
      content: `${item?.key} 将被永久删除`,
      okType: 'danger',
      onOk: async () => {
        await workItemApi.delete(id!);
        message.success('已删除');
        navigate(`/work-items/${type}`);
      },
    });
  };

  const handleStatusChange = async (newStatus: string) => {
    await workItemApi.update(id!, { status: newStatus, actor: '我' });
    message.success(`已流转到 ${newStatus}`);
    load();
  };

  // V1.21: inline 改字段 (顶部直接改, 不进 edit 模式)
  // V1.22: 自动加评论 (团队透明, 知道谁改了什么)
  const handleInlineUpdate = async (field: 'status' | 'priority' | 'assignee' | 'iterationId' | 'module', value: any) => {
    if (!item) return;
    const oldValue = (item as any)[field];
    if (oldValue === value) return;  // 没变
    const fieldName = field === 'status' ? '状态' : field === 'priority' ? '优先级' : field === 'assignee' ? '负责人' : field === 'iterationId' ? '迭代' : '模块';
    try {
      await workItemApi.update(id!, { [field]: value, actor: '我' });
      message.success(`${fieldName} 已更新`);
      // 自动评论 (V1.22 协作透明)
      try {
        await commentApi.create(
          id!,
          `🔄 **${fieldName}变更**: \`${oldValue || '(空)'}\` → \`${value || '(空)'}\``,
          '系统',
        );
      } catch { /* 静默 */ }
      load();
    } catch (e: any) {
      message.error('更新失败: ' + e.message);
    }
  };

  // 流程引擎：通过流程流转（V1.1）
  const handleFlowTransition = async (toNodeId: string, nodeName: string) => {
    try {
      await flowApi.transition(id!, toNodeId, '我');
      message.success(`已流转到「${nodeName}」`);
      load();
    } catch (e: any) {
      message.error('流转失败：' + e.message);
    }
  };

  const handleAIEstimate = async () => {
    try {
      const r = await aiApi.suggestEstimate({
        type: item.type,
        title: item.title,
        description: item.description,
        module: item.module,
      });
      Modal.confirm({
        title: 'AI 估分建议',
        content: (
          <div>
            <p>建议估分：<b style={{ color: '#1677ff', fontSize: 18 }}>{r.estimate} SP</b></p>
            <p>置信度：{Math.round(r.confidence * 100)}%</p>
            <p style={{ color: '#666' }}>{r.reason}</p>
          </div>
        ),
        onOk: async () => {
          await workItemApi.update(id!, { estimate: r.estimate, actor: '我' });
          message.success('已应用');
          load();
        },
      });
    } catch (e: any) {
      message.error('AI 估分失败：' + e.message);
    }
  };

  // V1.21: AI 拆子任务
  const handleAIDecompose = async () => {
    try {
      setLoading(true);
      const r = await aiApi.decompose(id!);
      setLoading(false);
      setDecomposeData(r);
      setDecomposeSelected(r.subtasks.map((_: any, i: number) => i));  // 默认全选
    } catch (e: any) {
      setLoading(false);
      message.error('AI 拆解失败: ' + e.message);
    }
  };

  const handleAIRisk = async () => {
    try {
      const r = await aiApi.assessRisk(id!);
      Modal.info({
        title: 'AI 风险评估',
        width: 500,
        content: (
          <div>
            <div style={{ marginBottom: 12 }}>
              风险等级：<Tag color={r.level === 'high' ? 'red' : r.level === 'medium' ? 'orange' : 'green'}>
                {r.level === 'high' ? '高' : r.level === 'medium' ? '中' : '低'}
              </Tag>
              <span style={{ marginLeft: 8 }}>风险分：{r.score}</span>
            </div>
            {r.risks.length === 0 ? <p style={{ color: '#999' }}>无明显风险</p> : (
              <Space direction="vertical" style={{ width: '100%' }}>
                {r.risks.map((rk: any, i: number) => (
                  <Alert
                    key={i}
                    type={rk.level === 'high' ? 'error' : rk.level === 'medium' ? 'warning' : 'info'}
                    message={<><Tag>{rk.type}</Tag>{rk.description}</>}
                    showIcon
                  />
                ))}
              </Space>
            )}
          </div>
        ),
      });
    } catch (e: any) {
      message.error('AI 风险评估失败：' + e.message);
    }
  };

  // 获取可用的流转
  const [transitions, setTransitions] = useState<Array<{ transition: any; node: any }>>([]);
  useEffect(() => {
    if (!id) return;
    flowApi.getAvailableTransitions(id).then(setTransitions).catch(() => setTransitions([]));
  }, [id, item?.currentNodeId]);

  const handleAddRelation = async () => {
    const targetKey = window.prompt('输入要关联的工作项编号（如 REQ-2）');
    if (!targetKey) return;
    try {
      const targetList = await workItemApi.list({});
      const target = targetList.find(i => i.key === targetKey);
      if (!target) {
        message.error(`未找到编号 ${targetKey}`);
        return;
      }
      if (target.id === id) {
        message.error('不能关联自己');
        return;
      }
      await workItemApi.addRelation(id!, target.id, '关联');
      message.success('已添加关联');
      load();
    } catch (e: any) {
      message.error('添加失败：' + e.message);
    }
  };

  if (loading || !item) {
    return <Card loading={!item && !loading}><Empty /></Card>;
  }

  const statusList = options?.statusByType[item.type]?.values || [];
  const isOverdue = item.planEnd && dayjs().isAfter(dayjs(item.planEnd)) && !['已完成', '已关闭', '已驳回', '已发布', '已验收'].includes(item.status);

  return (
    <div>
      <Card style={{ marginBottom: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
          <Space wrap>
            <Button icon={<ArrowLeftOutlined />} onClick={() => navigate(`/work-items/${type}`)}>返回</Button>
            <Tag color={TYPE_COLOR[item.type]} style={{ fontSize: 14, padding: '2px 10px' }}>{item.key}</Tag>

            {/* V1.21: 状态 inline 改 — 点击下拉切换 */}
            <Select
              size="small"
              value={item.status}
              onChange={(v) => handleInlineUpdate('status', v)}
              style={{ minWidth: 110 }}
              variant="borderless"
              options={statusList.map(s => ({ value: s, label: <Tag color={STATUS_COLOR[s]} style={{ margin: 0, fontSize: 13, padding: '2px 10px' }}>{s}</Tag> }))}
            />

            {/* V1.21: 优先级 inline 改 */}
            <Select
              size="small"
              value={item.priority}
              onChange={(v) => handleInlineUpdate('priority', v)}
              style={{ minWidth: 70 }}
              variant="borderless"
              options={['P0', 'P1', 'P2', 'P3'].map(p => ({ value: p, label: <Tag color={PRIORITY_COLOR[p]} style={{ margin: 0, fontSize: 13, padding: '2px 10px' }}>{p}</Tag> }))}
            />

            {/* V1.21: 负责人 inline 改 */}
            <Select
              size="small"
              value={item.assignee || undefined}
              onChange={(v) => handleInlineUpdate('assignee', v || null)}
              placeholder="未指派"
              allowClear
              style={{ minWidth: 120 }}
              variant="borderless"
              showSearch
              optionFilterProp="label"
              options={[
                ...(options?.assignees || []).map((u: string) => ({ value: u, label: <span><Avatar size="small" style={{ background: '#1677ff', fontSize: 11, marginRight: 4 }}>{u[0]}</Avatar>{u}</span> })),
                ...(item.assignee && !(options?.assignees || []).includes(item.assignee) ? [{ value: item.assignee, label: <span><Avatar size="small" style={{ background: '#1677ff', fontSize: 11, marginRight: 4 }}>{item.assignee[0]}</Avatar>{item.assignee}</span> }] : []),
              ]}
            />

            {isOverdue && <Tag color="red">超期</Tag>}
          </Space>
          <Space>
            {editing ? (
              <>
                <Button icon={<CloseOutlined />} onClick={() => { setEditing(false); load(); }}>取消</Button>
                <Button type="primary" icon={<SaveOutlined />} onClick={handleSave}>保存</Button>
              </>
            ) : (
              <>
                {(item.type === 'requirement' || item.type === 'task') && (
                  <Button icon={<RobotOutlined />} onClick={handleAIEstimate}>AI 估分</Button>
                )}
                <Button icon={<FireOutlined />} onClick={handleAIRisk}>AI 风险</Button>
                <Button icon={<BranchesOutlined />} onClick={handleAIDecompose} title="AI 自动拆成 3-8 个可执行子任务">AI 拆解</Button>
                <Button icon={<EditOutlined />} onClick={() => setEditing(true)}>编辑</Button>
                <Button icon={<CopyOutlined />} onClick={handleCopy} title="基于此工作项快速创建相似任务">复制</Button>
                <Button danger icon={<DeleteOutlined />} onClick={handleDelete}>删除</Button>
              </>
            )}
          </Space>
        </div>

        <Form form={form} layout="vertical" component={false}>
          <Form.Item name="title" style={{ marginBottom: 16 }}>
            {editing ? (
              <Input size="large" style={{ fontSize: 18, fontWeight: 500 }} />
            ) : (
              <h2 style={{ margin: 0 }}>{item.title}</h2>
            )}
          </Form.Item>

          <Descriptions column={3} size="small" bordered>
            <Descriptions.Item label={<><UserOutlined /> 负责人</>}>
              {editing ? (
                <Form.Item name="assignee" noStyle>
                  <Select allowClear style={{ width: '100%' }} placeholder="选择负责人" options={['张三', '李四', '王五', '赵六', '钱七', '孙八', '周九'].map(p => ({ value: p }))} />
                </Form.Item>
              ) : item.assignee ? <Space size={4}><Avatar size="small" style={{ background: '#1677ff' }}>{item.assignee[0]}</Avatar>{item.assignee}</Space> : <span style={{ color: '#ccc' }}>未指派</span>}
            </Descriptions.Item>
            <Descriptions.Item label={<><FlagOutlined /> 优先级</>}>
              {editing ? (
                <Form.Item name="priority" noStyle>
                  <Select options={['P0', 'P1', 'P2', 'P3'].map(p => ({ value: p, label: <Tag color={PRIORITY_COLOR[p]}>{p}</Tag> }))} />
                </Form.Item>
              ) : <Tag color={PRIORITY_COLOR[item.priority]}>{item.priority}</Tag>}
            </Descriptions.Item>
            {item.type === 'bug' && (
              <Descriptions.Item label="严重程度">
                {editing ? (
                  <Form.Item name="severity" noStyle>
                    <Select allowClear options={['S0', 'S1', 'S2', 'S3'].map(s => ({ value: s }))} />
                  </Form.Item>
                ) : item.severity ? <Tag color={item.severity === 'S0' ? 'red' : item.severity === 'S1' ? 'orange' : 'gold'}>{item.severity}</Tag> : <span style={{ color: '#ccc' }}>-</span>}
              </Descriptions.Item>
            )}
            <Descriptions.Item label="所属模块">
              {editing ? (
                <Form.Item name="module" noStyle>
                  <Input placeholder="如：登录模块" />
                </Form.Item>
              ) : item.module || <span style={{ color: '#ccc' }}>-</span>}
            </Descriptions.Item>
            <Descriptions.Item label={<><BranchesOutlined /> 状态</>}>
              {editing ? (
                <Form.Item name="status" noStyle>
                  <Select options={statusList.map(s => ({ value: s, label: <Tag color={STATUS_COLOR[s]}>{s}</Tag> }))} />
                </Form.Item>
              ) : (
                <Space>
                  <Tag color={STATUS_COLOR[item.status]}>{item.status}</Tag>
                  {!editing && statusList.filter(s => s !== item.status).length > 0 && (
                    <Select
                      size="small"
                      placeholder="流转到..."
                      style={{ width: 120 }}
                      onChange={handleStatusChange}
                      options={statusList.filter(s => s !== item.status).map(s => ({ value: s, label: s }))}
                    />
                  )}
                </Space>
              )}
            </Descriptions.Item>
            <Descriptions.Item label="迭代">
              {item.iteration?.name || <span style={{ color: '#ccc' }}>未分配</span>}
            </Descriptions.Item>
            <Descriptions.Item label={<><ProjectOutlined /> 所属项目</>}>
              {item.project ? (
                <Space size={4}>
                  <Tag color="geekblue">{item.project.code}</Tag>
                  <span>{item.project.name}</span>
                </Space>
              ) : <span style={{ color: '#ccc' }}>未关联</span>}
            </Descriptions.Item>
            <Descriptions.Item label="客户（内部项目组）">
              {item.customer ? <Tag color="blue">{item.customer.name}</Tag> : <span style={{ color: '#ccc' }}>-</span>}
            </Descriptions.Item>
            <Descriptions.Item label="车型">
              {item.carModel ? <Tag color="purple">{item.carModel.brand} {item.carModel.name}</Tag> : <span style={{ color: '#ccc' }}>-</span>}
            </Descriptions.Item>
            <Descriptions.Item label={<><BranchesOutlined /> 流程流转</>} span={3}>
              {transitions.length === 0 ? (
                <span style={{ color: '#ccc', fontSize: 12 }}>无可用流转（当前节点：{item.status}）</span>
              ) : (
                <Space wrap>
                  {transitions.map(t => (
                    <Button
                      key={t.transition.id}
                      size="small"
                      type={t.transition.isDefault ? 'primary' : 'default'}
                      onClick={() => handleFlowTransition(t.node.id, t.node.name)}
                    >
                      {t.transition.label || `→ ${t.node.name}`}
                    </Button>
                  ))}
                </Space>
              )}
            </Descriptions.Item>
            <Descriptions.Item label="估分">
              {editing ? (
                <Form.Item name="estimate" noStyle>
                  <Input type="number" placeholder="故事点" />
                </Form.Item>
              ) : item.estimate != null ? `${item.estimate} SP` : <span style={{ color: '#ccc' }}>-</span>}
            </Descriptions.Item>
            <Descriptions.Item label="实际工时">
              {editing ? (
                <Form.Item name="actualHours" noStyle>
                  <Input type="number" placeholder="小时" />
                </Form.Item>
              ) : item.actualHours != null ? `${item.actualHours} h` : <span style={{ color: '#ccc' }}>-</span>}
            </Descriptions.Item>
            <Descriptions.Item label={<><FieldTimeOutlined /> 计划时间</>} span={3}>
              {editing ? (
                <Form.Item name="planRange" noStyle>
                  <DatePicker.RangePicker />
                </Form.Item>
              ) : item.planStart && item.planEnd ? (
                <Space>
                  <span>{dayjs(item.planStart).format('YYYY-MM-DD')}</span>
                  <span>→</span>
                  <span>{dayjs(item.planEnd).format('YYYY-MM-DD')}</span>
                  <span style={{ color: '#999', fontSize: 12 }}>
                    ({dayjs(item.planEnd).diff(dayjs(item.planStart), 'day') + 1} 天)
                  </span>
                </Space>
              ) : <span style={{ color: '#ccc' }}>未排期</span>}
            </Descriptions.Item>
            <Descriptions.Item label="创建人" span={1}>
              {item.reporter}
            </Descriptions.Item>
            <Descriptions.Item label="创建时间" span={2}>
              {dayjs(item.createdAt).format('YYYY-MM-DD HH:mm')}
            </Descriptions.Item>
            <Descriptions.Item label="标签" span={3}>
              {editing ? (
                <Form.Item name="labels" noStyle>
                  <Input placeholder="多个标签用逗号分隔" />
                </Form.Item>
              ) : item.labels ? item.labels.split(',').map(l => <Tag key={l}>{l}</Tag>) : <span style={{ color: '#ccc' }}>-</span>}
            </Descriptions.Item>
          </Descriptions>
        </Form>
      </Card>

      {/* V1.25: 工作量统计卡片 */}
      <WorkloadStats item={item} />

      {/* V1.28: 工作量趋势图 */}
      <Card size="small" style={{ marginBottom: 12 }} title="📈 工作量趋势 (估分 vs 实际工时)">
        <WorkloadTrend workItemId={item.id} />
      </Card>

      <Tabs
        defaultActiveKey="desc"
        items={[
          {
            key: 'desc',
            label: '描述',
            children: (
              <Card>
                {editing ? (
                  <Form.Item name="description" style={{ marginBottom: 0 }}>
                    <Input.TextArea rows={10} placeholder="支持 Markdown 格式（## 标题、- 列表、**加粗**）" />
                  </Form.Item>
                ) : item.description ? (
                  <MarkdownView content={item.description} />
                ) : (
                  <Empty description="暂无描述" />
                )}
              </Card>
            ),
          },
          {
            key: 'children',
            label: `子工作项 (${item.children?.length || 0})`,
            children: (
              <Card>
                {item.children && item.children.length > 0 ? (
                  <Space direction="vertical" style={{ width: '100%' }} size={8}>
                    {item.children.map(c => (
                      <Link key={c.id} to={`/work-items/${c.type}/${c.id}`} style={{ display: 'block', padding: 8, background: '#fafafa', borderRadius: 6 }}>
                        <Space>
                          <Tag color={TYPE_COLOR[c.type]}>{c.key}</Tag>
                          <span>{c.title}</span>
                          <Tag color={STATUS_COLOR[c.status]}>{c.status}</Tag>
                          {c.assignee && <Tag color="blue">{c.assignee}</Tag>}
                          {c.priority && <Tag color={PRIORITY_COLOR[c.priority]}>{c.priority}</Tag>}
                        </Space>
                      </Link>
                    ))}
                  </Space>
                ) : <Empty description="无子工作项" />}
              </Card>
            ),
          },
          {
            key: 'relations',
            label: `关联 (${(item.relatedFrom?.length || 0) + (item.relatedTo?.length || 0)})`,
            children: (
              <Card extra={<Button size="small" icon={<PlusOutlined />} onClick={handleAddRelation}>添加关联</Button>}>
                {((item.relatedFrom?.length || 0) + (item.relatedTo?.length || 0)) === 0 ? (
                  <Empty description="无关联工作项" />
                ) : (
                  <Space direction="vertical" style={{ width: '100%' }} size={8}>
                    {item.relatedFrom?.map(r => (
                      <div key={r.id} style={{ padding: 8, background: '#fafafa', borderRadius: 6 }}>
                        <Space>
                          <Tag color="cyan">{r.relationType}</Tag>
                          <Link to={`/work-items/${r.to.type}/${r.to.id}`}>
                            <Tag color={TYPE_COLOR[r.to.type]}>{r.to.key}</Tag>{r.to.title}
                          </Link>
                          <Tag color={STATUS_COLOR[r.to.status]}>{r.to.status}</Tag>
                        </Space>
                      </div>
                    ))}
                    {item.relatedTo?.map(r => (
                      <div key={r.id} style={{ padding: 8, background: '#fff7e6', borderRadius: 6 }}>
                        <Space>
                          <Tag color="orange">被{r.relationType}</Tag>
                          <Link to={`/work-items/${r.from.type}/${r.from.id}`}>
                            <Tag color={TYPE_COLOR[r.from.type]}>{r.from.key}</Tag>{r.from.title}
                          </Link>
                          <Tag color={STATUS_COLOR[r.from.status]}>{r.from.status}</Tag>
                        </Space>
                      </div>
                    ))}
                  </Space>
                )}
              </Card>
            ),
          },
          {
            key: 'comments',
            label: <span><CommentOutlined /> 评论 ({item.comments?.length || 0})</span>,
            children: (
              <Card>
                <div style={{ marginBottom: 16 }}>
                  <Input.TextArea
                    rows={3}
                    placeholder="发表评论，输入 @ 触发成员联想... 可粘贴/上传图片 (V1.23)"
                    value={commentText}
                    onChange={e => {
                      const v = e.target.value;
                      setCommentText(v);
                      // 检测刚输入了 @ → 触发联想
                      const cursor = e.target.selectionStart || v.length;
                      const before = v.slice(0, cursor);
                      const atIdx = before.lastIndexOf('@');
                      if (atIdx >= 0) {
                        const query = before.slice(atIdx + 1);
                        // 必须是 @ 后只跟字母/中文（不含空格等）才联想
                        if (query.length <= 12 && !/[\s,，]/.test(query)) {
                          handleMentionSearch(query);
                        }
                      }
                    }}
                    onPaste={async (e) => {
                      // V1.23: 粘贴图片自动上传
                      const items = e.clipboardData?.items;
                      if (!items) return;
                      for (const it of Array.from(items)) {
                        if (it.kind === 'file' && it.type.startsWith('image/')) {
                          const f = it.getAsFile();
                          if (f) {
                            e.preventDefault();
                            await handleImageUpload(f);
                            return;
                          }
                        }
                      }
                    }}
                  />

                  {/* V1.23: 图片附件预览 */}
                  {commentImage && (
                    <div style={{ marginTop: 8, padding: 8, background: '#fafafa', borderRadius: 6, display: 'flex', alignItems: 'center', gap: 12 }}>
                      <img src={commentImage} alt="附件" style={{ maxWidth: 120, maxHeight: 80, borderRadius: 4 }} />
                      <div style={{ flex: 1, fontSize: 12, color: '#666' }}>
                        <div>图片已附加</div>
                        <div style={{ wordBreak: 'break-all' }}>{commentImage}</div>
                      </div>
                      <Button size="small" type="text" onClick={() => setCommentImage(null)}>移除</Button>
                    </div>
                  )}

                  {mentionOpts.length > 0 && commentText.includes('@') && (
                    <div style={{ marginTop: 6, padding: 8, background: '#f0f5ff', borderRadius: 4, fontSize: 12 }}>
                      <div style={{ color: '#999', marginBottom: 4 }}>💡 联想成员（点选直接插入）：</div>
                      <Space wrap>
                        {mentionOpts.slice(0, 8).map(o => (
                          <Tag
                            key={o.data.id}
                            color="processing"
                            style={{ cursor: 'pointer' }}
                            onClick={() => {
                              // 替换最后一个 @xxx 为完整 @displayName
                              const cursor = commentText.length;
                              const before = commentText.slice(0, cursor);
                              const atIdx = before.lastIndexOf('@');
                              if (atIdx >= 0) {
                                const after = commentText.slice(cursor);
                                const inserted = `@${o.data.displayName} `;
                                setCommentText(before.slice(0, atIdx) + inserted + after);
                                setMentionOpts([]);
                              }
                            }}
                          >
                            <Avatar size={14} style={{ background: o.data.avatarColor, marginRight: 4, fontSize: 10 }}>{o.data.displayName[0]}</Avatar>
                            {o.data.displayName}
                            <span style={{ color: '#999', marginLeft: 4, fontSize: 10 }}>@{o.data.username}</span>
                          </Tag>
                        ))}
                      </Space>
                    </div>
                  )}
                  {/* V1.24: 快捷模板 + emoji 选择器 */}
                  <div style={{ marginTop: 8, padding: 8, background: '#fafafa', borderRadius: 6 }}>
                    <Space size={4} wrap>
                      <span style={{ fontSize: 12, color: '#999', marginRight: 4 }}>💡 模板:</span>
                      {['已修复 ✅', '已合并', '等 review', '需要确认', '完成 ~80%'].map(t => (
                        <Tag key={t} style={{ cursor: 'pointer', margin: 0 }} onClick={() => setCommentText(prev => (prev ? prev + ' ' : '') + t)}>
                          {t}
                        </Tag>
                      ))}
                    </Space>
                    <div style={{ marginTop: 6 }}>
                      <Space size={2} wrap>
                        <span style={{ fontSize: 12, color: '#999', marginRight: 4 }}>😀 emoji:</span>
                        {['👍', '❤️', '🎉', '👀', '🚀', '✅', '⚠️', '🔥', '💡', '🤔', '😂', '😢'].map(e => (
                          <span
                            key={e}
                            style={{ cursor: 'pointer', fontSize: 18, padding: '0 4px', borderRadius: 4, userSelect: 'none' }}
                            onClick={() => setCommentText(prev => prev + e)}
                          >{e}</span>
                        ))}
                      </Space>
                    </div>
                  </div>
                  <div style={{ marginTop: 8, textAlign: 'right' }}>
                    <Space>
                      <Upload
                        beforeUpload={handleImageUpload}
                        showUploadList={false}
                        accept="image/*"
                      >
                        <Button icon={<UploadOutlined />} loading={uploadingImage}>
                          上传图片
                        </Button>
                      </Upload>
                      <Button type="primary" onClick={handleAddComment} disabled={!commentText.trim() && !commentImage}>
                        发表评论
                      </Button>
                    </Space>
                  </div>
                </div>
                {item.comments && item.comments.length > 0 ? (
                  <Space direction="vertical" style={{ width: '100%' }} size={12}>
                    {item.comments.map(c => (
                      <div key={c.id} style={{ display: 'flex', gap: 12, padding: 12, background: '#fafafa', borderRadius: 6 }}>
                        <Avatar style={{ background: '#1677ff' }}>{c.author[0]}</Avatar>
                        <div style={{ flex: 1 }}>
                          <div style={{ marginBottom: 4 }}>
                            <b>{c.author}</b>
                            <span style={{ color: '#999', fontSize: 12, marginLeft: 8 }}>
                              {dayjs(c.createdAt).format('MM-DD HH:mm')}
                            </span>
                          </div>
                          <div>{renderCommentContent(c.content)}</div>
                          {/* V1.23: 评论图片附件 */}
                          {c.imageUrl && (
                            <a href={c.imageUrl} target="_blank" rel="noreferrer" style={{ display: 'inline-block', marginTop: 6 }}>
                              <img
                                src={c.imageUrl}
                                alt="评论图片"
                                style={{ maxWidth: 320, maxHeight: 240, borderRadius: 4, border: '1px solid #e8e8e8' }}
                              />
                            </a>
                          )}
                          {/* V1.28: reactions 行 */}
                          <CommentReactions comment={c} currentUser="我" onChange={load} />
                        </div>
                      </div>
                    ))}
                  </Space>
                ) : <Empty description="暂无评论" />}
              </Card>
            ),
          },
          {
            key: 'dependencies',
            label: <span><ToolOutlined /> 外部依赖</span>,
            children: <DependencyTab workItemId={item.id} />,
          },
          {
            key: 'activities',
            label: <span><HistoryOutlined /> 活动</span>,
            children: (
              <Card>
                {activities.length === 0 ? <Empty /> : (
                  <Timeline
                    items={activities.map(a => ({
                      color: a.action === 'created' ? 'green' : a.action === 'status_changed' ? 'blue' : 'gray',
                      children: (
                        <div>
                          <b>{a.actor}</b>{' '}
                          {a.action === 'created' && <>创建了 <Tag>{a.newValue}</Tag></>}
                          {a.action === 'status_changed' && <>将状态从 <Tag>{a.oldValue}</Tag> 改为 <Tag color="blue">{a.newValue}</Tag></>}
                          {a.action === 'field_changed' && <>修改了字段 <Tag>{a.field}</Tag>{a.oldValue && <>从 <Tag>{a.oldValue}</Tag></>}{a.newValue && <>改为 <Tag>{a.newValue}</Tag></>}</>}
                          {a.action === 'commented' && <>发表评论：<span style={{ color: '#666' }}>{a.meta}</span></>}
                          <div style={{ color: '#999', fontSize: 12, marginTop: 4 }}>{dayjs(a.createdAt).format('YYYY-MM-DD HH:mm')}</div>
                        </div>
                      ),
                    }))}
                  />
                )}
              </Card>
            ),
          },
          {
            key: 'history',
            label: <span><AuditOutlined /> 变更历史 (审计)</span>,
            children: <HistoryTab workItemId={item.id} workItemKey={item.key} />,
          },
          {
            key: 'depgraph',
            label: <span><BranchesOutlined /> 依赖图谱</span>,
            children: <Card><DependencyGraph workItemId={item.id} /></Card>,
          },
        ]}
      />

      {/* V1.21: AI 拆解子任务 Modal (移到主组件作用域, 避免之前误写在 DependencyTab 函数内) */}
      <Modal
        title={
          <Space>
            <BranchesOutlined />
            <span>AI 拆解子任务</span>
            {decomposeData?.llmModel && <Tag color="purple">{decomposeData.llmModel}</Tag>}
            {!decomposeData?.llmModel && decomposeData && <Tag>模板生成</Tag>}
          </Space>
        }
        open={!!decomposeData}
        onCancel={() => setDecomposeData(null)}
        onOk={async () => {
          if (!decomposeData) return;
          const picked = decomposeData.subtasks.filter((_, i) => decomposeSelected.includes(i));
          if (picked.length === 0) {
            message.warning('请至少选择一个子任务');
            return;
          }
          setCreatingSubtasks(true);
          let created = 0;
          let failed = 0;
          for (const st of picked) {
            try {
              await workItemApi.create({
                type: st.type || 'task',
                title: st.title,
                description: st.reason || `AI 拆解自 ${decomposeData.parent.key}: ${decomposeData.parent.title}`,
                priority: st.priority || 'P2',
                parentId: id,
                reporter: 'AI 拆解',
                actor: '我',
              });
              created++;
            } catch {
              failed++;
            }
          }
          setCreatingSubtasks(false);
          setDecomposeData(null);
          message.success(`已创建 ${created} 个子任务${failed ? `, 失败 ${failed}` : ''}`);
          load();
        }}
        okText={`创建 ${decomposeSelected.length} 个子任务`}
        cancelText="取消"
        confirmLoading={creatingSubtasks}
        width={780}
      >
        {decomposeData && (
          <>
            {decomposeData.note && (
              <Alert message={decomposeData.note} type="info" showIcon style={{ marginBottom: 12 }} />
            )}
            <div style={{ marginBottom: 12, color: '#666' }}>
              基于 <b>{decomposeData.parent.key} {decomposeData.parent.title}</b> 拆解, 勾选要创建的子任务:
            </div>
            <Checkbox.Group
              value={decomposeSelected}
              onChange={(v) => setDecomposeSelected(v as number[])}
              style={{ width: '100%' }}
            >
              <Space direction="vertical" style={{ width: '100%' }} size={8}>
                {decomposeData.subtasks.map((st, i) => (
                  <div key={i} style={{
                    padding: 8, borderRadius: 4,
                    background: decomposeSelected.includes(i) ? '#f0f5ff' : 'transparent',
                    border: decomposeSelected.includes(i) ? '1px solid #adc6ff' : '1px solid transparent',
                  }}>
                    <Checkbox value={i}>
                      <Space>
                        <Tag color="blue">{st.type || 'task'}</Tag>
                        <span style={{ fontWeight: 500 }}>{st.title}</span>
                        <Tag color={st.priority === 'P0' ? 'red' : st.priority === 'P1' ? 'orange' : 'default'}>{st.priority || 'P2'}</Tag>
                        {st.estimate && <span style={{ color: '#999', fontSize: 12 }}>{st.estimate}h</span>}
                      </Space>
                      {st.reason && <div style={{ color: '#999', fontSize: 12, marginTop: 4, marginLeft: 24 }}>💡 {st.reason}</div>}
                    </Checkbox>
                  </div>
                ))}
              </Space>
            </Checkbox.Group>
          </>
        )}
      </Modal>
    </div>
  );
}

/**
 * V1.22 变更历史 Tab - 合并 audit-logs + activities 统一时间线
 */
function HistoryTab({ workItemId, workItemKey }: { workItemId: string; workItemKey: string }) {
  const [audits, setAudits] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<'all' | 'update' | 'create' | 'import' | 'status_change'>('all');

  const load = async () => {
    setLoading(true);
    try {
      const list = await auditApi.byEntity('workItem', workItemId);
      setAudits(list);
    } catch {
      setAudits([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [workItemId]);

  const filtered = filter === 'all' ? audits : audits.filter(a => a.action === filter || (filter === 'status_change' && a.action === 'update' && (a.meta || '').includes('status')));

  return (
    <Card
      extra={
        <Space>
          <Select
            value={filter}
            onChange={setFilter}
            style={{ width: 140 }}
            options={[
              { value: 'all', label: `全部 (${audits.length})` },
              { value: 'create', label: '创建' },
              { value: 'update', label: '更新' },
              { value: 'import', label: '导入' },
            ]}
          />
          <Button icon={<ReloadOutlined />} onClick={load} size="small">刷新</Button>
        </Space>
      }
    >
      {loading ? <Spin /> : filtered.length === 0 ? (
        <Empty description="暂无变更记录" />
      ) : (
        <Timeline
          items={filtered.map(a => {
            let summary = '';
            try { summary = JSON.parse(a.meta || '{}').summary || ''; } catch {}
            let color = 'gray';
            if (a.action === 'create') color = 'green';
            else if (a.action === 'update') color = 'blue';
            else if (a.action === 'import') color = 'purple';
            else if (a.action === 'delete') color = 'red';
            return {
              color,
              children: (
                <div>
                  <Space size={4} wrap>
                    <b>{a.actor || '系统'}</b>
                    <Tag color={color} style={{ margin: 0 }}>{a.action}</Tag>
                    {a.actorRole && <Tag style={{ margin: 0 }}>{a.actorRole}</Tag>}
                  </Space>
                  <div style={{ marginTop: 4, color: '#333' }}>{summary || a.meta || '(无摘要)'}</div>
                  <div style={{ color: '#999', fontSize: 12, marginTop: 2 }}>{dayjs(a.createdAt).format('YYYY-MM-DD HH:mm:ss')}</div>
                </div>
              ),
            };
          })}
        />
      )}
    </Card>
  );
}

// 简易 Markdown 渲染（只支持 ## 标题、- 列表、**加粗**、换行）
/**
 * V1.25 工作量统计卡片
 * 估分 vs 实际 + 工时进度 + 计划周期 + 偏差分析
 */
function WorkloadStats({ item }: { item: WorkItem }) {
  const estimate = item.estimate || 0;
  const actual = item.actualHours || 0;
  const planStart = item.planStart ? dayjs(item.planStart) : null;
  const planEnd = item.planEnd ? dayjs(item.planEnd) : null;
  const actualStart = item.actualStart ? dayjs(item.actualStart) : null;
  const actualEnd = item.actualEnd ? dayjs(item.actualEnd) : null;
  const now = dayjs();

  // 进度百分比
  const progressPct = estimate > 0 ? Math.min(100, Math.round((actual / estimate) * 100)) : 0;
  // 偏差 (实际 - 估分)
  const variance = actual - estimate;
  const variancePct = estimate > 0 ? Math.round((variance / estimate) * 100) : 0;
  // 计划天数
  const planDays = planStart && planEnd ? planEnd.diff(planStart, 'day') + 1 : 0;
  // 实际天数
  const actualDays = actualStart && actualEnd ? actualEnd.diff(actualStart, 'day') + 1 : (actualStart ? now.diff(actualStart, 'day') + 1 : 0);
  // 距计划截止
  const dueDays = planEnd ? planEnd.diff(now, 'day') : null;
  // 状态判断
  const isOverdue = planEnd && now.isAfter(planEnd) && !['已完成', '已关闭', '已驳回', '已发布', '已验收'].includes(item.status);
  const isOverEstimate = estimate > 0 && actual > estimate;

  // 渲染偏差颜色
  const varianceColor = variance > 0 ? '#ff4d4f' : variance < 0 ? '#52c41a' : '#999';
  const varianceText = variance > 0 ? `+${variance}` : `${variance}`;

  return (
    <Card size="small" style={{ marginBottom: 12 }} styles={{ body: { padding: 16 } }}>
      <Space size={4} style={{ marginBottom: 8 }}>
        <ThunderboltOutlined style={{ color: '#722ed1' }} />
        <span style={{ fontSize: 14, fontWeight: 500 }}>工作量统计</span>
      </Space>
      <Row gutter={[16, 12]}>
        {/* 估分 */}
        <Col span={4}>
          <Statistic
            title="估分"
            value={estimate || '-'}
            suffix={estimate ? 'SP' : ''}
            valueStyle={{ color: '#1677ff' }}
          />
        </Col>
        {/* 实际工时 */}
        <Col span={4}>
          <Statistic
            title="实际工时"
            value={actual || '-'}
            suffix={actual ? 'h' : ''}
            valueStyle={{ color: isOverEstimate ? '#ff4d4f' : '#52c41a' }}
          />
        </Col>
        {/* 进度 */}
        <Col span={4}>
          <div style={{ marginBottom: 4, color: '#666', fontSize: 14 }}>完成度</div>
          <div style={{ fontSize: 24, fontWeight: 500, color: progressPct >= 100 ? '#52c41a' : '#1677ff' }}>
            {estimate > 0 ? `${progressPct}%` : '-'}
          </div>
          {estimate > 0 && (
            <Progress
              percent={progressPct}
              size="small"
              showInfo={false}
              strokeColor={isOverEstimate ? '#ff4d4f' : '#1677ff'}
              style={{ marginTop: 2, marginBottom: 0 }}
            />
          )}
        </Col>
        {/* 偏差 */}
        <Col span={4}>
          <Statistic
            title="工时偏差"
            value={estimate > 0 ? varianceText : '-'}
            suffix={estimate > 0 ? `h (${variance > 0 ? '+' : ''}${variancePct}%)` : ''}
            valueStyle={{ color: varianceColor, fontSize: 18 }}
          />
          {isOverEstimate && (
            <Tag color="error" style={{ marginTop: 4 }}>超估 {variance}h</Tag>
          )}
        </Col>
        {/* 周期 */}
        <Col span={4}>
          <div style={{ marginBottom: 4, color: '#666', fontSize: 14 }}>计划周期</div>
          {planStart && planEnd ? (
            <>
              <div style={{ fontSize: 13 }}>
                {planStart.format('MM-DD')} ~ {planEnd.format('MM-DD')}
              </div>
              <div style={{ fontSize: 12, color: '#999', marginTop: 2 }}>
                {planDays} 天
                {isOverdue && <Tag color="red" style={{ marginLeft: 4, margin: 0 }}>超 {Math.abs(dueDays || 0)} 天</Tag>}
                {!isOverdue && dueDays !== null && dueDays >= 0 && dueDays <= 3 && (
                  <Tag color="orange" style={{ marginLeft: 4, margin: 0 }}>还 {dueDays === 0 ? '今天' : `${dueDays}天`}</Tag>
                )}
              </div>
            </>
          ) : (
            <div style={{ fontSize: 13, color: '#bbb' }}>未排期</div>
          )}
        </Col>
        {/* 实际周期 */}
        <Col span={4}>
          <div style={{ marginBottom: 4, color: '#666', fontSize: 14 }}>实际周期</div>
          {actualStart ? (
            <>
              <div style={{ fontSize: 13 }}>
                {actualStart.format('MM-DD')} {actualEnd ? `~ ${actualEnd.format('MM-DD')}` : '~ 进行中'}
              </div>
              <div style={{ fontSize: 12, color: '#999', marginTop: 2 }}>
                {actualDays > 0 ? `${actualDays} 天` : '今日开始'}
              </div>
            </>
          ) : (
            <div style={{ fontSize: 13, color: '#bbb' }}>未开始</div>
          )}
        </Col>
      </Row>
    </Card>
  );
}

function MarkdownView({ content }: { content: string }) {
  const lines = content.split('\n');
  return (
    <div style={{ lineHeight: 1.8 }}>
      {lines.map((line, i) => {
        if (line.startsWith('## ')) return <h3 key={i} style={{ marginTop: 16, marginBottom: 8 }}>{line.slice(3)}</h3>;
        if (line.startsWith('# ')) return <h2 key={i} style={{ marginTop: 16 }}>{line.slice(2)}</h2>;
        if (line.startsWith('- ')) return <div key={i} style={{ paddingLeft: 16 }}>• {renderInline(line.slice(2))}</div>;
        if (/^\d+\.\s/.test(line)) return <div key={i} style={{ paddingLeft: 16 }}>{renderInline(line)}</div>;
        if (!line.trim()) return <br key={i} />;
        return <p key={i} style={{ margin: 0 }}>{renderInline(line)}</p>;
      })}
    </div>
  );
}

function renderInline(text: string) {
  // 简化：**bold**
  const parts: any[] = [];
  const regex = /\*\*([^*]+)\*\*/g;
  let lastIndex = 0;
  let match;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) parts.push(text.slice(lastIndex, match.index));
    parts.push(<b key={parts.length}>{match[1]}</b>);
    lastIndex = regex.lastIndex;
  }
  if (lastIndex < text.length) parts.push(text.slice(lastIndex));
  return parts;
}

// ========== V1.7.1 外部依赖 Tab ==========
const DEP_TYPE_META: Record<string, { color: string }> = {
  '台架': { color: 'geekblue' }, '实车': { color: 'red' }, '车模': { color: 'orange' },
  'SDB': { color: 'purple' }, 'UE': { color: 'cyan' }, 'UI': { color: 'magenta' },
  '标定': { color: 'green' }, '其他': { color: 'default' },
};
const DEP_STATUS_META: Record<string, { label: string; color: string }> = {
  pending: { label: '待准备', color: 'default' }, preparing: { label: '准备中', color: 'processing' },
  ready: { label: '已就绪', color: 'success' }, blocked: { label: '卡点', color: 'error' },
  cancelled: { label: '已取消', color: 'default' },
};

function DependencyTab({ workItemId }: { workItemId: string }) {
  const [list, setList] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [projects, setProjects] = useState<any[]>([]);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [form] = Form.useForm();

  const load = async () => {
    setLoading(true);
    try {
      // 通过 workItemId 过滤依赖
      const deps = await dependencyApi.list();
      setList(deps.filter((d: any) => d.workItemId === workItemId));
      const projs = await (await import('../api')).projectApi.list();
      setProjects(projs);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [workItemId]);

  const handleAdd = () => {
    form.resetFields();
    form.setFieldsValue({ status: 'pending', type: '台架', workItemId });
    setDrawerOpen(true);
  };

  const handleSubmit = async () => {
    try {
      const v = await form.validateFields();
      await dependencyApi.create({ ...v, workItemId });
      message.success('已添加');
      setDrawerOpen(false);
      load();
    } catch (e: any) {
      if (e?.errorFields) return;
      message.error('保存失败：' + e.message);
    }
  };

  const handleMarkReady = async (d: any) => {
    await dependencyApi.ready(d.id);
    message.success('已标记就绪');
    load();
  };

  const handleDelete = async (id: string) => {
    await dependencyApi.remove(id);
    message.success('已删除');
    load();
  };

  const isOverdue = (d: any) => d.expectedDate && new Date(d.expectedDate) < new Date() && d.status !== 'ready' && d.status !== 'cancelled';
  const daysOverdue = (d: any) => d.expectedDate ? Math.ceil((Date.now() - new Date(d.expectedDate).getTime()) / 86400000) : 0;

  return (
    <Card
      title={<Space><ToolOutlined /> 外部依赖 ({list.length})</Space>}
      extra={<Button type="primary" size="small" icon={<PlusOutlined />} onClick={handleAdd}>添加依赖</Button>}
      loading={loading}
    >
      {list.length === 0 ? (
        <Empty description="该工作项暂无外部依赖" />
      ) : (
        <Space direction="vertical" style={{ width: '100%' }} size={8}>
          {list.map(d => (
            <div key={d.id} style={{ padding: 12, background: isOverdue(d) ? '#fff2f0' : '#fafafa', borderRadius: 6, border: isOverdue(d) ? '1px solid #ffccc7' : '1px solid transparent' }}>
              <Space wrap style={{ width: '100%', justifyContent: 'space-between' }}>
                <Space>
                  <Tag color={DEP_TYPE_META[d.type]?.color || 'default'} style={{ fontSize: 13, padding: '2px 10px' }}>{d.type}</Tag>
                  <span style={{ fontWeight: 500 }}>{d.name}</span>
                  <Tag color={DEP_STATUS_META[d.status]?.color}>{DEP_STATUS_META[d.status]?.label || d.status}</Tag>
                  {d.owner && <Tag>{d.owner}</Tag>}
                  {isOverdue(d) && <Tag color="red">超 {daysOverdue(d)} 天</Tag>}
                </Space>
                <Space>
                  {d.status !== 'ready' && d.status !== 'cancelled' && (
                    <Button type="link" size="small" icon={<CheckCircleOutlined />} onClick={() => handleMarkReady(d)}>标记就绪</Button>
                  )}
                  <Button type="link" size="small" danger icon={<DeleteOutlined />} onClick={() => handleDelete(d.id)}>删除</Button>
                </Space>
              </Space>
              {d.expectedDate && (
                <div style={{ fontSize: 12, color: '#666', marginTop: 4 }}>
                  <ClockCircleOutlined /> 预计就绪: {dayjs(d.expectedDate).format('YYYY-MM-DD')}
                  {d.actualDate && <span style={{ marginLeft: 12, color: '#52c41a' }}>✓ 实际就绪: {dayjs(d.actualDate).format('YYYY-MM-DD')}</span>}
                </div>
              )}
              {d.blocker && (
                <div style={{ fontSize: 12, color: '#ff4d4f', marginTop: 4 }}>
                  <WarningOutlined /> {d.blocker}
                </div>
              )}
            </div>
          ))}
        </Space>
      )}

      <Drawer
        title="添加外部依赖"
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        width={560}
        extra={
          <Space>
            <Button onClick={() => setDrawerOpen(false)}>取消</Button>
            <Button type="primary" onClick={handleSubmit}>添加</Button>
          </Space>
        }
      >
        <Form form={form} layout="vertical">
          <Form.Item name="type" label="依赖类型" rules={[{ required: true }]}>
            <Select options={Object.keys(DEP_TYPE_META).map(t => ({ value: t, label: t }))} />
          </Form.Item>
          <Form.Item name="name" label="依赖名称" rules={[{ required: true }]}>
            <Input placeholder="如：吉利研究院 4 号台架" />
          </Form.Item>
          <Form.Item name="owner" label="负责人">
            <Input placeholder="如 张三（研发一组）" />
          </Form.Item>
          <Form.Item name="status" label="状态">
            <Select options={Object.entries(DEP_STATUS_META).map(([k, v]) => ({ value: k, label: v.label }))} />
          </Form.Item>
          <Form.Item name="expectedDate" label="预计就绪时间">
            <Input type="date" />
          </Form.Item>
          <Form.Item name="blocker" label="卡点说明">
            <Input.TextArea rows={2} />
          </Form.Item>
        </Form>
      </Drawer>
    </Card>
  );
}

// V1.28: 评论 reactions 行
const REACTION_EMOJIS = ['👍', '❤️', '🎉', '🚀', '✅', '😄', '🤔', '👀'];
function CommentReactions({ comment, currentUser, onChange }: { comment: any; currentUser: string; onChange: () => void }) {
  const { message } = App.useApp();
  let reactions: Record<string, string[]> = {};
  try { reactions = JSON.parse(comment.reactions || '{}'); } catch { reactions = {}; }
  const handleReact = async (emoji: string) => {
    try {
      await commentApi.react(comment.id, emoji, currentUser);
      onChange();
    } catch (e: any) {
      message.error('操作失败: ' + e.message);
    }
  };
  const hasAny = Object.keys(reactions).length > 0;
  return (
    <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center' }}>
      {REACTION_EMOJIS.map(emoji => {
        const users = reactions[emoji] || [];
        const reacted = users.includes(currentUser);
        if (users.length === 0) return null; // 没人的 emoji 不显示
        // V1.29 hover 显示用户列表
        const tipContent = (
          <div style={{ maxWidth: 220 }}>
            <div style={{ fontWeight: 500, marginBottom: 4 }}>{emoji} {users.length} 人</div>
            <div style={{ fontSize: 12, lineHeight: 1.6 }}>
              {users.map((u, i) => (
                <span key={u} style={{ marginRight: 6 }}>
                  {u}{i < users.length - 1 ? '、' : ''}
                </span>
              ))}
            </div>
          </div>
        );
        return (
          <Tooltip key={emoji} title={tipContent} mouseEnterDelay={0.1}>
            <Button
              size="small"
              type={reacted ? 'primary' : 'default'}
              onClick={() => handleReact(emoji)}
              style={{ fontSize: 12, padding: '0 8px', height: 24 }}
            >
              {emoji} {users.length}
            </Button>
          </Tooltip>
        );
      })}
      <Button
        size="small"
        type="text"
        onClick={() => {
          // 弹出 emoji 选择器: 简单起见用 prompt
          const e = prompt(`选择 emoji (${REACTION_EMOJIS.join(' ')}):`, '👍');
          if (e && REACTION_EMOJIS.includes(e)) handleReact(e);
          else if (e) message.warning('不支持该 emoji');
        }}
        style={{ fontSize: 11, color: '#999' }}
      >
        {hasAny ? '+ 更多' : '+ 反应'}
      </Button>
    </div>
  );
}