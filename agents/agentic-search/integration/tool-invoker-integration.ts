import { ToolInvoker } from '@astack-tech/components';
import { 
  KeywordExpansionTool,
  SearchQueryOptimizerTool,
  SearchDeduplicationTool,
  SearchAggregationTool
} from '../tools/search-tools.js';
import {
  SentimentAnalysisTool,
  TopicClassificationTool,
  TrendDetectionTool
} from '../tools/analysis-tools.js';
import {
  FreshnessValidationTool,
  QualityValidationTool,
  DuplicationDetectionTool
} from '../tools/validation-tools.js';
import {
  DataFormatConverterTool,
  DataStatisticsTool,
  CacheManagementTool,
  PerformanceMonitorTool
} from '../tools/utility-tools.js';

/**
 * AStack Tool Invoker 集成
 * 
 * 为 Multi-Agent 系统提供统一的工具调用接口
 * 特点：
 * 1. 集中管理所有专用工具
 * 2. 提供工具发现和调用能力
 * 3. 支持工具链式调用
 * 4. 集成性能监控和缓存
 * 5. 提供工具使用统计
 */
export class AgenticSearchToolInvoker extends ToolInvoker {
  
  private performanceMonitor: PerformanceMonitorTool;
  private cacheManager: CacheManagementTool;
  private toolUsageStats: Map<string, number> = new Map();

  constructor() {
    // 初始化所有工具实例
    const tools = [
      // 搜索工具
      new KeywordExpansionTool(),
      new SearchQueryOptimizerTool(),
      new SearchDeduplicationTool(),
      new SearchAggregationTool(),
      
      // 分析工具
      new SentimentAnalysisTool(),
      new TopicClassificationTool(),
      new TrendDetectionTool(),
      
      // 验证工具
      new FreshnessValidationTool(),
      new QualityValidationTool(),
      new DuplicationDetectionTool(),
      
      // 实用工具
      new DataFormatConverterTool(),
      new DataStatisticsTool(),
      new CacheManagementTool(),
      new PerformanceMonitorTool()
    ];

    super({ 
      tools,
      verbose: true,
      parallel: true,
      timeout: 30000
    });

    // 初始化性能监控和缓存工具
    this.performanceMonitor = new PerformanceMonitorTool();
    this.cacheManager = new CacheManagementTool();
    
    console.log('🔗 AStack Tool Invoker 初始化完成');
  }

  /**
   * 获取工具统计信息
   */
  getToolStatistics() {
    return {
      totalTools: this.toolUsageStats.size,
      usageStats: Object.fromEntries(this.toolUsageStats),
      mostUsedTool: [...this.toolUsageStats.entries()].sort((a, b) => b[1] - a[1])[0]?.[0]
    };
  }

  /**
   * 设置工具分类
   */
  private setupToolCategories(): void {
    this.toolCategories = {
      search: [
        'keyword_expansion',
        'search_query_optimizer', 
        'search_deduplication',
        'search_aggregation'
      ],
      analysis: [
        'sentiment_analysis',
        'topic_classification',
        'trend_detection'
      ],
      validation: [
        'freshness_validation',
        'quality_validation',
        'duplication_detection'
      ],
      utility: [
        'data_format_converter',
        'data_statistics',
        'cache_management',
        'performance_monitor'
      ]
    };
  }

