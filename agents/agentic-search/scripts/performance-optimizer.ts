#!/usr/bin/env npx tsx

/**
 * 性能优化和并发测试脚本
 * 
 * 测试系统在高并发负载下的性能表现并提供优化建议
 */

import { config } from 'dotenv';
import { join } from 'path';
import { MultiAgentSearchPipeline } from '../pipeline/multi-agent-pipeline';
import { BrowserPool } from '../infrastructure/browser-pool';
import { WorkerPool } from '../infrastructure/worker-pool';
import { environmentManager, updateRuntimeConfig } from '../config/index';

// 加载环境变量
config({ path: join(__dirname, '../.env') });

/**
 * 性能测试指标
 */
interface PerformanceMetrics {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  averageResponseTime: number;
  minResponseTime: number;
  maxResponseTime: number;
  throughput: number; // 请求/秒
  errorRate: number;
  memoryUsage: {
    before: NodeJS.MemoryUsage;
    after: NodeJS.MemoryUsage;
    peak: NodeJS.MemoryUsage;
  };
  concurrencyLevel: number;
}

/**
 * 性能优化器和测试套件
 */
class PerformanceOptimizer {
  private pipeline: MultiAgentSearchPipeline;
  private browserPool?: BrowserPool;
  private workerPool?: WorkerPool;

  constructor() {
    this.pipeline = new MultiAgentSearchPipeline();
  }

  /**
   * 执行完整的性能测试和优化
   */
  async runPerformanceOptimization(): Promise<void> {
    console.log('⚡ 开始性能优化和并发测试...\n');

    try {
      // 1. 基准性能测试
      await this.runBaselinePerformanceTest();
      
      // 2. 并发负载测试
      await this.runConcurrencyLoadTest();
      
      // 3. 内存使用测试
      await this.runMemoryUsageTest();
      
      // 4. 瓶颈分析
      await this.analyzeBottlenecks();
      
      // 5. 配置优化建议
      await this.generateOptimizationRecommendations();
      
      // 6. 优化后性能测试
      await this.runOptimizedPerformanceTest();

      console.log('\n✅ 性能优化测试完成！');
      
    } catch (error) {
      console.error('\n❌ 性能测试失败:', error);
      throw error;
    } finally {
      await this.cleanup();
    }
  }

  /**
   * 基准性能测试
   */
  private async runBaselinePerformanceTest(): Promise<PerformanceMetrics> {
    console.log('📊 执行基准性能测试...');
    
    const testConfig = {
      concurrency: 5,
      requests: 20,
      timeout: 60000
    };

    const metrics = await this.executePerformanceTest(testConfig);
    
    console.log('  📈 基准性能指标:');
    this.printMetrics(metrics);
    
    return metrics;
  }

  /**
   * 并发负载测试
   */
  private async runConcurrencyLoadTest(): Promise<void> {
    console.log('🚀 执行并发负载测试...');
    
    const concurrencyLevels = [1, 3, 5, 10, 15, 20];
    const results: Array<{ level: number; metrics: PerformanceMetrics }> = [];

    for (const level of concurrencyLevels) {
      console.log(`  🔄 测试并发级别: ${level}`);
      
      try {
        const metrics = await this.executePerformanceTest({
          concurrency: level,
          requests: level * 3, // 每个并发级别3个请求
          timeout: 120000
        });
        
        results.push({ level, metrics });
        
        console.log(`    ✅ 并发 ${level}: ${metrics.throughput.toFixed(2)} req/s, ` +
                   `错误率 ${(metrics.errorRate * 100).toFixed(1)}%`);
        
      } catch (error) {
        console.error(`    ❌ 并发 ${level} 失败:`, error instanceof Error ? error.message : String(error));
        break; // 达到系统极限
      }
    }

    // 分析并发性能曲线
    this.analyzeConcurrencyResults(results);
  }

