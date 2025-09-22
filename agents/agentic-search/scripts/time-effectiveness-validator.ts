#!/usr/bin/env npx tsx

/**
 * 24 小时时效性验证脚本
 * 
 * 验证系统的时效性逻辑是否按预期工作
 */

import { config } from 'dotenv';
import { join } from 'path';
import { TimeValidator } from '../config/time-validator';
import { DynamicConfigManager } from '../config/dynamic-config-manager';

// 加载环境变量
config({ path: join(__dirname, '../.env') });

/**
 * 时效性验证测试套件
 */
class TimeEffectivenessValidator {
  private timeValidator: TimeValidator;
  private configManager: DynamicConfigManager;

  constructor() {
    this.timeValidator = new TimeValidator();
    this.configManager = new DynamicConfigManager();
  }

  /**
   * 执行完整的时效性验证
   */
  async runFullValidation(): Promise<void> {
    console.log('🕐 开始 24 小时时效性验证...\n');

    const testSuites = [
      { name: '基础时间窗口验证', test: () => this.testBasicTimeWindows() },
      { name: '边界条件测试', test: () => this.testBoundaryConditions() },
      { name: '新鲜度评分测试', test: () => this.testFreshnessScoring() },
      { name: '时区处理测试', test: () => this.testTimezoneHandling() },
      { name: '批量内容验证', test: () => this.testBatchValidation() },
      { name: '动态配置时效性', test: () => this.testDynamicConfigTimeWindows() },
      { name: '性能压力测试', test: () => this.testPerformanceUnderLoad() }
    ];

    let passed = 0;
    let failed = 0;
    const results: Array<{ name: string; status: 'pass' | 'fail'; error?: string; duration?: number }> = [];

    for (const suite of testSuites) {
      try {
        console.log(`  🔄 ${suite.name}...`);
        const startTime = Date.now();
        await suite.test();
        const duration = Date.now() - startTime;
        
        console.log(`  ✅ ${suite.name} 通过 (${duration}ms)`);
        results.push({ name: suite.name, status: 'pass', duration });
        passed++;
      } catch (error) {
        console.error(`  ❌ ${suite.name} 失败: ${error instanceof Error ? error.message : String(error)}`);
        results.push({ 
          name: suite.name, 
          status: 'fail', 
          error: error instanceof Error ? error.message : String(error) 
        });
        failed++;
      }
    }

    // 生成测试报告
    this.generateTestReport(results, passed, failed);

    if (failed > 0) {
      throw new Error(`时效性验证失败: ${failed} 个测试失败`);
    }

    console.log('\n✅ 所有时效性验证测试通过！');
  }