  /**
   * 智能工具调用（带性能监控和缓存）
   */
  async invokeToolSmart(
    toolName: string, 
    parameters: any, 
    options: {
      useCache?: boolean;
      cacheKey?: string;
      cacheTTL?: number;
      enableMonitoring?: boolean;
    } = {}
  ): Promise<any> {
    const {
      useCache = true,
      cacheKey,
      cacheTTL = 3600,
      enableMonitoring = true
    } = options;

    // 生成缓存键
    const finalCacheKey = cacheKey || this.generateCacheKey(toolName, parameters);

    // 尝试从缓存获取结果
    if (useCache) {
      const cachedResult = await this.cacheManager.invoke({
        operation: 'retrieve',
        key: finalCacheKey
      });

      if (cachedResult.success) {
        console.log(`💾 缓存命中: ${toolName}`);
        this.updateToolUsageStats(toolName, true);
        return cachedResult.data;
      }
    }

    // 开始性能监控
    let monitoringId: string | undefined;
    if (enableMonitoring) {
      monitoringId = `${toolName}_${Date.now()}`;
      await this.performanceMonitor.invoke({
        operation: 'start',
        operationName: monitoringId,
        metadata: { toolName, parameters: Object.keys(parameters) }
      });
    }

    try {
      // 调用工具
      const result = await super.invokeTool(toolName, parameters);

      // 结束性能监控
      if (enableMonitoring && monitoringId) {
        await this.performanceMonitor.invoke({
          operation: 'end',
          operationName: monitoringId,
          metadata: { success: true, resultSize: JSON.stringify(result).length }
        });
      }

      // 缓存结果
      if (useCache && result) {
        await this.cacheManager.invoke({
          operation: 'store',
          key: finalCacheKey,
          data: result,
          ttl: cacheTTL
        });
      }

      this.updateToolUsageStats(toolName, false);
      return result;

    } catch (error) {
      // 记录错误性能数据
      if (enableMonitoring && monitoringId) {
        await this.performanceMonitor.invoke({
          operation: 'end',
          operationName: monitoringId,
          metadata: { success: false, error: error instanceof Error ? error.message : String(error) }
        });
      }

      console.error(`❌ 工具调用失败: ${toolName}`, error);
      throw error;
    }
  }

  /**
   * 工具链式调用
   */
  async invokeToolChain(
    chainConfig: {
      name: string;
      description?: string;
      steps: {
        toolName: string;
        parameters: any;
        outputMapping?: Record<string, string>;
        condition?: (previousResults: any[]) => boolean;
      }[];
    },
    initialData?: any
  ): Promise<any> {
    console.log(`🔗 开始工具链调用: ${chainConfig.name}`);

    const chainId = `chain_${chainConfig.name}_${Date.now()}`;
    const results: any[] = [];
    let currentData = initialData;

    // 开始链式调用监控
    await this.performanceMonitor.invoke({
      operation: 'start',
      operationName: chainId,
      metadata: { 
        chainName: chainConfig.name, 
        stepCount: chainConfig.steps.length 
      }
    });

    try {
      for (let i = 0; i < chainConfig.steps.length; i++) {
        const step = chainConfig.steps[i];
        
        // 检查执行条件
        if (step.condition && !step.condition(results)) {
          console.log(`⏭️ 跳过步骤 ${i + 1}: 条件不满足`);
          continue;
        }

        console.log(`🔧 执行步骤 ${i + 1}/${chainConfig.steps.length}: ${step.toolName}`);

        // 处理参数（可能需要从前一步的结果中获取）
        const parameters = this.processChainParameters(step.parameters, currentData, results);

        // 调用工具
        const stepResult = await this.invokeToolSmart(step.toolName, parameters, {
          enableMonitoring: false // 避免嵌套监控
        });

        results.push(stepResult);

        // 输出映射（将结果映射到下一步的输入）
        if (step.outputMapping) {
          currentData = this.applyOutputMapping(stepResult, step.outputMapping);
        } else {
          currentData = stepResult;
        }
      }

      // 结束链式调用监控
      await this.performanceMonitor.invoke({
        operation: 'end',
        operationName: chainId,
        metadata: { 
          success: true, 
          completedSteps: results.length,
          finalResultSize: JSON.stringify(currentData).length
        }
      });

      console.log(`✅ 工具链调用完成: ${chainConfig.name}`);

      return {
        success: true,
        chainName: chainConfig.name,
        finalResult: currentData,
        stepResults: results,
        executedSteps: results.length,
        metadata: {
          executedAt: new Date(),
          chainId
        }
      };

    } catch (error) {
      // 记录链式调用错误
      await this.performanceMonitor.invoke({
        operation: 'end',
        operationName: chainId,
        metadata: { 
          success: false, 
          error: error instanceof Error ? error.message : String(error),
          failedAtStep: results.length + 1
        }
      });

      console.error(`❌ 工具链调用失败: ${chainConfig.name}`, error);
      
      return {
        success: false,
        chainName: chainConfig.name,
        error: error instanceof Error ? error.message : String(error),
        completedSteps: results.length,
        stepResults: results
      };
    }
  }

