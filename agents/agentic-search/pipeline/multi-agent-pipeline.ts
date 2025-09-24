import { Pipeline, Component } from '@astack-tech/core';
import { ModelProvider } from '@astack-tech/integrations';

import { CoordinatorAgent } from '../agents/coordinator-agent.js';
import { GoogleSearchAgent } from '../agents/google-search-agent.js';
import { TwitterSearchAgent } from '../agents/twitter-search-agent.js';
import { GitHubSearchAgent } from '../agents/github-search-agent.js';
import { QualityFilterAgent } from '../agents/quality-filter-agent.js';
// 移除 NewsletterGeneratorAgent - 直接输出周刊格式

import { DynamicConfigManager } from '../config/dynamic-config-manager.js';
import { BrowserPool } from '../infrastructure/browser-pool.js';
import { WorkerPool } from '../infrastructure/worker-pool.js';
import { AgenticSearchToolInvoker } from '../integration/tool-invoker-integration.js';

import {
  AgenticSearchInput,
  AgenticSearchOutput,
  CoordinatorOutput,
  SearchResult,
  SearchContent,
  QualityFilterOutput,
  // NewsletterGeneratorOutput - 已移除
} from '../types/multi-agent.js';

/**
 * Multi-Agent 搜索管道
 * 
 * 使用 AStack Pipeline 架构整合所有 Agent，实现：
 * 1. 动态策略制定和任务分配
 * 2. 并行多源搜索执行
 * 3. 智能质量过滤和内容优化
 * 4. AI 驱动的新闻简报生成
 * 5. 全流程性能监控和错误处理
 */
export class MultiAgentSearchPipeline extends Pipeline {

  private coordinatorAgent: CoordinatorAgent;
  private googleSearchAgent: GoogleSearchAgent;
  private twitterSearchAgent: TwitterSearchAgent;
  private githubSearchAgent: GitHubSearchAgent;
  private qualityFilterAgent: QualityFilterAgent;
  // 移除 newsletterGeneratorAgent - 直接输出周刊格式

  private configManager: DynamicConfigManager;
  private browserPool: BrowserPool;
  private workerPool: WorkerPool;
  private toolInvoker: AgenticSearchToolInvoker;

  private executionStats: {
    startTime: Date;
    endTime?: Date;
    totalDuration?: number;
    searchResults: Record<string, number>;
    qualityFilterResults?: any;
    finalContentCount?: number;
    errors: string[];
  } = {
    startTime: new Date(),
    searchResults: {},
    errors: []
  };

  constructor() {
    super();

    this.initializeInfrastructure();
    this.initializeAgents();
    this.configurePipeline();
    
    console.log('🚀 Multi-Agent Search Pipeline 初始化完成');
  }

  /**
   * 初始化基础设施组件
   */
  private initializeInfrastructure(): void {
    // 初始化配置管理器
    this.configManager = new DynamicConfigManager({
      deepseekApiKey: process.env.DEEPSEEK_API_KEY || '',
      githubToken: process.env.GITHUB_TOKEN || '',
      enableCaching: true,
      defaultStrategy: 'balanced'
    });

    // 初始化浏览器池（用于 Twitter Agent，需要支持人工干预）
    this.browserPool = new BrowserPool({
      maxBrowsers: 8,
      headless: false, // Twitter Agent需要非headless模式支持人工干预
      defaultTimeout: 30000
    });

    // 初始化工作线程池
    this.workerPool = new WorkerPool({
      maxWorkers: 12,
      workerTypes: ['google-search', 'twitter-search', 'github-search', 'quality-assessment']
    });

    // 初始化工具调用器
    this.toolInvoker = new AgenticSearchToolInvoker();
  }

  /**
   * 初始化所有 Agent 组件
   */
  private initializeAgents(): void {
    // 创建 Agent 实例
    this.coordinatorAgent = new CoordinatorAgent();
    this.googleSearchAgent = new GoogleSearchAgent(); // 使用自己的 headless BrowserPool
    this.twitterSearchAgent = new TwitterSearchAgent(this.browserPool); // 使用共享的非 headless BrowserPool
    this.githubSearchAgent = new GitHubSearchAgent();
    this.qualityFilterAgent = new QualityFilterAgent();
    // 移除 NewsletterGeneratorAgent 实例化

    // 将 Agent 添加到管道
    this.addComponent('coordinator', this.coordinatorAgent);
    this.addComponent('google_search', this.googleSearchAgent);
    this.addComponent('twitter_search', this.twitterSearchAgent);
    this.addComponent('github_search', this.githubSearchAgent);
    this.addComponent('quality_filter', this.qualityFilterAgent);
    // 移除 newsletter_generator 组件

    console.log('🤖 所有 Agent 组件已添加到管道');
  }

