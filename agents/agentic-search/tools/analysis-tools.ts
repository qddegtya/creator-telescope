import { Tool } from '@astack-tech/tools';
import { SearchContent } from '../types/multi-agent.js';

/**
 * 内容情感分析工具
 * 分析搜索内容的情感倾向和情绪特征
 */
export class SentimentAnalysisTool implements Tool {
  name = 'analyze_content_sentiment';
  description = '分析内容的情感倾向，识别正面、负面和中性情绪';
  parameters = {
    type: 'object',
    properties: {
      contents: {
        type: 'array',
        items: { type: 'object' },
        description: '需要分析的内容列表'
      },
      analysisDepth: {
        type: 'string',
        enum: ['basic', 'detailed', 'comprehensive'],
        description: '分析深度'
      }
    },
    required: ['contents']
  };

  async invoke(args: { 
    contents: SearchContent[],
    analysisDepth?: 'basic' | 'detailed' | 'comprehensive'
  }) {
    const { contents, analysisDepth = 'basic' } = args;

    console.log(`😊 情感分析: ${contents.length} 个内容`);

    const results = [];
    const overallSentiment = {
      positive: 0,
      negative: 0,
      neutral: 0
    };

    for (const content of contents) {
      const analysis = this.analyzeSingleContent(content, analysisDepth);
      results.push({
        contentId: content.id,
        title: content.title,
        sentiment: analysis.sentiment,
        confidence: analysis.confidence,
        emotions: analysis.emotions,
        keywords: analysis.keywords,
        reasoning: analysis.reasoning
      });

      // 累计总体情感统计
      overallSentiment[analysis.sentiment]++;
    }

    // 计算情感分布
    const total = contents.length;
    const sentimentDistribution = {
      positive: overallSentiment.positive / total,
      negative: overallSentiment.negative / total,
      neutral: overallSentiment.neutral / total
    };

    // 识别情感趋势
    const trends = this.identifySentimentTrends(results);

    return {
      contentAnalysis: results,
      overallSentiment: sentimentDistribution,
      trends,
      summary: {
        totalAnalyzed: total,
        dominantSentiment: this.getDominantSentiment(sentimentDistribution),
        averageConfidence: results.reduce((sum, r) => sum + r.confidence, 0) / total,
        emotionalKeywords: this.extractEmotionalKeywords(results)
      },
      metadata: {
        analysisDepth,
        processedAt: new Date()
      }
    };
  }

  private analyzeSingleContent(content: SearchContent, depth: string) {
    const text = `${content.title} ${content.content}`.toLowerCase();
    
    // 基础情感词典
    const positiveWords = [
      'good', 'great', 'excellent', 'amazing', 'awesome', 'fantastic', 'wonderful',
      'best', 'better', 'improved', 'breakthrough', 'innovation', 'success',
      'love', 'like', 'enjoy', 'happy', 'excited', 'thrilled'
    ];
    
    const negativeWords = [
      'bad', 'terrible', 'awful', 'horrible', 'worst', 'hate', 'dislike',
      'problem', 'issue', 'bug', 'error', 'fail', 'failure', 'broken',
      'disappointed', 'frustrated', 'angry', 'sad', 'worried', 'concern'
    ];

    const neutralWords = [
      'update', 'release', 'version', 'change', 'new', 'announcement',
      'report', 'analysis', 'study', 'research', 'data', 'information'
    ];

    // 计算情感分数
    let positiveScore = 0;
    let negativeScore = 0;
    let neutralScore = 0;

    positiveWords.forEach(word => {
      const matches = (text.match(new RegExp(word, 'g')) || []).length;
      positiveScore += matches;
    });

    negativeWords.forEach(word => {
      const matches = (text.match(new RegExp(word, 'g')) || []).length;
      negativeScore += matches;
    });

    neutralWords.forEach(word => {
      const matches = (text.match(new RegExp(word, 'g')) || []).length;
      neutralScore += matches;
    });

    // 确定主要情感
    const totalScore = positiveScore + negativeScore + neutralScore;
    let sentiment: 'positive' | 'negative' | 'neutral';
    let confidence: number;

    if (totalScore === 0) {
      sentiment = 'neutral';
      confidence = 0.5;
    } else if (positiveScore > negativeScore && positiveScore > neutralScore) {
      sentiment = 'positive';
      confidence = positiveScore / totalScore;
    } else if (negativeScore > positiveScore && negativeScore > neutralScore) {
      sentiment = 'negative';
      confidence = negativeScore / totalScore;
    } else {
      sentiment = 'neutral';
      confidence = Math.max(neutralScore, Math.min(positiveScore, negativeScore)) / totalScore;
    }

    // 详细分析（如果需要）
    let emotions: string[] = [];
    let keywords: string[] = [];
    let reasoning = '';

    if (depth === 'detailed' || depth === 'comprehensive') {
      emotions = this.identifyEmotions(text);
      keywords = this.extractSentimentKeywords(text);
      reasoning = this.generateReasoning(sentiment, positiveScore, negativeScore, neutralScore);
    }

    return {
      sentiment,
      confidence: Math.round(confidence * 100) / 100,
      emotions,
      keywords,
      reasoning
    };
  }