  /**
   * 获取工具推荐
   */
  getToolRecommendations(context: {
    taskType?: string;
    dataType?: string;
    previousTools?: string[];
    performance?: 'speed' | 'quality' | 'balanced';
  }): string[] {
    const { taskType, dataType, previousTools = [], performance = 'balanced' } = context;

    const recommendations: string[] = [];

    // 基于任务类型推荐
    if (taskType) {
      const taskTypeMap: Record<string, string[]> = {
        'search': ['keyword_expansion', 'search_query_optimizer', 'search_aggregation'],
        'analysis': ['sentiment_analysis', 'topic_classification', 'trend_detection'],
        'validation': ['freshness_validation', 'quality_validation', 'duplication_detection'],
        'processing': ['data_format_converter', 'data_statistics']
      };

      const taskTools = taskTypeMap[taskType] || [];
      recommendations.push(...taskTools);
    }

    // 基于数据类型推荐
    if (dataType === 'search_results') {
      recommendations.push('search_deduplication', 'quality_validation', 'freshness_validation');
    } else if (dataType === 'text_content') {
      recommendations.push('sentiment_analysis', 'topic_classification');
    }

    // 基于性能要求调整
    if (performance === 'speed') {
      // 优先推荐快速工具，避免复杂分析
      const fastTools = ['search_deduplication', 'data_format_converter'];
      return fastTools.filter(tool => recommendations.includes(tool));
    } else if (performance === 'quality') {
      // 推荐全面分析工具
      recommendations.push('trend_detection', 'data_statistics');
    }

    // 移除已使用的工具（避免重复）
    const filtered = recommendations.filter(tool => !previousTools.includes(tool));

    // 根据使用统计排序（推荐常用且成功率高的工具）
    return filtered.sort((a, b) => {
      const usageA = this.toolUsageStats.get(a) || 0;
      const usageB = this.toolUsageStats.get(b) || 0;
      return usageB - usageA;
    }).slice(0, 5);
  }

  /**
   * 获取工具使用统计
   */
  async getToolUsageStatistics(): Promise<any> {
    // 获取性能报告
    const performanceReport = await this.performanceMonitor.invoke({
      operation: 'report'
    });

    // 获取缓存信息
    const cacheInfo = await this.cacheManager.invoke({
      operation: 'info'
    });

    return {
      toolUsage: Object.fromEntries(this.toolUsageStats.entries()),
      performance: performanceReport.allMetrics || {},
      cache: cacheInfo,
      recommendations: this.generateUsageRecommendations(),
      summary: {
        totalTools: this.getAvailableTools().length,
        totalInvocations: Array.from(this.toolUsageStats.values()).reduce((sum, count) => sum + count, 0),
        cacheHitRate: this.calculateCacheHitRate(),
        averageResponseTime: this.calculateAverageResponseTime(performanceReport.allMetrics || {})
      }
    };
  }

  /**
   * 工具发现 - 根据描述查找合适的工具
   */
  discoverTools(description: string): Array<{ toolName: string; relevanceScore: number; reason: string }> {
    const tools = this.getAvailableTools();
    const results: Array<{ toolName: string; relevanceScore: number; reason: string }> = [];

    const descLower = description.toLowerCase();

    for (const toolName of tools) {
      const tool = this.getTool(toolName);
      if (!tool) continue;

      let score = 0;
      const reasons: string[] = [];

      // 基于工具名称匹配
      if (descLower.includes(toolName.replace(/_/g, ' '))) {
        score += 0.4;
        reasons.push('名称匹配');
      }

      // 基于描述匹配
      if (tool.description) {
        const toolDesc = tool.description.toLowerCase();
        const commonWords = descLower.split(' ').filter(word => 
          word.length > 3 && toolDesc.includes(word)
        );
        score += commonWords.length * 0.1;
        if (commonWords.length > 0) {
          reasons.push(`描述匹配 (${commonWords.length} 个关键词)`);
        }
      }

      // 基于分类匹配
      for (const [category, categoryTools] of Object.entries(this.toolCategories)) {
        if (categoryTools.includes(toolName) && descLower.includes(category)) {
          score += 0.3;
          reasons.push(`分类匹配 (${category})`);
        }
      }

      if (score > 0.2) {
        results.push({
          toolName,
          relevanceScore: Math.round(score * 100) / 100,
          reason: reasons.join(', ')
        });
      }
    }

    return results.sort((a, b) => b.relevanceScore - a.relevanceScore).slice(0, 5);
  }

