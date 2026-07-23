/**
 * Swagger / OpenAPI 3.0 配置
 * 访问：http://localhost:4000/api/docs
 */
import swaggerJsdoc from 'swagger-jsdoc';

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'AVM 项目中心 API',
      version: '1.2.0',
      description: 'AVM Project Center — 企业级项目管理平台 API 文档\n\n认证方式：`Authorization: Bearer <token>`',
    },
    servers: [
      { url: 'http://localhost:4000', description: '本地开发' },
      { url: 'http://localhost:8080', description: 'Docker 部署' },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'hex64',
        },
      },
      schemas: {
        WorkItem: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            key: { type: 'string', example: 'REQ-1' },
            type: { type: 'string', enum: ['requirement', 'task', 'bug', 'release'] },
            title: { type: 'string' },
            status: { type: 'string' },
            priority: { type: 'string', enum: ['P0', 'P1', 'P2', 'P3'] },
            assignee: { type: 'string', nullable: true },
            estimate: { type: 'number', nullable: true },
            planStart: { type: 'string', format: 'date-time', nullable: true },
            planEnd: { type: 'string', format: 'date-time', nullable: true },
          },
        },
        Project: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            code: { type: 'string', example: 'AVM-GALAXY-L7-2026' },
            name: { type: 'string' },
            customerId: { type: 'string' },
            carModelId: { type: 'string' },
            status: { type: 'string', enum: ['planning', 'active', 'completed', 'onhold', 'cancelled'] },
            billingType: { type: 'string', enum: ['ODC', 'FIXED', 'ODM', 'TIME_MATERIAL'] },
            contractAmount: { type: 'number' },
            risk: { type: 'string', enum: ['low', 'medium', 'high'] },
          },
        },
        User: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            username: { type: 'string' },
            displayName: { type: 'string' },
            role: { type: 'string', enum: ['member', 'biz_admin', 'space_admin', 'tenant_admin'] },
            active: { type: 'boolean' },
          },
        },
        Error: {
          type: 'object',
          properties: {
            error: { type: 'string' },
            requestId: { type: 'string' },
          },
        },
      },
    },
    security: [{ bearerAuth: [] }],
    tags: [
      { name: '认证', description: '登录 / 用户管理' },
      { name: '工作项', description: '需求 / 任务 / 缺陷 / 发布' },
      { name: '项目', description: 'AVM 集成项目管理' },
      { name: '迭代', description: '迭代 / 冲刺管理' },
      { name: '流程', description: '工作流引擎' },
      { name: '评审', description: 'Stage-Gate 评审' },
      { name: '仪表盘', description: '图表 / 数据看板' },
      { name: '客户与车型', description: '客户 / 车型 / 联系人' },
      { name: '外部依赖', description: '台架 / 实车 / SDB 等' },
      { name: '审计', description: '操作日志 / 合规' },
    ],
  },
  apis: ['./src/routes/*.ts'], // 扫描所有路由文件的 JSDoc 注释
};

export const swaggerSpec = swaggerJsdoc(options);