  private identifyEmotions(text: string): string[] {
    const emotionMap: Record<string, string[]> = {
      excitement: ['excited', 'thrilled', 'amazing', 'awesome', 'fantastic'],
      satisfaction: ['good', 'great', 'excellent', 'pleased', 'satisfied'],
      concern: ['worried', 'concerned', 'issue', 'problem'],
      frustration: ['frustrated', 'annoyed', 'terrible', 'awful'],
      curiosity: ['interesting', 'wonder', 'question', 'explore'],
      optimism: ['hope', 'optimistic', 'potential', 'future', 'promising']
    };

    const detectedEmotions: string[] = [];

    for (const [emotion, words] of Object.entries(emotionMap)) {
      if (words.some(word => text.includes(word))) {
        detectedEmotions.push(emotion);
      }
    }

    return detectedEmotions;
  }

  private extractSentimentKeywords(text: string): string[] {
    const keywords: string[] = [];
    const words = text.split(/\s+/);
    
    const significantWords = words.filter(word => 
      word.length > 4 && 
      !['that', 'this', 'with', 'from', 'they', 'have', 'been'].includes(word)
    );

    return significantWords.slice(0, 10);
  }

  private generateReasoning(
    sentiment: string, 
    positiveScore: number, 
    negativeScore: number, 
    neutralScore: number
  ): string {
    const total = positiveScore + negativeScore + neutralScore;
    
    if (total === 0) {
      return '内容缺乏明显的情感指标';
    }

    const reasons = [];
    if (positiveScore > 0) reasons.push(`正面词汇 ${positiveScore} 个`);
    if (negativeScore > 0) reasons.push(`负面词汇 ${negativeScore} 个`);
    if (neutralScore > 0) reasons.push(`中性词汇 ${neutralScore} 个`);

    return `基于${reasons.join('，')}，判断为${sentiment}情感`;
  }

  private identifySentimentTrends(results: any[]): any[] {
    const trends = [];

    // 按时间分析情感变化
    const timeGroups = this.groupByTimeWindow(results);
    
    for (const [timeWindow, items] of Object.entries(timeGroups)) {
      const sentimentCounts = {
        positive: items.filter((item: any) => item.sentiment === 'positive').length,
        negative: items.filter((item: any) => item.sentiment === 'negative').length,
        neutral: items.filter((item: any) => item.sentiment === 'neutral').length
      };

      trends.push({
        timeWindow,
        sentimentCounts,
        dominantSentiment: this.getDominantSentiment(sentimentCounts),
        itemCount: items.length
      });
    }

    return trends;
  }

  private groupByTimeWindow(results: any[]): Record<string, any[]> {
    // 简单按最近 6 小时、12 小时、24 小时分组
    const now = new Date();
    const groups: Record<string, any[]> = {
      'last6h': [],
      'last12h': [],
      'last24h': []
    };

    results.forEach(result => {
      const timestamp = result.timestamp || result.publishDate || new Date();
      const age = now.getTime() - (timestamp instanceof Date ? timestamp.getTime() : new Date(timestamp).getTime());
      
      if (age <= 6 * 60 * 60 * 1000) {
        groups.last6h.push(result);
      } else if (age <= 12 * 60 * 60 * 1000) {
        groups.last12h.push(result);
      } else {
        groups.last24h.push(result);
      }
    });

    return groups;
  }

