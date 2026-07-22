/**
 * 集中读环境变量（统一默认值，方便测试时覆盖）
 */
function get(name: string, def = ''): string {
  return process.env[name] ?? def;
}

export const env = {
  // LLM
  LLM_PROVIDER: get('LLM_PROVIDER', 'mock'), // openai | anthropic | mock
  LLM_API_KEY: get('LLM_API_KEY', ''),
  LLM_BASE_URL: get('LLM_BASE_URL', ''),
  LLM_MODEL: get('LLM_MODEL', ''),
  // 飞书 OAuth（企业版）
  FEISHU_APP_ID: get('FEISHU_APP_ID', ''),
  FEISHU_APP_SECRET: get('FEISHU_APP_SECRET', ''),
  FEISHU_REDIRECT_URI: get('FEISHU_REDIRECT_URI', 'http://localhost:5173/sso/feishu/callback'),
  // 数据库（Prisma 内部用 DATABASE_URL，这里只是常量占位）
  DATABASE_URL: get('DATABASE_URL', 'file:./prisma/dev.db'),
  // 服务端口
  PORT: Number(get('PORT', '4000')),
  // 运行环境
  NODE_ENV: get('NODE_ENV', 'development'),
};