  /**
   * 配置管道连接和数据流
   */
  private configurePipeline(): void {
    // Agent组件已在initializeAgents()中添加，此处只配置连接

    // 添加数据聚合组件
    const searchAggregator = this.createSearchAggregator();
    const qualityProcessor = this.createQualityProcessor(this.qualityFilterAgent, this.executionStats);
    const contentFormatter = this.createContentFormatter();

    this.addComponent('search_aggregator', searchAggregator);
    this.addComponent('quality_processor', qualityProcessor);
    this.addComponent('content_formatter', contentFormatter);

    // 配置管道流程
    this.setupPipelineFlow();

    console.log('🔗 管道组件配置完成');

    console.log('🔗 管道连接配置完成');
  }

  /**
   * 设置管道数据流
   */
  private setupPipelineFlow(): void {
    console.log('📊 配置 Multi-Agent 管道流程');
    
    // 阶段 1: 协调器输出策略 -> 搜索聚合器
    // coordinator 会输出策略到 'strategy' 端口，任务分配到 'tasks' 端口
    this.connect('coordinator.strategy', 'search_aggregator.coordination');
    this.connect('coordinator.tasks', 'search_aggregator.task_distribution');
    
    // 阶段 2: 搜索聚合器分发任务给各个搜索引擎
    this.connect('search_aggregator.google_task', 'google_search.task');
    this.connect('search_aggregator.twitter_task', 'twitter_search.task');
    this.connect('search_aggregator.github_task', 'github_search.in');
    
    // 阶段 3: 各搜索引擎结果回到聚合器
    this.connect('google_search.result', 'search_aggregator.google_results');
    this.connect('twitter_search.result', 'search_aggregator.twitter_results');
    this.connect('github_search.out', 'search_aggregator.github_results');
    
    // 阶段 4: 聚合结果 -> 质量过滤
    this.connect('search_aggregator.aggregated_results', 'quality_processor.input');
    
    // 阶段 5: 过滤结果 -> 内容格式化器 (直接输出周刊格式)
    this.connect('quality_processor.filtered_results', 'content_formatter.input');
    
    // 阶段 6: content_formatter使用标准'out'端口作为管道终点 (AStack Pipeline会自动连接到end.in)
    
    console.log('✅ Multi-Agent 管道流程配置完成');
  }

  /**
   * 创建搜索结果聚合器
   */
  private createSearchAggregator(): Component {
    const aggregator = new Component();

    // 输入端口
    Component.Port.I('coordination').attach(aggregator);
    Component.Port.I('task_distribution').attach(aggregator);
    Component.Port.I('google_results').attach(aggregator);
    Component.Port.I('twitter_results').attach(aggregator);
    Component.Port.I('github_results').attach(aggregator);
    
    // 输出端口 - 任务分发
    Component.Port.O('google_task').attach(aggregator);
    Component.Port.O('twitter_task').attach(aggregator);
    Component.Port.O('github_task').attach(aggregator);
    
    // 输出端口 - 聚合结果
    Component.Port.O('aggregated_results').attach(aggregator);

    aggregator._transform = ($i, $o) => {
      let coordination: any = null;
      let taskDistribution: any = null;
      const searchResults: Record<string, SearchResult> = {};

      // 接收协调信息
      $i('coordination').receive((data: any) => {
        coordination = data;
        console.log('📋 接收到协调策略');
      });

      // 接收任务分配
      $i('task_distribution').receive((tasks: CoordinatorOutput['taskDistribution']) => {
        taskDistribution = tasks;
        console.log('🎯 开始分发搜索任务');

        // 分发任务到各个搜索引擎
        if (tasks.google) {
          console.log('📤 分发 Google 搜索任务');
          $o('google_task').send(tasks.google);
        }
        
        if (tasks.twitter) {
          console.log('📤 分发 Twitter 搜索任务');
          $o('twitter_task').send(tasks.twitter);
        }
        
        if (tasks.github) {
          console.log('📤 分发 GitHub 搜索任务');
          $o('github_task').send(tasks.github);
        }
      });

      // 接收搜索结果
      ['google_results', 'twitter_results', 'github_results'].forEach(source => {
        $i(source).receive((result: any) => {
          const sourceKey = source.replace('_results', '');
          searchResults[sourceKey] = result;

          console.log(`✅ ${sourceKey} 搜索完成: ${result.contents?.length || 0} 个结果`);

          // 检查是否所有搜索都完成
          const allSearchesCompleted = taskDistribution && 
            Object.keys(taskDistribution).every(key => searchResults[key]);

          if (allSearchesCompleted) {
            console.log('🔄 所有搜索完成，开始聚合结果');
            
            // 聚合所有搜索结果
            const aggregatedContents: SearchContent[] = [];
            Object.values(searchResults).forEach((result: any) => {
              if (result.contents) {
                aggregatedContents.push(...result.contents);
              }
            });

            const aggregatedResult = {
              contents: aggregatedContents,
              totalResults: aggregatedContents.length,
              sources: Object.keys(searchResults),
              timestamp: new Date().toISOString(),
              searchResults: searchResults,
              strategy: coordination?.strategy || null
            };

            console.log(`📊 聚合完成: ${aggregatedResult.totalResults} 个结果`);
            $o('aggregated_results').send(aggregatedResult);
          }
        });
      });
    };

    return aggregator;
  }

