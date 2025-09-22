import { Agent, type AgentConfig, type Tool } from '@astack-tech/components';
import { Component } from '@astack-tech/core';
import { ModelProvider } from '@astack-tech/integrations';
import { 
  CoordinatorInput, 
  CoordinatorOutput, 
  AIEnhancedStrategy,
  GoogleSearchTask,
  TwitterSearchTask,
  GitHubSearchTask
} from '../types/multi-agent.js';

/**
 * 策略分析工具
 */
class StrategyAnalysisTool implements Tool {
  name = 'analyze_search_strategy';
  description = '分析关键字并制定搜索策略';
  parameters = {
    type: 'object',
    properties: {
      keywords: { type: 'array', items: { type: 'string' }, description: '关键字列表' },
      preferences: { type: 'object', description: '用户偏好' }
    },
    required: ['keywords']
  };

  async invoke(args: { keywords: string[], preferences?: any }) {
    // 基于关键字分析领域特征
    const { keywords, preferences = {} } = args;
    
    const isTechFocused = keywords.some(k => 
      ['api', 'framework', 'library', 'code', 'programming', 'ai', 'ml', 'agent'].includes(k.toLowerCase())
    );
    
    const isNewsFocused = keywords.some(k => 
      ['news', 'update', 'announcement', 'release', 'breaking'].includes(k.toLowerCase())
    );

    return {
      domainAnalysis: {
        isTechFocused,
        isNewsFocused,
        complexity: keywords.length > 5 ? 'high' : keywords.length > 2 ? 'medium' : 'low'
      },
      recommendedPriority: preferences.depth === 'deep' ? 'quality' : 'speed',
      suggestedExpansions: [
        ...keywords.map(k => `${k} 2024`),
        ...keywords.map(k => `${k} latest`),
        ...(isTechFocused ? keywords.map(k => `${k} framework`) : []),
        ...(isNewsFocused ? keywords.map(k => `${k} news`) : [])
      ]
    };
  }
}

/**
 * 任务分配工具
 */
class TaskDistributionTool implements Tool {
  name = 'distribute_search_tasks';
  description = '根据策略分配搜索任务给各个 Agent';
  parameters = {
    type: 'object',
    properties: {
      strategy: { type: 'object', description: 'AI 增强搜索策略' },
      keywords: { type: 'array', items: { type: 'string' }, description: '关键字列表' }
    },
    required: ['strategy', 'keywords']
  };

  async invoke(args: { strategy: any, keywords: string[] }) {
    const { strategy, keywords } = args;
    
    // 确保策略对象有必要的属性
    const searchTargets = strategy.searchTargets || ['google', 'twitter', 'github'];
    const expandedKeywords = strategy.expandedKeywords || strategy.keywordExpansions || keywords;
    const maxResults = strategy.maxResults || { google: 10, twitter: 8, github: 5 };
    const optimizedQueries = strategy.optimizedQueries || {
      google: keywords,
      twitter: keywords,
      github: keywords
    };
    
    return {
      googleTask: {
        agentType: 'google',
        enabled: searchTargets.includes('google'),
        priority: searchTargets.indexOf('google') + 1,
        keywords: expandedKeywords,
        maxResults: maxResults.google,
        timeoutMs: 60000,
        queries: optimizedQueries.google,
        siteFilters: ['github.com', 'reddit.com', 'stackoverflow.com', 'medium.com'],
        timeRange: 'past 24 hours',
        antiCrawling: {
          userAgentRotation: true,
          requestDelay: Math.random() * 2000 + 1000,
          proxyUsage: false
        }
      },
      twitterTask: {
        agentType: 'twitter',
        enabled: searchTargets.includes('twitter'),
        priority: searchTargets.indexOf('twitter') + 1,
        keywords: expandedKeywords,
        maxResults: maxResults.twitter,
        timeoutMs: 45000,
        hashtags: this.extractHashtags(expandedKeywords),
        influencers: [],
        engagement: { minLikes: 5, minRetweets: 2 },
        contentTypes: ['original', 'retweet']
      },
      githubTask: {
        agentType: 'github',
        enabled: searchTargets.includes('github'),
        priority: searchTargets.indexOf('github') + 1,
        keywords: optimizedQueries.github,
        maxResults: maxResults.github,
        timeoutMs: 30000,
        languages: this.extractLanguages(expandedKeywords),
        filters: {
          minStars: this.calculateMinStars(strategy.priority || strategy.priorityLevel || 'quality'),
          maxAge: '1y',
          hasReadme: true,
          hasLicense: false
        },
        searchScope: ['repositories', 'code']
      }
    };
  }

