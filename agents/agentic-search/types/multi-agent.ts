/**
 * Multi-Agent Agentic Search 类型定义
 * 精心设计的类型系统，支持静态 Pipeline + 动态策略路由
 */

// ==================== 基础类型 ====================

/**
 * 搜索内容项
 */
export interface SearchContent {
  id: string;
  title: string;
  content: string;
  url: string;
  source: 'google' | 'twitter' | 'github';
  timestamp: Date;
  metadata: {
    author?: string;
    platform?: string;
    tags?: string[];
    engagement?: {
      likes?: number;
      shares?: number;
      comments?: number;
      stars?: number;
    };
  };
}

/**
 * 搜索策略配置
 */
export interface SearchStrategy {
  // 目标搜索引擎
  searchTargets: Array<'google' | 'twitter' | 'github'>;
  
  // 搜索优先级
  priority: 'speed' | 'comprehensiveness' | 'quality';
  
  // 时间窗口
  timeWindow: '1h' | '6h' | '24h' | '7d';
  
  // 并发控制
  maxConcurrency: number;
  
  // 结果数量限制
  maxResults: {
    google: number;
    twitter: number;
    github: number;
  };
  
  // 质量阈值
  qualityThreshold: number;
}

/**
 * AI 增强的搜索策略
 */
export interface AIEnhancedStrategy extends SearchStrategy {
  // DeepSeek 生成的关键字扩展
  expandedKeywords: string[];
  
  // AI 推荐的搜索查询
  optimizedQueries: {
    google: string[];
    twitter: string[];
    github: string[];
  };
  
  // AI 分析的搜索重点
  searchFocus: string[];
  
  // 预期结果类型
  expectedContentTypes: Array<'news' | 'tutorial' | 'project' | 'discussion' | 'research'>;
}

// ==================== Agent 消息类型 ====================

/**
 * Coordinator Agent 输入
 */
export interface CoordinatorInput {
  keywords: string[];
  userPreferences?: {
    focus?: string;
    depth?: 'surface' | 'deep';
    freshness?: 'latest' | 'comprehensive';
  };
}

/**
 * Coordinator Agent 输出
 */
export interface CoordinatorOutput {
  strategy: AIEnhancedStrategy;
  taskDistribution: {
    google: GoogleSearchTask;
    twitter: TwitterSearchTask;
    github: GitHubSearchTask;
  };
  coordination: {
    executionOrder: string[];
    dependencyMap: Record<string, string[]>;
    timeoutMs: number;
  };
}

/**
 * 搜索任务基类
 */
export interface BaseSearchTask {
  agentType: string;
  enabled: boolean;
  priority: number;
  keywords: string[];
  maxResults: number;
  timeoutMs: number;
}

/**
 * Google 搜索任务
 */
export interface GoogleSearchTask extends BaseSearchTask {
  agentType: 'google';
  queries: string[];
  siteFilters: string[];
  timeRange: string;
  antiCrawling: {
    userAgentRotation: boolean;
    requestDelay: number;
    proxyUsage: boolean;
  };
}

/**
 * Twitter 搜索任务
 */
export interface TwitterSearchTask extends BaseSearchTask {
  agentType: 'twitter';
  hashtags: string[];
  influencers: string[];
  engagement: {
    minLikes: number;
    minRetweets: number;
  };
  contentTypes: Array<'original' | 'retweet' | 'reply'>;
}

/**
 * GitHub 搜索任务
 */
export interface GitHubSearchTask extends BaseSearchTask {
  agentType: 'github';
  languages: string[];
  filters: {
    minStars: number;
    maxAge: string;
    hasReadme: boolean;
    hasLicense: boolean;
  };
  searchScope: Array<'repositories' | 'code' | 'issues' | 'discussions'>;
}

// ==================== Agent 结果类型 ====================

/**
 * 搜索结果基类
 */
export interface BaseSearchResult {
  agentType: string;
  executionTime: number;
  success: boolean;
  error?: string;
  metadata: {
    totalFound: number;
    processedCount: number;
    filteredCount: number;
  };
}

/**
 * Google 搜索结果
 */
export interface GoogleSearchResult extends BaseSearchResult {
  agentType: 'google';
  contents: SearchContent[];
  searchMetrics: {
    queriesExecuted: number;
    pagesScraped: number;
    antiCrawlingBypass: boolean;
  };
}

/**
 * Twitter 搜索结果
 */
export interface TwitterSearchResult extends BaseSearchResult {
  agentType: 'twitter';
  contents: SearchContent[];
  socialMetrics: {
    totalEngagement: number;
    influencerPosts: number;
    trendingHashtags: string[];
  };
}

/**
 * GitHub 搜索结果
 */
export interface GitHubSearchResult extends BaseSearchResult {
  agentType: 'github';
  contents: SearchContent[];
  developmentMetrics: {
    totalStars: number;
    totalProjects: number;
    languageDistribution: Record<string, number>;
  };
}

// ==================== Quality Agent 类型 ====================

/**
 * 内容质量评估
 */