  /**
   * 创建质量处理器
   */
  private createQualityProcessor(qualityFilterAgent: QualityFilterAgent, executionStats: any): Component {
    const processor = new Component();

    Component.Port.I('input').attach(processor);
    Component.Port.O('filtered_results').attach(processor);

    processor._transform = ($i, $o) => {
      $i('input').receive(async (data: { contents: SearchContent[], strategy: any, searchResults: any }) => {
        console.log('🔍 开始质量过滤处理');

        try {
          // 使用质量过滤 Agent 处理
          const qualityResult = await qualityFilterAgent.filterContent({
            googleResults: data.searchResults.google,
            twitterResults: data.searchResults.twitter,
            githubResults: data.searchResults.github,
            strategy: data.strategy
          });

          executionStats.qualityFilterResults = qualityResult.summary;

          console.log(`✨ 质量过滤完成: ${qualityResult.summary.totalOutput}/${qualityResult.summary.totalInput} 通过`);

          $o('filtered_results').send({
            filteredContents: qualityResult.filteredContents,
            qualityAnalysis: qualityResult.qualityAnalysis,
            strategy: data.strategy
          });

        } catch (error) {
          console.error('❌ 质量过滤失败:', error);
          this.executionStats.errors.push(`质量过滤错误: ${error instanceof Error ? error.message : String(error)}`);

          // 发送原始内容作为备选
          $o('filtered_results').send({
            filteredContents: data.contents.slice(0, 50), // 限制数量
            qualityAnalysis: { error: '质量过滤失败，使用备选方案' },
            strategy: data.strategy
          });
        }
      });
    };

    return processor;
  }

  /**
   * 创建内容格式化器 - 直接输出周刊格式
   */
  private createContentFormatter(): Component {
    const formatter = new Component();

    // 使用标准的输入端口，但保持自定义名称以便连接
    Component.Port.I('input').attach(formatter);
    // 注意：Component基类已经自动创建了默认的'out'端口，这是AStack Pipeline期望的

    formatter._transform = ($i, $o) => {
      $i('input').receive(async (data: any) => {
        // 直接从质量过滤结果生成周刊格式
        const contents = data.filteredContents || [];
        
        console.log(`📝 开始生成周刊格式，内容数量: ${contents.length}`);
        
        // 生成周刊 Markdown 内容
        const weeklyMarkdown = this.generateWeeklyMarkdown(contents);
        
        // 生成最终输出
        const finalOutput: AgenticSearchOutput = {
          success: true,
          weeklyMarkdown, // 直接的周刊 markdown 内容
          contents: contents,
          searchResults: this.executionStats.searchResults,
          qualityAnalysis: data.qualityAnalysis || {},
          analytics: this.generateAnalytics(),
          metadata: {
            executionTime: this.executionStats.totalDuration || 0,
            timestamp: new Date(),
            contentSources: Object.keys(this.executionStats.searchResults),
            totalContents: Object.values(this.executionStats.searchResults).reduce((sum, count) => sum + count, 0),
            finalContentCount: contents.length,
            qualityFilterRate: this.executionStats.qualityFilterResults?.filterRate || 0
          }
        };

        this.executionStats.finalContentCount = finalOutput.metadata?.finalContentCount;

        console.log('🎯 管道执行完成');
        console.log(`   📊 总结果数: ${finalOutput.metadata?.totalContents}`);
        console.log(`   ✨ 高质量内容: ${finalOutput.metadata?.finalContentCount}`);
        console.log(`   ⏱️ 执行时间: ${finalOutput.metadata?.executionTime}ms`);

        // 直接保存周刊到文件系统
        try {
          await this.saveWeeklyToFile(weeklyMarkdown);
          console.log('📄 周刊文件保存成功');
        } catch (error) {
          console.warn('⚠️ 周刊保存失败:', error instanceof Error ? error.message : String(error));
        }

        // 使用标准的'out'端口发送最终结果，这样AStack Pipeline能正确处理
        $o('out').send(finalOutput);
      });
    };

    return formatter;
  }

  /**
   * 执行搜索任务
   */
  private async executeSearchTasks(
    tasks: CoordinatorOutput['taskDistribution'], 
    results: Record<string, SearchResult>
  ): Promise<void> {
    const searchPromises: Promise<void>[] = [];

    // Google 搜索任务
    if (tasks.google?.enabled) {
      searchPromises.push(
        this.executeSearchTask('google', tasks.google, results)
      );
    }

    // Twitter 搜索任务
    if (tasks.twitter?.enabled) {
      searchPromises.push(
        this.executeSearchTask('twitter', tasks.twitter, results)
      );
    }

    // GitHub 搜索任务
    if (tasks.github?.enabled) {
      searchPromises.push(
        this.executeSearchTask('github', tasks.github, results)
      );
    }

    // 等待所有搜索完成
    await Promise.allSettled(searchPromises);
  }