  private extractHashtags(keywords: string[]): string[] {
    const hashtags = new Set<string>();
    for (const keyword of keywords) {
      const words = keyword.toLowerCase().split(/\s+/);
      for (const word of words) {
        if (word.length > 2 && /^[a-z0-9]+$/.test(word)) {
          hashtags.add(word);
        }
      }
    }
    hashtags.add('ai'); hashtags.add('tech'); hashtags.add('coding');
    return Array.from(hashtags).slice(0, 10);
  }

  private extractLanguages(keywords: string[]): string[] {
    const languageMap: Record<string, string> = {
      'js': 'JavaScript', 'javascript': 'JavaScript', 'ts': 'TypeScript',
      'typescript': 'TypeScript', 'py': 'Python', 'python': 'Python'
    };
    const languages = new Set<string>();
    keywords.forEach(k => {
      const lang = languageMap[k.toLowerCase()];
      if (lang) languages.add(lang);
    });
    if (languages.size === 0) {
      languages.add('TypeScript'); languages.add('Python'); languages.add('JavaScript');
    }
    return Array.from(languages).slice(0, 5);
  }

  private calculateMinStars(priority: string): number {
    return priority === 'quality' ? 50 : priority === 'speed' ? 10 : 25;
  }
}

/**
 * Coordinator Agent
 * 
 * 使用 AStack Agent 架构，具备：
 * 1. 智能思考和决策能力
 * 2. 工具调用和多轮对话
 * 3. 策略制定和任务分配
 * 4. 错误处理和自我修正
 */
export class CoordinatorAgent extends Agent {

  constructor() {
    // 初始化 AStack Agent
    const config: AgentConfig = {
      model: new ModelProvider.Deepseek({
        apiKey: process.env.DEEPSEEK_API_KEY || '',
        model: 'deepseek-chat',
        temperature: 0.3
      }),
      tools: [
        new StrategyAnalysisTool(),
        new TaskDistributionTool()
      ],
      systemPrompt: `你是一个专业的 AI 搜索策略协调专家，具备深度思考和决策能力。

## 🎯 核心任务
你负责分析用户的搜索需求，制定最优的多源搜索策略，并协调 Google、Twitter、GitHub 三个搜索 Agent 的工作。

## 🧠 核心能力
1. **策略分析**: 深度分析关键字特征、用户偏好和搜索目标
2. **任务分配**: 基于策略为各搜索 Agent 生成精确的任务配置
3. **动态调整**: 根据实时情况调整搜索参数和优先级
4. **质量保证**: 确保所有搜索都满足 24 小时时效性要求

## 📋 工作流程
1. **分析阶段**: 使用 analyze_search_strategy 工具深度分析关键字
   - 识别领域特征（技术、新闻、社区等）
   - 评估搜索复杂度和时效性要求
   - 分析用户偏好和期望结果类型

2. **策略制定**: 基于分析结果制定 AI 增强搜索策略
   - 确定搜索目标和优先级
   - 生成扩展关键字和优化查询
   - 设置质量阈值和并发参数

3. **任务分配**: 使用 distribute_search_tasks 工具生成任务配置
   - 为每个搜索源分配具体任务
   - 设置反爬虫策略和 API 参数
   - 确定执行顺序和依赖关系

4. **输出协调**: 生成完整的协调方案
   - 包含详细的执行计划
   - 提供备选策略选项
   - 确保策略的可执行性

## 🎨 思考方式
- **系统性思维**: 从全局角度考虑搜索策略的整体效果
- **用户导向**: 始终以用户需求和期望为中心
- **效率优先**: 在保证质量的前提下追求最高效率
- **风险意识**: 考虑搜索失败的备选方案

## 📊 决策原则
1. **时效性优先**: 24 小时内的内容优先级最高
2. **质量平衡**: 在速度和质量之间找到最佳平衡点
3. **多样性保证**: 确保不同来源的内容都有合理占比
4. **用户偏好**: 根据用户的深度要求调整策略重点

## 🔧 工具使用指导
- 先使用 analyze_search_strategy 进行深度分析
- 基于分析结果制定详细策略
- 使用 distribute_search_tasks 生成任务分配
- 确保所有配置参数的合理性

## ⚠️ 注意事项
- 必须考虑各平台的 API 限制和反爬虫要求
- 关键字扩展要保持相关性，避免过度发散
- 时间窗口设置必须符合 24 小时时效性要求
- 备选策略要简单可靠，确保系统稳定性

请充分利用你的分析能力和工具，为每个搜索请求制定最优的协调策略。`,
      maxIterations: 5,
      verbose: true
    };

    super(config);

    // 添加额外的输出端口
    Component.Port.O('strategy').attach(this);
    Component.Port.O('tasks').attach(this);
  }