  /**
   * 基础时间窗口验证
   */
  private async testBasicTimeWindows(): Promise<void> {
    const testCases = [
      { content: new Date(), window: '1h', expected: true },
      { content: new Date(Date.now() - 30 * 60 * 1000), window: '1h', expected: true }, // 30分钟前
      { content: new Date(Date.now() - 2 * 60 * 60 * 1000), window: '1h', expected: false }, // 2小时前
      { content: new Date(Date.now() - 12 * 60 * 60 * 1000), window: '24h', expected: true }, // 12小时前
      { content: new Date(Date.now() - 25 * 60 * 60 * 1000), window: '24h', expected: false }, // 25小时前
      { content: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000), window: '7d', expected: true }, // 3天前
      { content: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000), window: '7d', expected: false } // 8天前
    ];

    for (const testCase of testCases) {
      const result = await this.timeValidator.run({
        contentTimestamp: testCase.content,
        requiredTimeWindow: testCase.window as any
      });

      if (result.isValid !== testCase.expected) {
        throw new Error(
          `时间窗口验证失败: 内容时间 ${testCase.content.toISOString()}, ` +
          `窗口 ${testCase.window}, 期望 ${testCase.expected}, 实际 ${result.isValid}`
        );
      }
    }
  }

  /**
   * 边界条件测试
   */
  private async testBoundaryConditions(): Promise<void> {
    const now = new Date();
    
    // 测试精确边界
    const exactBoundary = new Date(now.getTime() - 24 * 60 * 60 * 1000); // 正好 24 小时前
    const result1 = await this.timeValidator.run({
      contentTimestamp: exactBoundary,
      requiredTimeWindow: '24h'
    });
    
    if (!result1.isValid) {
      throw new Error('24小时边界测试失败：正好 24 小时前的内容应该有效');
    }

    // 测试超出边界
    const beyondBoundary = new Date(now.getTime() - 24 * 60 * 60 * 1000 - 1000); // 24小时+1秒前
    const result2 = await this.timeValidator.run({
      contentTimestamp: beyondBoundary,
      requiredTimeWindow: '24h'
    });
    
    if (result2.isValid) {
      throw new Error('24小时边界测试失败：超出 24 小时的内容应该无效');
    }

    // 测试未来时间
    const futureTime = new Date(now.getTime() + 60 * 60 * 1000); // 1小时后
    const result3 = await this.timeValidator.run({
      contentTimestamp: futureTime,
      requiredTimeWindow: '24h'
    });
    
    if (!result3.isValid) {
      throw new Error('未来时间测试失败：未来时间应该有效');
    }
  }

  /**
   * 新鲜度评分测试
   */
  private async testFreshnessScoring(): Promise<void> {
    const now = new Date();
    const testCases = [
      { time: now, expectedScore: 1.0 }, // 当前时间应该得满分
      { time: new Date(now.getTime() - 6 * 60 * 60 * 1000), expectedScore: 0.75 }, // 6小时前
      { time: new Date(now.getTime() - 12 * 60 * 60 * 1000), expectedScore: 0.5 }, // 12小时前
      { time: new Date(now.getTime() - 18 * 60 * 60 * 1000), expectedScore: 0.25 }, // 18小时前
      { time: new Date(now.getTime() - 23 * 60 * 60 * 1000), expectedScore: 0.04 } // 23小时前，接近最低分
    ];

    for (const testCase of testCases) {
      const result = await this.timeValidator.run({
        contentTimestamp: testCase.time,
        requiredTimeWindow: '24h'
      });

      const scoreDiff = Math.abs(result.freshnessScore - testCase.expectedScore);
      if (scoreDiff > 0.1) { // 允许 10% 的误差
        throw new Error(
          `新鲜度评分测试失败: 时间 ${testCase.time.toISOString()}, ` +
          `期望评分 ${testCase.expectedScore}, 实际评分 ${result.freshnessScore}`
        );
      }
    }
  }

  /**
   * 时区处理测试
   */
  private async testTimezoneHandling(): Promise<void> {
    const baseTime = new Date('2024-01-01T12:00:00Z'); // UTC 时间
    
    // 测试不同时区的相同时间点
    const timezones = [
      '2024-01-01T12:00:00Z',     // UTC
      '2024-01-01T20:00:00+08:00', // 北京时间
      '2024-01-01T07:00:00-05:00', // 纽约时间
      '2024-01-01T13:00:00+01:00'  // 伦敦时间
    ];

    const results = await Promise.all(
      timezones.map(timeStr => 
        this.timeValidator.run({
          contentTimestamp: new Date(timeStr),
          requiredTimeWindow: '24h'
        })
      )
    );

    // 所有时区的相同时间点应该有相同的新鲜度评分（误差范围内）
    const baseScore = results[0].freshnessScore;
    for (let i = 1; i < results.length; i++) {
      const scoreDiff = Math.abs(results[i].freshnessScore - baseScore);
      if (scoreDiff > 0.01) { // 1% 误差
        throw new Error(
          `时区处理测试失败: 时区 ${i} 评分 ${results[i].freshnessScore} ` +
          `与基准评分 ${baseScore} 差异过大`
        );
      }
    }
  }

  /**
   * 批量内容验证
   */
  private async testBatchValidation(): Promise<void> {
    // 生成测试内容
    const testContents = Array.from({ length: 100 }, (_, i) => ({
      timestamp: new Date(Date.now() - i * 15 * 60 * 1000), // 每15分钟一个内容
      id: `content_${i}`
    }));

    // 批量验证
    const validationPromises = testContents.map(content =>
      this.timeValidator.run({
        contentTimestamp: content.timestamp,
        requiredTimeWindow: '24h'
      }).then(result => ({ ...content, ...result }))
    );

    const results = await Promise.all(validationPromises);

    // 验证结果
    const validCount = results.filter(r => r.isValid).length;
    const expectedValidCount = Math.floor(24 * 60 / 15); // 24小时内的内容数量

    if (Math.abs(validCount - expectedValidCount) > 2) { // 允许2个内容的误差
      throw new Error(
        `批量验证测试失败: 期望 ${expectedValidCount} 个有效内容, 实际 ${validCount} 个`
      );
    }

    // 验证新鲜度评分递减
    for (let i = 1; i < results.length; i++) {
      if (results[i].isValid && results[i-1].isValid) {
        if (results[i].freshnessScore > results[i-1].freshnessScore) {
          throw new Error(
            `新鲜度评分递减测试失败: 内容 ${i} 的评分应该低于内容 ${i-1}`
          );
        }
      }
    }
  }

  /**
   * 动态配置时效性测试
   */
  private async testDynamicConfigTimeWindows(): Promise<void> {
    if (!process.env.DEEPSEEK_API_KEY) {
      console.warn('  ⚠️ 跳过动态配置测试 (缺少 DEEPSEEK_API_KEY)');
      return;
    }

    const testKeywords = ['breaking news', 'real-time', 'urgent update'];
    const config = await this.configManager.run({
      keywords: testKeywords
    });

    // 验证动态配置是否生成了合适的时间窗口
    if (!config.strategy.timeWindow) {
      throw new Error('动态配置未生成时间窗口');
    }

    // 对于新闻类关键词，时间窗口应该较短
    const validTimeWindows = ['1h', '6h', '12h', '24h'];
    if (!validTimeWindows.includes(config.strategy.timeWindow)) {
      throw new Error(`动态配置生成的时间窗口无效: ${config.strategy.timeWindow}`);
    }

    // 测试生成的时间窗口是否可用
    const testContent = new Date(Date.now() - 2 * 60 * 60 * 1000); // 2小时前
    const result = await this.timeValidator.run({
      contentTimestamp: testContent,
      requiredTimeWindow: config.strategy.timeWindow as any
    });

    if (typeof result.isValid !== 'boolean') {
      throw new Error('动态配置生成的时间窗口验证失败');
    }
  }

  /**
   * 性能压力测试
   */
  private async testPerformanceUnderLoad(): Promise<void> {
    const batchSize = 1000;
    const testContent = new Date();

    // 创建大量并发验证任务
    const startTime = Date.now();
    const validationPromises = Array.from({ length: batchSize }, () =>
      this.timeValidator.run({
        contentTimestamp: testContent,
        requiredTimeWindow: '24h'
      })
    );

    const results = await Promise.all(validationPromises);
    const duration = Date.now() - startTime;

    // 验证所有结果都成功
    if (results.some(r => typeof r.isValid !== 'boolean')) {
      throw new Error('性能测试中有验证失败');
    }

    // 验证性能要求 (每秒至少处理 100 个验证)
    const validationsPerSecond = (batchSize / duration) * 1000;
    if (validationsPerSecond < 100) {
      throw new Error(
        `性能测试失败: 每秒验证数 ${validationsPerSecond.toFixed(2)} < 100`
      );
    }

    console.log(`    📊 性能指标: ${validationsPerSecond.toFixed(2)} 验证/秒`);
  }

  /**
   * 生成测试报告
   */
  private generateTestReport(
    results: Array<{ name: string; status: 'pass' | 'fail'; error?: string; duration?: number }>,
    passed: number,
    failed: number
  ): void {
    console.log('\n📊 时效性验证报告');
    console.log('='.repeat(50));
    
    console.log(`\n总体状态: ${failed === 0 ? '✅ 全部通过' : `❌ ${failed} 个失败`}`);
    console.log(`通过测试: ${passed}`);
    console.log(`失败测试: ${failed}`);
    console.log(`总计测试: ${passed + failed}`);
    
    if (results.some(r => r.duration)) {
      const avgDuration = results
        .filter(r => r.duration)
        .reduce((sum, r) => sum + (r.duration || 0), 0) / results.filter(r => r.duration).length;
      console.log(`平均耗时: ${avgDuration.toFixed(2)}ms`);
    }

    console.log('\n详细结果:');
    results.forEach(result => {
      const icon = result.status === 'pass' ? '✅' : '❌';
      const duration = result.duration ? ` (${result.duration}ms)` : '';
      console.log(`  ${icon} ${result.name}${duration}`);
      if (result.error) {
        console.log(`      错误: ${result.error}`);
      }
    });

    // 生成改进建议
    if (failed > 0) {
      console.log('\n💡 改进建议:');
      const failedTests = results.filter(r => r.status === 'fail');
      
      if (failedTests.some(t => t.name.includes('性能'))) {
        console.log('  - 考虑优化时间验证算法的性能');
      }
      if (failedTests.some(t => t.name.includes('边界'))) {
        console.log('  - 检查边界条件处理逻辑');
      }
      if (failedTests.some(t => t.name.includes('时区'))) {
        console.log('  - 验证时区转换逻辑');
      }
      if (failedTests.some(t => t.name.includes('动态配置'))) {
        console.log('  - 检查 DeepSeek API 连接和配置生成逻辑');
      }
    }
  }
}

/**
 * 命令行入口
 */
async function main() {
  const command = process.argv[2] || 'full';
  const validator = new TimeEffectivenessValidator();

  console.log(`🚀 时效性验证工具 - ${command.toUpperCase()} 模式\n`);

  try {
    switch (command) {
      case 'full':
      case 'f':
        await validator.runFullValidation();
        break;

      case 'help':
      case '--help':
      case '-h':
        console.log(`
使用方法: npx tsx time-effectiveness-validator.ts [命令]

命令:
  full (f)       完整验证 (默认)
  help          显示此帮助

示例:
  npx tsx time-effectiveness-validator.ts full
        `);
        break;

      default:
        console.error(`❌ 未知命令: ${command}`);
        console.log('使用 "help" 查看可用命令');
        process.exit(1);
    }

    console.log('\n🎉 时效性验证完成！');
  } catch (error) {
    console.error('\n❌ 验证失败:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

// 执行主函数
if (require.main === module) {
  main().catch(error => {
    console.error('❌ 执行失败:', error);
    process.exit(1);
  });
}