  /**
   * 执行单个搜索任务
   */
  private async executeSearchTask(
    source: string, 
    task: any, 
    results: Record<string, SearchResult>
  ): Promise<void> {
    try {
      console.log(`🔍 启动 ${source} 搜索任务`);

      let searchResult: SearchResult;

      switch (source) {
        case 'google':
          searchResult = await this.googleSearchAgent.executeSearch(task, {
            requestId: `search_${Date.now()}`,
            timestamp: new Date(),
            userAgent: 'agentic-search/1.0'
          });
          break;

        case 'twitter':
          searchResult = await this.twitterSearchAgent.executeSearch(task, {
            requestId: `search_${Date.now()}`,
            timestamp: new Date(),
            userAgent: 'agentic-search/1.0'
          });
          break;

        case 'github':
          searchResult = await this.githubSearchAgent.executeSearch(task, {
            requestId: `search_${Date.now()}`,
            timestamp: new Date(),
            userAgent: 'agentic-search/1.0'
          });
          break;

        default:
          throw new Error(`未知的搜索源: ${source}`);
      }

      results[source] = searchResult;

      // 通过管道端口发送结果
      const outputPort = this.getComponent('search_aggregator')?.getPort('output', `${source}_results`);
      if (outputPort) {
        outputPort.send(searchResult);
      }

    } catch (error) {
      console.error(`❌ ${source} 搜索失败:`, error);
      this.executionStats.errors.push(`${source} 搜索错误: ${error instanceof Error ? error.message : String(error)}`);

      // 发送空结果
      results[source] = {
        success: false,
        results: [],
        totalResults: 0,
        executionTimeMs: 0,
        source,
        error: error instanceof Error ? error.message : String(error),
        metadata: { timestamp: new Date() }
      };
    }
  }

  /**
   * 检查所有搜索是否完成
   */
  private allSearchesCompleted(
    tasks: CoordinatorOutput['taskDistribution'], 
    results: Record<string, SearchResult>
  ): boolean {
    const enabledSources = Object.entries(tasks)
      .filter(([, task]) => task.enabled)
      .map(([source]) => source);

    return enabledSources.every(source => results[source] !== undefined);
  }

  /**
   * 聚合搜索结果并发送
   */
  private aggregateAndSendResults(
    searchResults: Record<string, SearchResult>, 
    coordination: any, 
    $o: any
  ): void {
    console.log('🔗 聚合搜索结果');

    // 聚合所有搜索内容
    const allContents: SearchContent[] = [];
    let totalSuccessfulSources = 0;

    Object.entries(searchResults).forEach(([source, result]) => {
      if (result.success && result.results.length > 0) {
        allContents.push(...result.results);
        totalSuccessfulSources++;
      }
    });

    console.log(`📊 聚合完成: ${allContents.length} 个内容来自 ${totalSuccessfulSources} 个源`);

    // 发送到质量处理器
    $o('aggregated_results').send({
      contents: allContents,
      strategy: coordination?.strategy || {},
      searchResults,
      metadata: {
        totalSources: Object.keys(searchResults).length,
        successfulSources: totalSuccessfulSources,
        aggregatedAt: new Date()
      }
    });
  }

  /**
   * 生成分析数据
   */
  private generateAnalytics(): any {
    return {
      execution: {
        startTime: this.executionStats.startTime,
        endTime: this.executionStats.endTime,
        totalDuration: this.executionStats.totalDuration,
        errors: this.executionStats.errors
      },
      performance: {
        searchSources: Object.keys(this.executionStats.searchResults).length,
        totalResults: Object.values(this.executionStats.searchResults).reduce((sum, count) => sum + count, 0),
        qualityFilterRate: this.executionStats.qualityFilterResults?.filterRate || 0,
        finalContentCount: this.executionStats.finalContentCount || 0
      },
      quality: this.executionStats.qualityFilterResults || {},
      recommendations: this.generateRecommendations()
    };
  }

  /**
   * 创建最终输出聚合器 - 管道终点
   */
  private createFinalOutputAggregator(): Component {
    const finalAggregator = new Component();

    // 输入端口 - 接收Newsletter生成器的两个输出
    Component.Port.I('newsletter_input').attach(finalAggregator);
    Component.Port.I('analysis_input').attach(finalAggregator);
    
    // 默认输出端口 'out' - 这是Pipeline期望的终止端口
    // Component基类已经自动创建了'out'端口，无需手动创建

    finalAggregator._transform = ($i, $o) => {
      let newsletterData: any = null;
      let analysisData: any = null;

      // 接收Newsletter数据
      $i('newsletter_input').receive((newsletter: any) => {
        newsletterData = newsletter;
        console.log('📋 [FinalOutput] 接收到Newsletter数据:', {
          hasNewsletter: !!newsletter,
          sections: newsletter?.sections?.length || 0,
          title: newsletter?.title || 'N/A'
        });
        
        // 检查是否可以发送最终结果
        this.tryEmitFinalResult(newsletterData, analysisData, $o);
      });

      // 接收分析数据
      $i('analysis_input').receive((analysis: any) => {
        analysisData = analysis;
        console.log('📊 [FinalOutput] 接收到分析数据:', {
          hasAnalysis: !!analysis,
          hasAnalysisData: !!analysis?.analysisData,
          hasMetadata: !!analysis?.metadata
        });
        
        // 检查是否可以发送最终结果
        this.tryEmitFinalResult(newsletterData, analysisData, $o);
      });
    };

    return finalAggregator;
  }

