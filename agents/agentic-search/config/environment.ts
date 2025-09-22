import { config } from 'dotenv';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

// ES Module 中获取 __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// 加载环境变量配置 - 尝试多个路径
const possibleEnvPaths = [
  join(__dirname, '../../.env'),
  join(process.cwd(), '.env'),
  '.env'
];

for (const envPath of possibleEnvPaths) {
  try {
    config({ path: envPath });
    console.log(`✅ 环境变量已从 ${envPath} 加载`);
    break;
  } catch (error) {
    // 继续尝试下一个路径
  }
}

/**
 * 环境变量验证接口
 */
export interface EnvironmentConfig {
  // DeepSeek API 配置
  deepseekApiKey: string;
  deepseekModel: string;
  deepseekTemperature: number;
  deepseekMaxTokens: number;

  // GitHub API 配置
  githubToken: string;
  githubApiUrl: string;

  // Twitter/X 登录配置
  twitterUsername: string;
  twitterPassword: string;
  twitterEmail?: string; // 有些情况下可能需要邮箱

  // 浏览器池配置
  browserPoolSize: number;
  browserHeadless: boolean;
  browserTimeout: number;
  browserUserAgentRotation: boolean;

  // Worker 池配置
  workerPoolSize: number;
  workerTimeout: number;
  workerConcurrency: number;

  // 搜索配置
  searchTimeout: number;
  searchRetryAttempts: number;
  searchRateLimit: number;

  // 质量过滤配置
  qualityThreshold: number;
  contentMinScore: number;
  duplicateThreshold: number;

  // 缓存配置
  cacheEnabled: boolean;
  cacheTTL: number;
  cacheMaxSize: number;

  // 日志配置
  logLevel: string;
  logToFile: boolean;
  logDirectory: string;

  // 性能监控配置
  monitoringEnabled: boolean;
  metricsPort: number;
  healthCheckInterval: number;

  // 服务配置
  nodeEnv: string;
  port: number;
  corsOrigins: string[];
}

/**
 * 环境变量解析和验证类
 */
export class EnvironmentManager {
  private static instance: EnvironmentManager;
  private config: EnvironmentConfig;

  private constructor() {
    this.config = this.loadAndValidateConfig();
  }

  /**
   * 获取环境管理器单例实例
   */
  public static getInstance(): EnvironmentManager {
    if (!EnvironmentManager.instance) {
      EnvironmentManager.instance = new EnvironmentManager();
    }
    return EnvironmentManager.instance;
  }

  /**
   * 获取完整环境配置
   */
  public getConfig(): EnvironmentConfig {
    return { ...this.config };
  }

  /**
   * 获取特定配置值
   */
  public get<K extends keyof EnvironmentConfig>(key: K): EnvironmentConfig[K] {
    return this.config[key];
  }

  /**
   * 验证必需的环境变量是否存在
   */
  public validateRequiredVariables(): void {
    const requiredVars = [
      'DEEPSEEK_API_KEY',
      'GITHUB_TOKEN'
    ];

    const missingVars = requiredVars.filter(varName => !process.env[varName]);

    if (missingVars.length > 0) {
      throw new Error(`Missing required environment variables: ${missingVars.join(', ')}`);
    }
  }

  /**
   * 动态更新配置（仅限非敏感配置）
   */
  public updateConfig(updates: Partial<Omit<EnvironmentConfig, 'deepseekApiKey' | 'githubToken' | 'twitterPassword'>>): void {
    this.config = { ...this.config, ...updates };
  }

  /**
   * 获取环境变量的安全摘要（隐藏敏感信息）
   */
  public getConfigSummary(): Partial<EnvironmentConfig> {
    const { deepseekApiKey, githubToken, twitterPassword, ...safeConfig } = this.config;
    return {
      ...safeConfig,
      deepseekApiKey: deepseekApiKey ? '***masked***' : 'not_set',
      githubToken: githubToken ? '***masked***' : 'not_set',
      twitterPassword: twitterPassword ? '***masked***' : 'not_set'
    };
  }

  /**
   * 检查当前环境是否为生产环境
   */
  public isProduction(): boolean {
    return this.config.nodeEnv === 'production';
  }

  /**
   * 检查当前环境是否为开发环境
   */
  public isDevelopment(): boolean {
    return this.config.nodeEnv === 'development';
  }

