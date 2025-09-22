/**
 * 配置系统统一入口
 * 
 * 提供环境变量管理、配置验证、动态配置等功能的统一访问接口
 */

// 导出环境配置相关
export {
  EnvironmentManager,
  environmentManager,
  getConfig,
  getConfigValue,
  isProduction,
  isDevelopment
} from './environment';

export type { EnvironmentConfig } from './environment';

// 导出配置验证相关
export {
  ConfigValidator,
  configValidator
} from './validation';

export type {
  ValidationResult,
  ValidationRule
} from './validation';

// 导出动态配置相关
export {
  DynamicConfigManager,
  type DynamicConfigInput,
  type DynamicConfigOutput
} from './dynamic-config-manager';

export type {
  SearchStrategy,
  AIEnhancedStrategy
} from '../types/multi-agent';

// 导出关键字配置
export { default as KeywordConfig } from './keywords.json';

/**
 * 配置系统初始化函数
 */
export async function initializeConfig(): Promise<void> {
  try {
    // 导入并获取环境管理器实例
    const { environmentManager: envManager } = await import('./environment.js');
    
    // 1. 验证环境变量
    envManager.validateRequiredVariables();
    
    // 2. 验证配置
    const config = envManager.getConfig();
    const { configValidator: validator } = await import('./validation.js');
    const validation = validator.validateConfig(config);
    
    if (!validation.isValid) {
      console.error('❌ 配置验证失败:');
      validation.errors.forEach(error => console.error(`  - ${error}`));
      throw new Error('配置验证失败，请检查环境变量设置');
    }
    
    // 3. 显示警告
    if (validation.warnings.length > 0) {
      console.warn('⚠️ 配置警告:');
      validation.warnings.forEach(warning => console.warn(`  - ${warning}`));
    }
    
    // 4. 显示建议
    if (validation.suggestions.length > 0 && !isProduction()) {
      console.info('💡 配置建议:');
      validation.suggestions.forEach(suggestion => console.info(`  - ${suggestion}`));
    }
    
    console.log('✅ 配置系统初始化成功');
    
    // 5. 生产环境额外验证
    if (config.nodeEnv === 'production') {
      const prodValidation = validator.validateProductionConfig(config);
      if (prodValidation.warnings.length > 0) {
        console.warn('⚠️ 生产环境配置警告:');
        prodValidation.warnings.forEach(warning => console.warn(`  - ${warning}`));
      }
    }
    
  } catch (error) {
    console.error('❌ 配置系统初始化失败:', error);
    throw error;
  }
}

/**
 * 获取配置系统状态报告
 */
export async function getConfigReport(): Promise<string> {
  const { environmentManager: envManager } = await import('./environment.js');
  const { configValidator: validator } = await import('./validation.js');
  const config = envManager.getConfig();
  return validator.generateConfigReport(config);
}

/**
 * 配置系统健康检查
 */
export async function healthCheck(): Promise<{ status: 'healthy' | 'warning' | 'error'; details: string[] }> {
  try {
    const { environmentManager: envManager } = await import('./environment.js');
    const { configValidator: validator } = await import('./validation.js');
    const config = envManager.getConfig();
    const validation = validator.validateConfig(config);
    
    if (!validation.isValid) {
      return {
        status: 'error',
        details: validation.errors
      };
    }
    
    if (validation.warnings.length > 0) {
      return {
        status: 'warning',
        details: validation.warnings
      };
    }
    
    return {
      status: 'healthy',
      details: ['所有配置检查通过']
    };
  } catch (error) {
    return {
      status: 'error',
      details: [`健康检查失败: ${error instanceof Error ? error.message : String(error)}`]
    };
  }
}

/**
 * 运行时配置更新（仅限非敏感配置）
 */
export async function updateRuntimeConfig(
  updates: Partial<Omit<EnvironmentConfig, 'deepseekApiKey' | 'githubToken'>>
): Promise<ValidationResult> {
  const { environmentManager: envManager } = await import('./environment.js');
  const { configValidator: validator } = await import('./validation.js');
  
  // 更新配置
  envManager.updateConfig(updates);
  
  // 重新验证
  const config = envManager.getConfig();
  const validation = validator.validateConfig(config);
  
  if (validation.isValid) {
    console.log('✅ 运行时配置更新成功');
  } else {
    console.error('❌ 运行时配置更新失败');
    validation.errors.forEach(error => console.error(`  - ${error}`));
  }
  
  return validation;
}

/**
 * 导出配置常量
 */
export const CONFIG_CONSTANTS = {
  // API 配置
  DEFAULT_DEEPSEEK_MODEL: 'deepseek-chat',
  DEFAULT_GITHUB_API_URL: 'https://api.github.com',
  
  // 性能配置
  MIN_BROWSER_POOL_SIZE: 1,
  MAX_BROWSER_POOL_SIZE: 20,
  MIN_WORKER_POOL_SIZE: 1,
  MAX_WORKER_POOL_SIZE: 50,
  
  // 质量配置
  MIN_QUALITY_THRESHOLD: 0.0,
  MAX_QUALITY_THRESHOLD: 1.0,
  
  // 超时配置
  MIN_TIMEOUT: 5000,
  MAX_TIMEOUT: 300000,
  
  // 缓存配置
  MIN_CACHE_TTL: 60,
  MAX_CACHE_TTL: 86400,
  MIN_CACHE_SIZE: 10,
  MAX_CACHE_SIZE: 10000,
  
  // 日志配置
  VALID_LOG_LEVELS: ['error', 'warn', 'info', 'debug'],
  
  // 环境配置
  VALID_NODE_ENVS: ['development', 'production', 'test']
} as const;