  private getDominantSentiment(distribution: Record<string, number>): string {
    return Object.entries(distribution).reduce((a, b) => 
      distribution[a[0]] > distribution[b[0]] ? a : b
    )[0];
  }

  private extractEmotionalKeywords(results: any[]): string[] {
    const allKeywords = results.flatMap((result: any) => result.keywords);
    const keywordCounts: Record<string, number> = {};

    allKeywords.forEach(keyword => {
      keywordCounts[keyword] = (keywordCounts[keyword] || 0) + 1;
    });

    return Object.entries(keywordCounts)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 10)
      .map(([keyword]) => keyword);
  }
}

/**
 * 内容主题分类工具
 * 智能识别和分类内容主题
 */
export class TopicClassificationTool implements Tool {
  name = 'classify_content_topics';
  description = '自动识别和分类内容主题，提供多层次的主题标签';
  parameters = {
    type: 'object',
    properties: {
      contents: {
        type: 'array',
        items: { type: 'object' },
        description: '需要分类的内容列表'
      },
      topicHierarchy: {
        type: 'boolean',
        description: '是否生成层次化主题分类'
      },
      customCategories: {
        type: 'array',
        items: { type: 'string' },
        description: '自定义分类类别'
      }
    },
    required: ['contents']
  };

  async invoke(args: { 
    contents: SearchContent[],
    topicHierarchy?: boolean,
    customCategories?: string[]
  }) {
    const { contents, topicHierarchy = true, customCategories = [] } = args;

    console.log(`🏷️ 主题分类: ${contents.length} 个内容`);

    // 预定义主题类别
    const defaultCategories = {
      technology: {
        keywords: ['ai', 'machine learning', 'algorithm', 'framework', 'library', 'api'],
        subcategories: ['frontend', 'backend', 'mobile', 'devops', 'ai/ml']
      },
      development: {
        keywords: ['code', 'programming', 'development', 'github', 'repository'],
        subcategories: ['tools', 'best practices', 'tutorials', 'open source']
      },
      business: {
        keywords: ['startup', 'funding', 'market', 'business', 'strategy'],
        subcategories: ['fintech', 'saas', 'enterprise', 'investment']
      },
      research: {
        keywords: ['research', 'study', 'paper', 'analysis', 'data'],
        subcategories: ['academic', 'industry', 'survey', 'experimental']
      },
      community: {
        keywords: ['community', 'discussion', 'opinion', 'trend', 'social'],
        subcategories: ['news', 'opinion', 'discussion', 'events']
      }
    };

    const results = [];
    const topicDistribution: Record<string, number> = {};

    for (const content of contents) {
      const classification = this.classifyContent(content, defaultCategories, customCategories);
      
      results.push({
        contentId: content.id,
        title: content.title,
        primaryTopic: classification.primaryTopic,
        secondaryTopics: classification.secondaryTopics,
        confidence: classification.confidence,
        subcategories: classification.subcategories,
        tags: classification.tags
      });

      // 统计主题分布
      topicDistribution[classification.primaryTopic] = 
        (topicDistribution[classification.primaryTopic] || 0) + 1;
    }

    // 生成主题关系图
    const topicRelations = topicHierarchy ? this.generateTopicHierarchy(results) : null;

    // 识别热门主题
    const trendingTopics = this.identifyTrendingTopics(results, topicDistribution);

    return {
      classifications: results,
      topicDistribution,
      topicRelations,
      trendingTopics,
      summary: {
        totalClassified: contents.length,
        uniqueTopics: Object.keys(topicDistribution).length,
        averageConfidence: results.reduce((sum, r) => sum + r.confidence, 0) / results.length,
        mostPopularTopic: Object.entries(topicDistribution).reduce((a, b) => a[1] > b[1] ? a : b)[0]
      },
      metadata: {
        categoriesUsed: Object.keys(defaultCategories).concat(customCategories),
        hierarchyGenerated: topicHierarchy,
        processedAt: new Date()
      }
    };
  }

