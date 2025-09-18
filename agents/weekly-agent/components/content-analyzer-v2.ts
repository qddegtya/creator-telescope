import { Component } from '@astack-tech/core';
import { ModelProvider } from '@astack-tech/integrations';
import type { ContentItem, AnalyzedContentItem } from '../types/content.js';

/**
 * 内容分析器配置接口
 */
interface AnalyzerConfig {
  apiKey?: string;
  model?: string;
  batchSize?: number;
  maxRetries?: number;
  useLocalRules?: boolean;
}

/**
 * 内容分析器组件 V2
 * 
 * 接收合并后的内容，使用 DeepSeek API 进行智能分析，输出分析结果
 */
export class ContentAnalyzerV2Component extends Component {
  private deepseek: ModelProvider.Deepseek | null = null;
  private config: AnalyzerConfig;

  constructor(config?: AnalyzerConfig) {
    super({});

    this.config = {
      apiKey: config?.apiKey || process.env.DEEPSEEK_API_KEY || '',
      model: config?.model || 'deepseek-chat',
      batchSize: config?.batchSize || 3,
      maxRetries: config?.maxRetries || 2,
      useLocalRules: config?.useLocalRules || false
    };

    // 初始化 DeepSeek 组件
    if (this.config.apiKey && !this.config.useLocalRules) {
      this.deepseek = new ModelProvider.Deepseek({
        apiKey: this.config.apiKey,
        model: this.config.model,
        temperature: 0.3,
        systemPrompt: `你是一个专业的 AI 技术内容分析师，专门为技术周刊筛选和分析前沿 AI 内容。

你的任务是分析每条内容，并输出结构化的分析结果。

评估标准：
- Critical: 重大突破、行业变革性技术、顶级公司重要发布
- High: 重要技术进展、实用工具发布、深度技术洞察  
- Medium: 有价值的技术更新、教程、经验分享
- Low: 一般性资讯、基础教程、重复内容

请为每条内容提供：
1. 中文摘要 (100-200字)
2. 关键洞察 (1-3个)
3. 重要性级别 (critical/high/medium/low)
4. 相关话题 (1-4个)
5. 技术难度 (expert/advanced/intermediate/beginner)

输出格式为 JSON。`
      });
    }

    // 定义输入和输出端口
    Component.Port.I('mergedContent').attach(this);     // 接收合并后的内容
    Component.Port.O('analyzedContent').attach(this);   // 输出分析结果
  }

  /**
   * 组件转换方法
   */
  _transform($i: any, $o: any) {
    $i('mergedContent').receive(async (contentItems: ContentItem[]) => {
      console.log(`🧠 开始分析 ${contentItems.length} 条合并内容...`);
      
      try {
        const analyzedItems = await this.analyzeContent(contentItems);
        $o('analyzedContent').send(analyzedItems);
        console.log(`✅ 内容分析完成，${analyzedItems.length} 条通过筛选`);
      } catch (error) {
        console.error('❌ 内容分析失败:', error);
        $o('analyzedContent').send([]);
      }
    });
  }

  /**
   * 分析内容
   */
  private async analyzeContent(contentItems: ContentItem[]): Promise<AnalyzedContentItem[]> {
    const analyzedItems: AnalyzedContentItem[] = [];
    
    // 首先进行质量预筛选
    const qualifiedItems = contentItems.filter(item => 
      (item.metrics?.aiRelevanceScore || 0) > 0.25 && 
      item.title.length > 10
    );
    
    console.log(`🔍 质量预筛选: ${contentItems.length} → ${qualifiedItems.length} 条`);

    // 检查是否使用 DeepSeek API
    if (!this.deepseek || this.config.useLocalRules) {
      console.warn('⚠️  使用本地规则分析');
      return this.analyzeWithLocalRules(qualifiedItems);
    }

    // 批次处理以避免 API 限制
    const batches = this.splitIntoBatches(qualifiedItems, this.config.batchSize || 3);
    
    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      console.log(`🧠 DeepSeek 分析批次 ${i + 1}/${batches.length} (${batch.length} 条)...`);
      
      try {
        const batchResults = await this.analyzeWithDeepSeek(batch);
        analyzedItems.push(...batchResults.filter(item => item !== null) as AnalyzedContentItem[]);
        
        // API 调用间隔
        if (i < batches.length - 1) {
          await this.delay(1500); // 稍长间隔避免限制
        }
      } catch (error) {
        console.warn(`⚠️  批次 ${i + 1} DeepSeek 分析失败，使用本地规则处理:`, error);
        const fallbackResults = await this.analyzeWithLocalRules(batch);
        analyzedItems.push(...fallbackResults);
      }
    }

    // 最终排序和过滤
    const finalItems = this.rankAndFilter(analyzedItems);
    
