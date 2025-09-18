/**
 * 内容项目的基础接口定义
 */
export interface ContentItem {
  /**
   * 内容的唯一标识符
   */
  id: string;

  /**
   * 内容标题
   */
  title: string;

  /**
   * 内容描述或摘要
   */
  description: string;

  /**
   * 内容的原始链接
   */
  url: string;

  /**
   * 内容作者
   */
  author: string;

  /**
   * 发布时间
   */
  publishedAt: Date;

  /**
   * 内容来源（twitter, arxiv, rss, search 等）
   */
  source: string;

  /**
   * 内容标签
   */
  tags: string[];

  /**
   * 缩略图或预览图片链接
   */
  imageUrl?: string;

  /**
   * 内容的统计指标
   */
  metrics?: {
    /**
     * 点赞数或类似的正面互动数
     */
    likes?: number;

    /**
     * 分享数或转发数
     */
    shares?: number;

    /**
     * 评论数
     */
    comments?: number;

    /**
     * AI 相关性评分 (0-1)
     */
    aiRelevanceScore?: number;

    /**
     * 内容质量评分 (0-1)
     */
    qualityScore?: number;

    /**
     * 新鲜度评分 (0-1)，基于发布时间计算
     */
    freshnessScore?: number;
  };

  /**
   * 额外的元数据
   */
  metadata?: {
    /**
     * 内容平台（twitter, arxiv, medium 等）
     */
    platform?: string;

    /**
     * 内容类型（article, tweet, paper, video 等）
     */
    contentType?: string;

    /**
     * 是否为推文串或系列内容
     */
    isThread?: boolean;

    /**
     * 原始推文或内容的作者用户名
     */
    accountHandle?: string;

    /**
     * 内容语言
     */
    language?: string;

    /**
     * 是否包含代码
     */
    hasCode?: boolean;

    /**
     * 是否包含图片
     */
    hasImages?: boolean;

    /**
     * 估计阅读时间（分钟）
     */
    readingTimeMinutes?: number;
  };
}

/**
 * 分析后的内容项目，包含 AI 生成的增强信息
 */
export interface AnalyzedContentItem extends ContentItem {
  /**
   * AI 生成的中文摘要
   */
  aiGeneratedSummary: string;

  /**
   * AI 提取的关键洞察
   */
  keyInsights: string[];

  /**
   * AI 评估的重要性级别
   */
  importanceLevel: 'low' | 'medium' | 'high' | 'critical';

  /**
   * AI 生成的相关话题
   */
  relatedTopics: string[];

  /**
   * AI 评估的技术难度级别
   */
  technicalLevel: 'beginner' | 'intermediate' | 'advanced' | 'expert';

  /**
   * 最终的综合评分
   */
  finalScore: number;
}

/**
 * 周刊内容列表项，符合 Creator Telescope 的 schema
 */
export interface WeeklyContentItem {
  /**
   * 缩略图链接
   */
  teaser: string;

  /**
   * 内容链接
   */
  link: string;

  /**
   * 内容描述
   */
  description: string;

  /**
   * 内容标题
   */
  title: string;
}

/**
 * 周刊数据结构，符合 Creator Telescope 的 schema
 */
export interface WeeklyNewsletter {
  /**
   * 发布日期
   */
  date: Date;

  /**
   * 周刊摘要
   */
  summary: string;

  /**
   * 内容列表
   */
  contentList: WeeklyContentItem[];
}

/**
 * 内容采集配置
 */
export interface ContentCollectionConfig {
  /**
   * 每个来源最多采集的内容数量
   */
  maxItemsPerSource: number;

  /**
   * 采集的时间范围（天数）
   */
  dayRange: number;

  /**
   * AI 相关性的最低评分阈值
   */
  minAiRelevanceScore: number;

  /**
   * 质量评分的最低阈值
   */
  minQualityScore: number;

  /**
   * 是否启用详细日志
   */
  enableVerboseLogging: boolean;
}

/**
 * 内容过滤规则
 */
export interface ContentFilter {
  /**
   * 必须包含的关键词（任意一个）
   */
  requiredKeywords?: string[];

  /**
   * 禁止包含的关键词
   */
  excludedKeywords?: string[];

  /**
   * 最小字符数
   */
  minLength?: number;

  /**
   * 最大字符数
   */
  maxLength?: number;

  /**
   * 必须包含的来源
   */
  allowedSources?: string[];

  /**
   * 禁止的来源
   */
  blockedSources?: string[];

  /**
   * 最小发布时间
   */
  minPublishTime?: Date;

  /**
   * 是否只要英文内容
   */
  englishOnly?: boolean;
}

/**
 * 内容评分权重配置
 */
export interface ScoringWeights {
  /**
   * AI 相关性权重
   */
  aiRelevance: number;

  /**
   * 内容质量权重
   */
  quality: number;

  /**
   * 新鲜度权重
   */
  freshness: number;

  /**
   * 社交互动权重
   */
  socialEngagement: number;

  /**
   * 作者权威性权重
   */
  authorAuthority: number;
}

/**
 * 数据源的统计信息
 */
export interface SourceStats {
  /**
   * 数据源名称
   */
  sourceName: string;

  /**
   * 采集到的原始内容数量
   */
  rawItemsCount: number;

  /**
   * 过滤后的内容数量
   */
  filteredItemsCount: number;

  /**
   * 采集耗时（毫秒）
   */
  collectionTimeMs: number;

  /**
   * 成功率
   */
  successRate: number;

  /**
   * 错误信息
   */
  errors: string[];
}