  private classifyContent(
    content: SearchContent, 
    categories: any, 
    customCategories: string[]
  ) {
    const text = `${content.title} ${content.content}`.toLowerCase();
    const scores: Record<string, number> = {};

    // 计算每个类别的得分
    for (const [category, data] of Object.entries(categories)) {
      let score = 0;
      const keywords = (data as any).keywords;
      
      keywords.forEach((keyword: string) => {
        const matches = (text.match(new RegExp(keyword, 'g')) || []).length;
        score += matches;
      });

      if (score > 0) {
        scores[category] = score;
      }
    }

    // 处理自定义类别
    customCategories.forEach(category => {
      const matches = (text.match(new RegExp(category.toLowerCase(), 'g')) || []).length;
      if (matches > 0) {
        scores[category] = matches;
      }
    });

    // 确定主要主题
    const sortedTopics = Object.entries(scores).sort(([,a], [,b]) => b - a);
    const primaryTopic = sortedTopics.length > 0 ? sortedTopics[0][0] : 'general';
    const secondaryTopics = sortedTopics.slice(1, 3).map(([topic]) => topic);

    // 计算置信度
    const totalScore = Object.values(scores).reduce((sum, score) => sum + score, 0);
    const confidence = totalScore > 0 ? (sortedTopics[0]?.[1] || 0) / totalScore : 0.3;

    // 识别子类别
    const subcategories = this.identifySubcategories(text, primaryTopic, categories);

    // 生成标签
    const tags = this.generateTopicTags(text, primaryTopic);

    return {
      primaryTopic,
      secondaryTopics,
      confidence: Math.round(confidence * 100) / 100,
      subcategories,
      tags
    };
  }

  private identifySubcategories(text: string, primaryTopic: string, categories: any): string[] {
    const categoryData = categories[primaryTopic];
    if (!categoryData || !categoryData.subcategories) {
      return [];
    }

    const matchedSubcategories: string[] = [];

    categoryData.subcategories.forEach((subcategory: string) => {
      if (text.includes(subcategory.toLowerCase().replace('/', ' '))) {
        matchedSubcategories.push(subcategory);
      }
    });

    return matchedSubcategories;
  }

  private generateTopicTags(text: string, primaryTopic: string): string[] {
    const tags: string[] = [primaryTopic];

    // 基于内容特征添加标签
    const tagMap: Record<string, string[]> = {
      tutorial: ['tutorial', 'guide', 'how to', 'step by step'],
      news: ['news', 'announcement', 'release', 'update'],
      discussion: ['discussion', 'opinion', 'thoughts', 'debate'],
      review: ['review', 'comparison', 'vs', 'evaluation'],
      research: ['research', 'study', 'analysis', 'survey'],
      tool: ['tool', 'library', 'framework', 'utility'],
      beginner: ['beginner', 'intro', 'basics', 'getting started'],
      advanced: ['advanced', 'expert', 'deep dive', 'mastery']
    };

    for (const [tag, keywords] of Object.entries(tagMap)) {
      if (keywords.some(keyword => text.includes(keyword))) {
        tags.push(tag);
      }
    }

    return [...new Set(tags)]; // 去重
  }

  private generateTopicHierarchy(results: any[]): any {
    const hierarchy: Record<string, any> = {};

    results.forEach(result => {
      const { primaryTopic, subcategories, tags } = result;

      if (!hierarchy[primaryTopic]) {
        hierarchy[primaryTopic] = {
          subcategories: {},
          tags: new Set(),
          count: 0
        };
      }

      hierarchy[primaryTopic].count++;
      
      // 添加子类别
      subcategories.forEach((sub: string) => {
        if (!hierarchy[primaryTopic].subcategories[sub]) {
          hierarchy[primaryTopic].subcategories[sub] = 0;
        }
        hierarchy[primaryTopic].subcategories[sub]++;
      });

      // 添加标签
      tags.forEach((tag: string) => {
        hierarchy[primaryTopic].tags.add(tag);
      });
    });

    // 转换 Set 为 Array
    Object.values(hierarchy).forEach((topic: any) => {
      topic.tags = Array.from(topic.tags);
    });

    return hierarchy;
  }

