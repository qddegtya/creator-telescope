import { Component } from '@astack-tech/core';
import { ModelProvider } from '@astack-tech/integrations';
import { 
  KeywordDrivenConfig, 
  EnvironmentConfig, 
  SearchStrategy, 
  AIEnhancedStrategy 
} from '../types/multi-agent.js';

/**
 * 动态配置管理器输入
 */
export interface DynamicConfigInput {
  /**
   * 核心关键字数组
   */
  keywords: string[];
  
  /**
   * 用户偏好设置
   */
  userPreferences?: {
    focus?: string;
    depth?: 'surface' | 'deep';
    freshness?: 'latest' | 'comprehensive';
    speed?: number;        // 0-10 速度偏好
    quality?: number;      // 0-10 质量偏好
  };
  
  /**
   * 强制重新计算策略
   */
  forceRecalculate?: boolean;
}

/**
 * 动态配置管理器输出
 */
export interface DynamicConfigOutput {
  /**
   * 完整的关键字驱动配置
   */
  config: KeywordDrivenConfig;
  
  /**
   * AI 增强的搜索策略
   */
  strategy: AIEnhancedStrategy;
  
  /**
   * 环境配置
   */
  environment: EnvironmentConfig;
  
  /**
   * 配置生成元数据
   */
  metadata: {
    generatedAt: Date;
    tokensUsed: number;
    strategyConfidence: number;
    estimatedExecutionTime: number;
  };
}

/**
 * 动态配置管理器组件
 * 
 * 核心功能：
 * 1. 接收关键字和用户偏好
 * 2. 使用 DeepSeek 生成完全动态的搜索策略
 * 3. 根据关键字智能调整所有配置参数
 * 4. 无需任何静态配置文件
 */
export class DynamicConfigManager extends Component {
  private deepseek: ModelProvider.Deepseek;
  private cachedConfigs: Map<string, DynamicConfigOutput>;
  private environment: EnvironmentConfig;

  constructor() {
    super({});

    // 初始化环境配置
    this.environment = this.initializeEnvironment();

    // 初始化 DeepSeek 用于配置生成
    this.deepseek = new ModelProvider.Deepseek({
      apiKey: this.environment.deepseekApiKey,
      model: 'deepseek-chat',
      temperature: 0.2, // 配置生成需要更稳定的输出
      systemPrompt: `你是一个专业的 AI 搜索策略配置专家。

你的任务是根据用户提供的关键字，动态生成完整的搜索配置和策略。

核心要求：
1. 完全基于关键字动态生成配置，不依赖任何静态设置
2. 根据关键字语义智能调整搜索优先级和权重
3. 自动优化搜索查询以获得最佳效果
4. 确保 24 小时时效性要求
5. 平衡速度、质量、深度三个维度

输出格式必须是严格的 JSON，包含：
- keywordDrivenConfig: 完整的关键字驱动配置
- aiEnhancedStrategy: AI 增强的搜索策略
- strategyMetadata: 策略生成元数据

分析关键字的语义、领域特征、时效性要求，生成最优配置。`
    });

    // 缓存系统，避免重复计算相同关键字的配置
    this.cachedConfigs = new Map();

    // 配置端口
    Component.Port.I('input').attach(this);
    Component.Port.O('output').attach(this);
  }

  /**
   * 初始化环境配置
   */
  private initializeEnvironment(): EnvironmentConfig {
    return {
      // API Keys
      deepseekApiKey: process.env.DEEPSEEK_API_KEY || '',
      githubToken: process.env.GITHUB_TOKEN || '',
      
      // 性能配置
      maxConcurrentBrowsers: parseInt(process.env.MAX_CONCURRENT_BROWSERS || '5'),
      maxConcurrentApiCalls: parseInt(process.env.MAX_CONCURRENT_API_CALLS || '10'),
      requestTimeout: parseInt(process.env.REQUEST_TIMEOUT || '30000'),
      
      // 质量配置
      minContentQuality: parseFloat(process.env.MIN_CONTENT_QUALITY || '0.6'),
      maxContentAge: process.env.MAX_CONTENT_AGE || '24h',
      
      // 调试配置
      enableDebugLogs: process.env.ENABLE_DEBUG_LOGS === 'true',
      enablePerformanceMonitoring: process.env.ENABLE_PERFORMANCE_MONITORING === 'true',
      saveIntermediateResults: process.env.SAVE_INTERMEDIATE_RESULTS === 'true'
    };
  }