  /**
   * 运行协调任务 - 重写 Agent 的运行方法
   */
  async runCoordination(input: CoordinatorInput): Promise<CoordinatorOutput> {
    console.log('🧠 Coordinator Agent 开始协调工作...');
    console.log('📝 输入关键字:', input.keywords);

    // 构建用户消息，让 Agent 进行思考和工具调用
    const userMessage = `请为以下搜索请求制定完整的协调策略：

关键字: ${input.keywords.join(', ')}

用户偏好:
- 焦点: ${input.userPreferences?.focus || '综合'}
- 深度: ${input.userPreferences?.depth || 'deep'}  
- 时效性: ${input.userPreferences?.freshness || 'latest'}

请按照以下步骤思考和执行：
1. 使用 analyze_search_strategy 工具分析关键字特征和领域
2. 基于分析结果制定完整的 AI 增强搜索策略
3. 使用 distribute_search_tasks 工具生成具体的任务分配
4. 输出最终的协调方案

确保所有搜索都满足 24 小时时效性要求。`;

    try {
      // 使用 Agent 的思考和工具调用能力
      const agentOutput = await super.run(userMessage);
      
      console.log('🧠 Agent 思考完成:', agentOutput.message);
      console.log('🔧 工具调用次数:', agentOutput.toolCalls?.length || 0);

      // 从 Agent 的工具调用结果中提取策略和任务
      const { strategy, taskDistribution, coordination } = this.extractCoordinationResults(agentOutput);

      const output: CoordinatorOutput = {
        strategy,
        taskDistribution,
        coordination
      };

      console.log('✅ Coordinator Agent 协调完成');
      console.log('   - 搜索目标:', strategy.searchTargets.join(', '));
      console.log('   - 执行顺序:', coordination.executionOrder.join(' → '));

      return output;

    } catch (error) {
      console.error('❌ Coordinator Agent 协调失败:', error);
      
      // 使用备选策略
      console.log('🔄 使用备选协调策略...');
      return this.generateFallbackCoordination(input);
    }
  }

  /**
   * 从 Agent 输出中提取协调结果
   */
  private extractCoordinationResults(agentOutput: any): {
    strategy: AIEnhancedStrategy;
    taskDistribution: CoordinatorOutput['taskDistribution'];
    coordination: CoordinatorOutput['coordination'];
  } {
    // 从工具调用结果中提取策略分析
    const strategyAnalysis = agentOutput.toolCalls?.find(
      (call: any) => call.tool === 'analyze_search_strategy'
    )?.result;

    // 从工具调用结果中提取任务分配
    const taskResults = agentOutput.toolCalls?.find(
      (call: any) => call.tool === 'distribute_search_tasks'
    )?.result;

    if (!strategyAnalysis || !taskResults) {
      throw new Error('未能从 Agent 工具调用中获取完整结果');
    }

    // 构建 AI 增强策略
    const strategy: AIEnhancedStrategy = {
      searchTargets: ['google', 'twitter', 'github'],
      priority: strategyAnalysis.recommendedPriority || 'quality',
      timeWindow: '24h',
      maxConcurrency: 8,
      maxResults: {
        google: 25,
        twitter: 20,
        github: 15
      },
      qualityThreshold: 0.7,
      expandedKeywords: strategyAnalysis.suggestedExpansions || [],
      optimizedQueries: {
        google: strategyAnalysis.suggestedExpansions?.map((k: string) => 
          `${k} site:github.com OR site:reddit.com after:2024-01-01`) || [],
        twitter: strategyAnalysis.suggestedExpansions?.map((k: string) => 
          `${k} -filter:retweets lang:en`) || [],
        github: strategyAnalysis.suggestedExpansions || []
      },
      searchFocus: strategyAnalysis.domainAnalysis?.isTechFocused ? 
        ['technical implementations', 'code examples', 'best practices'] :
        ['breaking news', 'community discussions', 'expert opinions'],
      expectedContentTypes: strategyAnalysis.domainAnalysis?.isTechFocused ? 
        ['project', 'tutorial', 'discussion'] :
        ['news', 'discussion', 'research']
    };

    // 任务分配
    const taskDistribution = {
      google: taskResults.googleTask,
      twitter: taskResults.twitterTask,
      github: taskResults.githubTask
    };

    // 执行协调
    const coordination = {
      executionOrder: strategy.priority === 'speed' ? 
        ['github', 'google', 'twitter'] : ['google', 'github', 'twitter'],
      dependencyMap: {
        'google': [],
        'twitter': [],
        'github': []
      },
      timeoutMs: 75000 // 75 秒总超时
    };

    return { strategy, taskDistribution, coordination };
  }