  private identifyTrendingTopics(results: any[], distribution: Record<string, number>): any[] {
    const trending = [];
    const totalContents = results.length;

    for (const [topic, count] of Object.entries(distribution)) {
      const percentage = count / totalContents;
      
      if (percentage > 0.1) { // 超过 10% 的内容
        const topicContents = results.filter(r => r.primaryTopic === topic);
        const avgConfidence = topicContents.reduce((sum, r) => sum + r.confidence, 0) / count;
        
        trending.push({
          topic,
          count,
          percentage: Math.round(percentage * 100),
          averageConfidence: Math.round(avgConfidence * 100) / 100,
          subcategories: this.getTopSubcategories(topicContents),
          commonTags: this.getCommonTags(topicContents)
        });
      }
    }

    return trending.sort((a, b) => b.percentage - a.percentage);
  }

  private getTopSubcategories(contents: any[]): string[] {
    const subcategoryCounts: Record<string, number> = {};

    contents.forEach(content => {
      content.subcategories.forEach((sub: string) => {
        subcategoryCounts[sub] = (subcategoryCounts[sub] || 0) + 1;
      });
    });

    return Object.entries(subcategoryCounts)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 3)
      .map(([sub]) => sub);
  }

  private getCommonTags(contents: any[]): string[] {
    const tagCounts: Record<string, number> = {};

    contents.forEach(content => {
      content.tags.forEach((tag: string) => {
        tagCounts[tag] = (tagCounts[tag] || 0) + 1;
      });
    });

    return Object.entries(tagCounts)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 5)
      .map(([tag]) => tag);
  }
}

/**
 * 趋势检测工具
 * 识别内容中的新兴趋势和模式
 */
export class TrendDetectionTool implements Tool {
  name = 'detect_content_trends';
  description = '检测内容中的趋势模式，识别新兴话题和变化';
  parameters = {
    type: 'object',
    properties: {
      contents: {
        type: 'array',
        items: { type: 'object' },
        description: '内容列表'
      },
      timeWindow: {
        type: 'string',
        description: '时间窗口（如：24h, 7d, 1m）'
      },
      trendTypes: {
        type: 'array',
        items: { type: 'string' },
        description: '趋势类型（emerging, growing, declining）'
      }
    },
    required: ['contents']
  };

  async invoke(args: { 
    contents: SearchContent[],
    timeWindow?: string,
    trendTypes?: string[]
  }) {
    const { contents, timeWindow = '24h', trendTypes = ['emerging', 'growing', 'declining'] } = args;

    console.log(`📈 趋势检测: ${contents.length} 个内容，时间窗口: ${timeWindow}`);

    // 提取关键词频率
    const keywordFrequency = this.analyzeKeywordFrequency(contents);
    
    // 分析时间分布
    const temporalDistribution = this.analyzeTemporalDistribution(contents, timeWindow);
    
    // 检测不同类型的趋势
    const detectedTrends: any[] = [];

    if (trendTypes.includes('emerging')) {
      const emergingTrends = this.detectEmergingTrends(keywordFrequency, temporalDistribution);
      detectedTrends.push(...emergingTrends);
    }

    if (trendTypes.includes('growing')) {
      const growingTrends = this.detectGrowingTrends(temporalDistribution);
      detectedTrends.push(...growingTrends);
    }

    if (trendTypes.includes('declining')) {
      const decliningTrends = this.detectDecliningTrends(temporalDistribution);
      detectedTrends.push(...decliningTrends);
    }

    // 计算趋势强度
    const trendStrength = this.calculateTrendStrength(detectedTrends, contents.length);

    return {
      detectedTrends: detectedTrends.sort((a, b) => b.strength - a.strength),
      keywordFrequency,
      temporalDistribution,
      trendStrength,
      summary: {
        totalTrends: detectedTrends.length,
        emergingCount: detectedTrends.filter(t => t.type === 'emerging').length,
        growingCount: detectedTrends.filter(t => t.type === 'growing').length,
        decliningCount: detectedTrends.filter(t => t.type === 'declining').length,
        strongestTrend: detectedTrends.length > 0 ? detectedTrends[0].keyword : null
      },
      metadata: {
        timeWindow,
        analysisDate: new Date(),
        contentTimespan: this.getContentTimespan(contents)
      }
    };
  }

