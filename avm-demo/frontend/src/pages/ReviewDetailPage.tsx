import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Card, Descriptions, Tag, Button, Space, message, Modal, Input, Radio, Slider, Checkbox,
  Avatar, Progress, Result, Divider, Timeline, Empty,
} from 'antd';
import {
  ArrowLeftOutlined, CheckCircleOutlined, CloseCircleOutlined, EditOutlined,
  AuditOutlined, MinusCircleOutlined,
} from '@ant-design/icons';
import { reviewApi, activityApi } from '../api';
import type { Review, Activity } from '../types';

const REVIEW_TYPE_LABEL: Record<string, string> = { tr: '技术评审 TR', dcp: '决策评审 DCP', qr: '质量评审 QR' };
const REVIEW_TYPE_COLOR: Record<string, string> = { tr: 'blue', dcp: 'purple', qr: 'cyan' };
const STATUS_COLOR: Record<string, string> = {
  pending: 'default', in_progress: 'processing', approved: 'success', rejected: 'error',
};
const STATUS_LABEL: Record<string, string> = {
  pending: '待评审', in_progress: '评审中', approved: '已通过', rejected: '已驳回',
};
const CONCLUSION_LABEL: Record<string, string> = { go: '通过', not_go: '驳回', go_with_risk: '有条件通过' };
const CONCLUSION_COLOR: Record<string, string> = { go: 'success', not_go: 'error', go_with_risk: 'warning' };