  /**
   * 尝试发送最终结果到默认的'out'端口
   */
  private tryEmitFinalResult(newsletter: any, analysis: any, $o: any): void {
    console.log('🔍 [FinalOutput] 检查发送条件:', {
      hasNewsletter: newsletter !== null,
      hasAnalysis: analysis !== null,
      newsletterSections: newsletter?.sections?.length || 0,
      analysisData: !!analysis?.analysisData
    });

    // 更宽松的条件：只要有分析数据就可以发送，newsletter可以为空
    if (analysis !== null) {
      console.log('🎯 [FinalOutput] 聚合最终输出数据');
      
      // 构建最终输出 - 符合AgenticSearchOutput接口
      const finalOutput: AgenticSearchOutput = {
        success: true,
        newsletter: newsletter || { 
          title: '搜索完成', 
          content: '', 
          sections: [], 
          generatedAt: new Date() 
        }, // 提供默认newsletter
        contents: analysis.analysisData?.contents || [], // 添加缺失的contents字段
        searchResults: this.executionStats.searchResults,
        qualityAnalysis: analysis.analysisData?.qualityAnalysis || {},
        analytics: this.generateAnalytics(),
        metadata: {
          executionTime: this.executionStats.totalDuration || 0,
          timestamp: new Date(),
          contentSources: Object.keys(this.executionStats.searchResults),
          totalContents: Object.values(this.executionStats.searchResults).reduce((sum, count) => sum + count, 0),
          finalContentCount: analysis.analysisData?.summary?.totalContents || 0,
          qualityFilterRate: this.executionStats.qualityFilterResults?.filterRate || 0
        }
      };

      // 更新执行统计
      this.executionStats.endTime = new Date();
      this.executionStats.totalDuration = this.executionStats.endTime.getTime() - this.executionStats.startTime.getTime();
      this.executionStats.finalContentCount = finalOutput.metadata?.finalContentCount;

      console.log('✅ [FinalOutput] 管道执行完成');
      console.log(`   📊 总结果数: ${finalOutput.metadata?.totalContents}`);
      console.log(`   ✨ 高质量内容: ${finalOutput.metadata?.finalContentCount}`);
      console.log(`   ⏱️ 执行时间: ${finalOutput.metadata?.executionTime}ms`);

      // 发送到默认的'out'端口 - 这是Pipeline的终止点
      $o('out').send(finalOutput);
      
      console.log('🚀 [FinalOutput] 最终结果已发送到out端口');
    } else {
      console.log('⏳ [FinalOutput] 等待分析数据...');
    }
  }

  /**
   * 生成改进建议
   */
  private generateRecommendations(): string[] {
    const recommendations: string[] = [];

    // 基于执行统计生成建议
    const totalResults = Object.values(this.executionStats.searchResults).reduce((sum, count) => sum + count, 0);
    const errorCount = this.executionStats.errors.length;

    if (totalResults < 50) {
      recommendations.push('搜索结果数量较少，建议扩展关键词或调整搜索策略');
    }

    if (errorCount > 0) {
      recommendations.push(`发现 ${errorCount} 个错误，建议检查网络连接和 API 配置`);
    }

    if (this.executionStats.qualityFilterResults?.filterRate < 0.3) {
      recommendations.push('质量过滤率较低，建议调整质量阈值或优化搜索源');
    }

    if (recommendations.length === 0) {
      recommendations.push('执行成功，当前配置表现良好');
    }

    return recommendations;
  }

  /**
   * 重置所有Agent状态
   * 避免测试用例之间的状态污染和并发执行混乱
   */
  private resetAgentStates(): void {
    console.log('🔄 重置Agent状态以避免测试间污染...');

    // 重置执行统计
    this.executionStats = {
      startTime: new Date(),
      endTime: new Date(),
      totalDuration: 0,
      searchResults: {},
      errors: []
    };

    // 重置所有Agent的内部状态
    // 注意：Agent本身是无状态的，但某些Agent可能缓存了前一次执行的数据
    // 通过重新创建关键状态来确保隔离
    
    // 重置Twitter Agent的登录状态，避免重试次数积累
    if (this.twitterSearchAgent && (this.twitterSearchAgent as any).loginState) {
      (this.twitterSearchAgent as any).loginState.loginAttempts = 0;
      (this.twitterSearchAgent as any).loginState.isLoggedIn = false;
      console.log('🔄 Twitter Agent登录状态已重置');
    }

    // 重置GitHub Agent的状态，清理API调用缓存
    if (this.githubSearchAgent && typeof (this.githubSearchAgent as any).resetState === 'function') {
      (this.githubSearchAgent as any).resetState();
      console.log('🔄 GitHub Agent状态已重置');
    }

    // 重置其他Agent状态
    if (this.googleSearchAgent && typeof (this.googleSearchAgent as any).resetState === 'function') {
      (this.googleSearchAgent as any).resetState();
      console.log('🔄 Google Agent状态已重置');
    }

    // 强制垃圾回收，避免内存泄漏
    if (global.gc) {
      global.gc();
      console.log('🧹 已强制执行垃圾回收');
    }

    console.log('✅ Agent状态重置完成');
  }