export interface ContentQualityAssessment {
  contentId: string;
  scores: {
    relevance: number;      // 相关性 0-1
    credibility: number;    // 可信度 0-1
    freshness: number;      // 时效性 0-1
    uniqueness: number;     // 独特性 0-1
    engagement: number;     // 互动性 0-1
  };
  overallScore: number;
  aiAnalysis: {
    summary: string;
    keyInsights: string[];
    recommendationLevel: 'must-include' | 'recommended' | 'optional' | 'exclude';
    reasoning: string;
  };
}

/**
 * Quality Agent 输入
 */
export interface QualityFilterInput {
  googleResults: GoogleSearchResult;
  twitterResults: TwitterSearchResult;
  githubResults: GitHubSearchResult;
  strategy: AIEnhancedStrategy;
}

/**
 * Quality Agent 输出
 */
export interface QualityFilterOutput {
  filteredContents: SearchContent[];
  qualityAssessments: ContentQualityAssessment[];
  filteringStats: {
    totalInputs: number;
    passedFilter: number;
    rejectedReasons: Record<string, number>;
  };
  recommendations: {
    searchGaps: string[];
    qualityImprovements: string[];
    nextActions: string[];
  };
}

// ==================== Newsletter Agent 类型 ====================

/**
 * Newsletter 章节
 */
export interface NewsletterSection {
  id: string;
  title: string;
  description: string;
  contents: SearchContent[];
  priority: number;
  aiGenerated: {
    summary: string;
    keyHighlights: string[];
    calloutBoxes: Array<{
      type: 'tip' | 'warning' | 'insight' | 'trending';
      content: string;
    }>;
  };
}

/**
 * Newsletter Agent 输入
 */
export interface NewsletterGeneratorInput {
  filteredContents: SearchContent[];
  qualityAssessments: ContentQualityAssessment[];
  strategy: AIEnhancedStrategy;
  userPreferences: CoordinatorInput['userPreferences'];
}

/**
 * Newsletter Agent 输出
 */
export interface NewsletterGeneratorOutput {
  newsletter: {
    title: string;
    subtitle: string;
    publishDate: Date;
    sections: NewsletterSection[];
    metadata: {
      totalContents: number;
      estimatedReadTime: number;
      contentSources: Record<string, number>;
      topKeywords: string[];
    };
  };
  markdownContent: string;
  analyticsData: {
    contentDistribution: Record<string, number>;
    qualityMetrics: {
      averageScore: number;
      scoreDistribution: Record<string, number>;
    };
    generationMetrics: {
      processingTime: number;
      aiTokensUsed: number;
      sectionsGenerated: number;
    };
  };
}

// ==================== Pipeline 流程类型 ====================

/**
 * 完整的 Agentic Search 输出
 */
export interface AgenticSearchOutput {
  // 执行状态
  success: boolean;
  error?: string;
  
  // 核心内容
  weeklyMarkdown?: string; // 直接的周刊 markdown 内容
  contents: SearchContent[]; // 过滤后的高质量内容数组
  
  // 搜索结果和分析数据
  searchResults?: Record<string, number>;
  qualityAnalysis?: any;
  analytics?: any;
  metadata?: {
    executionTime: number;
    timestamp: Date;
    contentSources: string[];
    totalContents: number;
    finalContentCount: number;
    qualityFilterRate: number;
    errors?: string[];
  };
}

// ==================== 错误处理类型 ====================

/**
 * Agent 执行错误
 */
export interface AgentExecutionError {
  agentType: string;
  errorCode: string;
  message: string;
  timestamp: Date;
  context: Record<string, unknown>;
  recoverable: boolean;
  fallbackStrategy?: string;
}

/**
 * Pipeline 执行状态
 */
export interface PipelineExecutionStatus {
  status: 'initializing' | 'running' | 'completed' | 'failed' | 'partially-failed';
  currentStage: string;
  progress: number; // 0-100
  agentStatuses: Record<string, 'pending' | 'running' | 'completed' | 'failed'>;
  errors: AgentExecutionError[];
  startTime: Date;
  estimatedCompletionTime?: Date;
}

// ==================== 配置类型 ====================

/**
 * 环境配置
 */
export interface EnvironmentConfig {
  // API Keys
  deepseekApiKey: string;
  githubToken: string;
  
  // 性能配置
  maxConcurrentBrowsers: number;
  maxConcurrentApiCalls: number;
  requestTimeout: number;
  
  // 质量配置
  minContentQuality: number;
  maxContentAge: string;
  
  // 调试配置
  enableDebugLogs: boolean;
  enablePerformanceMonitoring: boolean;
  saveIntermediateResults: boolean;
}

/**
 * 关键字驱动配置
 */
export interface KeywordDrivenConfig {
  // 核心关键字
  keywords: string[];
  
  // 搜索偏好
  searchPreference: {
    speed: number;      // 0-10 速度偏好
    depth: number;      // 0-10 深度偏好
    freshness: number;  // 0-10 时效性偏好
    quality: number;    // 0-10 质量偏好
  };
  
  // 内容类型偏好
  contentTypeWeights: {
    news: number;
    tutorials: number;
    projects: number;
    discussions: number;
    research: number;
  };
  
  // 输出定制
  outputFormat: {
    includeMetrics: boolean;
    includeDebugInfo: boolean;
    sectionCount: number;
    maxItemsPerSection: number;
  };
}