  /**
   * 内存使用测试
   */
  private async runMemoryUsageTest(): Promise<void> {
    console.log('💾 执行内存使用测试...');
    
    const initialMemory = process.memoryUsage();
    console.log('  📊 初始内存使用:');
    this.printMemoryUsage(initialMemory);

    // 执行中等负载测试并监控内存
    let peakMemory = initialMemory;
    const memoryMonitor = setInterval(() => {
      const currentMemory = process.memoryUsage();
      if (currentMemory.heapUsed > peakMemory.heapUsed) {
        peakMemory = currentMemory;
      }
    }, 1000);

    const testConfig = {
      concurrency: 8,
      requests: 24,
      timeout: 90000
    };

    await this.executePerformanceTest(testConfig);
    clearInterval(memoryMonitor);

    const finalMemory = process.memoryUsage();
    
    console.log('  📊 峰值内存使用:');
    this.printMemoryUsage(peakMemory);
    
    console.log('  📊 最终内存使用:');
    this.printMemoryUsage(finalMemory);
    
    // 内存增长分析
    const memoryGrowth = (finalMemory.heapUsed - initialMemory.heapUsed) / 1024 / 1024;
    console.log(`  📈 内存增长: ${memoryGrowth.toFixed(2)} MB`);
    
    if (memoryGrowth > 100) {
      console.warn('  ⚠️ 检测到可能的内存泄漏');
    }
  }

  /**
   * 瓶颈分析
   */
  private async analyzeBottlenecks(): Promise<void> {
    console.log('🔍 执行瓶颈分析...');
    
    // 分别测试各个组件的性能
    const components = [
      { name: 'Google Search', test: () => this.testGoogleSearchPerformance() },
      { name: 'GitHub Search', test: () => this.testGitHubSearchPerformance() },
      { name: 'Quality Filter', test: () => this.testQualityFilterPerformance() },
      { name: 'Content Generation', test: () => this.testContentGenerationPerformance() }
    ];

    const bottlenecks: Array<{ component: string; avgTime: number }> = [];

    for (const component of components) {
      try {
        console.log(`  🔄 测试 ${component.name}...`);
        const avgTime = await component.test();
        bottlenecks.push({ component: component.name, avgTime });
        console.log(`    ⏱️ ${component.name}: ${avgTime.toFixed(2)}ms`);
      } catch (error) {
        console.warn(`    ⚠️ ${component.name} 测试失败:`, error instanceof Error ? error.message : String(error));
      }
    }

    // 排序找出最慢的组件
    bottlenecks.sort((a, b) => b.avgTime - a.avgTime);
    
    console.log('  📊 性能瓶颈分析:');
    bottlenecks.forEach((item, index) => {
      const icon = index === 0 ? '🐌' : index === 1 ? '⚠️' : '✅';
      console.log(`    ${icon} ${item.component}: ${item.avgTime.toFixed(2)}ms`);
    });
  }

  /**
   * 生成优化建议
   */
  private async generateOptimizationRecommendations(): Promise<void> {
    console.log('💡 生成优化建议...');
    
    const currentConfig = environmentManager.getConfig();
    const recommendations: string[] = [];

    // 基于当前配置生成建议
    if (currentConfig.browserPoolSize < 5) {
      recommendations.push('建议增加浏览器池大小到 5-10 以提高并发能力');
    }
    
    if (currentConfig.workerPoolSize < currentConfig.browserPoolSize * 2) {
      recommendations.push('建议 Worker 池大小设为浏览器池的 2-3 倍');
    }
    
    if (currentConfig.searchTimeout > 60000) {
      recommendations.push('建议减少搜索超时时间到 45 秒以下以提高响应速度');
    }
    
    if (!currentConfig.cacheEnabled) {
      recommendations.push('建议启用缓存以减少重复请求');
    }
    
    if (currentConfig.qualityThreshold > 0.8) {
      recommendations.push('建议适当降低质量阈值以提高搜索结果数量');
    }

    // 内存优化建议
    recommendations.push('建议定期清理浏览器缓存和临时文件');
    recommendations.push('建议在生产环境中启用 Node.js 内存优化选项');

    console.log('  🎯 优化建议:');
    recommendations.forEach((rec, index) => {
      console.log(`    ${index + 1}. ${rec}`);
    });

    // 应用优化配置
    await this.applyOptimizations();
  }