  /**
   * 生成配置缓存键
   */
  private generateCacheKey(input: DynamicConfigInput): string {
    const keywordsKey = input.keywords.sort().join('|');
    const prefsKey = input.userPreferences ? 
      JSON.stringify(input.userPreferences) : 'default';
    return `${keywordsKey}::${prefsKey}`;
  }

  /**
   * 使用 DeepSeek 生成动态配置
   */
  private async generateDynamicConfig(input: DynamicConfigInput): Promise<{
    keywordDrivenConfig: KeywordDrivenConfig;
    aiEnhancedStrategy: AIEnhancedStrategy;
    strategyMetadata: any;
  }> {
    const preferences = input.userPreferences || {};
    
    const prompt = `分析以下关键字并生成完整的动态搜索配置：

关键字: ${input.keywords.join(', ')}

用户偏好:
- 焦点: ${preferences.focus || '综合'}
- 深度: ${preferences.depth || 'deep'}
- 时效性: ${preferences.freshness || 'latest'}
- 速度偏好: ${preferences.speed || 7}/10
- 质量偏好: ${preferences.quality || 8}/10

要求生成：

1. KeywordDrivenConfig - 基于关键字的完整配置
2. AIEnhancedStrategy - AI 增强的搜索策略
3. StrategyMetadata - 策略元数据

关键约束：
- 必须确保 24 小时时效性
- 根据关键字语义调整各源的权重
- 优化搜索查询以获得最佳效果
- 智能设置质量阈值和并发参数

输出 JSON 格式:
{
  "keywordDrivenConfig": {
    "keywords": ["关键字数组"],
    "searchPreference": {
      "speed": 7,
      "depth": 8,
      "freshness": 9,
      "quality": 8
    },
    "contentTypeWeights": {
      "news": 0.3,
      "tutorials": 0.2,
      "projects": 0.3,
      "discussions": 0.1,
      "research": 0.1
    },
    "outputFormat": {
      "includeMetrics": true,
      "includeDebugInfo": false,
      "sectionCount": 5,
      "maxItemsPerSection": 8
    }
  },
  "aiEnhancedStrategy": {
    "searchTargets": ["google", "twitter", "github"],
    "priority": "quality",
    "timeWindow": "24h",
    "maxConcurrency": 8,
    "maxResults": {
      "google": 20,
      "twitter": 15,
      "github": 10
    },
    "qualityThreshold": 0.7,
    "expandedKeywords": ["扩展关键字"],
    "optimizedQueries": {
      "google": ["优化查询"],
      "twitter": ["Twitter 查询"],
      "github": ["GitHub 查询"]
    },
    "searchFocus": ["搜索重点"],
    "expectedContentTypes": ["预期内容类型"]
  },
  "strategyMetadata": {
    "confidence": 0.85,
    "estimatedExecutionTime": 45000,
    "keywordComplexity": "medium",
    "domainSpecificity": "high"
  }
}`;

    try {
      const response = await this.deepseek.generateCompletion(prompt);
      return JSON.parse(response);
    } catch (error) {
      console.warn('⚠️ DeepSeek 配置生成失败，使用智能备选策略:', error);
      return this.generateFallbackConfig(input);
    }
  }