  /**
   * 加载并验证环境配置
   */
  private loadAndValidateConfig(): EnvironmentConfig {
    // 验证必需的环境变量
    this.validateRequiredVariables();

    const config: EnvironmentConfig = {
      // DeepSeek API 配置
      deepseekApiKey: process.env.DEEPSEEK_API_KEY || '',
      deepseekModel: process.env.DEEPSEEK_MODEL || 'deepseek-chat',
      deepseekTemperature: this.parseFloat(process.env.DEEPSEEK_TEMPERATURE, 0.3),
      deepseekMaxTokens: this.parseInt(process.env.DEEPSEEK_MAX_TOKENS, 4000),

      // GitHub API 配置
      githubToken: process.env.GITHUB_TOKEN || '',
      githubApiUrl: process.env.GITHUB_API_URL || 'https://api.github.com',

      // Twitter/X 登录配置
      twitterUsername: process.env.TWITTER_USERNAME || '',
      twitterPassword: process.env.TWITTER_PASSWORD || '',
      twitterEmail: process.env.TWITTER_EMAIL || undefined,

      // 浏览器池配置
      browserPoolSize: this.parseInt(process.env.BROWSER_POOL_SIZE, 5),
      browserHeadless: this.parseBoolean(process.env.BROWSER_HEADLESS, true),
      browserTimeout: this.parseInt(process.env.BROWSER_TIMEOUT, 30000),
      browserUserAgentRotation: this.parseBoolean(process.env.BROWSER_USER_AGENT_ROTATION, true),

      // Worker 池配置
      workerPoolSize: this.parseInt(process.env.WORKER_POOL_SIZE, 10),
      workerTimeout: this.parseInt(process.env.WORKER_TIMEOUT, 60000),
      workerConcurrency: this.parseInt(process.env.WORKER_CONCURRENCY, 3),

      // 搜索配置
      searchTimeout: this.parseInt(process.env.SEARCH_TIMEOUT, 45000),
      searchRetryAttempts: this.parseInt(process.env.SEARCH_RETRY_ATTEMPTS, 3),
      searchRateLimit: this.parseInt(process.env.SEARCH_RATE_LIMIT, 100),

      // 质量过滤配置
      qualityThreshold: this.parseFloat(process.env.QUALITY_THRESHOLD, 0.7),
      contentMinScore: this.parseFloat(process.env.CONTENT_MIN_SCORE, 0.6),
      duplicateThreshold: this.parseFloat(process.env.DUPLICATE_THRESHOLD, 0.8),

      // 缓存配置
      cacheEnabled: this.parseBoolean(process.env.CACHE_ENABLED, true),
      cacheTTL: this.parseInt(process.env.CACHE_TTL, 3600),
      cacheMaxSize: this.parseInt(process.env.CACHE_MAX_SIZE, 1000),

      // 日志配置
      logLevel: process.env.LOG_LEVEL || 'info',
      logToFile: this.parseBoolean(process.env.LOG_TO_FILE, true),
      logDirectory: process.env.LOG_DIRECTORY || './logs',

      // 性能监控配置
      monitoringEnabled: this.parseBoolean(process.env.MONITORING_ENABLED, true),
      metricsPort: this.parseInt(process.env.METRICS_PORT, 9090),
      healthCheckInterval: this.parseInt(process.env.HEALTH_CHECK_INTERVAL, 30000),

      // 服务配置
      nodeEnv: process.env.NODE_ENV || 'development',
      port: this.parseInt(process.env.PORT, 3000),
      corsOrigins: this.parseArray(process.env.CORS_ORIGINS, ['http://localhost:3000'])
    };

    this.validateConfig(config);
    return config;
  }

  /**
   * 验证配置的合理性
   */
  private validateConfig(config: EnvironmentConfig): void {
    // 验证数值范围
    if (config.deepseekTemperature < 0 || config.deepseekTemperature > 2) {
      throw new Error('DEEPSEEK_TEMPERATURE must be between 0 and 2');
    }

    if (config.deepseekMaxTokens < 100 || config.deepseekMaxTokens > 32000) {
      throw new Error('DEEPSEEK_MAX_TOKENS must be between 100 and 32000');
    }

    if (config.browserPoolSize < 1 || config.browserPoolSize > 20) {
      throw new Error('BROWSER_POOL_SIZE must be between 1 and 20');
    }

    if (config.workerPoolSize < 1 || config.workerPoolSize > 50) {
      throw new Error('WORKER_POOL_SIZE must be between 1 and 50');
    }

    if (config.qualityThreshold < 0 || config.qualityThreshold > 1) {
      throw new Error('QUALITY_THRESHOLD must be between 0 and 1');
    }

    if (config.contentMinScore < 0 || config.contentMinScore > 1) {
      throw new Error('CONTENT_MIN_SCORE must be between 0 and 1');
    }

    if (config.duplicateThreshold < 0 || config.duplicateThreshold > 1) {
      throw new Error('DUPLICATE_THRESHOLD must be between 0 and 1');
    }

    // 验证日志级别
    const validLogLevels = ['error', 'warn', 'info', 'debug'];
    if (!validLogLevels.includes(config.logLevel)) {
      throw new Error(`LOG_LEVEL must be one of: ${validLogLevels.join(', ')}`);
    }

    // 验证环境类型
    const validEnvs = ['development', 'production', 'test'];
    if (!validEnvs.includes(config.nodeEnv)) {
      throw new Error(`NODE_ENV must be one of: ${validEnvs.join(', ')}`);
    }
  }

  /**
   * 解析整数环境变量
   */
  private parseInt(value: string | undefined, defaultValue: number): number {
    if (!value) return defaultValue;
    const parsed = parseInt(value, 10);
    return isNaN(parsed) ? defaultValue : parsed;
  }

  /**
   * 解析浮点数环境变量
   */
  private parseFloat(value: string | undefined, defaultValue: number): number {
    if (!value) return defaultValue;
    const parsed = parseFloat(value);
    return isNaN(parsed) ? defaultValue : parsed;
  }

  /**
   * 解析布尔值环境变量
   */
  private parseBoolean(value: string | undefined, defaultValue: boolean): boolean {
    if (!value) return defaultValue;
    return value.toLowerCase() === 'true' || value === '1';
  }

  /**
   * 解析数组环境变量
   */
  private parseArray(value: string | undefined, defaultValue: string[]): string[] {
    if (!value) return defaultValue;
    return value.split(',').map(item => item.trim()).filter(item => item.length > 0);
  }
}

// 导出单例实例
export const environmentManager = EnvironmentManager.getInstance();

// 导出配置获取快捷方法
export const getConfig = () => environmentManager.getConfig();
export const getConfigValue = <K extends keyof EnvironmentConfig>(key: K) => environmentManager.get(key);
export const isProduction = () => environmentManager.isProduction();
export const isDevelopment = () => environmentManager.isDevelopment();