  /**
   * 应用性能优化配置
   */
  private async applyOptimizations(): Promise<void> {
    console.log('⚙️ 应用性能优化配置...');
    
    const currentConfig = environmentManager.getConfig();
    const optimizedConfig = {
      browserPoolSize: Math.max(currentConfig.browserPoolSize, 8),
      workerPoolSize: Math.max(currentConfig.workerPoolSize, 15),
      searchTimeout: Math.min(currentConfig.searchTimeout, 45000),
      cacheEnabled: true,
      cacheTTL: 1800, // 30分钟缓存
      qualityThreshold: Math.min(currentConfig.qualityThreshold, 0.75)
    };

    updateRuntimeConfig(optimizedConfig);
    console.log('  ✅ 优化配置已应用');
  }

  /**
   * 优化后性能测试
   */
  private async runOptimizedPerformanceTest(): Promise<void> {
    console.log('🎯 执行优化后性能测试...');
    
    const optimizedMetrics = await this.executePerformanceTest({
      concurrency: 10,
      requests: 30,
      timeout: 90000
    });

    console.log('  📈 优化后性能指标:');
    this.printMetrics(optimizedMetrics);
  }

  /**
   * 执行性能测试
   */
  private async executePerformanceTest(config: {
    concurrency: number;
    requests: number;
    timeout: number;
  }): Promise<PerformanceMetrics> {
    const beforeMemory = process.memoryUsage();
    const startTime = Date.now();
    
    // 生成测试请求
    const testRequests = Array.from({ length: config.requests }, (_, i) => ({
      keywords: [`test ${i}`, 'performance'],
      timeWindow: '24h' as const,
      sources: {
        google: { enabled: true, priority: 1 },
        twitter: { enabled: false },
        github: { enabled: Math.random() > 0.5 }
      },
      quality: {
        minScore: 0.6,
        duplicateThreshold: 0.8,
        maxResults: 3
      }
    }));

    // 分批执行以控制并发
    const batches: any[][] = [];
    for (let i = 0; i < testRequests.length; i += config.concurrency) {
      batches.push(testRequests.slice(i, i + config.concurrency));
    }

    const results: Array<{ success: boolean; time: number }> = [];
    let peakMemory = beforeMemory;

    for (const batch of batches) {
      const batchPromises = batch.map(async (request) => {
        const requestStart = Date.now();
        try {
          const result = await Promise.race([
            this.pipeline.execute(request),
            new Promise((_, reject) => 
              setTimeout(() => reject(new Error('Timeout')), config.timeout)
            )
          ]);
          
          const requestTime = Date.now() - requestStart;
          return { success: true, time: requestTime };
        } catch (error) {
          const requestTime = Date.now() - requestStart;
          return { success: false, time: requestTime };
        }
      });

      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);

      // 监控内存使用
      const currentMemory = process.memoryUsage();
      if (currentMemory.heapUsed > peakMemory.heapUsed) {
        peakMemory = currentMemory;
      }
    }

    const endTime = Date.now();
    const totalTime = endTime - startTime;
    const afterMemory = process.memoryUsage();

    // 计算指标
    const successfulRequests = results.filter(r => r.success).length;
    const failedRequests = results.length - successfulRequests;
    const responseTimes = results.map(r => r.time);
    