  private analyzeKeywordFrequency(contents: SearchContent[]): Record<string, number> {
    const frequency: Record<string, number> = {};

    contents.forEach(content => {
      const text = `${content.title} ${content.content}`.toLowerCase();
      const words = text.match(/\b\w{3,}\b/g) || []; // 提取 3+ 字符的单词

      words.forEach(word => {
        if (!this.isStopWord(word)) {
          frequency[word] = (frequency[word] || 0) + 1;
        }
      });
    });

    // 过滤低频词汇
    const filtered: Record<string, number> = {};
    Object.entries(frequency).forEach(([word, count]) => {
      if (count >= 3) { // 至少出现 3 次
        filtered[word] = count;
      }
    });

    return filtered;
  }

  private analyzeTemporalDistribution(contents: SearchContent[], timeWindow: string): any {
    const distribution: Record<string, any[]> = {};
    const windowHours = this.parseTimeWindow(timeWindow);

    // 将内容按时间段分组
    const now = new Date();
    const intervals = 6; // 分成 6 个时间段
    const intervalDuration = windowHours / intervals;

    for (let i = 0; i < intervals; i++) {
      const intervalStart = new Date(now.getTime() - (i + 1) * intervalDuration * 60 * 60 * 1000);
      const intervalEnd = new Date(now.getTime() - i * intervalDuration * 60 * 60 * 1000);
      const intervalKey = `interval_${i}`;

      distribution[intervalKey] = contents.filter(content => 
        content.timestamp >= intervalStart && content.timestamp < intervalEnd
      );
    }

    return distribution;
  }

  private detectEmergingTrends(
    keywordFreq: Record<string, number>, 
    temporalDist: Record<string, any[]>
  ): any[] {
    const trends: any[] = [];

    // 检测在最近时间段突然出现的关键词
    const recentInterval = temporalDist['interval_0'] || [];
    const recentKeywords = this.extractKeywordsFromContents(recentInterval);

    Object.entries(recentKeywords).forEach(([keyword, recentCount]) => {
      const totalCount = keywordFreq[keyword] || 0;
      const emergenceRatio = recentCount / totalCount;

      if (emergenceRatio > 0.6 && totalCount >= 3) { // 60% 的出现在最近时段
        trends.push({
          type: 'emerging',
          keyword,
          strength: emergenceRatio,
          totalMentions: totalCount,
          recentMentions: recentCount,
          relatedContents: recentInterval.filter(content => 
            content.title.toLowerCase().includes(keyword) ||
            content.content.toLowerCase().includes(keyword)
          ).slice(0, 3)
        });
      }
    });

    return trends;
  }

  private detectGrowingTrends(temporalDist: Record<string, any[]>): any[] {
    const trends: any[] = [];

    // 分析关键词在不同时间段的增长趋势
    const intervals = Object.keys(temporalDist).sort().reverse(); // 从最新到最旧
    
    if (intervals.length < 3) return trends; // 需要至少 3 个时间段

    const keywordTrends: Record<string, number[]> = {};

    // 统计每个时间段的关键词出现次数
    intervals.forEach((interval, index) => {
      const contents = temporalDist[interval];
      const keywords = this.extractKeywordsFromContents(contents);

      Object.entries(keywords).forEach(([keyword, count]) => {
        if (!keywordTrends[keyword]) {
          keywordTrends[keyword] = new Array(intervals.length).fill(0);
        }
        keywordTrends[keyword][index] = count;
      });
    });

    // 检测增长趋势
    Object.entries(keywordTrends).forEach(([keyword, counts]) => {
      const growth = this.calculateGrowthTrend(counts);
      if (growth.isGrowing && growth.strength > 0.3) {
        trends.push({
          type: 'growing',
          keyword,
          strength: growth.strength,
          growthRate: growth.rate,
          totalMentions: counts.reduce((sum, count) => sum + count, 0),
          trendData: counts
        });
      }
    });

    return trends;
  }

  private detectDecliningTrends(temporalDist: Record<string, any[]>): any[] {
    const trends: any[] = [];

    const intervals = Object.keys(temporalDist).sort().reverse();
    if (intervals.length < 3) return trends;

    const keywordTrends: Record<string, number[]> = {};

    intervals.forEach((interval, index) => {
      const contents = temporalDist[interval];
      const keywords = this.extractKeywordsFromContents(contents);

      Object.entries(keywords).forEach(([keyword, count]) => {
        if (!keywordTrends[keyword]) {
          keywordTrends[keyword] = new Array(intervals.length).fill(0);
        }
        keywordTrends[keyword][index] = count;
      });
    });

    Object.entries(keywordTrends).forEach(([keyword, counts]) => {
      const decline = this.calculateDeclineTrend(counts);
      if (decline.isDeclining && decline.strength > 0.3) {
        trends.push({
          type: 'declining',
          keyword,
          strength: decline.strength,
          declineRate: decline.rate,
          totalMentions: counts.reduce((sum, count) => sum + count, 0),
          trendData: counts
        });
      }
    });

    return trends;
  }