  /**
   * 备选协调策略
   */
  private generateFallbackCoordination(input: CoordinatorInput): CoordinatorOutput {
    console.log('⚠️ 使用备选协调策略');

    const keywords = input.keywords;
    const preferences = input.userPreferences || {};
    
    // 简单分析
    const isTechFocused = keywords.some(k => 
      ['api', 'framework', 'library', 'code', 'programming', 'ai', 'ml', 'agent'].includes(k.toLowerCase())
    );

    const strategy: AIEnhancedStrategy = {
      searchTargets: ['google', 'twitter', 'github'],
      priority: preferences.depth === 'deep' ? 'quality' : 'speed',
      timeWindow: '24h',
      maxConcurrency: 8,
      maxResults: { google: 25, twitter: 20, github: 15 },
      qualityThreshold: 0.7,
      expandedKeywords: [
        ...keywords,
        ...keywords.map(k => `${k} 2024`),
        ...keywords.map(k => `${k} latest`)
      ],
      optimizedQueries: {
        google: keywords.map(k => `${k} site:github.com OR site:reddit.com after:2024-01-01`),
        twitter: keywords.map(k => `${k} -filter:retweets lang:en`),
        github: keywords
      },
      searchFocus: isTechFocused ? 
        ['technical implementations'] : ['latest news'],
      expectedContentTypes: ['news', 'tutorial', 'project', 'discussion']
    };

    const taskDistribution = {
      google: {
        agentType: 'google' as const,
        enabled: true,
        priority: 1,
        keywords: strategy.expandedKeywords,
        maxResults: 25,
        timeoutMs: 60000,
        queries: strategy.optimizedQueries.google,
        siteFilters: ['github.com', 'reddit.com'],
        timeRange: 'past 24 hours',
        antiCrawling: { userAgentRotation: true, requestDelay: 2000, proxyUsage: false }
      },
      twitter: {
        agentType: 'twitter' as const,
        enabled: true,
        priority: 2,
        keywords: strategy.expandedKeywords,
        maxResults: 20,
        timeoutMs: 45000,
        hashtags: ['ai', 'tech'],
        influencers: [],
        engagement: { minLikes: 5, minRetweets: 2 },
        contentTypes: ['original', 'retweet'] as const[]
      },
      github: {
        agentType: 'github' as const,
        enabled: true,
        priority: 3,
        keywords: strategy.expandedKeywords,
        maxResults: 15,
        timeoutMs: 30000,
        languages: ['TypeScript', 'Python'],
        filters: { minStars: 20, maxAge: '1y', hasReadme: true, hasLicense: false },
        searchScope: ['repositories', 'code'] as const[]
      }
    };

    const coordination = {
      executionOrder: ['google', 'twitter', 'github'],
      dependencyMap: { 'google': [], 'twitter': [], 'github': [] },
      timeoutMs: 75000
    };

    return { strategy, taskDistribution, coordination };
  }

  /**
   * 重写 _transform 方法以支持自定义输入输出
   */
  _transform($i: any, $o: any): void {
    // 自定义的协调输入处理（不调用 super，避免端口冲突）
    $i('in').receive(async (input: CoordinatorInput) => {
      try {
        const output = await this.runCoordination(input);
        
        // 发送策略信息
        $o('strategy').send({
          strategy: output.strategy,
          coordination: output.coordination
        });
        
        // 发送任务分配  
        $o('tasks').send(output.taskDistribution);
        
      } catch (error) {
        console.error(
          `[CoordinatorAgent] 协调处理失败: ${error instanceof Error ? error.message : String(error)}`
        );
        throw error;
      }
    });
  }
}

export default CoordinatorAgent;