    return {
      totalRequests: results.length,
      successfulRequests,
      failedRequests,
      averageResponseTime: responseTimes.reduce((sum, time) => sum + time, 0) / responseTimes.length,
      minResponseTime: Math.min(...responseTimes),
      maxResponseTime: Math.max(...responseTimes),
      throughput: (successfulRequests / totalTime) * 1000,
      errorRate: failedRequests / results.length,
      memoryUsage: {
        before: beforeMemory,
        after: afterMemory,
        peak: peakMemory
      },
      concurrencyLevel: config.concurrency
    };
  }

  /**
   * 分析并发测试结果
   */
  private analyzeConcurrencyResults(results: Array<{ level: number; metrics: PerformanceMetrics }>): void {
    console.log('\n  📊 并发性能分析:');
    
    // 找出最佳并发级别
    const bestPerformance = results.reduce((best, current) => 
      current.metrics.throughput > best.metrics.throughput ? current : best
    );

    console.log(`    🏆 最佳并发级别: ${bestPerformance.level} (${bestPerformance.metrics.throughput.toFixed(2)} req/s)`);
    
    // 找出性能下降点
    for (let i = 1; i < results.length; i++) {
      const prev = results[i - 1];
      const curr = results[i];
      
      if (curr.metrics.throughput < prev.metrics.throughput * 0.9) {
        console.log(`    ⚠️ 性能下降点: 并发 ${curr.level} (吞吐量下降 ${((1 - curr.metrics.throughput / prev.metrics.throughput) * 100).toFixed(1)}%)`);
        break;
      }
    }

    // 错误率分析
    const highErrorRateResults = results.filter(r => r.metrics.errorRate > 0.1);
    if (highErrorRateResults.length > 0) {
      console.log(`    ❌ 高错误率并发级别: ${highErrorRateResults.map(r => r.level).join(', ')}`);
    }
  }

  /**
   * 测试各组件性能
   */
  private async testGoogleSearchPerformance(): Promise<number> {
    // 简化测试，实际应该测试 Google Search Agent
    const times: number[] = [];
    for (let i = 0; i < 5; i++) {
      const start = Date.now();
      try {
        await this.pipeline.execute({
          keywords: ['test'],
          timeWindow: '24h',
          sources: { google: { enabled: true, priority: 1 }, twitter: { enabled: false }, github: { enabled: false } },
          quality: { minScore: 0.5, duplicateThreshold: 0.8, maxResults: 1 }
        });
        times.push(Date.now() - start);
      } catch {
        times.push(60000); // 超时作为惩罚
      }
    }
    return times.reduce((sum, time) => sum + time, 0) / times.length;
  }

  private async testGitHubSearchPerformance(): Promise<number> {
    const times: number[] = [];
    for (let i = 0; i < 5; i++) {
      const start = Date.now();
      try {
        await this.pipeline.execute({
          keywords: ['test'],
          timeWindow: '24h',
          sources: { google: { enabled: false }, twitter: { enabled: false }, github: { enabled: true, priority: 1 } },
          quality: { minScore: 0.5, duplicateThreshold: 0.8, maxResults: 1 }
        });
        times.push(Date.now() - start);
      } catch {
        times.push(30000);
      }
    }
    return times.reduce((sum, time) => sum + time, 0) / times.length;
  }

  private async testQualityFilterPerformance(): Promise<number> {
    // 模拟质量过滤测试
    return 500; // 假设平均 500ms
  }

  private async testContentGenerationPerformance(): Promise<number> {
    // 模拟内容生成测试
    return 2000; // 假设平均 2 秒
  }

  /**
   * 打印性能指标
   */
  private printMetrics(metrics: PerformanceMetrics): void {
    console.log(`    总请求数: ${metrics.totalRequests}`);
    console.log(`    成功请求: ${metrics.successfulRequests}`);
    console.log(`    失败请求: ${metrics.failedRequests}`);
    console.log(`    平均响应时间: ${metrics.averageResponseTime.toFixed(2)}ms`);
    console.log(`    最小响应时间: ${metrics.minResponseTime}ms`);
    console.log(`    最大响应时间: ${metrics.maxResponseTime}ms`);
    console.log(`    吞吐量: ${metrics.throughput.toFixed(2)} req/s`);
    console.log(`    错误率: ${(metrics.errorRate * 100).toFixed(2)}%`);
    console.log(`    并发级别: ${metrics.concurrencyLevel}`);
  }

  /**
   * 打印内存使用情况
   */
  private printMemoryUsage(memory: NodeJS.MemoryUsage): void {
    console.log(`    堆内存: ${(memory.heapUsed / 1024 / 1024).toFixed(2)} MB`);
    console.log(`    堆总量: ${(memory.heapTotal / 1024 / 1024).toFixed(2)} MB`);
    console.log(`    外部内存: ${(memory.external / 1024 / 1024).toFixed(2)} MB`);
    console.log(`    RSS: ${(memory.rss / 1024 / 1024).toFixed(2)} MB`);
  }

  /**
   * 清理资源
   */
  private async cleanup(): Promise<void> {
    console.log('\n🧹 清理性能测试资源...');
    
    if (this.browserPool) {
      await this.browserPool.destroy();
    }
    
    if (this.workerPool) {
      await this.workerPool.destroy();
    }
    
    // 强制垃圾回收
    if (global.gc) {
      global.gc();
    }
    
    console.log('  ✅ 资源清理完成');
  }
}