    console.log(`📊 分析统计:`);
    console.log(`   - 原始内容: ${contentItems.length} 条`);
    console.log(`   - 质量筛选: ${qualifiedItems.length} 条`);
    console.log(`   - 分析完成: ${analyzedItems.length} 条`);
    console.log(`   - 最终输出: ${finalItems.length} 条`);

    return finalItems;
  }

  /**
   * 使用 DeepSeek API 分析批次内容
   */
  private async analyzeWithDeepSeek(items: ContentItem[]): Promise<(AnalyzedContentItem | null)[]> {
    const results: (AnalyzedContentItem | null)[] = [];
    
    for (const item of items) {
      try {
        const analyzed = await this.analyzeItemWithDeepSeek(item);
        results.push(analyzed);
      } catch (error) {
        console.warn(`⚠️  DeepSeek 分析失败: ${item.title.substring(0, 30)}...`, error);
        // 失败时使用本地规则作为备选
        const fallback = await this.analyzeSingleItemLocal(item);
        results.push(fallback);
      }
    }
    
    return results;
  }

  /**
   * 使用 DeepSeek API 分析单条内容
   */
  private async analyzeItemWithDeepSeek(item: ContentItem): Promise<AnalyzedContentItem | null> {
    if (!this.deepseek) return null;

    const prompt = `请分析以下 AI 相关内容：

标题: ${item.title}
描述: ${item.description}
来源: ${item.source}
作者: ${item.author}
发布时间: ${item.publishedAt}

请输出 JSON 格式的分析结果，包含以下字段：
{
  "aiGeneratedSummary": "中文摘要 (100-200字)",
  "keyInsights": ["洞察1", "洞察2", "洞察3"],
  "importanceLevel": "critical|high|medium|low",
  "relatedTopics": ["话题1", "话题2", "话题3", "话题4"],
  "technicalLevel": "expert|advanced|intermediate|beginner",
  "shouldInclude": true|false,
  "reason": "包含或排除的原因"
}`;

    try {
      const response = await this.deepseek.generateCompletion(prompt) as string;
      const analysis = JSON.parse(response);
      
      // 验证分析结果
      if (!analysis.shouldInclude) {
        return null;
      }

      // 计算最终评分
      const finalScore = this.calculateFinalScore(item, analysis.importanceLevel);
      
      if (finalScore < 0.4) {
        return null;
      }

      return {
        ...item,
        aiGeneratedSummary: analysis.aiGeneratedSummary || this.generateSummary(item),
        keyInsights: Array.isArray(analysis.keyInsights) ? analysis.keyInsights : this.extractInsights(item),
        importanceLevel: analysis.importanceLevel || 'medium',
        relatedTopics: Array.isArray(analysis.relatedTopics) ? analysis.relatedTopics : this.identifyTopics(item),
        technicalLevel: analysis.technicalLevel || 'intermediate',
        finalScore
      };
    } catch (error) {
      console.warn('⚠️  DeepSeek JSON 解析失败，使用本地规则');
      return this.analyzeSingleItemLocal(item);
    }
  }

  /**
   * 使用本地规则分析批次内容
   */
  private async analyzeWithLocalRules(items: ContentItem[]): Promise<AnalyzedContentItem[]> {
    const results: AnalyzedContentItem[] = [];
    
    for (const item of items) {
      const analyzed = await this.analyzeSingleItemLocal(item);
      if (analyzed) {
        results.push(analyzed);
      }
    }
    
    return results;
  }

  /**
   * 使用本地规则分析单条内容
   */
  private async analyzeSingleItemLocal(item: ContentItem): Promise<AnalyzedContentItem | null> {
    // 生成中文摘要
    const aiGeneratedSummary = this.generateSummary(item);
    
    // 提取关键洞察
    const keyInsights = this.extractInsights(item);
    
    // 评估重要性
    const importanceLevel = this.assessImportance(item);
    
    // 识别相关话题
    const relatedTopics = this.identifyTopics(item);
    
    // 评估技术难度
    const technicalLevel = this.assessTechnicalLevel(item);
    
    // 计算最终评分
    const finalScore = this.calculateFinalScore(item, importanceLevel);

    // 过滤低分内容
    if (finalScore < 0.4) {
      return null;
    }

    return {
      ...item,
      aiGeneratedSummary,
      keyInsights,
      importanceLevel,
      relatedTopics,
      technicalLevel,
      finalScore
    };
  }

  /**
   * 生成中文摘要
   */
  private generateSummary(item: ContentItem): string {
    const title = item.title;
    const desc = item.description;
    
    // 基于来源和内容生成摘要
    if (item.source === 'twitter') {
      // Twitter 内容通常比较简短直接
      if (desc.length > 80) {
        return desc.length > 200 ? desc.substring(0, 197) + '...' : desc;
      }
      
      // 如果描述太短，基于标题扩展
      const keyTopic = this.extractMainKeyword(title);
      return `关于 ${keyTopic} 的最新动态和技术分享，来自业界专家的第一手信息。`;
    }
    
    if (item.source === 'rss') {
      // RSS 文章通常有更详细的描述
      if (desc.length > 50) {
        return desc.length > 250 ? desc.substring(0, 247) + '...' : desc;
      }
      
      const keyTopic = this.extractMainKeyword(title);
      return `深度解析 ${keyTopic} 的技术进展，提供专业的行业洞察和技术分析。`;
    }
    
    return desc || '最新 AI 技术动态分享。';
  }

  /**
   * 提取关键洞察
   */
  private extractInsights(item: ContentItem): string[] {
    const insights: string[] = [];
    const text = (item.title + ' ' + item.description).toLowerCase();
    
    // 基于关键词模式识别洞察
    const insightPatterns = [
      { keywords: ['breakthrough', 'breakthrough', '突破', '重大'], insight: '技术突破性进展' },
      { keywords: ['release', 'launched', '发布', '推出'], insight: '新产品/服务发布' },
      { keywords: ['performance', '性能', 'speed', '速度'], insight: '性能优化相关' },
      { keywords: ['open source', 'github', '开源'], insight: '开源项目动态' },
      { keywords: ['research', 'study', '研究', '论文'], insight: '学术研究成果' },
      { keywords: ['model', '模型', 'training', '训练'], insight: 'AI 模型技术' },
      { keywords: ['api', 'developer', '开发者'], insight: '开发者工具更新' },
      { keywords: ['funding', 'investment', '融资', '投资'], insight: '行业投融资动态' }
    ];
    
    for (const pattern of insightPatterns) {
      if (pattern.keywords.some(keyword => text.includes(keyword))) {
        insights.push(pattern.insight);
        if (insights.length >= 3) break; // 最多3个洞察
      }
    }
    
    // 如果没有匹配到特定模式，添加通用洞察
    if (insights.length === 0) {
      if (item.source === 'twitter') {
        insights.push('行业专家观点分享');
      } else if (item.source === 'rss') {
        insights.push('深度技术分析');
      } else {
        insights.push('AI 行业最新动态');
      }
    }
    
    return insights;
  }

  /**
   * 评估重要性级别
   */
  private assessImportance(item: ContentItem): 'low' | 'medium' | 'high' | 'critical' {
    let score = 0;
    const text = (item.title + ' ' + item.description).toLowerCase();
    
    // 基于内容源权重
    if (item.metadata?.isHighQualitySource) score += 1;
    if (item.source === 'rss' && item.metadata?.feedCategory === 'research') score += 1;
    
    // 基于社交指标
    if (item.metrics?.likes && item.metrics.likes > 1000) score += 2;
    if (item.metrics?.likes && item.metrics.likes > 500) score += 1;
    
    // 基于关键词重要性
    const criticalKeywords = ['gpt-5', 'claude-4', 'breakthrough', '重大突破', 'acquisition', '收购'];
    const highKeywords = ['gpt-4', 'claude', 'release', '发布', 'funding', '融资'];
    const mediumKeywords = ['ai', 'machine learning', '人工智能', '机器学习'];
    
    if (criticalKeywords.some(k => text.includes(k))) score += 3;
    else if (highKeywords.some(k => text.includes(k))) score += 2;
    else if (mediumKeywords.some(k => text.includes(k))) score += 1;
    
    // 基于 AI 相关性评分
    const aiScore = item.metrics?.aiRelevanceScore || 0;
    if (aiScore > 0.8) score += 2;
    else if (aiScore > 0.6) score += 1;
    
    // 基于时效性
    const freshnessScore = item.metrics?.freshnessScore || 0;
    if (freshnessScore > 0.8) score += 1;
    
    if (score >= 6) return 'critical';
    if (score >= 4) return 'high';
    if (score >= 2) return 'medium';
    return 'low';
  }

  /**
   * 识别相关话题
   */
  private identifyTopics(item: ContentItem): string[] {
    const topics: string[] = [];
    const text = (item.title + ' ' + item.description).toLowerCase();
    
    const topicMap = {
      '大语言模型': ['gpt', 'llm', 'large language', 'transformer', 'claude'],
      '计算机视觉': ['vision', 'image', 'visual', 'cv', '视觉', '图像'],
      '自然语言处理': ['nlp', 'language', 'text', '语言处理', 'chat'],
      '机器学习': ['machine learning', 'ml', 'training', '机器学习', '训练'],
      'AI应用': ['application', 'tool', 'product', '应用', '产品', 'app'],
      '开源项目': ['open source', 'github', '开源', 'repository'],
      '行业动态': ['funding', 'acquisition', 'partnership', '融资', '收购', '合作'],
      '技术突破': ['breakthrough', 'innovation', '突破', '创新', '进展']
    };
    
    for (const [topic, keywords] of Object.entries(topicMap)) {
      if (keywords.some(keyword => text.includes(keyword))) {
        topics.push(topic);
        if (topics.length >= 4) break; // 最多4个话题
      }
    }
    
    return topics.length > 0 ? topics : ['AI技术'];
  }

  /**
   * 评估技术难度
   */
  private assessTechnicalLevel(item: ContentItem): 'beginner' | 'intermediate' | 'advanced' | 'expert' {
    const text = (item.title + ' ' + item.description).toLowerCase();
    
    // RSS 文章通常更技术性
    if (item.source === 'rss') {
      if (item.metadata?.feedCategory === 'research') return 'expert';
      if (item.metadata?.feedName?.includes('Blog')) return 'advanced';
    }
    
    // 基于技术关键词判断
    const expertKeywords = ['architecture', 'algorithm', 'optimization', '架构', '算法', '优化'];
    const advancedKeywords = ['implementation', 'api', 'development', '实现', '开发', '部署'];
    const intermediateKeywords = ['tutorial', 'guide', 'how to', '教程', '指南', '介绍'];
    const beginnerKeywords = ['introduction', 'basics', '入门', '基础'];
    
    if (expertKeywords.some(k => text.includes(k))) return 'expert';
    if (advancedKeywords.some(k => text.includes(k))) return 'advanced';
    if (beginnerKeywords.some(k => text.includes(k))) return 'beginner';
    if (intermediateKeywords.some(k => text.includes(k))) return 'intermediate';
    
    // 默认根据来源判断
    return item.source === 'twitter' ? 'intermediate' : 'advanced';
  }

  /**
   * 计算最终评分
   */
  private calculateFinalScore(item: ContentItem, importance: string): number {
    let score = 0;
    
    // 基础指标权重 (60%)
    score += (item.metrics?.aiRelevanceScore || 0) * 0.35;
    score += (item.metrics?.qualityScore || 0) * 0.15;
    score += (item.metrics?.freshnessScore || 0) * 0.1;
    
    // 重要性权重 (25%)
    const importanceWeights = { 'critical': 0.25, 'high': 0.2, 'medium': 0.15, 'low': 0.1 };
    score += importanceWeights[importance as keyof typeof importanceWeights] || 0.1;
    
    // 社交互动权重 (10%)
    if (item.metrics?.likes || item.metrics?.shares) {
      const socialScore = Math.min(
        (item.metrics.likes || 0) / 2000 + (item.metrics.shares || 0) / 200, 
        0.1
      );
      score += socialScore;
    }
    
    // 来源权重 (5%)
    if (item.metadata?.isHighQualitySource) {
      score += 0.05;
    }
    
    return Math.min(score, 1.0);
  }

  /**
   * 提取主要关键词
   */
  private extractMainKeyword(title: string): string {
    const keywords = ['GPT', 'Claude', 'OpenAI', 'Anthropic', 'Google', 'Meta', 'AI', '人工智能', '大模型'];
    
    for (const keyword of keywords) {
      if (title.includes(keyword)) {
        return keyword;
      }
    }
    
    // 提取第一个有意义的词
    const words = title.split(/[\s\-_,，。]+/);
    const meaningfulWord = words.find(word => word.length > 2 && !/^[a-zA-Z]{1,2}$/.test(word));
    return meaningfulWord || 'AI 技术';
  }

  /**
   * 排序和过滤
   */
  private rankAndFilter(items: AnalyzedContentItem[]): AnalyzedContentItem[] {
    // 按最终评分排序
    const sorted = items.sort((a, b) => b.finalScore - a.finalScore);
    
    // 确保内容多样性
    const diversified: AnalyzedContentItem[] = [];
    const usedSources = new Map<string, number>();
    const maxPerSource = 12; // 每个来源最多12篇
    
    for (const item of sorted) {
      const sourceCount = usedSources.get(item.source) || 0;
      
      if (sourceCount < maxPerSource) {
        diversified.push(item);
        usedSources.set(item.source, sourceCount + 1);
        
        if (diversified.length >= 20) break; // 总共最多20篇
      }
    }
    
    return diversified;
  }

  /**
   * 将内容分割成批次
   */
  private splitIntoBatches<T>(items: T[], batchSize: number): T[][] {
    const batches: T[][] = [];
    for (let i = 0; i < items.length; i += batchSize) {
      batches.push(items.slice(i, i + batchSize));
    }
    return batches;
  }

  /**
   * 延迟函数
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export default ContentAnalyzerV2Component;