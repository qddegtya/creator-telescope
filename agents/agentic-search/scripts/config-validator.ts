#!/usr/bin/env npx tsx

/**
 * 配置验证脚本
 * 
 * 提供命令行工具来验证、报告和测试环境配置
 */

import { config } from 'dotenv';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

// ES Module 中获取 __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
import { 
  initializeConfig,
  getConfigReport,
  healthCheck
} from '../config/index.js';

// 加载环境变量
config({ path: join(__dirname, '../../.env') });

/**
 * 主要功能函数
 */
class ConfigValidatorCLI {
  /**
   * 验证配置
   */
  async validate(): Promise<void> {
    console.log('🔍 开始验证配置...\n');
    
    try {
      await initializeConfig();
      console.log('\n✅ 所有配置验证通过！');
    } catch (error) {
      console.error('\n❌ 配置验证失败:', error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  }

  /**
   * 生成配置报告
   */
  async report(): Promise<void> {
    console.log('📊 生成配置报告...\n');
    
    try {
      const report = await getConfigReport();
      console.log(report);
    } catch (error) {
      console.error('❌ 报告生成失败:', error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  }

  /**
   * 健康检查
   */
  async health(): Promise<void> {
    console.log('🏥 执行健康检查...\n');
    
    const health = await healthCheck();
    
    console.log(`状态: ${this.getStatusIcon(health.status)} ${health.status.toUpperCase()}`);
    console.log('\n详细信息:');
    health.details.forEach(detail => {
      console.log(`  - ${detail}`);
    });
    
    if (health.status === 'error') {
      process.exit(1);
    }
  }

  /**
   * 交互式配置向导
   */
  async interactive(): Promise<void> {
    console.log('🧙 配置向导启动...\n');
    
    const { environmentManager } = await import('../config/environment.js');
    const { configValidator } = await import('../config/validation.js');
    const config = environmentManager.getConfig();
    const validation = configValidator.validateConfig(config);
    
    // 显示当前状态
    console.log('📋 当前配置状态:');
    console.log(`  - 环境: ${config.nodeEnv}`);
    console.log(`  - DeepSeek API: ${config.deepseekApiKey ? '✅ 已配置' : '❌ 未配置'}`);
    console.log(`  - GitHub Token: ${config.githubToken ? '✅ 已配置' : '❌ 未配置'}`);
    console.log(`  - 浏览器池大小: ${config.browserPoolSize}`);
    console.log(`  - Worker 池大小: ${config.workerPoolSize}`);
    console.log('');
    
    // 显示问题
    if (validation.errors.length > 0) {
      console.log('❌ 需要修复的错误:');
      validation.errors.forEach((error, i) => {
        console.log(`  ${i + 1}. ${error}`);
      });
      console.log('');
    }
    
    if (validation.warnings.length > 0) {
      console.log('⚠️ 建议关注的警告:');
      validation.warnings.forEach((warning, i) => {
        console.log(`  ${i + 1}. ${warning}`);
      });
      console.log('');
    }
    
    if (validation.suggestions.length > 0) {
      console.log('💡 优化建议:');
      validation.suggestions.forEach((suggestion, i) => {
        console.log(`  ${i + 1}. ${suggestion}`);
      });
      console.log('');
    }
    
    // 生成示例 .env 文件
    console.log('📝 生成示例配置文件...');
    await this.generateEnvExample();
  }

  /**
   * 测试配置
   */
  async test(): Promise<void> {
    console.log('🧪 执行配置测试...\n');
    
    const tests = [
      { name: '环境变量验证', test: () => this.testEnvironmentVariables() },
      { name: 'API 连接测试', test: () => this.testAPIConnections() },
      { name: '性能配置测试', test: () => this.testPerformanceConfig() },
      { name: '安全配置测试', test: () => this.testSecurityConfig() }
    ];
    
    let passed = 0;
    let failed = 0;
    
    for (const test of tests) {
      try {
        console.log(`  🔄 ${test.name}...`);
        await test.test();
        console.log(`  ✅ ${test.name} 通过`);
        passed++;
      } catch (error) {
        console.error(`  ❌ ${test.name} 失败: ${error instanceof Error ? error.message : String(error)}`);
        failed++;
      }
    }
    
    console.log(`\n📊 测试结果: ${passed} 通过, ${failed} 失败`);
    
    if (failed > 0) {
      process.exit(1);
    }
  }

  /**
   * 获取状态图标
   */
  private getStatusIcon(status: string): string {
    switch (status) {
      case 'healthy': return '🟢';
      case 'warning': return '🟡';
      case 'error': return '🔴';
      default: return '⚪';
    }
  }

  /**
   * 生成示例环境文件
   */
  private async generateEnvExample(): Promise<void> {
    const { environmentManager } = await import('../config/environment.js');
    const config = environmentManager.getConfig();
    
    console.log('创建 .env.local 示例文件，包含当前配置值:');
    console.log('```');
    console.log('# AI Agent 搜索系统配置');
    console.log(`NODE_ENV=${config.nodeEnv}`);
    console.log('DEEPSEEK_API_KEY=your_deepseek_api_key_here');
    console.log('GITHUB_TOKEN=your_github_token_here');
    console.log(`BROWSER_POOL_SIZE=${config.browserPoolSize}`);
    console.log(`WORKER_POOL_SIZE=${config.workerPoolSize}`);
    console.log(`QUALITY_THRESHOLD=${config.qualityThreshold}`);
    console.log(`LOG_LEVEL=${config.logLevel}`);
    console.log('```');
  }

  /**
   * 测试环境变量
   */
  private async testEnvironmentVariables(): Promise<void> {
    const required = ['DEEPSEEK_API_KEY', 'GITHUB_TOKEN'];
    const missing = required.filter(key => !process.env[key]);
    
    if (missing.length > 0) {
      throw new Error(`缺少必需的环境变量: ${missing.join(', ')}`);
    }
  }

  /**
   * 测试 API 连接
   */
  private async testAPIConnections(): Promise<void> {
    // 测试 DeepSeek API
    const deepseekKey = process.env.DEEPSEEK_API_KEY;
    if (deepseekKey && deepseekKey.length < 20) {
      throw new Error('DeepSeek API Key 长度可能不正确');
    }
    
    // 测试 GitHub Token
    const githubToken = process.env.GITHUB_TOKEN;
    if (githubToken && !githubToken.startsWith('ghp_') && !githubToken.startsWith('github_pat_')) {
      console.warn('  ⚠️ GitHub Token 格式可能不正确');
    }
  }

  /**
   * 测试性能配置
   */
  private async testPerformanceConfig(): Promise<void> {
    const { environmentManager } = await import('../config/environment.js');
    const config = environmentManager.getConfig();
    
    if (config.browserPoolSize > 15) {
      console.warn('  ⚠️ 浏览器池过大，可能导致内存问题');
    }
    
    if (config.workerPoolSize > config.browserPoolSize * 5) {
      console.warn('  ⚠️ Worker 池相对浏览器池过大');
    }
    
    if (config.searchTimeout > config.workerTimeout) {
      throw new Error('搜索超时不能大于 Worker 超时');
    }
  }

  /**
   * 测试安全配置
   */
  private async testSecurityConfig(): Promise<void> {
    const { environmentManager } = await import('../config/environment.js');
    const config = environmentManager.getConfig();
    
    if (config.nodeEnv === 'production') {
      if (config.logLevel === 'debug') {
        console.warn('  ⚠️ 生产环境不建议使用 debug 日志级别');
      }
      
      if (config.corsOrigins.includes('*')) {
        console.warn('  ⚠️ 生产环境不建议使用通配符 CORS');
      }
    }
  }
}

/**
 * 命令行入口
 */
async function main() {
  const command = process.argv[2] || 'validate';
  const cli = new ConfigValidatorCLI();
  
  console.log(`🚀 配置验证工具 - ${command.toUpperCase()} 模式\n`);
  
  switch (command) {
    case 'validate':
    case 'v':
      await cli.validate();
      break;
      
    case 'report':
    case 'r':
      await cli.report();
      break;
      
    case 'health':
    case 'h':
      await cli.health();
      break;
      
    case 'interactive':
    case 'i':
      await cli.interactive();
      break;
      
    case 'test':
    case 't':
      await cli.test();
      break;
      
    case 'help':
    case '--help':
    case '-h':
      console.log(`
使用方法: npx tsx config-validator.ts [命令]

命令:
  validate (v)    验证配置 (默认)
  report (r)      生成详细报告
  health (h)      健康检查
  interactive (i) 交互式向导
  test (t)        执行测试套件
  help           显示此帮助

示例:
  npx tsx config-validator.ts validate
  npx tsx config-validator.ts report
  npx tsx config-validator.ts health
      `);
      break;
      
    default:
      console.error(`❌ 未知命令: ${command}`);
      console.log('使用 "help" 查看可用命令');
      process.exit(1);
  }
}

// 执行主函数
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error('❌ 执行失败:', error);
    process.exit(1);
  });
}