  /**
   * 私有辅助方法
   */
  private generateCacheKey(toolName: string, parameters: any): string {
    const paramHash = JSON.stringify(parameters);
    return `tool_${toolName}_${Buffer.from(paramHash).toString('base64').substring(0, 16)}`;
  }

  private updateToolUsageStats(toolName: string, fromCache: boolean): void {
    const current = this.toolUsageStats.get(toolName) || 0;
    this.toolUsageStats.set(toolName, current + 1);

    // 可以在这里记录更详细的统计信息，如缓存命中等
  }

  private processChainParameters(parameters: any, currentData: any, previousResults: any[]): any {
    // 处理参数中的占位符
    const processed = JSON.parse(JSON.stringify(parameters));

    // 简单的占位符替换
    const replaceValue = (obj: any): any => {
      if (typeof obj === 'string') {
        if (obj === '{{current}}') return currentData;
        if (obj.startsWith('{{result[') && obj.endsWith(']}}')) {
          const index = parseInt(obj.slice(9, -3));
          return previousResults[index];
        }
      } else if (typeof obj === 'object' && obj !== null) {
        Object.keys(obj).forEach(key => {
          obj[key] = replaceValue(obj[key]);
        });
      }
      return obj;
    };

    return replaceValue(processed);
  }

  private applyOutputMapping(result: any, mapping: Record<string, string>): any {
    const mapped: any = {};

    Object.entries(mapping).forEach(([sourceKey, targetKey]) => {
      const value = this.getNestedValue(result, sourceKey);
      this.setNestedValue(mapped, targetKey, value);
    });

    return mapped;
  }

  private getNestedValue(obj: any, path: string): any {
    return path.split('.').reduce((current, key) => current?.[key], obj);
  }

  private setNestedValue(obj: any, path: string, value: any): void {
    const keys = path.split('.');
    const lastKey = keys.pop()!;
    
    let current = obj;
    for (const key of keys) {
      if (!current[key]) current[key] = {};
      current = current[key];
    }
    
    current[lastKey] = value;
  }

  private generateUsageRecommendations(): string[] {
    const recommendations = [];
    const totalUsage = Array.from(this.toolUsageStats.values()).reduce((sum, count) => sum + count, 0);

    if (totalUsage === 0) {
      recommendations.push('开始使用工具来获得性能洞察');
      return recommendations;
    }

    // 分析使用模式
    const sortedTools = Array.from(this.toolUsageStats.entries())
      .sort(([,a], [,b]) => b - a);

    const mostUsed = sortedTools[0];
    const leastUsed = sortedTools[sortedTools.length - 1];

    if (mostUsed[1] > totalUsage * 0.5) {
      recommendations.push(`${mostUsed[0]} 使用频率过高，考虑缓存优化`);
    }

    if (leastUsed[1] < totalUsage * 0.05) {
      recommendations.push(`${leastUsed[0]} 使用频率较低，评估是否需要`);
    }

    if (sortedTools.length > 10) {
      recommendations.push('工具使用较分散，考虑优化工具选择策略');
    }

    return recommendations.length > 0 ? recommendations : ['工具使用模式正常'];
  }

  private calculateCacheHitRate(): number {
    // 这里需要实现缓存命中率的计算
    // 简化实现
    return 0.75;
  }

  private calculateAverageResponseTime(performanceData: Record<string, any>): number {
    const tools = Object.values(performanceData);
    if (tools.length === 0) return 0;

    const totalAvgTime = tools.reduce((sum: number, tool: any) => sum + (tool.avgTime || 0), 0);
    return Math.round(totalAvgTime / tools.length);
  }

  private toolCategories: Record<string, string[]> = {};
}

export default AgenticSearchToolInvoker;