  /**
   * 主要执行方法
   */
  async execute(input: AgenticSearchInput): Promise<AgenticSearchOutput> {
    console.log('🚀 启动 Multi-Agent Search Pipeline');
    console.log('📝 搜索关键字:', input.keywords.join(', '));

    // 重置所有Agent状态，避免测试用例间的状态污染
    this.resetAgentStates();

    this.executionStats.startTime = new Date();

    try {
      // 启动协调器
      const coordinatorInput = {
        keywords: input.keywords,
        userPreferences: input.userPreferences || {},
        searchScope: input.searchScope || ['google', 'twitter', 'github'],
        qualityRequirements: input.qualityRequirements || 'standard'
      };

      // 运行管道，从协调器开始
      const result = await this.run('coordinator.in', coordinatorInput);

      this.executionStats.endTime = new Date();
      this.executionStats.totalDuration = this.executionStats.endTime.getTime() - this.executionStats.startTime.getTime();

      console.log('✅ Pipeline 执行完成');

      return result as AgenticSearchOutput;

    } catch (error) {
      this.executionStats.endTime = new Date();
      this.executionStats.totalDuration = this.executionStats.endTime.getTime() - this.executionStats.startTime.getTime();
      this.executionStats.errors.push(error instanceof Error ? error.message : String(error));

      console.error('❌ Pipeline 执行失败:', error);

      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        contents: [], // 错误情况下返回空数组
        newsletter: { title: '', content: '', sections: [] }, // 添加默认newsletter结构
        searchResults: this.executionStats.searchResults,
        analytics: this.generateAnalytics(),
        metadata: {
          executionTime: this.executionStats.totalDuration,
          timestamp: new Date(),
          errors: this.executionStats.errors
        }
      };
    }
  }

  /**
   * 生成周刊 Markdown 格式
   */
  private generateWeeklyMarkdown(contents: SearchContent[]): string {
    const today = new Date();
    const dateStr = today.toISOString().split('T')[0]; // YYYY-MM-DD格式
    
    // 统计内容来源
    const githubCount = contents.filter(c => c.source === 'github').length;
    const twitterCount = contents.filter(c => c.source === 'twitter').length;
    const googleCount = contents.filter(c => c.source === 'google').length;
    
    // 生成总结
    const summary = `本期我们收集了 ${contents.length} 条 AI Agent 相关的精选内容，包括 ${githubCount} 个 GitHub 项目、${twitterCount} 条 Twitter 动态和 ${googleCount} 条搜索结果。涵盖了最新的技术趋势、开源项目和社区讨论，为开发者和技术从业者提供有价值的信息参考。`;
    
    // 生成 contentList - 直接使用所有内容，不做数量限制
    const contentList = contents.map(content => {
      return {
        link: content.url,
        title: content.title,
        description: this.enhanceContentDescription(content)
      };
    });
    
    // 生成完整的 frontmatter
    const frontmatter = {
      date: dateStr,
      summary,
      contentList
    };
    
    // 转换为 YAML frontmatter + markdown
    const yamlContent = this.objectToYaml(frontmatter);
    
    return `---\n${yamlContent}---\n`;
  }

  /**
   * 增强内容描述 - 信息增强而非压缩
   */
  private enhanceContentDescription(content: SearchContent): string {
    if (!content.content) return '';

    let description = '';
    
    // 根据来源类型添加专业化信息增强
    if (content.source === 'github') {
      description = this.enhanceGitHubDescription(content);
    } else if (content.source === 'twitter') {
      description = this.enhanceTwitterDescription(content);
    } else if (content.source === 'google') {
      description = this.enhanceGoogleDescription(content);
    } else {
      description = content.content;
    }
    
    // 确保中英文间的空格格式
    description = this.formatChineseEnglishSpacing(description);
    
    return description;
  }

  /**
   * 增强GitHub项目描述
   */
  private enhanceGitHubDescription(content: SearchContent): string {
    const parts = [`🐙 **GitHub 项目** - ${content.content}`];
    
    // 添加技术栈信息
    if (content.metadata?.language) {
      parts.push(`**技术栈**: ${content.metadata.language}`);
    }
    
    // 添加社区数据
    if (content.metadata?.stars) {
      const stars = content.metadata.stars.toLocaleString();
      parts.push(`**社区热度**: ⭐ ${stars} stars`);
    }
    
    // 添加更新状态
    if (content.timestamp) {
      const timeDiff = Date.now() - content.timestamp.getTime();
      const daysDiff = Math.floor(timeDiff / (1000 * 60 * 60 * 24));
      if (daysDiff <= 7) {
        parts.push(`**状态**: 🔥 最近 ${daysDiff} 天内有更新`);
      }
    }
    
    return parts.join(' | ');
  }

  /**
   * 增强Twitter动态描述
   */
  private enhanceTwitterDescription(content: SearchContent): string {
    const parts = [`🐦 **Twitter 动态** - ${content.content}`];
    
    // 添加互动数据
    if (content.metadata?.engagement) {
      const { likes, shares, comments } = content.metadata.engagement;
      if (likes > 0 || shares > 0) {
        const engagement = [];
        if (likes > 0) engagement.push(`❤️ ${likes}`);
        if (shares > 0) engagement.push(`🔄 ${shares}`);
        if (comments > 0) engagement.push(`💬 ${comments}`);
        parts.push(`**互动**: ${engagement.join(' ')}`);
      }
    }
    
    // 添加作者信息
    if (content.author && content.metadata?.userHandle) {
      parts.push(`**作者**: @${content.metadata.userHandle}`);
    }
    
    // 添加媒体类型
    if (content.metadata?.hasMedia) {
      const mediaTypes = [];
      if (content.metadata.mediaTypes?.hasImage) mediaTypes.push('图片');
      if (content.metadata.mediaTypes?.hasVideo) mediaTypes.push('视频');
      if (mediaTypes.length > 0) {
        parts.push(`**媒体**: ${mediaTypes.join('、')}`);
      }
    }
    
    return parts.join(' | ');
  }

  /**
   * 增强搜索发现描述
   */
  private enhanceGoogleDescription(content: SearchContent): string {
    const parts = [`🔍 **搜索发现** - ${content.content}`];
    
    // 添加来源网站信息
    if (content.url) {
      try {
        const domain = new URL(content.url).hostname;
        parts.push(`**来源**: ${domain}`);
      } catch (e) {
        // URL解析失败，忽略
      }
    }
    
    // 添加时效性标记
    if (content.timestamp) {
      const hoursAgo = Math.floor((Date.now() - content.timestamp.getTime()) / (1000 * 60 * 60));
      if (hoursAgo < 24) {
        parts.push(`**时效**: 🔥 ${hoursAgo} 小时内发布`);
      }
    }
    
    return parts.join(' | ');
  }

  /**
   * 确保中英文间空格格式
   */
  private formatChineseEnglishSpacing(text: string): string {
    // 中文字符后跟英文字符，添加空格
    text = text.replace(/([一-龯])([a-zA-Z0-9])/g, '$1 $2');
    // 英文字符后跟中文字符，添加空格  
    text = text.replace(/([a-zA-Z0-9])([一-龯])/g, '$1 $2');
    // 清理多余的空格
    text = text.replace(/\s+/g, ' ');
    return text.trim();
  }

  /**
   * 将对象转换为 YAML 格式
   */
  private objectToYaml(obj: any, indent = 0): string {
    const spaces = ' '.repeat(indent);
    let yaml = '';
    
    for (const [key, value] of Object.entries(obj)) {
      if (Array.isArray(value)) {
        yaml += `${spaces}${key}: [\n`;
        (value as any[]).forEach((item, index) => {
          yaml += `${spaces}  {\n`;
          for (const [itemKey, itemValue] of Object.entries(item)) {
            const escapedValue = typeof itemValue === 'string' 
              ? `"${(itemValue as string).replace(/"/g, '\\"')}"` 
              : itemValue;
            yaml += `${spaces}    ${itemKey}: ${escapedValue},\n`;
          }
          yaml += `${spaces}  }${index < value.length - 1 ? ',' : ''}\n`;
        });
        yaml += `${spaces}]\n`;
      } else if (typeof value === 'string') {
        const escapedValue = `"${value.replace(/"/g, '\\"')}"`;
        yaml += `${spaces}${key}: ${escapedValue}\n`;
      } else {
        yaml += `${spaces}${key}: ${value}\n`;
      }
    }
    
    return yaml;
  }

  /**
   * 保存周刊到文件系统
   */
  private async saveWeeklyToFile(markdownContent: string): Promise<void> {
    const fs = await import('fs');
    const path = await import('path');
    
    // 生成文件名
    const now = new Date();
    const timestamp = now.toISOString().replace(/[:.]/g, '-').slice(0, 19); // YYYY-MM-DDTHH-MM-SS
    const fileName = `weekly-${timestamp}.md`;
    
    // 确保输出目录存在
    const outputDir = path.join(process.cwd(), 'output', 'newsletters');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    
    const filePath = path.join(outputDir, fileName);
    
    // 直接写入周刊 markdown 内容
    fs.writeFileSync(filePath, markdownContent, 'utf-8');
    
    console.log(`📝 周刊已保存到: ${filePath}`);
  }

  /**
   * 清理资源
   */
  async cleanup(): Promise<void> {
    console.log('🧹 清理 Pipeline 资源...');

    try {
      // 1. 清理浏览器池
      if (this.browserPool) {
        console.log('  🔄 清理浏览器池...');
        await this.browserPool.destroy();
        console.log('  ✅ 浏览器池清理完成');
      }
      
      // 2. 终止Worker池
      if (this.workerPool) {
        console.log('  🔄 清理工作线程池...');
        await this.workerPool.destroy();
        console.log('  ✅ 工作线程池清理完成');
      }
      
      // 3. 等待异步操作完成
      console.log('  ⏳ 等待异步操作完成...');
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // 4. 清理统计数据
      this.executionStats.endTime = new Date();
      this.executionStats.totalDuration = this.executionStats.endTime.getTime() - this.executionStats.startTime.getTime();
      
      console.log('  ✅ Pipeline资源清理完成');
      
    } catch (error) {
      console.error('  ❌ 资源清理过程中出错:', error instanceof Error ? error.message : String(error));
      // 不抛出错误，避免掩盖主要的执行错误
    }
  }

  /**
   * 管道变换逻辑
   */
  _transform($i: any, $o: any): void {
    $i('search_request').receive(async (input: AgenticSearchInput) => {
      try {
        const result = await this.execute(input);
        
        // 发送最终输出
        $o('final_output').send(result);

      } catch (error) {
        console.error('[MultiAgentSearchPipeline] 执行失败:', error);
        throw error;
      }
    });
  }
}

