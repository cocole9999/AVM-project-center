/**
 * AVM 种子数据（V1.7 真实场景版：吉利 AVM 集成项目管理）
 *
 * 业务背景：用户为吉利汽车的 AVM 产品集成项目管理方
 * - 客户（内部）：吉利各车型项目组（银河/极氪/领克/博越/熊猫 等）
 * - 车型：吉利全系
 * - 联系人：每个项目组的 UPL/PPM/测试/开发/AVM 接口人
 * - 项目：每个车型一个 AVM 集成项目
 *
 * 覆盖：V1.0 + V1.1（流程/评审）+ V1.2（图表/仪表盘）+ AI + V1.3（多空间/通知/收藏/排期）
 *      + V1.4（公式/聚合/模板/自动化/WebHook/导入/交接）+ V1.5（AI 人力/基线/MCP）
 *      + V1.6（测试/SSO/LLM）+ V1.7（客户/车型/项目）
 */
import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';

const prisma = new PrismaClient();

function daysFromNow(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(0, 0, 0, 0);
  return d;
}

function hashPassword(pwd: string): string {
  return crypto.createHash('sha256').update(pwd + 'avm-salt').digest('hex');
}

async function main() {
  console.log('🌱 开始初始化演示数据（V1.7 吉利 AVM 集成项目真实场景）...');

  // 使用事务包裹整个 seed 操作，确保原子性（失败时自动回滚）
  await prisma.$transaction(async (tx) => {

  // 清空现有数据（按依赖顺序）
  await tx.activity.deleteMany();
  await tx.comment.deleteMany();
  await tx.workItemRelation.deleteMany();
  await tx.reviewItem.deleteMany();
  await tx.reviewParticipant.deleteMany();
  await tx.review.deleteMany();
  await tx.aIRunLog.deleteMany();
  await tx.workItem.deleteMany();
  await tx.iteration.deleteMany();
  await tx.flowTransition.deleteMany();
  await tx.flowNode.deleteMany();
  await tx.nodeFlow.deleteMany();
  await tx.reviewTemplate.deleteMany();
  await tx.chartConfig.deleteMany();
  await tx.dashboard.deleteMany();
  await tx.aIFieldConfig.deleteMany();
  // V1.3
  await tx.notification.deleteMany();
  await tx.favorite.deleteMany();
  await tx.resourceAllocation.deleteMany();
  await tx.spaceMember.deleteMany();
  await tx.workbenchConfig.deleteMany();
  await tx.space.deleteMany();
  // V1.4
  await tx.automationLog.deleteMany();
  await tx.automationRule.deleteMany();
  await tx.webhookLog.deleteMany();
  await tx.webhookConfig.deleteMany();
  await tx.importJob.deleteMany();
  await tx.workHandover.deleteMany();
  await tx.workItemTemplate.deleteMany();
  await tx.rollupField.deleteMany();
  await tx.formulaField.deleteMany();
  // V1.6 测试
  await tx.testCaseBug.deleteMany();
  await tx.testPlanCase.deleteMany();
  await tx.testRun.deleteMany();
  await tx.testPlan.deleteMany();
  await tx.testCase.deleteMany();
  // V1.6 LLM 设置（避免影响 V1.6.8 E2E）
  await tx.LLMSettings.deleteMany();
  // V1.5
  await tx.baseline.deleteMany();
  await tx.resourceAnalysis.deleteMany();
  // V1.7 客户/车型/项目（依赖 workItem）
  await tx.project.deleteMany();
  await tx.contact.deleteMany();
  await tx.carModel.deleteMany();
  await tx.customer.deleteMany();
  // 其它
  await tx.user.deleteMany();

  // ========== 用户（吉利 AVM 集成项目组 内部成员） ==========
  const users = await Promise.all([
    prisma.user.create({ data: { username: 'admin', displayName: '系统管理员', email: 'admin@avm.demo', password: hashPassword('admin123'), department: 'AVM 中台', role: 'tenant_admin' } }),
    prisma.user.create({ data: { username: 'pm', displayName: 'AVM 项目经理', email: 'pm@avm.demo', password: hashPassword('pm123'), department: 'AVM 项目管理部', role: 'space_admin' } }),
    prisma.user.create({ data: { username: 'zhangsan', displayName: '张三（研发一组）', email: 'zhangsan@avm.demo', password: hashPassword('123456'), department: 'AVM 研发一组', role: 'biz_admin' } }),
    prisma.user.create({ data: { username: 'lisi', displayName: '李四（研发一组）', email: 'lisi@avm.demo', password: hashPassword('123456'), department: 'AVM 研发一组', role: 'member' } }),
    prisma.user.create({ data: { username: 'wangwu', displayName: '王五（研发二组）', email: 'wangwu@avm.demo', password: hashPassword('123456'), department: 'AVM 研发二组', role: 'member' } }),
    prisma.user.create({ data: { username: 'zhaoliu', displayName: '赵六（研发二组）', email: 'zhaoliu@avm.demo', password: hashPassword('123456'), department: 'AVM 研发二组', role: 'member' } }),
    prisma.user.create({ data: { username: 'tester', displayName: '测试-小王', email: 'tester@avm.demo', password: hashPassword('123456'), department: 'AVM 测试部', role: 'member' } }),
  ]);
  console.log(`✓ 用户: ${users.length} 个（吉利 AVM 内部团队）`);

  // ========== V1.3 空间（吉利 AVM 集成项目） ==========
  const productSpace = await tx.space.create({
    data: {
      name: 'AVM 集成项目',
      code: 'avm-integration',
      description: 'AVM 集成项目管理主空间：各车型项目 + 需求池 + 迭代 + 研发流程 + 客户/车型管理',
      icon: 'product',
      ownerId: 'pm',
      memberCount: users.length,
    },
  });
  const growthSpace = await tx.space.create({
    data: {
      name: 'AVM 内部研发',
      code: 'avm-internal',
      description: 'AVM 产品内部研发空间：算法优化 + 标定工具 + 测试平台',
      icon: 'experiment',
      ownerId: 'zhangsan',
      memberCount: 4,
    },
  });
  console.log(`✓ 空间: 2 个`);

  // ========== V1.7 客户（内部项目组 - 吉利各车型项目组） ==========
  const customers = await Promise.all([
    prisma.customer.create({ data: {
      code: 'GEELY-GALAXY-L7', name: '吉利银河 L7 项目组', shortName: '银河L7',
      type: 'internal', industry: '汽车主机厂',
      contact: '陈工（UPL）', phone: '18800001001', email: 'chen.gong@geely-galaxy-l7.demo',
      address: '杭州吉利研究院', description: '银河 L7 AVM 集成项目对接方', status: 'active',
    }}),
    prisma.customer.create({ data: {
      code: 'GEELY-ZEEKR-001', name: '吉利极氪 001 项目组', shortName: '极氪001',
      type: 'internal', industry: '汽车主机厂',
      contact: '林工（UPL）', phone: '18800001002', email: 'lin.gong@zeekr-001.demo',
      address: '宁波极氪工厂', description: '极氪 001 透明底盘升级 + 泊车集成', status: 'active',
    }}),
    prisma.customer.create({ data: {
      code: 'GEELY-LYNK-09', name: '吉利领克 09 项目组', shortName: '领克09',
      type: 'internal', industry: '汽车主机厂',
      contact: '周工（UPL）', phone: '18800001003', email: 'zhou.gong@lynk-09.demo',
      address: '上海领克研究院', description: '领克 09 AVM 泊车集成 + 升级', status: 'active',
    }}),
    prisma.customer.create({ data: {
      code: 'GEELY-BOYUE-L', name: '吉利博越 L 项目组', shortName: '博越L',
      type: 'internal', industry: '汽车主机厂',
      contact: '黄工（UPL）', phone: '18800001004', email: 'huang.gong@boyue-l.demo',
      address: '宁波吉利研究院', description: '博越 L AVM 升级 + 工厂标定', status: 'active',
    }}),
    prisma.customer.create({ data: {
      code: 'GEELY-PANDA-MINI', name: '吉利熊猫 mini 项目组', shortName: '熊猫mini',
      type: 'internal', industry: '汽车主机厂',
      contact: '吴工（UPL）', phone: '18800001005', email: 'wu.gong@panda-mini.demo',
      address: '杭州吉利春晓工厂', description: '熊猫 mini 入门级 AVM 标定', status: 'active',
    }}),
    prisma.customer.create({ data: {
      code: 'GEELY-ZEEKR-007', name: '吉利极氪 007 项目组', shortName: '极氪007',
      type: 'internal', industry: '汽车主机厂',
      contact: '徐工（UPL）', phone: '18800001006', email: 'xu.gong@zeekr-007.demo',
      address: '宁波极氪工厂', description: '极氪 007 AVM 集成（Q1 启动）', status: 'active',
    }}),
  ]);
  console.log(`✓ 客户（内部项目组）: ${customers.length} 个`);

  // ========== V1.7 车型（吉利全系） ==========
  const carModels = await Promise.all([
    prisma.carModel.create({ data: { code: 'GALAXY-L7', name: '银河L7', brand: '吉利银河', series: 'L系列', launchYear: 2023, segment: '紧凑型 SUV', platform: 'GEEA 2.0', description: '雷神电混 SUV，搭载 AVM 2.5 透明底盘' } }),
    prisma.carModel.create({ data: { code: 'GALAXY-L6', name: '银河L6', brand: '吉利银河', series: 'L系列', launchYear: 2023, segment: '紧凑型轿车', platform: 'GEEA 2.0', description: '雷神电混轿车，AVM 入门级' } }),
    prisma.carModel.create({ data: { code: 'ZEEKR-001', name: '极氪001', brand: '极氪', series: '猎装轿跑', launchYear: 2021, segment: '中大型车', platform: 'SEA 浩瀚', description: '猎装轿跑，AVM 透明底盘 + 自动泊车' } }),
    prisma.carModel.create({ data: { code: 'ZEEKR-007', name: '极氪007', brand: '极氪', series: '轿车', launchYear: 2023, segment: '中型轿车', platform: 'SEA 浩瀚', description: '中型轿车，AVM 集成进行中' } }),
    prisma.carModel.create({ data: { code: 'ZEEKR-009', name: '极氪009', brand: '极氪', series: 'MPV', launchYear: 2023, segment: '中大型 MPV', platform: 'SEA 浩瀚', description: '高端 MPV，AVM 全景 + 泊车辅助' } }),
    prisma.carModel.create({ data: { code: 'LYNK-09', name: '领克09', brand: '领克', series: '中大型 SUV', launchYear: 2021, segment: '中大型 SUV', platform: 'SPA Evo', description: '旗舰 SUV，AVM + 泊车集成' } }),
    prisma.carModel.create({ data: { code: 'LYNK-08', name: '领克08', brand: '领克', series: '中型 SUV', launchYear: 2023, segment: '中型 SUV', platform: 'CMA Evo', description: '中型 SUV，AVM 升级' } }),
    prisma.carModel.create({ data: { code: 'BOYUE-L', name: '博越L', brand: '吉利', series: '博越系列', launchYear: 2022, segment: '紧凑型 SUV', platform: 'CMA', description: '主流 SUV，AVM 升级 + 工厂标定' } }),
    prisma.carModel.create({ data: { code: 'PANDA-MINI', name: '熊猫mini', brand: '吉利', series: '微型车', launchYear: 2023, segment: '微型车', platform: 'e-PLATFORM', description: '入门微型电动车，AVM 标定版' } }),
    prisma.carModel.create({ data: { code: 'XINGRUI', name: '星瑞', brand: '吉利', series: '中国星', launchYear: 2020, segment: '紧凑型轿车', platform: 'CMA', description: 'CMA 旗舰轿车，AVM 升级中' } }),
  ]);
  console.log(`✓ 车型: ${carModels.length} 个`);

  // ========== V1.7 联系人（每个项目组：UPL/PPM/测试/开发/AVM接口人） ==========
  const rolePool: Record<string, string[]> = {
    'UPL': ['陈工', '林工', '周工', '黄工', '吴工', '徐工'],
    'PPM': ['杨工', '何工', '罗工', '高工', '马工', '梁工'],
    '测试': ['测试-李', '测试-朱', '测试-胡', '测试-郭', '测试-曹', '测试-彭'],
    '开发': ['开发-曾', '开发-田', '开发-蔡', '开发-潘', '开发-袁', '开发-于'],
    'AVM接口人': ['AVM-邓', 'AVM-苏', 'AVM-卢', 'AVM-蒋', 'AVM-蔡', 'AVM-贾'],
  };
  const contactData: any[] = [];
  for (let i = 0; i < customers.length; i++) {
    const c = customers[i];
    const roles = ['UPL', 'PPM', '测试', '开发', 'AVM接口人'];
    for (let r = 0; r < roles.length; r++) {
      const role = roles[r];
      const name = rolePool[role][i];
      contactData.push({
        customerId: c.id,
        name,
        role,
        department: c.shortName + ' 项目组',
        phone: '1390000' + String(1000 + i * 5 + r).padStart(4, '0'),
        email: name.replace(/[^\w]/g, '').toLowerCase() + '@' + c.code.toLowerCase() + '.demo',
        feishuId: 'feishu_' + c.shortName + '_' + role,
        primary: r === 0, // UPL 为主要联系人
        note: role === 'UPL' ? '客户侧项目总负责人' : role === 'AVM接口人' ? 'AVM 技术对接窗口' : '',
      });
    }
  }
  await tx.contact.createMany({ data: contactData });
  console.log(`✓ 联系人: ${contactData.length} 个（每个项目组 5 人 × ${customers.length} 组）`);

  // ========== V1.7 项目（每个车型一个 AVM 集成项目） ==========
  const findCar = (code: string) => carModels.find(c => c.code === code)!;
  const findCustomer = (code: string) => customers.find(c => c.code === code)!;
  const projects = await Promise.all([
    prisma.project.create({ data: {
      code: 'AVM-GALAXY-L7-2026', name: '银河 L7 AVM 2.5 集成项目',
      description: '银河 L7 AVM 透明底盘功能集成 + 工厂标定 + ODC 持续投入',
      customerId: findCustomer('GEELY-GALAXY-L7').id, carModelId: findCar('GALAXY-L7').id,
      pmUserId: 'pm', pmUserName: 'AVM 项目经理',
      startDate: daysFromNow(-90), endDate: daysFromNow(90),
      status: 'active', billingType: 'ODC', contractAmount: 3800000, budgetHours: 2400, consumedHours: 1620,
      risk: 'medium', progress: 67, tags: '银河系列,ODC,主力车型',
      createdBy: 'AVM 项目经理',
    }}),
    prisma.project.create({ data: {
      code: 'AVM-ZEEKR-001-2026', name: '极氪 001 透明底盘 + 泊车升级',
      description: '极氪 001 透明底盘功能升级 + 自动泊车集成',
      customerId: findCustomer('GEELY-ZEEKR-001').id, carModelId: findCar('ZEEKR-001').id,
      pmUserId: 'pm', pmUserName: 'AVM 项目经理',
      startDate: daysFromNow(-60), endDate: daysFromNow(120),
      status: 'active', billingType: 'ODC', contractAmount: 2800000, budgetHours: 1800, consumedHours: 980,
      risk: 'low', progress: 54, tags: '极氪,ODC,泊车',
      createdBy: 'AVM 项目经理',
    }}),
    prisma.project.create({ data: {
      code: 'AVM-LYNK-09-2026', name: '领克 09 AVM 泊车集成（ODM 包干）',
      description: '领克 09 整车 AVM 泊车集成 ODM 整体包干，含开发/测试/工厂标定/验收',
      customerId: findCustomer('GEELY-LYNK-09').id, carModelId: findCar('LYNK-09').id,
      pmUserId: 'pm', pmUserName: 'AVM 项目经理',
      startDate: daysFromNow(-30), endDate: daysFromNow(180),
      status: 'active', billingType: 'ODM', contractAmount: 6000000, budgetHours: 4200, consumedHours: 720,
      risk: 'high', progress: 17, tags: '领克,ODM,包干,大单',
      createdBy: 'AVM 项目经理',
    }}),
    prisma.project.create({ data: {
      code: 'AVM-BOYUE-L-2026', name: '博越 L AVM 升级 + 工厂标定',
      description: '博越 L AVM 升级，含工厂标定采图与标定调试',
      customerId: findCustomer('GEELY-BOYUE-L').id, carModelId: findCar('BOYUE-L').id,
      pmUserId: 'pm', pmUserName: 'AVM 项目经理',
      startDate: daysFromNow(-45), endDate: daysFromNow(60),
      status: 'active', billingType: 'ODC', contractAmount: 1500000, budgetHours: 1000, consumedHours: 620,
      risk: 'low', progress: 62, tags: '博越,ODC,标定',
      createdBy: 'AVM 项目经理',
    }}),
    prisma.project.create({ data: {
      code: 'AVM-PANDA-MINI-2026', name: '熊猫 mini AVM 标定版（固定价）',
      description: '熊猫 mini 入门级 AVM 标定固定价项目',
      customerId: findCustomer('GEELY-PANDA-MINI').id, carModelId: findCar('PANDA-MINI').id,
      pmUserId: 'pm', pmUserName: 'AVM 项目经理',
      startDate: daysFromNow(-20), endDate: daysFromNow(40),
      status: 'active', billingType: 'Fixed', contractAmount: 800000, budgetHours: 480, consumedHours: 310,
      risk: 'low', progress: 65, tags: '熊猫mini,固定价,标定',
      createdBy: 'AVM 项目经理',
    }}),
    prisma.project.create({ data: {
      code: 'AVM-ZEEKR-007-2026', name: '极氪 007 AVM 集成（Q1 启动）',
      description: '极氪 007 AVM 全功能集成，含泊车辅助 + 透明底盘 + 工厂标定',
      customerId: findCustomer('GEELY-ZEEKR-007').id, carModelId: findCar('ZEEKR-007').id,
      pmUserId: 'pm', pmUserName: 'AVM 项目经理',
      startDate: daysFromNow(7), endDate: daysFromNow(150),
      status: 'planning', billingType: 'ODC', contractAmount: 2200000, budgetHours: 1400, consumedHours: 0,
      risk: 'medium', progress: 0, tags: '极氪,ODC,Q1启动',
      createdBy: 'AVM 项目经理',
    }}),
    prisma.project.create({ data: {
      code: 'AVM-LYNK-08-2025', name: '领克 08 AVM 升级（2025 收尾）',
      description: '领克 08 2025 年度 AVM 升级，已进入验收阶段',
      customerId: customers[0].id, carModelId: findCar('LYNK-08').id, // 借用 银河L7 客户组演示
      pmUserId: 'pm', pmUserName: 'AVM 项目经理',
      startDate: daysFromNow(-180), endDate: daysFromNow(-10),
      status: 'completed', billingType: 'ODC', contractAmount: 1800000, budgetHours: 1100, consumedHours: 1180,
      risk: 'low', progress: 100, tags: '领克,ODC,收尾',
      createdBy: 'AVM 项目经理',
    }}),
  ]);
  console.log(`✓ 项目: ${projects.length} 个（覆盖银河/极氪/领克/博越/熊猫 主力车型）`);

  // 空间成员
  for (const u of users) {
    await tx.spaceMember.create({
      data: { spaceId: productSpace.id, userId: u.username, userName: u.displayName, role: u.role === 'tenant_admin' ? 'owner' : u.role === 'space_admin' ? 'admin' : 'member' },
    });
    if (['zhangsan', 'lisi', 'wangwu', 'pm'].includes(u.username)) {
      await tx.spaceMember.create({
        data: { spaceId: growthSpace.id, userId: u.username, userName: u.displayName, role: u.username === 'pm' ? 'admin' : 'member' },
      });
    }
  }
  console.log(`✓ 空间成员: ${users.length * 2} 个`);

  // ========== 节点流（每个工作项类型一个） ==========
  const reqFlow = await tx.nodeFlow.create({
    data: {
      name: '需求标准流程',
      workType: 'requirement',
      description: '从需求评审到验收的标准流程',
      isActive: true,
    },
  });
  const reqNodes = await Promise.all([
    prisma.flowNode.create({ data: { flowId: reqFlow.id, name: '需求池', nodeType: 'start', positionX: 80, positionY: 200, statusValue: '待评审', description: '新需求进入' } }),
    prisma.flowNode.create({ data: { flowId: reqFlow.id, name: '需求评审', nodeType: 'review', positionX: 280, positionY: 200, statusValue: '已规划', reviewType: 'tr', reviewRule: 'majority', description: 'PM / 架构师 / 业务方评审' } }),
    prisma.flowNode.create({ data: { flowId: reqFlow.id, name: '开发中', nodeType: 'normal', positionX: 480, positionY: 200, statusValue: '开发中', requiredFields: 'assignee,estimate', slaHours: 240, dodItems: JSON.stringify([{ name: '代码已合并', required: true }, { name: '单元测试通过', required: true }, { name: '设计稿已对齐', required: false }]) } }),
    prisma.flowNode.create({ data: { flowId: reqFlow.id, name: '测试中', nodeType: 'normal', positionX: 680, positionY: 200, statusValue: '测试中', slaHours: 72, dodItems: JSON.stringify([{ name: '用例已评审', required: true }, { name: '冒烟通过', required: true }]) } }),
    prisma.flowNode.create({ data: { flowId: reqFlow.id, name: 'UAT验收', nodeType: 'review', positionX: 880, positionY: 200, statusValue: '验收中', reviewType: 'qr', reviewRule: 'all', description: '业务方验收' } }),
    prisma.flowNode.create({ data: { flowId: reqFlow.id, name: '已验收', nodeType: 'end', positionX: 1080, positionY: 200, statusValue: '已验收' } }),
    prisma.flowNode.create({ data: { flowId: reqFlow.id, name: '已关闭', nodeType: 'end', positionX: 880, positionY: 360, statusValue: '已关闭', description: '归档' } }),
  ]);
  // 连线
  await tx.flowTransition.createMany({
    data: [
      { flowId: reqFlow.id, fromNodeId: reqNodes[0].id, toNodeId: reqNodes[1].id, label: '提交评审', isDefault: true },
      { flowId: reqFlow.id, fromNodeId: reqNodes[1].id, toNodeId: reqNodes[2].id, label: '通过', isDefault: true },
      { flowId: reqFlow.id, fromNodeId: reqNodes[1].id, toNodeId: reqNodes[6].id, label: '驳回' },
      { flowId: reqFlow.id, fromNodeId: reqNodes[2].id, toNodeId: reqNodes[3].id, label: '提测', isDefault: true },
      { flowId: reqFlow.id, fromNodeId: reqNodes[3].id, toNodeId: reqNodes[4].id, label: '测试通过', isDefault: true },
      { flowId: reqFlow.id, fromNodeId: reqNodes[3].id, toNodeId: reqNodes[2].id, label: '打回修复' },
      { flowId: reqFlow.id, fromNodeId: reqNodes[4].id, toNodeId: reqNodes[5].id, label: '验收通过', isDefault: true },
      { flowId: reqFlow.id, fromNodeId: reqNodes[4].id, toNodeId: reqNodes[2].id, label: '验收不通过' },
    ],
  });

  const taskFlow = await tx.nodeFlow.create({
    data: { name: '任务标准流程', workType: 'task', description: '任务流转流程', isActive: true },
  });
  const taskNodes = await Promise.all([
    prisma.flowNode.create({ data: { flowId: taskFlow.id, name: '待领取', nodeType: 'start', positionX: 80, positionY: 200, statusValue: '待领取' } }),
    prisma.flowNode.create({ data: { flowId: taskFlow.id, name: '进行中', nodeType: 'normal', positionX: 280, positionY: 200, statusValue: '进行中' } }),
    prisma.flowNode.create({ data: { flowId: taskFlow.id, name: '自测中', nodeType: 'normal', positionX: 480, positionY: 200, statusValue: '自测中', dodItems: JSON.stringify([{ name: '自测用例通过', required: true }]) } }),
    prisma.flowNode.create({ data: { flowId: taskFlow.id, name: '已完成', nodeType: 'end', positionX: 680, positionY: 200, statusValue: '已完成' } }),
  ]);
  await tx.flowTransition.createMany({
    data: [
      { flowId: taskFlow.id, fromNodeId: taskNodes[0].id, toNodeId: taskNodes[1].id, isDefault: true },
      { flowId: taskFlow.id, fromNodeId: taskNodes[1].id, toNodeId: taskNodes[2].id, isDefault: true },
      { flowId: taskFlow.id, fromNodeId: taskNodes[2].id, toNodeId: taskNodes[3].id, isDefault: true },
    ],
  });

  const bugFlow = await tx.nodeFlow.create({
    data: { name: '缺陷处理流程', workType: 'bug', description: '缺陷从发现到关闭', isActive: true },
  });
  const bugNodes = await Promise.all([
    prisma.flowNode.create({ data: { flowId: bugFlow.id, name: '待修复', nodeType: 'start', positionX: 80, positionY: 200, statusValue: '待修复' } }),
    prisma.flowNode.create({ data: { flowId: bugFlow.id, name: '修复中', nodeType: 'normal', positionX: 280, positionY: 200, statusValue: '修复中' } }),
    prisma.flowNode.create({ data: { flowId: bugFlow.id, name: '待验证', nodeType: 'normal', positionX: 480, positionY: 200, statusValue: '待验证' } }),
    prisma.flowNode.create({ data: { flowId: bugFlow.id, name: '已关闭', nodeType: 'end', positionX: 680, positionY: 200, statusValue: '已关闭' } }),
    prisma.flowNode.create({ data: { flowId: bugFlow.id, name: '已驳回', nodeType: 'end', positionX: 480, positionY: 360, statusValue: '已驳回' } }),
  ]);
  await tx.flowTransition.createMany({
    data: [
      { flowId: bugFlow.id, fromNodeId: bugNodes[0].id, toNodeId: bugNodes[1].id, isDefault: true },
      { flowId: bugFlow.id, fromNodeId: bugNodes[1].id, toNodeId: bugNodes[2].id, isDefault: true },
      { flowId: bugFlow.id, fromNodeId: bugNodes[2].id, toNodeId: bugNodes[3].id, label: '验证通过', isDefault: true },
      { flowId: bugFlow.id, fromNodeId: bugNodes[2].id, toNodeId: bugNodes[4].id, label: '驳回' },
      { flowId: bugFlow.id, fromNodeId: bugNodes[2].id, toNodeId: bugNodes[1].id, label: '未修复' },
    ],
  });

  console.log(`✓ 节点流: 3 套（需求/任务/缺陷）`);

  // ========== 评审模板 ==========
  await tx.reviewTemplate.createMany({
    data: [
      { name: '技术评审 TR4', reviewType: 'tr', description: '技术方案评审', items: JSON.stringify([
        { name: '技术可行性', itemType: 'score', maxScore: 5, description: '技术路线是否可行' },
        { name: '架构合理性', itemType: 'score', maxScore: 5 },
        { name: '性能影响', itemType: 'score', maxScore: 5 },
        { name: '安全合规', itemType: 'check', description: '是否涉及安全风险' },
        { name: '风险评估', itemType: 'text', description: '列出已知风险' },
      ]) },
      { name: '业务验收 UAT', reviewType: 'qr', description: '业务方验收评审', items: JSON.stringify([
        { name: '业务需求满足度', itemType: 'score', maxScore: 5 },
        { name: '用户体验', itemType: 'score', maxScore: 5 },
        { name: '数据准确性', itemType: 'check' },
        { name: '改进建议', itemType: 'text' },
      ]) },
      { name: '投资决策 DCP', reviewType: 'dcp', description: '产品/项目投资决策', items: JSON.stringify([
        { name: '商业价值', itemType: 'score', maxScore: 10 },
        { name: '市场机会', itemType: 'score', maxScore: 10 },
        { name: '资源投入合理性', itemType: 'score', maxScore: 10 },
        { name: '是否继续投资', itemType: 'check', description: 'Go / Not Go' },
      ]) },
    ],
  });
  console.log(`✓ 评审模板: 3 个`);

  // ========== 迭代（吉利 AVM 集成项目冲刺） ==========
  const iter1 = await tx.iteration.create({ data: { name: 'AVM V2.5 银河 L7 集成冲刺', goal: '银河 L7 AVM 2.5 透明底盘 + 工厂标定完成', status: 'active', startDate: daysFromNow(-7), endDate: daysFromNow(7), space: { connect: { id: productSpace.id } } } });
  const iter2 = await tx.iteration.create({ data: { name: 'AVM V2.6 极氪系列升级', goal: '极氪 001/007 AVM 透明底盘 + 泊车集成', status: 'planning', startDate: daysFromNow(8), endDate: daysFromNow(35), space: { connect: { id: productSpace.id } } } });
  const iter3 = await tx.iteration.create({ data: { name: 'AVM 标定工具优化冲刺', goal: '工厂标定采图工具 + 自动标定算法优化', status: 'active', startDate: daysFromNow(-3), endDate: daysFromNow(10), space: { connect: { id: growthSpace.id } } } });

  // ========== 一些工作项（关联到流程的节点） ==========
  const findNode = async (flowId: string, status: string) => {
    const flow = await tx.nodeFlow.findUnique({ where: { id: flowId }, include: { nodes: true } });
    return flow?.nodes.find(n => n.statusValue === status);
  };

  const reqReview = await findNode(reqFlow.id, '待评审');
  const reqPlanned = await findNode(reqFlow.id, '已规划');
  const reqDevelop = await findNode(reqFlow.id, '开发中');
  const reqTest = await findNode(reqFlow.id, '测试中');
  const reqAccept = await findNode(reqFlow.id, '验收中');
  const reqDone = await findNode(reqFlow.id, '已验收');

  const req1 = await tx.workItem.create({ data: { type: 'requirement', key: 'REQ-1', title: '银河 L7 AVM 透明底盘功能开发', description: '## 需求背景\n\n客户：吉利银河 L7 项目组（陈工）\n依据：客户提供 VPP 计划 + 功能打点表\n\n## 需求描述\n\n基于客户提供 SDB 车模数据 + 4 颗广角 Camera，实现透明底盘鸟瞰视图：\n- 启动车辆 < 1.5s 出图\n- 4 路 Camera 拼接误差 < 5cm\n- 鸟瞰图刷新率 ≥ 25fps\n\n## 验收标准\n\n- 工厂标定采图一次通过率 ≥ 95%\n- 复杂光照（夜间/雨雪/逆光）下画面清晰\n- 与极氪 001 已发布的透明底盘功能保持视觉一致性', status: '已验收', priority: 'P0', reporter: 'AVM 项目经理', assignee: '张三（研发一组）', module: 'AVM 透明底盘', labels: '银河L7,ODC,透明底盘', iteration: { connect: { id: iter1.id } }, space: { connect: { id: productSpace.id } }, estimate: 21, actualHours: 23, planStart: daysFromNow(-30), planEnd: daysFromNow(-7), actualStart: daysFromNow(-30), actualEnd: daysFromNow(-7), currentNode: { connect: { id: reqDone?.id  } }, project: { connect: { id: projects[0].id } }, carModel: { connect: { id: carModels[0].id } }, customer: { connect: { id: customers[0].id } } } });
  const req2 = await tx.workItem.create({ data: { type: 'requirement', key: 'REQ-2', title: '极氪 001 泊车辅助 AVM 集成', description: '## 需求背景\n\n客户：吉利极氪 001 项目组（林工）\n依据：客户 PRD + SWRS 基线 + UE/UI 文档\n\n## 需求描述\n\n基于 AVM 鸟瞰图，实现自动泊车辅助功能：\n- 车位识别准确率 ≥ 90%\n- 泊车轨迹平滑，体感无顿挫\n- 与客户 FlymeAuto 中控大屏深度集成\n- 兼容极氪 001 现役车型 OTA 升级\n\n## 验收标准\n\n- 客户 UAT 一次通过\n- 泊车成功率 ≥ 85%（客户实车测试 50 次）', status: '开发中', priority: 'P0', reporter: 'AVM 项目经理', assignee: '李四（研发一组）', module: 'AVM 泊车辅助', labels: '极氪001,ODC,泊车,FlymeAuto', iteration: { connect: { id: iter1.id } }, space: { connect: { id: productSpace.id } }, estimate: 34, actualHours: 18, planStart: daysFromNow(-15), planEnd: daysFromNow(20), actualStart: daysFromNow(-15), currentNode: { connect: { id: reqDevelop?.id  } }, project: { connect: { id: projects[1].id } }, carModel: { connect: { id: carModels[2].id } }, customer: { connect: { id: customers[1].id } } } });
  const req3 = await tx.workItem.create({ data: { type: 'requirement', key: 'REQ-3', title: '领克 09 ODM 整车 AVM 泊车集成', description: '## 需求背景\n\n客户：吉利领克 09 项目组（周工）\n合同类型：ODM 整体包干（600 万）\n依据：客户 ESOW + PO 已签\n\n## 需求描述\n\nODM 模式交付 AVM 整车集成：\n- 包含 AVM 软件开发 + 工厂标定 + 验收 + 开票 + 回款\n- 涵盖自动泊车 + 透明底盘 + 360°环视\n- 周期 7 个月\n- 团队峰值 8 人\n\n## 关键风险\n\n- 工厂标定排期紧张（与领克成都工厂协调中）\n- ODM 报价博弈已完成，但需要严格控制超投', status: '已规划', priority: 'P0', reporter: 'AVM 项目经理', assignee: '王五（研发二组）', module: 'AVM 泊车辅助', labels: '领克09,ODM,包干,大单', iteration: { connect: { id: iter2.id } }, space: { connect: { id: productSpace.id } }, estimate: 89, actualHours: 12, planStart: daysFromNow(-5), planEnd: daysFromNow(180), actualStart: daysFromNow(-5), currentNode: { connect: { id: reqPlanned?.id  } }, project: { connect: { id: projects[2].id } }, carModel: { connect: { id: carModels[5].id } }, customer: { connect: { id: customers[2].id } } } });
  const req4 = await tx.workItem.create({ data: { type: 'requirement', key: 'REQ-4', title: '博越 L AVM 工厂标定采图', description: '## 需求背景\n\n客户：吉利博越 L 项目组（黄工）\n依据：客户提供的 VPP + 标定场景清单\n\n## 需求描述\n\n赴客户工厂完成 AVM 工厂标定：\n- 4 颗广角 Camera 标定采图（白天/夜间/雨雾）\n- 标定场地：吉利宁波春晓工厂\n- 输出标定文件 + 标定报告\n- 与客户工厂标定工程师协同\n\n## 验收标准\n\n- 标定一次性通过客户验收\n- 出具标定报告签字版', status: '开发中', priority: 'P1', reporter: 'AVM 项目经理', assignee: '赵六（研发二组）', module: 'AVM 工厂标定', labels: '博越L,ODC,工厂标定,采图', iteration: { connect: { id: iter1.id } }, space: { connect: { id: productSpace.id } }, estimate: 8, planStart: daysFromNow(-2), planEnd: daysFromNow(4), actualStart: daysFromNow(-2), currentNode: { connect: { id: reqDevelop?.id  } }, project: { connect: { id: projects[3].id } }, carModel: { connect: { id: carModels[7].id } }, customer: { connect: { id: customers[3].id } } } });
  const req5 = await tx.workItem.create({ data: { type: 'requirement', key: 'REQ-5', title: '熊猫 mini AVM 标定固定价项目', description: '## 需求背景\n\n客户：吉利熊猫 mini 项目组（吴工）\n合同类型：固定价 80 万\n依据：ESOW + 报价单已签\n\n## 需求描述\n\n入门级 AVM 标定固定价交付：\n- 出厂标定文件 + 工厂支持\n- 工厂标定一次性通过\n- 含 2 周现场支持', status: '已规划', priority: 'P1', reporter: 'AVM 项目经理', assignee: '李四（研发一组）', module: 'AVM 工厂标定', labels: '熊猫mini,固定价,标定', iteration: { connect: { id: iter1.id } }, space: { connect: { id: productSpace.id } }, estimate: 13, planStart: daysFromNow(2), planEnd: daysFromNow(20), currentNode: { connect: { id: reqPlanned?.id  } }, project: { connect: { id: projects[4].id } }, carModel: { connect: { id: carModels[8].id } }, customer: { connect: { id: customers[4].id } } } });
  const req6 = await tx.workItem.create({ data: { type: 'requirement', key: 'REQ-6', title: '极氪 007 AVM 全功能集成（Q1 启动）', description: '## 需求背景\n\n客户：吉利极氪 007 项目组（徐工）\n启动日期：本周 +7 天\n合同类型：ODC 220 万\n\n## 需求描述\n\n极氪 007 AVM 全功能集成：\n- 透明底盘 + 自动泊车 + 360° 环视\n- 工厂标定（与极氪宁波工厂协调中）\n- 与客户 FlymeAuto 深度集成\n\n## 风险\n\n- 项目启动与极氪 001 共享资源，资源排期需要协调', status: '待评审', priority: 'P0', reporter: 'AVM 项目经理', module: 'AVM 全功能集成', labels: '极氪007,ODC,Q1启动', iteration: { connect: { id: iter2.id } }, space: { connect: { id: productSpace.id } }, estimate: 55, planStart: daysFromNow(7), planEnd: daysFromNow(150), currentNode: { connect: { id: reqReview?.id  } }, project: { connect: { id: projects[5].id } }, carModel: { connect: { id: carModels[3].id } }, customer: { connect: { id: customers[5].id } } } });
  const req7 = await tx.workItem.create({ data: { type: 'requirement', key: 'REQ-7', title: '领克 08 AVM 2025 收尾验收', description: '## 项目背景\n\n客户：领克（借用 银河L7 客户组演示）\n合同类型：ODC 180 万 / 1100 人天\n\n## 当前状态\n\n已进入验收阶段，2025 已消耗 1180 人天（超投 7%），需要复盘。\n\n## 关键任务\n\n- 推动客户 UAT 验收\n- 准备回款材料\n- 复盘超投原因', status: '验收中', priority: 'P1', reporter: 'AVM 项目经理', assignee: '张三（研发一组）', module: 'AVM 升级', labels: '领克08,ODC,收尾,超投', iteration: { connect: { id: iter1.id } }, space: { connect: { id: productSpace.id } }, estimate: 5, planStart: daysFromNow(-3), planEnd: daysFromNow(7), actualStart: daysFromNow(-3), currentNode: { connect: { id: reqAccept?.id  } }, project: { connect: { id: projects[6].id } }, carModel: { connect: { id: carModels[6].id } } } });

  const taskTodo = await findNode(taskFlow.id, '待领取');
  const taskDoing = await findNode(taskFlow.id, '进行中');
  const taskDone = await findNode(taskFlow.id, '已完成');
  const taskTest = await findNode(taskFlow.id, '自测中');

  await tx.workItem.create({ data: { type: 'task', key: 'TASK-1', title: '银河 L7 Camera 交互协议适配', description: '对接客户提供的车身 CAN 协议 + Camera 协议，完成 AVM 与车身数据贯通', status: '已完成', priority: 'P0', reporter: '李四（研发一组）', assignee: '李四（研发一组）', module: 'AVM 透明底盘', labels: '银河L7,Camera协议,CAN', iteration: { connect: { id: iter1.id } }, space: { connect: { id: productSpace.id } }, estimate: 5, actualHours: 6, parent: { connect: { id: req1.id } }, planStart: daysFromNow(-30), planEnd: daysFromNow(-26), actualStart: daysFromNow(-30), actualEnd: daysFromNow(-26), currentNode: { connect: { id: taskDone?.id  } }, project: { connect: { id: projects[0].id } }, carModel: { connect: { id: carModels[0].id } } } });
  await tx.workItem.create({ data: { type: 'task', key: 'TASK-2', title: '银河 L7 SDB 车模数据解析', description: '解析客户提供 SDB 文件中的车模点云/三角面片数据，生成 AVM 鸟瞰图所需的 3D 车模', status: '已完成', priority: 'P0', reporter: '王五（研发二组）', assignee: '王五（研发二组）', module: 'AVM 透明底盘', labels: '银河L7,SDB,3D车模', iteration: { connect: { id: iter1.id } }, space: { connect: { id: productSpace.id } }, estimate: 8, actualHours: 9, parent: { connect: { id: req1.id } }, planStart: daysFromNow(-25), planEnd: daysFromNow(-18), actualStart: daysFromNow(-25), actualEnd: daysFromNow(-18), currentNode: { connect: { id: taskDone?.id  } }, project: { connect: { id: projects[0].id } }, carModel: { connect: { id: carModels[0].id } } } });
  await tx.workItem.create({ data: { type: 'task', key: 'TASK-3', title: '极氪 001 泊车 UI 集成', description: '将 AVM 泊车 UI 嵌入客户 FlymeAuto 中控大屏，遵循客户 UE/UI 规范', status: '已完成', priority: 'P1', reporter: '王五（研发二组）', assignee: '王五（研发二组）', module: 'AVM 泊车辅助', labels: '极氪001,UE,UI,FlymeAuto', iteration: { connect: { id: iter1.id } }, space: { connect: { id: productSpace.id } }, estimate: 5, actualHours: 5, parent: { connect: { id: req2.id } }, planStart: daysFromNow(-15), planEnd: daysFromNow(-10), currentNode: { connect: { id: taskDone?.id  } }, project: { connect: { id: projects[1].id } }, carModel: { connect: { id: carModels[2].id } } } });
  await tx.workItem.create({ data: { type: 'task', key: 'TASK-4', title: '极氪 001 泊车轨迹规划算法', description: '基于 AVM 鸟瞰图 + 超声波雷达数据，规划自动泊车轨迹', status: '自测中', priority: 'P1', reporter: '李四（研发一组）', assignee: '李四（研发一组）', module: 'AVM 泊车辅助', labels: '极氪001,泊车算法,雷达', iteration: { connect: { id: iter1.id } }, space: { connect: { id: productSpace.id } }, estimate: 13, actualHours: 8, parent: { connect: { id: req2.id } }, planStart: daysFromNow(-10), planEnd: daysFromNow(5), currentNode: { connect: { id: taskTest?.id  } }, project: { connect: { id: projects[1].id } }, carModel: { connect: { id: carModels[2].id } } } });
  await tx.workItem.create({ data: { type: 'task', key: 'TASK-5', title: '博越 L 工厂标定现场采图', description: '赴吉利宁波春晓工厂，完成博越 L 4 颗 Camera 工厂标定采图（白天/夜间/雨雾）', status: '进行中', priority: 'P1', reporter: '赵六（研发二组）', assignee: '赵六（研发二组）', module: 'AVM 工厂标定', labels: '博越L,工厂标定,采图,出差', iteration: { connect: { id: iter1.id } }, space: { connect: { id: productSpace.id } }, estimate: 8, actualHours: 3, parent: { connect: { id: req4.id } }, planStart: daysFromNow(-2), planEnd: daysFromNow(3), actualStart: daysFromNow(-2), currentNode: { connect: { id: taskDoing?.id  } }, project: { connect: { id: projects[3].id } }, carModel: { connect: { id: carModels[7].id } } } });
  await tx.workItem.create({ data: { type: 'task', key: 'TASK-6', title: '领克 09 ODM 立项材料准备', description: '准备领克 09 ODM 立项材料：ESOW / 报价单 / 风险评估 / 资源预测', status: '待领取', priority: 'P0', reporter: 'AVM 项目经理', assignee: 'AVM 项目经理', module: 'AVM 立项', labels: '领克09,ODM,立项,ESOW', iteration: { connect: { id: iter1.id } }, space: { connect: { id: productSpace.id } }, estimate: 5, parent: { connect: { id: req3.id } }, planStart: daysFromNow(0), planEnd: daysFromNow(5), currentNode: { connect: { id: taskTodo?.id  } }, project: { connect: { id: projects[2].id } }, carModel: { connect: { id: carModels[5].id } } } });

  const bugPending = await findNode(bugFlow.id, '待修复');
  const bugFixing = await findNode(bugFlow.id, '修复中');
  await tx.workItem.create({ data: { type: 'bug', key: 'BUG-1', title: '银河 L7 全景影像受限（黑屏）', description: '## 复现\n\n客户反馈：\n1. 启动车辆，挂入 R 挡\n2. AVM 全景影像画面整体变黑，仅能看到部分边框\n3. 复现概率约 1/20\n\n## 现象\n\n- 4 路 Camera 同时黑屏\n- 重启车机后恢复\n\n## 已采取行动\n\n- 已协调 Camera BSP 团队和智驾团队介入\n- 客户 AVM 接口人 AVM-邓 已升级为高优先级', status: '修复中', priority: 'P0', severity: 'S1', reporter: 'AVM-邓（银河 L7 AVM接口人）', assignee: '李四（研发一组）', module: 'AVM 全景影像', labels: '银河L7,黑屏,CameraBSP,S1', iteration: { connect: { id: iter1.id } }, space: { connect: { id: productSpace.id } }, estimate: 5, actualHours: 2, planStart: daysFromNow(0), planEnd: daysFromNow(2), currentNode: { connect: { id: bugFixing?.id  } }, project: { connect: { id: projects[0].id } }, carModel: { connect: { id: carModels[0].id } }, customer: { connect: { id: customers[0].id } } } });
  await tx.workItem.create({ data: { type: 'bug', key: 'BUG-2', title: '极氪 001 雷达故障告警误报', description: '雷达持续告警"泊车雷达故障"，但实际雷达硬件正常，客户多次抱怨。\n\n## 分析\n\n疑似雷达数据解析逻辑异常，已协调相关资源快速响应。', status: '待修复', priority: 'P1', severity: 'S2', reporter: '测试-李（极氪 001）', assignee: '王五（研发二组）', module: 'AVM 泊车辅助', labels: '极氪001,雷达,误报', iteration: { connect: { id: iter1.id } }, space: { connect: { id: productSpace.id } }, estimate: 3, planStart: daysFromNow(1), planEnd: daysFromNow(3), currentNode: { connect: { id: bugPending?.id  } }, project: { connect: { id: projects[1].id } }, carModel: { connect: { id: carModels[2].id } }, customer: { connect: { id: customers[1].id } } } });
  await tx.workItem.create({ data: { type: 'bug', key: 'BUG-3', title: '博越 L 摄像头画面花屏', description: '后视摄像头偶发花屏，怀疑与车机系统兼容性相关。\n\n客户要求按客户质量流程复盘并输出复盘文档。', status: '待修复', priority: 'P1', severity: 'S2', reporter: '测试-朱（博越 L）', module: 'AVM 全景影像', labels: '博越L,摄像头,花屏,需复盘', iteration: { connect: { id: iter1.id } }, space: { connect: { id: productSpace.id } }, planStart: daysFromNow(2), planEnd: daysFromNow(4), currentNode: { connect: { id: bugPending?.id  } }, project: { connect: { id: projects[3].id } }, carModel: { connect: { id: carModels[7].id } }, customer: { connect: { id: customers[3].id } } } });
  await tx.workItem.create({ data: { type: 'bug', key: 'BUG-4', title: '领克 08 AVM 标定漂移（已超期）', description: '## 复现\n\n领克 08 车主反馈：\n- 泊车后视画面与实际车位出现 10cm 偏差\n- 多名车主集中反馈，市场关注度高\n\n## 已升级\n\n已超期 1 天，需快速响应并按客户模板输出复盘文档。', status: '待修复', priority: 'P0', severity: 'S1', reporter: 'AVM-卢（领克 08 市场反馈）', assignee: '李四（研发一组）', module: 'AVM 标定', labels: '领克08,标定漂移,市场反馈,S1', iteration: { connect: { id: iter1.id } }, space: { connect: { id: productSpace.id } }, planStart: daysFromNow(-2), planEnd: daysFromNow(-1), currentNode: { connect: { id: bugPending?.id  } }, project: { connect: { id: projects[6].id } }, carModel: { connect: { id: carModels[6].id } } } });

  await tx.workItem.create({ data: { type: 'release', key: 'REL-1', title: 'AVM V2.5 银河 L7 集成版发布', description: '## 发布内容\n\n- 银河 L7 透明底盘功能\n- 工厂标定文件\n- 客户 UAT 通过的版本\n\n## 客户对接\n\n- 客户：陈工（UPL）\n- 发版窗口：本周内', status: '规划中', priority: 'P0', reporter: 'AVM 项目经理', assignee: '张三（研发一组）', module: 'AVM 集成发布', labels: '银河L7,V2.5,发版', planStart: daysFromNow(-7), planEnd: daysFromNow(14), project: { connect: { id: projects[0].id } }, carModel: { connect: { id: carModels[0].id } } } });

  // ========== AI 字段配置 ==========
  await tx.aIFieldConfig.createMany({
    data: [
      { name: '需求估分建议', workType: 'requirement', targetField: 'estimate', capability: 'estimate_suggest', inputFields: 'title,description,module', prompt: '基于历史相似需求估分', enabled: true },
      { name: '任务估分建议', workType: 'task', targetField: 'estimate', capability: 'estimate_suggest', inputFields: 'title,description,module', enabled: true },
      { name: '缺陷自动归类', workType: 'bug', targetField: 'module', capability: 'bug_classify', inputFields: 'title,description', enabled: true },
      { name: '缺陷优先级建议', workType: 'bug', targetField: 'priority', capability: 'priority_suggest', inputFields: 'title,description,severity', enabled: true },
    ],
  });
  console.log(`✓ AI 字段配置: 4 个`);

  // ========== 仪表盘 + 图表（吉利 AVM 集成项目视图） ==========
  const dash1 = await tx.dashboard.create({ data: { name: 'AVM 集成项目总览', description: 'PM/管理层使用：跨车型项目全景', scope: 'custom' } });
  const dash2 = await tx.dashboard.create({ data: { name: '研发效能', description: '团队研发效率分析', scope: 'custom' } });

  await tx.chartConfig.createMany({
    data: [
      { name: '工作项类型分布', chartType: 'pie', source: 'work_items', dimensions: JSON.stringify([{ field: 'type', alias: '类型' }]), measures: JSON.stringify([{ field: 'id', aggregation: 'count', alias: '数量' }]), dashboardId: dash1.id, position: 0, options: JSON.stringify({ title: '工作项类型分布' }) },
      { name: '状态分布', chartType: 'bar', source: 'work_items', dimensions: JSON.stringify([{ field: 'status', alias: '状态' }]), measures: JSON.stringify([{ field: 'id', aggregation: 'count', alias: '数量' }]), dashboardId: dash1.id, position: 1, options: JSON.stringify({ title: '状态分布', horizontal: true }) },
      { name: '优先级分布', chartType: 'pie', source: 'work_items', dimensions: JSON.stringify([{ field: 'priority', alias: '优先级' }]), measures: JSON.stringify([{ field: 'id', aggregation: 'count', alias: '数量' }]), dashboardId: dash1.id, position: 2, options: JSON.stringify({ title: '优先级分布' }) },
      { name: '负责人工作负荷', chartType: 'bar', source: 'work_items', dimensions: JSON.stringify([{ field: 'assignee', alias: '负责人' }]), measures: JSON.stringify([{ field: 'estimate', aggregation: 'sum', alias: '总估分' }]), dashboardId: dash2.id, position: 0, options: JSON.stringify({ title: '负责人负荷' }) },
      { name: '类型估分对比', chartType: 'bar', source: 'work_items', dimensions: JSON.stringify([{ field: 'type', alias: '类型' }]), measures: JSON.stringify([{ field: 'estimate', aggregation: 'avg', alias: '平均估分' }]), dashboardId: dash2.id, position: 1, options: JSON.stringify({ title: '类型平均估分' }) },
      { name: '模块估分汇总', chartType: 'bar', source: 'work_items', dimensions: JSON.stringify([{ field: 'module', alias: '模块' }]), measures: JSON.stringify([{ field: 'estimate', aggregation: 'sum', alias: '总估分' }]), dashboardId: dash2.id, position: 2, options: JSON.stringify({ title: '模块估分', horizontal: true }) },
    ],
  });
  console.log(`✓ 仪表盘: 2 个，图表: 6 个`);

  // 重新跑 PR seed（关系和评论）
  // 关联
  const allItems = await tx.workItem.findMany();
  const findKey = (k: string) => allItems.find(i => i.key === k);
  const bug1 = findKey('BUG-1')!;
  const task5 = findKey('TASK-5')!;
  const task4 = findKey('TASK-4')!;
  const rel1 = findKey('REL-1')!;

  await tx.workItemRelation.createMany({
    data: [
      { fromId: bug1.id, toId: req3.id, relationType: '关联' },
      { fromId: task5.id, toId: task4.id, relationType: '阻塞' },
      { fromId: rel1.id, toId: req1.id, relationType: '引用' },
      { fromId: rel1.id, toId: req2.id, relationType: '引用' },
      { fromId: rel1.id, toId: req3.id, relationType: '引用' },
    ],
  });

  // 评论
  await tx.comment.createMany({
    data: [
      { workItemId: req3.id, author: 'AVM 项目经理', content: '领克 09 ODM 大单，必须控制超投。建议每个阶段设置成本审查点。' },
      { workItemId: req3.id, author: '王五（研发二组）', content: '已与领克成都工厂初步沟通，标定排期可协调到下月初。' },
      { workItemId: bug1.id, author: '李四（研发一组）', content: '已协调 Camera BSP 团队介入，怀疑是车机电源管理问题。明天会有结论。' },
      { workItemId: task5.id, author: '赵六（研发二组）', content: '宁波春晓工厂标定采图已到 40%，夜间场景明天开始。' },
    ],
  });

  // 活动
  for (const item of allItems.slice(0, 15)) {
    await tx.activity.create({
      data: {
        workItemId: item.id,
        actor: item.reporter,
        action: 'created',
        newValue: `${item.key} ${item.title}`,
        createdAt: item.createdAt,
      },
    });
  }

  console.log('✅ 种子数据初始化完成');
  console.log(`   用户: 7 | 空间: 2 | 客户: ${customers.length} | 车型: ${carModels.length} | 联系人: ${contactData.length} | 项目: ${projects.length}`);
  console.log(`   迭代: 3 | 工作项: ${allItems.length} | 节点流: 3 | 评审模板: 3`);
  console.log(`   AI 配置: 4 | 仪表盘: 2 | 图表: 6`);

  // ========== V1.7.1 外部依赖（台架/实车/车模/SDB/UE/UI/标定） ==========
  const depsData = [
    // REQ-1 银河 L7 AVM 透明底盘 - 需要 SDB + 标定
    { type: 'SDB', name: '银河 L7 V2.5 软件开发板', owner: '李四（研发一组）', status: 'ready', expectedDate: daysFromNow(-15), actualDate: daysFromNow(-12), workItemKey: 'REQ-1', projectCode: 'AVM-GALAXY-L7-2026' },
    { type: '标定', name: '银河 L7 4 颗广角 Camera 标定文件', owner: '赵六（研发二组）', status: 'ready', expectedDate: daysFromNow(-7), actualDate: daysFromNow(-5), workItemKey: 'REQ-1', projectCode: 'AVM-GALAXY-L7-2026' },
    // REQ-2 极氪 001 泊车 - 需要实车 + UE
    { type: '实车', name: '极氪 001 Me 版试制车', owner: '王五（研发二组）', status: 'preparing', expectedDate: daysFromNow(7), workItemKey: 'REQ-2', projectCode: 'AVM-ZEEKR-001-2026' },
    { type: 'UE', name: '极氪 FlymeAuto 中控 UI 套件', owner: '李四（研发一组）', status: 'blocked', blocker: '客户 FlymeAuto SDK 接口未开放，等客户确认中', expectedDate: daysFromNow(3), workItemKey: 'REQ-2', projectCode: 'AVM-ZEEKR-001-2026' },
    // REQ-3 领克 09 ODM - 多种依赖
    { type: '台架', name: '领克 09 ODM HIL 测试台架', owner: '王五（研发二组）', status: 'preparing', expectedDate: daysFromNow(14), workItemKey: 'REQ-3', projectCode: 'AVM-LYNK-09-2026' },
    { type: '实车', name: '领克 09 试制车 2 台', owner: '王五（研发二组）', status: 'pending', expectedDate: daysFromNow(30), workItemKey: 'REQ-3', projectCode: 'AVM-LYNK-09-2026' },
    { type: '车模', name: '领克 09 车模（VPP+UI）', owner: '张三（研发一组）', status: 'preparing', expectedDate: daysFromNow(10), workItemKey: 'REQ-3', projectCode: 'AVM-LYNK-09-2026' },
    { type: 'UI', name: '领克 09 中控 UI 设计稿', owner: '钱七（设计）', status: 'preparing', expectedDate: daysFromNow(20), workItemKey: 'REQ-3', projectCode: 'AVM-LYNK-09-2026' },
    { type: '标定', name: '领克成都工厂标定排期', owner: 'PM', status: 'blocked', blocker: '与领克成都工厂协调中，工厂 8 月排期已满', expectedDate: daysFromNow(60), workItemKey: 'REQ-3', projectCode: 'AVM-LYNK-09-2026' },
    // REQ-4 博越 L 工厂标定 - 标定
    { type: '实车', name: '博越 L 试制车（宁波春晓工厂）', owner: '赵六（研发二组）', status: 'ready', expectedDate: daysFromNow(-2), actualDate: daysFromNow(-2), workItemKey: 'REQ-4', projectCode: 'AVM-BOYUE-L-2026' },
    { type: '标定', name: '博越 L 工厂标定采图服务', owner: '赵六（研发二组）', status: 'preparing', expectedDate: daysFromNow(4), workItemKey: 'REQ-4', projectCode: 'AVM-BOYUE-L-2026' },
    // REQ-5 熊猫 mini
    { type: '标定', name: '熊猫 mini 入门级标定包', owner: '李四（研发一组）', status: 'pending', expectedDate: daysFromNow(20), workItemKey: 'REQ-5', projectCode: 'AVM-PANDA-MINI-2026' },
  ];

  // 解析 workItemKey + projectCode 为 ID 后插入
  const workItemByKey = new Map(allItems.map(i => [i.key, i]));
  const projectByCode = new Map(projects.map(p => [p.code, p]));
  for (const d of depsData) {
    const wi = d.workItemKey ? workItemByKey.get(d.workItemKey) : null;
    const pj = d.projectCode ? projectByCode.get(d.projectCode) : null;
    await tx.externalDependency.create({
      data: {
        type: d.type, name: d.name, owner: d.owner, status: d.status,
        expectedDate: d.expectedDate, actualDate: d.actualDate || null,
        blocker: d.blocker || '',
        workItemId: wi?.id || null,
        projectId: pj?.id || null,
        spaceId: productSpace.id,
      },
    });
  }
  console.log(`   外部依赖: ${depsData.length}`);

  // ========== V1.7 测试用例（吉利 AVM 集成场景） ==========
  const bug1Key = findKey('BUG-1');
  const bug2Key = findKey('BUG-2');
  const req1Key = findKey('REQ-1');
  const testCases = await Promise.all([
    prisma.testCase.create({ data: {
      code: 'TC-GALAXY-L7-001', title: '银河 L7 透明底盘 - 启动出图时间',
      description: '验证：启动车辆后 AVM 透明底盘出图时间 < 1.5s',
      caseType: 'performance', priority: 'P0', module: 'AVM 透明底盘',
      tags: '银河L7,透明底盘,性能',
      preconditions: '车辆静止，发动机已启动',
      steps: JSON.stringify([
        { step: 1, action: '启动车辆，等待仪表盘显示 READY', expected: '车机系统启动完成' },
        { step: 2, action: '挂入 R 挡', expected: 'AVM 全景影像显示，透明底盘叠加' },
        { step: 3, action: '用秒表记录从挂挡到鸟瞰图完整显示的时间', expected: '< 1.5s' },
      ]),
      expectedResult: '鸟瞰图完整显示时间 < 1.5s，4 路 Camera 无撕裂',
      workItemId: req1Key?.id, workItemKey: 'REQ-1',
      automated: false, status: 'active', createdBy: 'AVM 项目经理',
    }}),
    prisma.testCase.create({ data: {
      code: 'TC-GALAXY-L7-002', title: '银河 L7 透明底盘 - 夜间场景',
      description: '验证：夜间环境下透明底盘画面清晰',
      caseType: 'functional', priority: 'P0', module: 'AVM 透明底盘',
      tags: '银河L7,透明底盘,夜间',
      preconditions: '夜间/弱光环境',
      steps: JSON.stringify([
        { step: 1, action: '夜间环境挂入 R 挡', expected: 'AVM 画面正常显示' },
        { step: 2, action: '观察 4 路 Camera 拼接', expected: '无明显噪点，鸟瞰图清晰' },
      ]),
      expectedResult: '夜间画面噪点可控，无明显黑屏',
      workItemId: req1Key?.id, workItemKey: 'REQ-1',
      automated: false, status: 'active', createdBy: 'AVM 项目经理',
    }}),
    prisma.testCase.create({ data: {
      code: 'TC-ZEEKR-001-001', title: '极氪 001 泊车辅助 - 车位识别',
      description: '验证：自动泊车车位识别准确率 ≥ 90%',
      caseType: 'functional', priority: 'P0', module: 'AVM 泊车辅助',
      tags: '极氪001,泊车,识别',
      preconditions: '客户实车测试 50 个车位',
      steps: JSON.stringify([
        { step: 1, action: '选择停车场 50 个不同车位', expected: '准备就绪' },
        { step: 2, action: '逐个测试 AVM 自动识别车位能力', expected: '记录识别成功/失败数' },
      ]),
      expectedResult: '车位识别准确率 ≥ 90%',
      workItemId: req1Key?.id, workItemKey: 'REQ-2',
      automated: false, status: 'active', createdBy: 'AVM 项目经理',
    }}),
    prisma.testCase.create({ data: {
      code: 'TC-BOYUE-L-001', title: '博越 L 工厂标定 - 白天场景采图',
      description: '验证：吉利宁波春晓工厂白天标定采图一次性通过',
      caseType: 'functional', priority: 'P1', module: 'AVM 工厂标定',
      tags: '博越L,工厂标定,采图',
      preconditions: '白天晴朗天气，工厂标定场地准备就绪',
      steps: JSON.stringify([
        { step: 1, action: 'AVM 工程师赴吉利宁波春晓工厂', expected: '到达现场' },
        { step: 2, action: '4 颗广角 Camera 白天场景标定采图', expected: '采图完成' },
        { step: 3, action: '提交客户标定工程师审核', expected: '一次性通过客户验收' },
      ]),
      expectedResult: '白天场景一次性通过客户验收，输出标定文件',
      workItemId: req1Key?.id, workItemKey: 'REQ-4',
      automated: false, status: 'active', createdBy: 'AVM 项目经理',
    }}),
    prisma.testCase.create({ data: {
      code: 'TC-BUG-001-001', title: '银河 L7 黑屏 bug 复现',
      description: '复现并验证：AVM 全景影像黑屏问题',
      caseType: 'regression', priority: 'P0', module: 'AVM 全景影像',
      tags: '银河L7,黑屏,CameraBSP',
      preconditions: '车辆已升级到 V2.5.1',
      steps: JSON.stringify([
        { step: 1, action: '启动车辆，挂入 R 挡', expected: 'AVM 画面显示' },
        { step: 2, action: '连续 20 次切换 R/D 挡', expected: '复现黑屏 ≥ 1 次' },
      ]),
      expectedResult: '成功复现 4 路 Camera 同时黑屏',
      workItemId: bug1Key?.id, workItemKey: 'BUG-1',
      automated: true, status: 'active', createdBy: 'AVM 项目经理',
    }}),
  ]);
  console.log(`✓ 测试用例: ${testCases.length} 个（吉利 AVM 集成场景）`);
  console.log('');
  console.log('🔑 测试账号：');
  console.log('   admin / admin123     - 租户管理员（AVM 中台）');
  console.log('   pm / pm123           - 空间管理员（AVM 项目经理）');
  console.log('   zhangsan / 123456    - 业务线管理员（AVM 研发一组）');
  console.log('   lisi / 123456        - 成员（AVM 研发一组）');
  console.log('   wangwu / 123456      - 成员（AVM 研发二组）');
  console.log('   zhaoliu / 123456     - 成员（AVM 研发二组）');
  console.log('   tester / 123456      - 测试（AVM 测试部）');

  // ========== V1.3 通知 + 收藏 + 人员排期 + 工作台配置 ==========
  console.log('\n🌱 写入 V1.3 数据...');

  // 1. 通知（覆盖 6 种类型）- 吉利 AVM 集成项目场景
  const notifs: any[] = [];
  // 临期通知：李四（研发一组）的 BUG-2（planEnd +1 天）
  notifs.push(await tx.notification.create({
    data: {
      recipientId: '李四（研发一组）',
      type: 'due_soon',
      level: 'warning',
      title: 'BUG-2 临期 1 天：极氪 001 雷达故障告警误报',
      content: '客户 AVM 接口人 AVM-苏 多次催促，请尽快修复',
      resourceType: 'work_item',
      resourceId: 'BUG-2',
      link: '/work-items/bug',
    },
  }));
  // 超期通知：BUG-4（已超期）
  notifs.push(await tx.notification.create({
    data: {
      recipientId: '李四（研发一组）',
      type: 'overdue',
      level: 'error',
      title: 'BUG-4 已超期 1 天：领克 08 AVM 标定漂移（市场反馈）',
      content: '多名车主集中反馈，已升级到 AVM 项目经理，请按客户模板输出复盘文档',
      resourceType: 'work_item',
      resourceId: 'BUG-4',
      link: '/work-items/bug',
    },
  }));
  // 评审通知
  notifs.push(await tx.notification.create({
    data: {
      recipientId: '王五（研发二组）',
      type: 'review',
      level: 'info',
      title: 'REQ-3 领克 09 ODM 立项 UAT 验收待你处理',
      content: 'ODM 包干 600 万大单，必须严格评估',
      resourceType: 'review',
      resourceId: 'review-demo',
      link: '/reviews',
    },
  }));
  // 指派通知
  notifs.push(await tx.notification.create({
    data: {
      recipientId: '张三（研发一组）',
      type: 'assign',
      level: 'info',
      title: 'TASK-5 已指派给你：博越 L 工厂标定现场采图',
      content: '王五（研发二组）→ 已出差至宁波春晓工厂',
      resourceType: 'work_item',
      resourceId: 'TASK-5',
      link: '/work-items/task',
    },
  }));
  // @ 提及
  notifs.push(await tx.notification.create({
    data: {
      recipientId: 'pm',
      type: 'mention',
      level: 'info',
      title: '李四（研发一组） 在 REQ-2 极氪 001 泊车辅助 评论中 @ 了你',
      content: '资源排期问题：与极氪 007 共享研发，需要协调',
      resourceType: 'work_item',
      resourceId: 'REQ-2',
      link: '/work-items/requirement/REQ-2',
    },
  }));
  // 系统通知
  notifs.push(await tx.notification.create({
    data: {
      recipientId: '张三（研发一组）',
      type: 'system',
      level: 'success',
      title: '欢迎使用 AVM 项目中心 V1.7（吉利 AVM 集成项目管理）',
      content: '本次更新：客户档案 / 车型库 / 项目管理 / 真实场景数据（吉利银河/极氪/领克/博越/熊猫）',
    },
  }));
  console.log(`✓ 通知: ${notifs.length} 条`);

  // 2. 收藏
  const favs: any[] = [];
  // 张三（研发一组）收藏
  favs.push(await tx.favorite.create({
    data: { userId: '张三（研发一组）', resourceType: 'work_item', resourceId: 'REQ-1', title: 'REQ-1 银河 L7 AVM 透明底盘功能开发', subtitle: '已验收 · P0', icon: 'requirement', link: '/work-items/requirement/REQ-1', folder: '银河L7核心需求' },
  }));
  favs.push(await tx.favorite.create({
    data: { userId: '张三（研发一组）', resourceType: 'iteration', resourceId: 'iter1', title: 'AVM V2.5 银河 L7 集成冲刺', subtitle: '进行中', icon: 'iteration', link: '/iterations/iter1', folder: '当前迭代' },
  }));
  favs.push(await tx.favorite.create({
    data: { userId: '张三（研发一组）', resourceType: 'chart', resourceId: 'chart-1', title: '需求状态分布', subtitle: '图表 · bar', icon: 'chart', link: '/dashboards', folder: '常用图表' },
  }));
  // 李四（研发一组）收藏
  favs.push(await tx.favorite.create({
    data: { userId: '李四（研发一组）', resourceType: 'work_item', resourceId: 'BUG-1', title: 'BUG-1 银河 L7 全景影像受限（黑屏）', subtitle: '修复中 · P0', icon: 'bug', link: '/work-items/bug/BUG-1', folder: '紧急缺陷' },
  }));
  favs.push(await tx.favorite.create({
    data: { userId: '李四（研发一组）', resourceType: 'work_item', resourceId: 'TASK-4', title: 'TASK-4 极氪 001 泊车轨迹规划算法', subtitle: '自测中 · P1', icon: 'task', link: '/work-items/task/TASK-4', folder: '极氪001工作' },
  }));
  // pm 收藏
  favs.push(await tx.favorite.create({
    data: { userId: 'AVM 项目经理', resourceType: 'dashboard', resourceId: 'dash-1', title: 'AVM 集成项目总览', subtitle: '仪表盘', icon: 'dashboard', link: '/dashboards', folder: '默认' },
  }));
  console.log(`✓ 收藏: ${favs.length} 条`);

  // 3. 人员排期（覆盖本周 + 下周）— 吉利 AVM 集成项目场景
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const allocations: any[] = [];

  // 张三（研发一组）本周排期（过载 - 50h，处理银河 L7 透明底盘）
  for (let d = 0; d < 5; d++) {
    const dt = new Date(today);
    dt.setDate(dt.getDate() + d);
    allocations.push(await tx.resourceAllocation.create({
      data: {
        userId: '张三（研发一组）', userName: '张三（研发一组）',
        workItemId: 'REQ-1', workItemKey: 'REQ-1', workItemTitle: '银河 L7 AVM 透明底盘功能开发',
        startDate: dt, endDate: dt, allocatedHours: 10, type: 'develop', status: 'in_progress',
        spaceId: productSpace.id,
      },
    }));
  }
  // 李四（研发一组）本周（饱和 - 40h，处理极氪 001 泊车 + 银河 L7 黑屏 bug）
  for (let d = 0; d < 5; d++) {
    const dt = new Date(today);
    dt.setDate(dt.getDate() + d);
    allocations.push(await tx.resourceAllocation.create({
      data: {
        userId: '李四（研发一组）', userName: '李四（研发一组）',
        workItemId: 'REQ-2', workItemKey: 'REQ-2', workItemTitle: '极氪 001 泊车辅助 AVM 集成',
        startDate: dt, endDate: dt, allocatedHours: 8, type: 'develop', status: 'in_progress',
        spaceId: productSpace.id,
      },
    }));
  }
  // 王五（研发二组）本周（偏闲 - 20h，领克 09 ODM 立项）
  for (let d = 0; d < 5; d++) {
    const dt = new Date(today);
    dt.setDate(dt.getDate() + d);
    if (d % 2 === 0) {
      allocations.push(await tx.resourceAllocation.create({
        data: {
          userId: '王五（研发二组）', userName: '王五（研发二组）',
          workItemId: 'REQ-3', workItemKey: 'REQ-3', workItemTitle: '领克 09 ODM 整车 AVM 泊车集成',
          startDate: dt, endDate: dt, allocatedHours: 4, type: 'develop', status: 'in_progress',
          spaceId: productSpace.id,
        },
      }));
    }
  }
  // pm 下周排期（极氪 007 启动准备）
  for (let d = 5; d < 10; d++) {
    const dt = new Date(today);
    dt.setDate(dt.getDate() + d);
    allocations.push(await tx.resourceAllocation.create({
      data: {
        userId: 'AVM 项目经理', userName: 'AVM 项目经理',
        workItemId: 'REQ-6', workItemKey: 'REQ-6', workItemTitle: '极氪 007 AVM 全功能集成（Q1 启动）',
        startDate: dt, endDate: dt, allocatedHours: 6, type: 'review', status: 'planned',
        spaceId: productSpace.id,
      },
    }));
  }
  console.log(`✓ 排期: ${allocations.length} 条`);

  // 4. 工作台配置
  await tx.workbenchConfig.create({
    data: {
      userId: '张三（研发一组）',
      defaultSpaceId: productSpace.id,
      layout: JSON.stringify([
        { type: 'metrics', title: '我的指标', size: 'full' },
        { type: 'my_assigned', title: '我负责的', size: 'half' },
        { type: 'my_due', title: '临期提醒', size: 'half' },
        { type: 'workload', title: '本周负荷', size: 'half' },
        { type: 'pending_reviews', title: '待评审', size: 'half' },
        { type: 'notifications', title: '最近通知', size: 'full' },
      ]),
    },
  });
  await tx.workbenchConfig.create({
    data: {
      userId: '李四（研发一组）',
      defaultSpaceId: productSpace.id,
      layout: JSON.stringify([
        { type: 'metrics', title: '我的指标', size: 'full' },
        { type: 'my_assigned', title: '我的任务', size: 'full' },
        { type: 'workload', title: '本周负荷', size: 'full' },
      ]),
    },
  });
  await tx.workbenchConfig.create({
    data: {
      userId: 'AVM 项目经理',
      defaultSpaceId: productSpace.id,
      layout: JSON.stringify([
        { type: 'team_metrics', title: '团队总览', size: 'full' },
        { type: 'all_due', title: '全部临期', size: 'full' },
        { type: 'workload', title: '人员负荷', size: 'full' },
      ]),
    },
  });
  console.log(`✓ 工作台配置: 3 个`);

  console.log('\n🎉 V1.3 数据写入完成');

  // ========== V1.4 公式字段 + 聚合字段 + 模板 + 自动化 + WebHook ==========
  console.log('\n🌱 写入 V1.4 数据（公式/聚合/自动化/WebHook）...');

  // 1. 公式字段
  await tx.formulaField.create({
    data: {
      spaceId: productSpace.id, workType: 'requirement',
      name: '剩余工时', fieldKey: 'remaining', formula: 'estimate - actualHours',
      outputType: 'number', format: '0.0',
      description: '预估 - 实际 = 剩余工时',
      createdBy: 'AVM 项目经理',
    },
  });
  await tx.formulaField.create({
    data: {
      spaceId: productSpace.id, workType: 'requirement',
      name: '完成率', fieldKey: 'progress', formula: 'ROUND(progress * 100)',
      outputType: 'percent', format: '0%',
      description: '已完成比例',
      createdBy: 'AVM 项目经理',
    },
  });
  await tx.formulaField.create({
    data: {
      spaceId: productSpace.id, workType: 'task',
      name: '剩余工时', fieldKey: 'remaining', formula: 'estimate - actualHours',
      outputType: 'number', format: '0.0',
      description: '剩余工时（任务）',
      createdBy: 'AVM 项目经理',
    },
  });
  await tx.formulaField.create({
    data: {
      spaceId: productSpace.id, workType: 'bug',
      name: '已超期天数', fieldKey: 'overdueDays', formula: 'ABS(daysLeft) * overdue',
      outputType: 'number', format: '0',
      description: '超期天数（仅超期时显示）',
      createdBy: 'AVM 项目经理',
    },
  });
  console.log('✓ 公式字段: 4 条');

  // 2. 聚合字段
  await tx.rollupField.create({
    data: {
      spaceId: productSpace.id, workType: 'requirement',
      name: '子任务估分合计', fieldKey: 'sumTaskEstimate',
      childType: 'task', sourceField: 'estimate', aggregation: 'sum',
      outputType: 'number', format: '0.0',
      description: '所有子任务的估分合计',
    },
  });
  await tx.rollupField.create({
    data: {
      spaceId: productSpace.id, workType: 'requirement',
      name: '子任务完成率', fieldKey: 'childProgress',
      childType: 'task', sourceField: 'progress', aggregation: 'progress',
      outputType: 'percent', format: '0%',
      description: '子任务整体完成率',
    },
  });
  await tx.rollupField.create({
    data: {
      spaceId: productSpace.id, workType: 'requirement',
      name: '子任务数', fieldKey: 'taskCount',
      childType: 'task', sourceField: 'count', aggregation: 'count',
      outputType: 'number', format: '0',
    },
  });
  await tx.rollupField.create({
    data: {
      spaceId: productSpace.id, workType: 'requirement',
      name: '超期子任务数', fieldKey: 'overdueTaskCount',
      childType: 'task', sourceField: 'count', aggregation: 'countOver',
      outputType: 'number', format: '0',
    },
  });
  console.log('✓ 聚合字段: 4 条');

  // 3. 工作项模板
  await tx.workItemTemplate.create({
    data: {
      spaceId: productSpace.id, name: '新功能开发需求', workType: 'requirement',
      description: '标准的产品新功能需求模板',
      defaultFields: JSON.stringify({ priority: 'P1', module: '产品', labels: '需求' }),
      childItems: JSON.stringify([
        { type: 'task', title: '技术方案设计', defaults: { priority: 'P1', estimate: 3 } },
        { type: 'task', title: '前端开发', defaults: { priority: 'P1', estimate: 8 } },
        { type: 'task', title: '后端开发', defaults: { priority: 'P1', estimate: 8 } },
        { type: 'task', title: '联调测试', defaults: { priority: 'P2', estimate: 3 } },
        { type: 'task', title: 'UAT 验收', defaults: { priority: 'P2', estimate: 2 } },
      ]),
      tags: '功能,标准模板', category: '需求',
      createdBy: 'AVM 项目经理',
    },
  });
  await tx.workItemTemplate.create({
    data: {
      spaceId: productSpace.id, name: '紧急缺陷修复', workType: 'bug',
      description: 'P0/P1 缺陷标准处理流程',
      defaultFields: JSON.stringify({ priority: 'P0', severity: 'S0', labels: '紧急' }),
      childItems: JSON.stringify([
        { type: 'task', title: '定位根因', defaults: { priority: 'P0', estimate: 1 } },
        { type: 'task', title: '修复代码', defaults: { priority: 'P0', estimate: 2 } },
        { type: 'task', title: '回归测试', defaults: { priority: 'P0', estimate: 1 } },
      ]),
      tags: '缺陷,紧急', category: '缺陷',
      createdBy: 'AVM 项目经理',
    },
  });
  await tx.workItemTemplate.create({
    data: {
      spaceId: productSpace.id, name: '月度版本发布', workType: 'release',
      description: '标准版本发布模板',
      defaultFields: JSON.stringify({ priority: 'P1' }),
      childItems: JSON.stringify([
        { type: 'task', title: '代码冻结', defaults: { priority: 'P0', estimate: 1 } },
        { type: 'task', title: '预发布验证', defaults: { priority: 'P0', estimate: 2 } },
        { type: 'task', title: '正式发布', defaults: { priority: 'P0', estimate: 1 } },
        { type: 'task', title: '线上验证', defaults: { priority: 'P1', estimate: 2 } },
      ]),
      tags: '发布,月度', category: '版本',
      createdBy: 'AVM 项目经理',
    },
  });
  console.log('✓ 工作项模板: 3 条');

  // 4. 自动化规则
  await tx.automationRule.create({
    data: {
      spaceId: productSpace.id,
      name: 'P0 缺陷自动指派给值班人',
      description: 'S0/S1 缺陷创建时自动指派给张三',
      trigger: JSON.stringify({ type: 'work_item.created', resource: 'work_item' }),
      conditions: JSON.stringify([
        { field: 'type', op: 'eq', value: 'bug' },
        { field: 'priority', op: 'in', value: ['P0', 'P1'] },
      ]),
      actions: JSON.stringify([
        { type: 'assign_user', config: { userId: '张三（研发一组）' } },
        { type: 'send_notification', config: { recipientId: '张三（研发一组）', title: '新的紧急缺陷', content: '请立即处理' } },
        { type: 'add_label', config: { label: '紧急处理' } },
      ]),
      createdBy: 'AVM 项目经理',
    },
  });
  await tx.automationRule.create({
    data: {
      spaceId: productSpace.id,
      name: '超期自动通知',
      description: '工作项超期时通知负责人',
      trigger: JSON.stringify({ type: 'work_item.overdue', resource: 'work_item' }),
      conditions: JSON.stringify([
        { field: 'isOverdue', op: 'eq', value: 'true' },
      ]),
      actions: JSON.stringify([
        { type: 'send_notification', config: { recipientId: '{{assignee}}', title: '工作项已超期', content: '请尽快处理' } },
      ]),
      createdBy: 'AVM 项目经理',
    },
  });
  await tx.automationRule.create({
    data: {
      spaceId: productSpace.id,
      name: '状态变更评论留痕',
      description: '工作项状态变更时自动添加评论',
      trigger: JSON.stringify({ type: 'work_item.status_changed', resource: 'work_item' }),
      conditions: JSON.stringify([]),
      actions: JSON.stringify([
        { type: 'add_comment', config: { content: '状态变更为 {{status}}' } },
      ]),
      createdBy: 'AVM 项目经理',
    },
  });
  console.log('✓ 自动化规则: 3 条');

  // 5. WebHook 配置
  await tx.webhookConfig.create({
    data: {
      spaceId: productSpace.id,
      name: '飞书群机器人',
      url: 'https://open.feishu.cn/open-apis/bot/v2/hook/demo',
      events: 'work_item.created,work_item.status_changed,work_item.overdue',
      headers: JSON.stringify({}),
      secret: '',
      enabled: false,  // 默认禁用避免误发
      createdBy: 'AVM 项目经理',
    },
  });
  await tx.webhookConfig.create({
    data: {
      spaceId: productSpace.id,
      name: 'GitLab 状态同步',
      url: 'https://gitlab.example.com/api/v4/projects/1/trigger/pipeline',
      events: 'work_item.status_changed',
      headers: JSON.stringify({ 'X-Gitlab-Token': 'demo' }),
      enabled: false,
      createdBy: 'AVM 项目经理',
    },
  });
  console.log('✓ WebHook 配置: 2 条');

  }); // 结束事务

  // 6. 批量计算公式 + 聚合（在事务外执行）
  const { recomputeAllDerivedFields } = await import('./services/rollupEngine');
  const recompute = await recomputeAllDerivedFields();
  console.log(`✓ 派生字段计算: ${recompute.formulasCount} 公式 + ${recompute.rollupsCount} 聚合, 耗时 ${recompute.duration}ms`);

  console.log('\n🎉 V1.4 数据写入完成');
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });