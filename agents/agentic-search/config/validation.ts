import { EnvironmentConfig } from './environment';

/**
 * 配置验证结果接口
 */
export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  suggestions: string[];
}

/**
 * 配置验证规则接口
 */
export interface ValidationRule {
  name: string;
  validate: (config: EnvironmentConfig) => ValidationResult;
  priority: 'critical' | 'important' | 'optional';
}

/**
 * 环境配置验证器
 */
export class ConfigValidator {
  private rules: ValidationRule[] = [];

  constructor() {
    this.initializeRules();
  }

  /**
   * 验证完整配置
   */
  public validateConfig(config: EnvironmentConfig): ValidationResult {
    const result: ValidationResult = {
      isValid: true,
      errors: [],
      warnings: [],
      suggestions: []
    };

    // 按优先级执行验证规则
    const sortedRules = this.rules.sort((a, b) => {
      const priorityOrder = { critical: 0, important: 1, optional: 2 };
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    });

    for (const rule of sortedRules) {
      try {
        const ruleResult = rule.validate(config);
        
        // 合并结果
        result.errors.push(...ruleResult.errors);
        result.warnings.push(...ruleResult.warnings);
        result.suggestions.push(...ruleResult.suggestions);

        // 如果有错误，标记为无效
        if (ruleResult.errors.length > 0) {
          result.isValid = false;
        }
      } catch (error) {
        result.errors.push(`验证规则 '${rule.name}' 执行失败: ${error instanceof Error ? error.message : String(error)}`);
        result.isValid = false;
      }
    }

    return result;
  }

  /**
   * 验证生产环境配置
   */
  public validateProductionConfig(config: EnvironmentConfig): ValidationResult {
    const result = this.validateConfig(config);

    // 生产环境特定检查
    if (config.nodeEnv === 'production') {
      // 检查敏感信息
      if (config.deepseekApiKey.includes('test') || config.deepseekApiKey.includes('dev')) {
        result.warnings.push('生产环境使用了测试 API 密钥');
      }

      // 检查性能配置
      if (config.browserPoolSize < 3) {
        result.warnings.push('生产环境建议使用更大的浏览器池 (≥3)');
      }

      if (config.workerPoolSize < 5) {
        result.warnings.push('生产环境建议使用更大的 Worker 池 (≥5)');
      }

      if (!config.monitoringEnabled) {
        result.warnings.push('生产环境建议启用监控');
      }

      if (!config.logToFile) {
        result.warnings.push('生产环境建议启用文件日志');
      }
    }

    return result;
  }

  /**
   * 生成配置报告
   */
  public generateConfigReport(config: EnvironmentConfig): string {
    const validation = this.validateConfig(config);
    
    let report = '# 环境配置验证报告\n\n';
    
    // 基本信息
    report += `## 基本信息\n`;
    report += `- 环境: ${config.nodeEnv}\n`;
    report += `- 验证状态: ${validation.isValid ? '✅ 通过' : '❌ 失败'}\n`;
    report += `- 错误数量: ${validation.errors.length}\n`;
    report += `- 警告数量: ${validation.warnings.length}\n\n`;

    // 配置摘要
    report += `## 配置摘要\n`;
    report += `- DeepSeek 模型: ${config.deepseekModel}\n`;
    report += `- 浏览器池大小: ${config.browserPoolSize}\n`;
    report += `- Worker 池大小: ${config.workerPoolSize}\n`;
    report += `- 质量阈值: ${config.qualityThreshold}\n`;
    report += `- 缓存状态: ${config.cacheEnabled ? '启用' : '禁用'}\n`;
    report += `- 监控状态: ${config.monitoringEnabled ? '启用' : '禁用'}\n\n`;

    // 错误列表
    if (validation.errors.length > 0) {
      report += `## ❌ 错误\n`;
      validation.errors.forEach((error, index) => {
        report += `${index + 1}. ${error}\n`;
      });
      report += '\n';
    }

    // 警告列表
    if (validation.warnings.length > 0) {
      report += `## ⚠️ 警告\n`;
      validation.warnings.forEach((warning, index) => {
        report += `${index + 1}. ${warning}\n`;
      });
      report += '\n';
    }

    // 建议列表
    if (validation.suggestions.length > 0) {
      report += `## 💡 建议\n`;
      validation.suggestions.forEach((suggestion, index) => {
        report += `${index + 1}. ${suggestion}\n`;
      });
      report += '\n';
    }

    return report;
  }

  /**
   * 初始化验证规则
   */
  private initializeRules(): void {
    this.rules = [
      // 关键 API 密钥验证
      {
        name: 'API Keys Validation',
        priority: 'critical',
        validate: (config) => {
          const result: ValidationResult = { isValid: true, errors: [], warnings: [], suggestions: [] };

          if (!config.deepseekApiKey || config.deepseekApiKey.trim() === '') {
            result.errors.push('DEEPSEEK_API_KEY 是必需的');
          } else if (config.deepseekApiKey.length < 20) {
            result.warnings.push('DEEPSEEK_API_KEY 长度可能不正确');
          }

          if (!config.githubToken || config.githubToken.trim() === '') {
            result.errors.push('GITHUB_TOKEN 是必需的');
          } else if (!config.githubToken.startsWith('ghp_') && !config.githubToken.startsWith('github_pat_')) {
            result.warnings.push('GITHUB_TOKEN 格式可能不正确');
          }

          return result;
        }
      },

      // 资源配置验证
      {
        name: 'Resource Configuration',
        priority: 'important',
        validate: (config) => {
          const result: ValidationResult = { isValid: true, errors: [], warnings: [], suggestions: [] };

          // 浏览器池配置
          if (config.browserPoolSize > 10) {
            result.warnings.push('浏览器池过大可能导致内存占用过高');
          }

          // Worker 池配置
          if (config.workerPoolSize > config.browserPoolSize * 5) {
            result.warnings.push('Worker 池大小相对浏览器池过大');
          }

          // 超时配置
          if (config.searchTimeout > config.workerTimeout) {
            result.errors.push('搜索超时时间不能大于 Worker 超时时间');
          }

          if (config.browserTimeout > config.searchTimeout) {
            result.warnings.push('浏览器超时时间大于搜索超时时间，可能导致资源浪费');
          }

          return result;
        }
      },

      // 性能配置验证
      {
        name: 'Performance Configuration',
        priority: 'important',
        validate: (config) => {
          const result: ValidationResult = { isValid: true, errors: [], warnings: [], suggestions: [] };

          // 质量阈值配置
          if (config.qualityThreshold > 0.9) {
            result.warnings.push('质量阈值过高可能导致有效内容被过滤');
          }

          if (config.contentMinScore > config.qualityThreshold) {
            result.errors.push('内容最低分数不能高于质量阈值');
          }

          // 缓存配置
          if (config.cacheEnabled && config.cacheTTL < 300) {
            result.warnings.push('缓存生存时间过短可能影响性能');
          }

          if (config.cacheMaxSize < 100) {
            result.warnings.push('缓存大小过小可能影响命中率');
          }

          return result;
        }
      },

      // DeepSeek 配置验证
      {
        name: 'DeepSeek Configuration',
        priority: 'important',
        validate: (config) => {
          const result: ValidationResult = { isValid: true, errors: [], warnings: [], suggestions: [] };

          // 模型参数验证
          if (config.deepseekTemperature > 1.5) {
            result.warnings.push('DeepSeek 温度过高可能导致输出不稳定');
          }

          if (config.deepseekTemperature < 0.1) {
            result.warnings.push('DeepSeek 温度过低可能导致输出过于固定');
          }

          if (config.deepseekMaxTokens > 8000) {
            result.warnings.push('DeepSeek 最大令牌数过高可能增加成本');
          }

          if (config.deepseekMaxTokens < 1000) {
            result.warnings.push('DeepSeek 最大令牌数过低可能影响输出质量');
          }

          return result;
        }
      },

      // 安全配置验证
      {
        name: 'Security Configuration',
        priority: 'important',
        validate: (config) => {
          const result: ValidationResult = { isValid: true, errors: [], warnings: [], suggestions: [] };

          // 生产环境安全检查
          if (config.nodeEnv === 'production') {
            if (config.logLevel === 'debug') {
              result.warnings.push('生产环境建议使用 info 或更高的日志级别');
            }

            // CORS 配置检查
            if (config.corsOrigins.includes('*')) {
              result.warnings.push('生产环境不建议使用通配符 CORS 源');
            }
          }

          return result;
        }
      },

      // 监控配置验证
      {
        name: 'Monitoring Configuration',
        priority: 'optional',
        validate: (config) => {
          const result: ValidationResult = { isValid: true, errors: [], warnings: [], suggestions: [] };

          if (config.monitoringEnabled) {
            if (config.healthCheckInterval < 10000) {
              result.suggestions.push('健康检查间隔建议不少于 10 秒');
            }

            if (config.metricsPort === config.port) {
              result.warnings.push('监控端口不应与服务端口相同');
            }
          } else {
            result.suggestions.push('建议启用监控以便于故障排查');
          }

          if (!config.logToFile && config.nodeEnv === 'production') {
            result.suggestions.push('生产环境建议启用文件日志');
          }

          return result;
        }
      }
    ];
  }
}

// 导出验证器实例
export const configValidator = new ConfigValidator();