export default MultiAgentSearchPipeline;

/**
 * 主执行函数 - 运行真实的AI agent搜索
 */
async function main() {
  console.log('🚀 启动Creator Telescope AI Agent搜索系统');
  console.log('📅 当前时间:', new Date().toLocaleString('zh-CN'));
  
  const pipeline = new MultiAgentSearchPipeline();
  
  try {
    // 从配置文件加载搜索输入
    const { default: keywordsConfig } = await import('../config/keywords.json', { 
      with: { type: 'json' } 
    });
    
    console.log('📋 搜索配置:');
    console.log('  🎯 焦点关键词:', keywordsConfig.focus);
    console.log('  ⏱️ 时间窗口:', keywordsConfig.timeWindow);
    console.log('  🔍 搜索源:', Object.keys(keywordsConfig.sources).filter(s => keywordsConfig.sources[s].enabled));
    
    // 构建搜索输入
    const searchInput = {
      keywords: keywordsConfig.focus,
      userPreferences: {
        timeWindow: keywordsConfig.timeWindow,
        preferredSources: Object.keys(keywordsConfig.sources).filter(s => keywordsConfig.sources[s].enabled),
        qualityThreshold: keywordsConfig.quality.minRelevanceScore
      },
      searchScope: ['google', 'twitter', 'github'],
      qualityRequirements: 'high'
    };
    
    console.log('\n🔍 开始执行搜索...');
    const result = await pipeline.execute(searchInput);
    
    if (result.success) {
      console.log('\n✅ 搜索完成！');
      console.log('📊 搜索结果统计:');
      console.log(`  📄 内容总数: ${result.contents?.length || 0}`);
      console.log(`  ⏱️ 执行时间: ${result.metadata?.executionTime}ms`);
      console.log(`  🎯 内容源: ${result.metadata?.contentSources?.join(', ')}`);
      console.log(`  ✨ 高质量内容: ${result.metadata?.finalContentCount}`);
      
      if (result.newsletter) {
        console.log('\n📰 新闻简报生成:');
        console.log(`  📝 标题: ${result.newsletter.title}`);
        console.log(`  📄 章节数: ${result.newsletter.sections?.length || 0}`);
      }
      
      // 输出推荐建议
      if (result.analytics?.recommendations) {
        console.log('\n💡 系统建议:');
        result.analytics.recommendations.forEach((rec: string, i: number) => {
          console.log(`  ${i + 1}. ${rec}`);
        });
      }
      
      console.log('\n🎉 Creator Telescope搜索完成！');
      
    } else {
      console.error('\n❌ 搜索失败:');
      console.error('  错误:', result.error);
      
      if (result.metadata?.errors?.length) {
        console.error('  详细错误:');
        result.metadata.errors.forEach((err: string, i: number) => {
          console.error(`    ${i + 1}. ${err}`);
        });
      }
    }
    
  } catch (error) {
    console.error('\n💥 系统错误:', error instanceof Error ? error.message : String(error));
    throw error; // 重新抛出错误以确保进程正确退出
    
  } finally {
    // 清理资源
    console.log('\n🧹 开始系统资源清理...');
    await pipeline.cleanup();
    
    // 确保所有异步操作完成
    console.log('⏳ 最终同步等待...');
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    console.log('✅ 系统清理完成，准备退出');
  }
}

// 如果直接运行此文件，执行主函数
if (import.meta.url === `file://${process.argv[1]}`) {
  main()
    .then(() => {
      console.log('🎉 程序正常完成');
      process.exit(0);
    })
    .catch(error => {
      console.error('💥 致命错误:', error);
      process.exit(1);
    });
}