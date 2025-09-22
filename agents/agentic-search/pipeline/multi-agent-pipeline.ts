import { Pipeline, Component } from '@astack-tech/core';
import { ModelProvider } from '@astack-tech/integrations';

import { CoordinatorAgent } from '../agents/coordinator-agent.js';
import { GoogleSearchAgent } from '../agents/google-search-agent.js';
import { TwitterSearchAgent } from '../agents/twitter-search-agent.js';
import { GitHubSearchAgent } from '../agents/github-search-agent.js';
import { QualityFilterAgent } from '../agents/quality-filter-agent.js';
import { NewsletterGeneratorAgent } from '../agents/newsletter-generator-agent.js';

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
  NewsletterGeneratorOutput
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
  private newsletterGeneratorAgent: NewsletterGeneratorAgent;

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

    // 初始化浏览器池
    this.browserPool = new BrowserPool({
      maxBrowsers: 8,
      headless: true,
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
    this.googleSearchAgent = new GoogleSearchAgent();
    this.twitterSearchAgent = new TwitterSearchAgent(this.browserPool);
    this.githubSearchAgent = new GitHubSearchAgent();
    this.qualityFilterAgent = new QualityFilterAgent();
    this.newsletterGeneratorAgent = new NewsletterGeneratorAgent();

    // 将 Agent 添加到管道
    this.addComponent('coordinator', this.coordinatorAgent);
    this.addComponent('google_search', this.googleSearchAgent);
    this.addComponent('twitter_search', this.twitterSearchAgent);
    this.addComponent('github_search', this.githubSearchAgent);
    this.addComponent('quality_filter', this.qualityFilterAgent);
    this.addComponent('newsletter_generator', this.newsletterGeneratorAgent);

    console.log('🤖 所有 Agent 组件已添加到管道');
  }

  /**
   * 配置管道连接和数据流
   */
  private configurePipeline(): void {
    // 添加所有 Agent 组件到管道
    this.addComponent('coordinator', this.coordinatorAgent);
    this.addComponent('google_search', this.googleSearchAgent);
    this.addComponent('twitter_search', this.twitterSearchAgent);
    this.addComponent('github_search', this.githubSearchAgent);
    this.addComponent('quality_filter', this.qualityFilterAgent);
    this.addComponent('newsletter_generator', this.newsletterGeneratorAgent);

    // 添加数据聚合组件
    const searchAggregator = this.createSearchAggregator();
    const qualityProcessor = this.createQualityProcessor(this.qualityFilterAgent, this.executionStats);

    this.addComponent('search_aggregator', searchAggregator);
    this.addComponent('quality_processor', qualityProcessor);

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
    this.connect('search_aggregator.google_task', 'google_search.in');
    this.connect('search_aggregator.twitter_task', 'twitter_search.task');
    this.connect('search_aggregator.github_task', 'github_search.in');
    
    // 阶段 3: 各搜索引擎结果回到聚合器
    this.connect('google_search.out', 'search_aggregator.google_results');
    this.connect('twitter_search.result', 'search_aggregator.twitter_results');
    this.connect('github_search.out', 'search_aggregator.github_results');
    
    // 阶段 4: 聚合结果 -> 质量过滤
    this.connect('search_aggregator.aggregated_results', 'quality_processor.input');
    
    // 阶段 5: 过滤结果 -> 新闻稿生成 (管道终点)
    this.connect('quality_processor.filtered_results', 'newsletter_generator.in');
    
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
   * 创建内容格式化器
   */
  private createContentFormatter(): Component {
    const formatter = new Component();

    Component.Port.I('input').attach(formatter);
    Component.Port.I('newsletter_data').attach(formatter);
    Component.Port.O('formatted_content').attach(formatter);
    Component.Port.O('final_output').attach(formatter);

    let filteredData: any = null;
    let newsletterData: any = null;

    formatter._transform = ($i, $o) => {
      $i('input').receive((data: any) => {
        filteredData = data;
        
        // 准备新闻简报生成输入
        const newsletterInput = {
          contents: data.filteredContents,
          focusKeywords: data.strategy?.searchTargets || ['AI', 'technology'],
          template: {
            title: 'AI 技术日报',
            sections: ['summary', 'highlights', 'trends', 'technical', 'community', 'projects', 'conclusion'],
            format: 'markdown'
          }
        };

        $o('formatted_content').send(newsletterInput);
      });

      $i('newsletter_data').receive((newsletter: NewsletterGeneratorOutput) => {
        newsletterData = newsletter;

        // 生成最终输出
        const finalOutput: AgenticSearchOutput = {
          success: true,
          newsletter: newsletter.newsletter,
          searchResults: this.executionStats.searchResults,
          qualityAnalysis: filteredData?.qualityAnalysis || {},
          analytics: this.generateAnalytics(),
          metadata: {
            executionTime: this.executionStats.totalDuration || 0,
            timestamp: new Date(),
            contentSources: Object.keys(this.executionStats.searchResults),
            totalContents: Object.values(this.executionStats.searchResults).reduce((sum, count) => sum + count, 0),
            finalContentCount: filteredData?.filteredContents?.length || 0,
            qualityFilterRate: this.executionStats.qualityFilterResults?.filterRate || 0
          }
        };

        this.executionStats.finalContentCount = finalOutput.metadata?.finalContentCount;

        console.log('🎯 管道执行完成');
        console.log(`   📊 总结果数: ${finalOutput.metadata?.totalContents}`);
        console.log(`   ✨ 高质量内容: ${finalOutput.metadata?.finalContentCount}`);
        console.log(`   ⏱️ 执行时间: ${finalOutput.metadata?.executionTime}ms`);

        $o('final_output').send(finalOutput);
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
   * 主要执行方法
   */
  async execute(input: AgenticSearchInput): Promise<AgenticSearchOutput> {
    console.log('🚀 启动 Multi-Agent Search Pipeline');
    console.log('📝 搜索关键字:', input.keywords.join(', '));

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
   * 清理资源
   */
  async cleanup(): Promise<void> {
    console.log('🧹 清理 Pipeline 资源');

    try {
      // 关闭浏览器池
      if (this.browserPool) {
        await this.browserPool.destroy();
      }
      
      // 终止Worker池
      if (this.workerPool) {
        await this.workerPool.destroy();
      }
      
      console.log('✅ 资源清理完成');
    } catch (error) {
      console.error('❌ 资源清理失败:', error);
    }
  }

  /**
   * 管道变换逻辑
   */
  _transform($i: any, $o: any): void {
    $i('search_request').receive(async (input: AgenticSearchInput) => {
      try {
        const result = await this.execute(input);
        
        // 发送不同类型的输出
        $o('search_output').send(result);
        
        if (result.newsletter) {
          $o('newsletter').send(result.newsletter);
        }
        
        if (result.analytics) {
          $o('analytics').send(result.analytics);
        }

      } catch (error) {
        console.error('[MultiAgentSearchPipeline] 执行失败:', error);
        throw error;
      }
    });
  }
}

export default MultiAgentSearchPipeline;