  private extractKeywordsFromContents(contents: any[]): Record<string, number> {
    const keywords: Record<string, number> = {};

    contents.forEach(content => {
      const text = `${content.title} ${content.content}`.toLowerCase();
      const words = text.match(/\b\w{3,}\b/g) || [];

      words.forEach(word => {
        if (!this.isStopWord(word)) {
          keywords[word] = (keywords[word] || 0) + 1;
        }
      });
    });

    return keywords;
  }

  private calculateGrowthTrend(counts: number[]): { isGrowing: boolean; strength: number; rate: number } {
    // 简单的线性回归检测增长趋势
    const n = counts.length;
    const indices = Array.from({ length: n }, (_, i) => i);
    
    const sumX = indices.reduce((sum, x) => sum + x, 0);
    const sumY = counts.reduce((sum, y) => sum + y, 0);
    const sumXY = indices.reduce((sum, x, i) => sum + x * counts[i], 0);
    const sumXX = indices.reduce((sum, x) => sum + x * x, 0);

    const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
    const isGrowing = slope > 0;
    const strength = Math.abs(slope) / (sumY / n); // 标准化强度

    return {
      isGrowing,
      strength: Math.min(strength, 1),
      rate: slope
    };
  }

  private calculateDeclineTrend(counts: number[]): { isDeclining: boolean; strength: number; rate: number } {
    const growth = this.calculateGrowthTrend(counts);
    return {
      isDeclining: growth.rate < 0,
      strength: growth.strength,
      rate: growth.rate
    };
  }

  private calculateTrendStrength(trends: any[], totalContents: number): any {
    if (trends.length === 0) return { overall: 0, byType: {} };

    const byType: Record<string, number> = {};
    let totalStrength = 0;

    trends.forEach(trend => {
      const adjustedStrength = trend.strength * (trend.totalMentions / totalContents);
      totalStrength += adjustedStrength;

      if (!byType[trend.type]) {
        byType[trend.type] = 0;
      }
      byType[trend.type] += adjustedStrength;
    });

    return {
      overall: totalStrength / trends.length,
      byType,
      strongest: trends[0]?.keyword || null,
      weakest: trends[trends.length - 1]?.keyword || null
    };
  }

  private parseTimeWindow(timeWindow: string): number {
    const unit = timeWindow.slice(-1);
    const value = parseInt(timeWindow.slice(0, -1));

    switch (unit) {
      case 'h': return value;
      case 'd': return value * 24;
      case 'w': return value * 24 * 7;
      case 'm': return value * 24 * 30;
      default: return 24; // 默认 24 小时
    }
  }

  private getContentTimespan(contents: SearchContent[]): string {
    if (contents.length === 0) return '无';

    const timestamps = contents.map(c => c.timestamp.getTime());
    const earliest = new Date(Math.min(...timestamps));
    const latest = new Date(Math.max(...timestamps));

    const diffHours = (latest.getTime() - earliest.getTime()) / (1000 * 60 * 60);

    if (diffHours < 24) {
      return `${Math.round(diffHours)} 小时`;
    }
    return `${Math.round(diffHours / 24)} 天`;
  }

  private isStopWord(word: string): boolean {
    const stopWords = [
      'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with',
      'by', 'from', 'up', 'about', 'into', 'through', 'during', 'before',
      'after', 'above', 'below', 'between', 'among', 'throughout', 'despite',
      'towards', 'upon', 'concerning', 'are', 'is', 'was', 'were', 'been',
      'be', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would',
      'could', 'should', 'may', 'might', 'must', 'can', 'this', 'that',
      'these', 'those', 'there', 'here', 'when', 'where', 'why', 'how',
      'what', 'which', 'who', 'whom', 'whose'
    ];

    return stopWords.includes(word.toLowerCase());
  }
}