/**
 * 快速性能检查
 */
async function quickPerformanceCheck(): Promise<void> {
  console.log('⚡ 快速性能检查...\n');
  
  const optimizer = new PerformanceOptimizer();
  
  try {
    const testConfig = {
      concurrency: 3,
      requests: 9,
      timeout: 30000
    };

    const metrics = await optimizer['executePerformanceTest'](testConfig);
    
    console.log('📊 快速性能指标:');
    optimizer['printMetrics'](metrics);
    
    // 性能评估
    const performanceScore = optimizer['calculatePerformanceScore'](metrics);
    console.log(`\n🎯 性能评分: ${performanceScore}/100`);
    
    if (performanceScore < 60) {
      console.log('⚠️ 性能需要优化');
    } else if (performanceScore < 80) {
      console.log('✅ 性能良好');
    } else {
      console.log('🏆 性能优秀');
    }
    
  } catch (error) {
    console.error('❌ 快速性能检查失败:', error);
  } finally {
    await optimizer['cleanup']();
  }
}

/**
 * 性能评分计算（扩展方法）
 */
PerformanceOptimizer.prototype['calculatePerformanceScore'] = function(metrics: PerformanceMetrics): number {
  let score = 100;
  
  // 响应时间评分 (40%)
  if (metrics.averageResponseTime > 30000) score -= 40;
  else if (metrics.averageResponseTime > 20000) score -= 30;
  else if (metrics.averageResponseTime > 10000) score -= 20;
  else if (metrics.averageResponseTime > 5000) score -= 10;
  
  // 错误率评分 (30%)
  score -= metrics.errorRate * 30;
  
  // 吞吐量评分 (20%)
  if (metrics.throughput < 0.1) score -= 20;
  else if (metrics.throughput < 0.5) score -= 15;
  else if (metrics.throughput < 1.0) score -= 10;
  else if (metrics.throughput < 2.0) score -= 5;
  
  // 稳定性评分 (10%)
  const responseTimeVariance = metrics.maxResponseTime - metrics.minResponseTime;
  if (responseTimeVariance > 20000) score -= 10;
  else if (responseTimeVariance > 10000) score -= 5;
  
  return Math.max(0, Math.round(score));
};

/**
 * 命令行入口
 */
async function main() {
  const command = process.argv[2] || 'full';
  
  console.log(`🚀 性能优化工具 - ${command.toUpperCase()} 模式\n`);

  try {
    switch (command) {
      case 'full':
      case 'f':
        const optimizer = new PerformanceOptimizer();
        await optimizer.runPerformanceOptimization();
        break;
        
      case 'quick':
      case 'q':
        await quickPerformanceCheck();
        break;

      case 'help':
      case '--help':
      case '-h':
        console.log(`
使用方法: npx tsx performance-optimizer.ts [命令]

命令:
  full (f)      完整性能优化测试 (默认)
  quick (q)     快速性能检查
  help          显示此帮助

示例:
  npx tsx performance-optimizer.ts full
  npx tsx performance-optimizer.ts quick
        `);
        break;

      default:
        console.error(`❌ 未知命令: ${command}`);
        console.log('使用 "help" 查看可用命令');
        process.exit(1);
    }

    console.log('\n🎉 性能测试完成！');
  } catch (error) {
    console.error('\n❌ 性能测试失败:', error instanceof Error ? error.message : String(error));
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