export function ReviewDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [review, setReview] = useState<Review | null>(null);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [finalizeOpen, setFinalizeOpen] = useState(false);
  const [submission, setSubmission] = useState<Record<string, any>>({});
  const [summary, setSummary] = useState('');

  const load = async () => {
    if (!id) return;
    const data = await reviewApi.get(id);
    setReview(data);
    if (data.workItemId) {
      activityApi.list(data.workItemId).then(setActivities).catch(() => {});
    }
    // 初始化 submission
    const init: Record<string, any> = {};
    (data.items || []).forEach(it => {
      init[it.id] = it.itemType === 'score' ? it.score ?? 3 : it.itemType === 'check' ? it.checked ?? null : it.answer ?? '';
    });
    setSubmission(init);
  };

  useEffect(() => { load(); }, [id]);

  if (!review) return <Card loading />;

  const isFinalized = review.status === 'approved' || review.status === 'rejected';

  const handleSubmit = async () => {
    try {
      const submissions = Object.entries(submission).map(([itemId, value]) => {
        const item = review.items!.find(i => i.id === itemId)!;
        const s: any = { itemId, comment: '' };
        if (item.itemType === 'score') s.score = value;
        else if (item.itemType === 'check') s.checked = value;
        else if (item.itemType === 'text') s.answer = value;
        return s;
      });
      await reviewApi.submit(review.id, 'zhangsan', submissions);
      message.success('已提交');
      load();
    } catch (e: any) {
      message.error('提交失败：' + e.message);
    }
  };

  const handleFinalize = async (conclusion: 'go' | 'not_go' | 'go_with_risk') => {
    try {
      await reviewApi.finalize(review.id, { conclusion, summary, finalizer: '我' });
      message.success(`评审已${CONCLUSION_LABEL[conclusion]}`);
      setFinalizeOpen(false);
      load();
    } catch (e: any) {
      message.error('操作失败：' + e.message);
    }
  };

  const completedItems = (review.items || []).filter(i => i.completed).length;
  const totalItems = (review.items || []).length;
  const respondedParticipants = (review.participants || []).filter(p => p.hasResponded).length;
  const totalParticipants = (review.participants || []).length;

  // 计算当前分数汇总
  const scoreAvg = (() => {
    const items = (review.items || []).filter(i => i.itemType === 'score' && i.score != null);
    if (items.length === 0) return null;
    const total = items.reduce((s, i) => s + (i.score! / i.maxScore), 0) / items.length * 5;
    return total;
  })();

  return (
    <div>
      <Card style={{ marginBottom: 12 }}>
        <Space style={{ marginBottom: 12 }}>
          <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/reviews')}>返回</Button>
          <Tag color={REVIEW_TYPE_COLOR[review.reviewType]}>{REVIEW_TYPE_LABEL[review.reviewType]}</Tag>
          <Tag color={STATUS_COLOR[review.status]}>{STATUS_LABEL[review.status]}</Tag>
          {review.conclusion && <Tag color={CONCLUSION_COLOR[review.conclusion]}>{CONCLUSION_LABEL[review.conclusion]}</Tag>}
        </Space>
        <h2 style={{ margin: '0 0 12px 0' }}>{review.title}</h2>
        <Descriptions column={4} size="small" bordered>
          <Descriptions.Item label="工作项">
            {review.workItem && (
              <a onClick={() => navigate(`/work-items/${review.workItem!.type}/${review.workItem!.id}`)}>
                <Tag>{review.workItem.key}</Tag>{review.workItem.title}
              </a>
            )}
          </Descriptions.Item>
          <Descriptions.Item label="发起人">{review.initiator}</Descriptions.Item>
          <Descriptions.Item label="参与者">{respondedParticipants}/{totalParticipants} 已评</Descriptions.Item>
          <Descriptions.Item label="要素完成度">
            <Progress percent={Math.round((completedItems / Math.max(totalItems, 1)) * 100)} size="small" />
          </Descriptions.Item>
          <Descriptions.Item label="创建时间" span={2}>{new Date(review.createdAt).toLocaleString('zh-CN')}</Descriptions.Item>
          {review.finalizedAt && <Descriptions.Item label="结论时间" span={2}>{new Date(review.finalizedAt).toLocaleString('zh-CN')}</Descriptions.Item>}
          {review.summary && (
            <Descriptions.Item label="总结论说明" span={4}>{review.summary}</Descriptions.Item>
          )}
        </Descriptions>
      </Card>

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12 }}>
        <Card title={<><EditOutlined /> 评审要素填写</>}>
          <Space direction="vertical" style={{ width: '100%' }} size={16}>
            {(review.items || []).map(item => (
              <div key={item.id} style={{ padding: 12, background: item.completed ? '#f6ffed' : '#fafafa', borderRadius: 6, border: '1px solid #f0f0f0' }}>
                <Space style={{ marginBottom: 8 }}>
                  <b>{item.name}</b>
                  {item.completed && <Tag color="green" icon={<CheckCircleOutlined />}>已评</Tag>}
                  {item.itemType === 'score' && <Tag>评分项</Tag>}
                  {item.itemType === 'check' && <Tag color="cyan">勾选项</Tag>}
                  {item.itemType === 'text' && <Tag color="purple">文本项</Tag>}
                </Space>
                {item.description && <div style={{ color: '#999', fontSize: 12, marginBottom: 8 }}>{item.description}</div>}

                {isFinalized ? (
                  <div>
                    {item.itemType === 'score' && (
                      <span>得分：<b>{item.score ?? '-'}</b> / {item.maxScore}</span>
                    )}
                    {item.itemType === 'check' && (
                      <span>{item.checked ? <Tag color="green" icon={<CheckCircleOutlined />}>已确认</Tag> : <Tag color="red" icon={<CloseCircleOutlined />}>未通过</Tag>}</span>
                    )}
                    {item.itemType === 'text' && (
                      <span>回答：<i>{item.answer || '-'}</i></span>
                    )}
                    {item.comment && <div style={{ marginTop: 4, color: '#666', fontSize: 12 }}>意见：{item.comment}</div>}
                  </div>
                ) : (
                  <div>
                    {item.itemType === 'score' && (
                      <div>
                        <Slider
                          min={0}
                          max={item.maxScore}
                          step={1}
                          value={submission[item.id] ?? 3}
                          onChange={v => setSubmission(s => ({ ...s, [item.id]: v }))}
                          marks={{ 0: '0', [item.maxScore]: `${item.maxScore}` }}
                        />
                        <div style={{ fontSize: 12, color: '#666' }}>当前：{submission[item.id]} 分</div>
                      </div>
                    )}
                    {item.itemType === 'check' && (
                      <Radio.Group
                        value={submission[item.id]}
                        onChange={e => setSubmission(s => ({ ...s, [item.id]: e.target.value }))}
                      >
                        <Radio value={true}><CheckCircleOutlined style={{ color: 'green' }} /> 通过</Radio>
                        <Radio value={false}><CloseCircleOutlined style={{ color: 'red' }} /> 不通过</Radio>
                      </Radio.Group>
                    )}
                    {item.itemType === 'text' && (
                      <Input.TextArea
                        rows={2}
                        value={submission[item.id] || ''}
                        onChange={e => setSubmission(s => ({ ...s, [item.id]: e.target.value }))}
                        placeholder="请输入回答"
                      />
                    )}
                  </div>
                )}
              </div>
            ))}
            {!isFinalized && (
              <Space>
                <Button type="primary" onClick={handleSubmit}>提交我的评审</Button>
                <Button onClick={() => setSubmission({})}>清空</Button>
              </Space>
            )}
          </Space>
        </Card>

        <div>
          <Card title="评审概览" size="small" style={{ marginBottom: 12 }}>
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 12, color: '#999' }}>综合得分</div>
              {scoreAvg != null ? (
                <div style={{ fontSize: 28, fontWeight: 500, color: scoreAvg >= 4 ? 'green' : scoreAvg >= 3 ? 'orange' : 'red' }}>
                  {scoreAvg.toFixed(1)} <span style={{ fontSize: 14, color: '#999' }}>/ 5</span>
                </div>
              ) : <span style={{ color: '#ccc' }}>无评分项</span>}
            </div>
            <Divider style={{ margin: '8px 0' }} />
            <div style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 12, color: '#999' }}>要素完成度</div>
              <Progress percent={Math.round((completedItems / Math.max(totalItems, 1)) * 100)} size="small" />
            </div>
            <div>
              <div style={{ fontSize: 12, color: '#999' }}>参与者响应</div>
              <Progress percent={Math.round((respondedParticipants / Math.max(totalParticipants, 1)) * 100)} size="small" />
            </div>
          </Card>

          <Card title="参与者" size="small" style={{ marginBottom: 12 }}>
            {(review.participants || []).map(p => (
              <div key={p.id} style={{ padding: '6px 0', borderBottom: '1px solid #f5f5f5' }}>
                <Space>
                  <Avatar size="small" style={{ background: p.hasResponded ? '#52c41a' : '#999' }}>{p.userName[0]}</Avatar>
                  <span>{p.userName}</span>
                  <Tag color={p.role === 'chair' ? 'purple' : 'blue'}>{p.role}</Tag>
                  {p.hasResponded ? <Tag color="green" icon={<CheckCircleOutlined />}>已评</Tag> : <Tag>待评</Tag>}
                </Space>
              </div>
            ))}
          </Card>

          {!isFinalized && (
            <Button block type="primary" size="large" icon={<AuditOutlined />} onClick={() => setFinalizeOpen(true)}>
              总结论
            </Button>
          )}
        </div>
      </div>

      <Modal
        title="总结论"
        open={finalizeOpen}
        onCancel={() => setFinalizeOpen(false)}
        footer={null}
      >
        <p style={{ color: '#666' }}>请根据评审要素填写情况给出最终结论：</p>
        <Input.TextArea
          rows={3}
          placeholder="结论说明（必填）"
          value={summary}
          onChange={e => setSummary(e.target.value)}
          style={{ marginBottom: 16 }}
        />
        <Space direction="vertical" style={{ width: '100%' }}>
          <Button block size="large" type="primary" icon={<CheckCircleOutlined />}
            onClick={() => handleFinalize('go')} disabled={!summary}>
            Go - 通过
          </Button>
          <Button block size="large" danger icon={<CloseCircleOutlined />}
            onClick={() => handleFinalize('not_go')} disabled={!summary}>
            Not Go - 驳回
          </Button>
          <Button block size="large" icon={<MinusCircleOutlined />}
            style={{ borderColor: '#fa8c16', color: '#fa8c16' }}
            onClick={() => handleFinalize('go_with_risk')} disabled={!summary}>
            Go with Risk - 有条件通过
          </Button>
        </Space>
      </Modal>
    </div>
  );
}