  /**
   * 智能备选配置生成
   */
  private generateFallbackConfig(input: DynamicConfigInput): {
    keywordDrivenConfig: KeywordDrivenConfig;
    aiEnhancedStrategy: AIEnhancedStrategy;
    strategyMetadata: any;
  } {
    const preferences = input.userPreferences || {};
    
    // 基于关键字智能推测配置
    const isTechFocused = input.keywords.some(k => 
      ['api', 'framework', 'library', 'code', 'github', 'programming'].includes(k.toLowerCase())
    );
    
    const isNewsFocused = input.keywords.some(k => 
      ['news', 'update', 'announcement', 'release'].includes(k.toLowerCase())
    );

    const keywordDrivenConfig: KeywordDrivenConfig = {
      keywords: input.keywords,
      searchPreference: {
        speed: preferences.speed || (isTechFocused ? 6 : 8),
        depth: preferences.quality || (isTechFocused ? 9 : 7),
        freshness: isNewsFocused ? 10 : 8,
        quality: preferences.quality || 8
      },
      contentTypeWeights: {
        news: isNewsFocused ? 0.4 : 0.2,
        tutorials: isTechFocused ? 0.3 : 0.15,
        projects: isTechFocused ? 0.4 : 0.2,
        discussions: 0.15,
        research: isTechFocused ? 0.2 : 0.1
      },
      outputFormat: {
        includeMetrics: true,
        includeDebugInfo: this.environment.enableDebugLogs,
        sectionCount: 5,
        maxItemsPerSection: 8
      }
    };

    const aiEnhancedStrategy: AIEnhancedStrategy = {
      searchTargets: ['google', 'twitter', 'github'],
      priority: preferences.quality && preferences.quality > 7 ? 'quality' : 'speed',
      timeWindow: '24h',
      maxConcurrency: this.environment.maxConcurrentApiCalls,
      maxResults: {
        google: 20,
        twitter: 15,
        github: isTechFocused ? 15 : 10
      },
      qualityThreshold: this.environment.minContentQuality,
      expandedKeywords: [
        ...input.keywords,
        ...input.keywords.map(k => `${k} 2024`),
        ...input.keywords.map(k => `${k} latest`),
        ...(isTechFocused ? input.keywords.map(k => `${k} framework`) : []),
        ...(isNewsFocused ? input.keywords.map(k => `${k} news`) : [])
      ],
      optimizedQueries: {
        google: input.keywords.map(k => `${k} site:github.com OR site:reddit.com after:2024-01-01`),
        twitter: input.keywords.map(k => `${k} -filter:retweets lang:en`),
        github: input.keywords
      },
      searchFocus: isTechFocused ? 
        ['code quality', 'best practices', 'latest trends'] :
        ['breaking news', 'community discussions', 'expert opinions'],
      expectedContentTypes: isTechFocused ? 
        ['project', 'tutorial', 'discussion'] :
        ['news', 'discussion', 'research']
    };

    return {
      keywordDrivenConfig,
      aiEnhancedStrategy,
      strategyMetadata: {
        confidence: 0.75,
        estimatedExecutionTime: 40000,
        keywordComplexity: input.keywords.length > 3 ? 'high' : 'medium',
        domainSpecificity: isTechFocused || isNewsFocused ? 'high' : 'medium'
      }
    };
  }

  /**
   * 独立运行组件
   */
  async run(input: DynamicConfigInput): Promise<DynamicConfigOutput> {
    console.log('⚙️ 动态配置管理器开始工作...');
    console.log('📝 输入关键字:', input.keywords);
    
    // 检查缓存
    const cacheKey = this.generateCacheKey(input);
    if (!input.forceRecalculate && this.cachedConfigs.has(cacheKey)) {
      console.log('📦 使用缓存配置');
      return this.cachedConfigs.get(cacheKey)!;
    }

    try {
      // 使用 DeepSeek 生成动态配置
      const configData = await this.generateDynamicConfig(input);
      
      // 构建完整输出
      const output: DynamicConfigOutput = {
        config: configData.keywordDrivenConfig,
        strategy: configData.aiEnhancedStrategy,
        environment: this.environment,
        metadata: {
          generatedAt: new Date(),
          tokensUsed: 0, // TODO: 实际计算 token 使用量
          strategyConfidence: configData.strategyMetadata.confidence,
          estimatedExecutionTime: configData.strategyMetadata.estimatedExecutionTime
        }
      };

      // 缓存结果
      this.cachedConfigs.set(cacheKey, output);
      
      console.log('✅ 动态配置生成完成:');
      console.log('   - 扩展关键字数量:', output.strategy.expandedKeywords.length);
      console.log('   - 搜索优先级:', output.strategy.priority);
      console.log('   - 策略置信度:', output.metadata.strategyConfidence);
      
      return output;
      
    } catch (error) {
      console.error('❌ 动态配置生成失败:', error);
      throw new Error(`配置生成失败: ${error instanceof Error ? error.message : '未知错误'}`);
    }
  }

  /**
   * 在流水线中运行组件
   */
  _transform($i: any, $o: any): void {
    $i('input').receive(async (input: DynamicConfigInput) => {
      try {
        const output = await this.run(input);
        $o('output').send(output);
      } catch (error) {
        console.error(
          `[DynamicConfigManager] 处理失败: ${error instanceof Error ? error.message : String(error)}`
        );
        // 发送错误信号而不是静默失败
        throw error;
      }
    });
  }

  /**
   * 清理缓存
   */
  clearCache(): void {
    this.cachedConfigs.clear();
    console.log('🧹 配置缓存已清理');
  }

  /**
   * 获取缓存统计
   */
  getCacheStats(): {
    size: number;
    keys: string[];
  } {
    return {
      size: this.cachedConfigs.size,
      keys: Array.from(this.cachedConfigs.keys())
    };
  }
}

export default DynamicConfigManager;