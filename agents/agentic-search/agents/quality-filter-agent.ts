import { Agent, type AgentConfig, type Tool } from '@astack-tech/components';
import { Component } from '@astack-tech/core';
import { ModelProvider } from '@astack-tech/integrations';
import { 
  SearchContent, 
  QualityFilterInput, 
  QualityFilterOutput,
  QualityAssessment,
  SearchStrategy
} from '../types/multi-agent.js';

/**
 * 内容质量评估工具
 */
class ContentQualityTool implements Tool {
  name = 'assess_content_quality';
  description = '评估搜索内容的质量，包括相关性、可信度、时效性和独特性';
  parameters = {
    type: 'object',
    properties: {
      contents: { 
        type: 'array', 
        items: { type: 'object' },
        description: '需要评估质量的内容列表' 
      },
      strategy: { 
        type: 'object', 
        description: '搜索策略和评估标准' 
      },
      batchSize: { 
        type: 'number', 
        description: '批处理大小，默认为 3' 
      }
    },
    required: ['contents', 'strategy']
  };

  async invoke(args: { 
    contents: SearchContent[], 
    strategy: SearchStrategy,
    batchSize?: number 
  }) {
    const { contents, strategy, batchSize = 3 } = args;
    
    console.log(`📊 开始质量评估: ${contents.length} 个内容，批次大小: ${batchSize}`);

    const assessments: QualityAssessment[] = [];
    const qualityThreshold = strategy.qualityThreshold || 0.6;

    // 分批处理内容
    for (let i = 0; i < contents.length; i += batchSize) {
      const batch = contents.slice(i, i + batchSize);
      console.log(`📊 处理批次 ${Math.floor(i / batchSize) + 1}/${Math.ceil(contents.length / batchSize)}`);

      // 为每个内容生成评估
      for (const content of batch) {
        const assessment = await this.assessSingleContent(content, strategy);
        if (assessment) {
          assessments.push(assessment);
        }
      }

      // 批次间延迟
      if (i + batchSize < contents.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    // 过滤高质量内容
    const highQualityContents = contents.filter(content => {
      const assessment = assessments.find(a => a.contentId === content.id);
      return assessment && assessment.overallScore >= qualityThreshold;
    });

    return {
      assessments,
      filteredContents: highQualityContents,
      qualityStats: this.generateQualityStats(assessments, qualityThreshold)
    };
  }

  private async assessSingleContent(content: SearchContent, strategy: SearchStrategy): Promise<QualityAssessment | null> {
    try {
      // 基于内容特征进行质量评估
      const scores = {
        relevance: this.assessRelevance(content, strategy),
        credibility: this.assessCredibility(content),
        freshness: this.assessFreshness(content),
        uniqueness: this.assessUniqueness(content),
        engagement: this.assessEngagement(content)
      };

      // 计算加权总分
      const overallScore = (
        scores.relevance * 0.3 +
        scores.credibility * 0.25 +
        scores.freshness * 0.2 +
        scores.uniqueness * 0.15 +
        scores.engagement * 0.1
      );

      return {
        contentId: content.id,
        contentTitle: content.title,
        scores,
        overallScore: Math.round(overallScore * 100) / 100,
        reasoning: this.generateReasoning(scores, content),
        recommendationLevel: this.getRecommendationLevel(overallScore),
        timestamp: new Date()
      };

    } catch (error) {
      console.error(`质量评估失败: ${content.title}`, error);
      return null;
    }
  }

  private assessRelevance(content: SearchContent, strategy: SearchStrategy): number {
    let score = 0.5; // 基准分

    const searchFocus = strategy.searchFocus || [];
    const title = content.title.toLowerCase();
    const contentText = content.content.toLowerCase();

    // 检查关键词匹配
    for (const focus of searchFocus) {
      const focusLower = focus.toLowerCase();
      if (title.includes(focusLower)) score += 0.2;
      if (contentText.includes(focusLower)) score += 0.1;
    }

    // 基于来源调整
    if (content.source === 'github' && searchFocus.includes('technical implementations')) {
      score += 0.15;
    }
    if (content.source === 'twitter' && searchFocus.includes('community discussions')) {
      score += 0.15;
    }

    return Math.min(score, 1.0);
  }

  private assessCredibility(content: SearchContent): number {
    let score = 0.5; // 基准分

    // 基于来源的可信度
    switch (content.source) {
      case 'github':
        // GitHub 仓库可信度基于星标数
        const stars = content.metadata?.stars || 0;
        if (stars > 1000) score += 0.3;
        else if (stars > 100) score += 0.2;
        else if (stars > 10) score += 0.1;
        break;

      case 'google':
        // Google 结果基于域名
        const url = content.url;
        if (url.includes('github.com') || url.includes('stackoverflow.com')) {
          score += 0.3;
        } else if (url.includes('medium.com') || url.includes('dev.to')) {
          score += 0.2;
        } else if (url.includes('reddit.com')) {
          score += 0.1;
        }
        break;

      case 'twitter':
        // Twitter 内容基于互动数据
        const likes = content.metadata?.likes || 0;
        const retweets = content.metadata?.retweets || 0;
        if (likes > 100 || retweets > 50) score += 0.2;
        else if (likes > 20 || retweets > 10) score += 0.1;
        break;
    }

    // 作者信誉（基于用户名特征）
    const author = content.author?.toLowerCase() || '';
    if (author.includes('official') || author.includes('team')) {
      score += 0.1;
    }

    return Math.min(score, 1.0);
  }

  private assessFreshness(content: SearchContent): number {
    const now = new Date();
    const contentTime = content.timestamp;
    const hoursDiff = (now.getTime() - contentTime.getTime()) / (1000 * 60 * 60);

    // 24 小时内的内容得分更高
    if (hoursDiff <= 24) return 1.0;
    if (hoursDiff <= 48) return 0.8;
    if (hoursDiff <= 168) return 0.6; // 一周内
    if (hoursDiff <= 720) return 0.4; // 一个月内
    return 0.2;
  }

  private assessUniqueness(content: SearchContent): number {
    let score = 0.7; // 基准分

    // 检查内容长度（更长通常更独特）
    const contentLength = content.content.length;
    if (contentLength > 500) score += 0.2;
    else if (contentLength > 200) score += 0.1;

    // 检查技术深度（基于技术关键词）
    const techKeywords = ['api', 'implementation', 'algorithm', 'architecture', 'framework'];
    const techMatches = techKeywords.filter(keyword => 
      content.content.toLowerCase().includes(keyword)
    ).length;
    score += techMatches * 0.05;

    return Math.min(score, 1.0);
  }

  private assessEngagement(content: SearchContent): number {
    let score = 0.5; // 基准分

    // GitHub 项目的参与度
    if (content.source === 'github') {
      const forks = content.metadata?.forks || 0;
      const watchers = content.metadata?.watchers || 0;
      const issues = content.metadata?.openIssues || 0;
      
      if (forks > 50) score += 0.2;
      else if (forks > 10) score += 0.1;
      
      if (watchers > 100) score += 0.1;
      if (issues > 0 && issues < 20) score += 0.1; // 有活跃问题但不太多
    }

    // Twitter 内容的互动
    if (content.source === 'twitter') {
      const likes = content.metadata?.likes || 0;
      const retweets = content.metadata?.retweets || 0;
      const replies = content.metadata?.replies || 0;
      
      const engagementScore = (likes * 0.1 + retweets * 0.5 + replies * 0.3) / 100;
      score += Math.min(engagementScore, 0.3);
    }

    return Math.min(score, 1.0);
  }

  private generateReasoning(scores: any, content: SearchContent): string {
    const reasons: string[] = [];

    if (scores.relevance > 0.8) reasons.push('高度相关');
    else if (scores.relevance < 0.5) reasons.push('相关性较低');

    if (scores.credibility > 0.8) reasons.push('来源可信');
    else if (scores.credibility < 0.5) reasons.push('来源可信度待验证');

    if (scores.freshness > 0.8) reasons.push('内容新鲜');
    else if (scores.freshness < 0.5) reasons.push('内容时效性一般');

    if (scores.uniqueness > 0.8) reasons.push('内容独特');
    if (scores.engagement > 0.7) reasons.push('社区参与度高');

    return reasons.join('，') || '质量评估正常';
  }

  private getRecommendationLevel(score: number): 'must-include' | 'recommended' | 'optional' | 'exclude' {
    if (score >= 0.85) return 'must-include';
    if (score >= 0.7) return 'recommended';
    if (score >= 0.5) return 'optional';
    return 'exclude';
  }

  private generateQualityStats(assessments: QualityAssessment[], threshold: number) {
    const total = assessments.length;
    const passed = assessments.filter(a => a.overallScore >= threshold).length;
    
    const avgScores = {
      relevance: assessments.reduce((sum, a) => sum + a.scores.relevance, 0) / total,
      credibility: assessments.reduce((sum, a) => sum + a.scores.credibility, 0) / total,
      freshness: assessments.reduce((sum, a) => sum + a.scores.freshness, 0) / total,
      uniqueness: assessments.reduce((sum, a) => sum + a.scores.uniqueness, 0) / total,
      engagement: assessments.reduce((sum, a) => sum + a.scores.engagement, 0) / total,
      overall: assessments.reduce((sum, a) => sum + a.overallScore, 0) / total
    };

    return {
      totalAssessed: total,
      passedFilter: passed,
      filterRate: passed / total,
      qualityThreshold: threshold,
      averageScores: avgScores,
      recommendations: {
        mustInclude: assessments.filter(a => a.recommendationLevel === 'must-include').length,
        recommended: assessments.filter(a => a.recommendationLevel === 'recommended').length,
        optional: assessments.filter(a => a.recommendationLevel === 'optional').length,
        exclude: assessments.filter(a => a.recommendationLevel === 'exclude').length
      }
    };
  }
}

/**
 * 内容排序和筛选工具
 */
class ContentRankingTool implements Tool {
  name = 'rank_and_filter_content';
  description = '基于质量评估结果对内容进行排序和筛选';
  parameters = {
    type: 'object',
    properties: {
      contents: { 
        type: 'array', 
        items: { type: 'object' },
        description: '内容列表' 
      },
      assessments: { 
        type: 'array', 
        items: { type: 'object' },
        description: '质量评估结果' 
      },
      maxResults: { 
        type: 'number', 
        description: '最大返回结果数' 
      },
      diversityFactor: { 
        type: 'number', 
        description: '多样性因子，0-1 之间' 
      }
    },
    required: ['contents', 'assessments']
  };

  async invoke(args: { 
    contents: SearchContent[], 
    assessments: QualityAssessment[],
    maxResults?: number,
    diversityFactor?: number
  }) {
    const { contents, assessments, maxResults = 100, diversityFactor = 0.3 } = args;

    console.log(`📊 开始内容排序: ${contents.length} 个内容，最大返回 ${maxResults} 个`);

    // 为内容添加质量分数
    const scoredContents = contents.map(content => {
      const assessment = assessments.find(a => a.contentId === content.id);
      return {
        ...content,
        qualityScore: assessment?.overallScore || 0,
        qualityAssessment: assessment
      };
    });

    // 按质量分数排序
    let sortedContents = scoredContents.sort((a, b) => b.qualityScore - a.qualityScore);

    // 应用多样性筛选
    if (diversityFactor > 0) {
      sortedContents = this.applyDiversityFilter(sortedContents, diversityFactor);
    }

    // 限制结果数量
    const finalResults = sortedContents.slice(0, maxResults);

    return {
      rankedContents: finalResults,
      rankingStats: {
        totalInput: contents.length,
        totalOutput: finalResults.length,
        averageQuality: finalResults.reduce((sum, c) => sum + c.qualityScore, 0) / finalResults.length,
        qualityDistribution: this.getQualityDistribution(finalResults),
        sourceDistribution: this.getSourceDistribution(finalResults)
      }
    };
  }

  private applyDiversityFilter(contents: any[], diversityFactor: number): any[] {
    const result: any[] = [];
    const seenSources = new Set<string>();
    const seenAuthors = new Set<string>();
    const seenDomains = new Set<string>();

    for (const content of contents) {
      let diversityBonus = 0;

      // 来源多样性
      if (!seenSources.has(content.source)) {
        diversityBonus += 0.1;
        seenSources.add(content.source);
      }

      // 作者多样性
      if (content.author && !seenAuthors.has(content.author)) {
        diversityBonus += 0.05;
        seenAuthors.add(content.author);
      }

      // 域名多样性（针对 Google 结果）
      if (content.source === 'google') {
        try {
          const domain = new URL(content.url).hostname;
          if (!seenDomains.has(domain)) {
            diversityBonus += 0.05;
            seenDomains.add(domain);
          }
        } catch (e) {
          // URL 解析失败，忽略
        }
      }

      // 调整质量分数
      content.adjustedScore = content.qualityScore + (diversityBonus * diversityFactor);
      result.push(content);
    }

    // 重新按调整后的分数排序
    return result.sort((a, b) => b.adjustedScore - a.adjustedScore);
  }

  private getQualityDistribution(contents: any[]) {
    const excellent = contents.filter(c => c.qualityScore >= 0.8).length;
    const good = contents.filter(c => c.qualityScore >= 0.6 && c.qualityScore < 0.8).length;
    const average = contents.filter(c => c.qualityScore >= 0.4 && c.qualityScore < 0.6).length;
    const poor = contents.filter(c => c.qualityScore < 0.4).length;

    return { excellent, good, average, poor };
  }

  private getSourceDistribution(contents: any[]) {
    const distribution: Record<string, number> = {};
    for (const content of contents) {
      distribution[content.source] = (distribution[content.source] || 0) + 1;
    }
    return distribution;
  }
}

/**
 * Quality Filter Agent
 * 
 * 使用 AStack Agent 架构进行智能质量评估和内容筛选
 * 特点：
 * 1. 多维度质量评估（相关性、可信度、时效性、独特性、互动性）
 * 2. AI 驱动的智能决策
 * 3. 批量处理优化
 * 4. 多样性保证
 * 5. 详细的质量分析报告
 */
export class QualityFilterAgent extends Agent {

  constructor() {
    const config: AgentConfig = {
      model: new ModelProvider.Deepseek({
        apiKey: process.env.DEEPSEEK_API_KEY || '',
        model: 'deepseek-chat',
        temperature: 0.2
      }),
      tools: [
        new ContentQualityTool(),
        new ContentRankingTool()
      ],
      maxIterations: 3, // 明确限制最大迭代次数
      iterationTimeout: 30000, // 单次迭代超时30秒
      systemPrompt: `你是一个专业的内容质量评估专家，具备严格的质量标准和客观的评判能力。

## 🎯 专业使命
对搜索收集的内容进行多维度质量评估，确保只有最高质量的内容能够通过筛选。

## 📊 评估维度 (权重)
1. **相关性 (30%)**: 内容与搜索关键字的匹配度
2. **可信度 (25%)**: 来源的权威性和内容的可靠性
3. **时效性 (20%)**: 内容的新鲜度和时间相关性
4. **独特性 (15%)**: 内容的原创性和独特见解
5. **互动性 (10%)**: 内容的参与度和社区反响

## 🔍 评估方法
1. **内容分析**:
   - 关键词匹配度计算
   - 语义相关性分析
   - 内容深度和完整性检查

2. **来源评估**:
   - 域名权威性检查
   - 作者信誉度分析
   - 发布平台可信度

3. **时效性验证**:
   - 发布时间验证
   - 内容更新频率
   - 话题时效性判断

4. **质量综合**:
   - 多维度加权计算
   - 质量阈值判断
   - 排序和推荐等级

## 🎯 质量标准
- **优秀** (≥0.9): 必须包含的高质量内容
- **良好** (≥0.8): 推荐包含的质量内容
- **可接受** (≥0.7): 可选包含的一般内容
- **不合格** (<0.7): 排除的低质量内容

## 🚫 排除条件
- 垃圾和广告内容
- 重复和抄袭内容
- 过时和无效信息
- 不相关和偏题内容

## 📈 优化建议
基于评估结果提供搜索策略优化建议，帮助提升整体内容质量。

你的任务是确保只有最有价值的内容能够被推荐给用户。`,
      maxIterations: 3,
      verbose: true
    };

    super(config);

    // 添加输出端口
    Component.Port.O('filtered').attach(this);
    Component.Port.O('analysis').attach(this);
  }

  /**
   * 执行质量过滤任务
   */
  async filterContent(input: QualityFilterInput): Promise<QualityFilterOutput> {
    console.log('✨ Quality Filter Agent 开始质量评估...');
    
    // 聚合所有搜索结果的内容
    const allContents: SearchContent[] = [];
    if (input.googleResults?.contents) allContents.push(...input.googleResults.contents);
    if (input.twitterResults?.contents) allContents.push(...input.twitterResults.contents);
    if (input.githubResults?.contents) allContents.push(...input.githubResults.contents);
    
    console.log('📊 输入内容数量:', allContents.length);
    console.log('🎯 质量阈值:', input.strategy?.qualityThreshold || 0.6);

    // 构建 Agent 消息
    const userMessage = `请对以下搜索内容进行全面的质量评估和筛选：

内容数量: ${allContents.length}
搜索策略: ${JSON.stringify(input.strategy, null, 2)}
质量要求: ${input.qualityRequirements || '标准质量评估'}

请按照以下步骤执行：
1. 使用 assess_content_quality 工具对所有内容进行质量评估
2. 分析评估结果，识别高质量内容的特征
3. 使用 rank_and_filter_content 工具进行智能排序和筛选
4. 生成详细的质量分析报告

请确保：
- 评估标准与搜索策略保持一致
- 保持内容的多样性和代表性
- 优先选择 24 小时内的新鲜内容
- 提供清晰的质量改进建议`;

    try {
      // 使用 Agent 的智能分析能力，设置明确的超时和迭代限制
      const agentOutput = await Promise.race([
        super.run(userMessage),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('质量过滤Agent执行超时')), 30000)
        )
      ]) as any;
      
      console.log('🧠 Agent 分析完成:', agentOutput.message);
      console.log('🔧 工具调用次数:', agentOutput.toolCalls?.length || 0);

      // 检查工具调用是否成功
      if (!agentOutput.toolCalls || agentOutput.toolCalls.length === 0) {
        console.warn('⚠️ Agent 未进行工具调用，使用备选筛选策略');
        return this.generateFallbackFilter(input);
      }

      // 从工具调用结果中提取数据
      const { filteredContents, qualityAnalysis } = this.extractFilterResults(agentOutput, input);

      const output: QualityFilterOutput = {
        filteredContents,
        qualityAnalysis,
        summary: {
          totalInput: allContents.length,
          totalOutput: filteredContents.length,
          filterRate: filteredContents.length / allContents.length,
          processingTime: new Date(),
          qualityThreshold: input.strategy?.qualityThreshold || 0.6
        }
      };

      console.log('✅ Quality Filter Agent 完成');
      console.log(`   📊 筛选结果: ${output.summary.totalOutput}/${output.summary.totalInput} (${Math.round(output.summary.filterRate * 100)}%)`);

      return output;

    } catch (error) {
      console.error('❌ Quality Filter Agent 失败:', error);
      
      // 返回基础筛选结果
      return this.generateFallbackFilter(input);
    }
  }

  /**
   * 从 Agent 输出中提取筛选结果
   */
  private extractFilterResults(agentOutput: any, input: QualityFilterInput): {
    filteredContents: SearchContent[];
    qualityAnalysis: any;
  } {
    // 获取质量评估结果
    const qualityTool = agentOutput.toolCalls?.find(
      (call: any) => call.tool === 'assess_content_quality'
    );

    // 获取排序筛选结果
    const rankingTool = agentOutput.toolCalls?.find(
      (call: any) => call.tool === 'rank_and_filter_content'
    );

    if (!qualityTool || !rankingTool) {
      console.warn('⚠️ Agent 工具调用不完整，使用默认结果');
      console.log(`   - 质量评估工具: ${qualityTool ? '✅' : '❌'}`);
      console.log(`   - 排序筛选工具: ${rankingTool ? '✅' : '❌'}`);
      console.log(`   - 工具调用总数: ${agentOutput.toolCalls?.length || 0}`);
      
      // 返回基本的默认结果而不是抛出错误
      return {
        filteredContents: input.contents || [], // 使用原始内容
        qualityAnalysis: {
          assessments: [],
          qualityStats: { totalAssessed: 0, averageScore: 0.6, scoreDistribution: {} },
          rankingStats: { totalRanked: input.contents?.length || 0, filteredCount: 0 },
          aiInsights: { summary: '工具调用失败，使用默认筛选', keyInsights: [], recommendations: [] },
          recommendations: ['建议检查AI Agent配置和工具调用逻辑']
        }
      };
    }

    const qualityResult = qualityTool.result;
    const rankingResult = rankingTool.result;

    return {
      filteredContents: rankingResult.rankedContents || [],
      qualityAnalysis: {
        assessments: qualityResult.assessments || [],
        qualityStats: qualityResult.qualityStats || {},
        rankingStats: rankingResult.rankingStats || {},
        aiInsights: this.extractAIInsights(agentOutput.message),
        recommendations: this.generateRecommendations(qualityResult.qualityStats)
      }
    };
  }

  /**
   * 提取 AI 洞察
   */
  private extractAIInsights(agentMessage: string): string[] {
    const insights: string[] = [];
    
    // 从 Agent 回复中提取关键洞察
    const lines = agentMessage.split('\n');
    for (const line of lines) {
      if (line.includes('发现') || line.includes('分析') || line.includes('建议')) {
        insights.push(line.trim());
      }
    }

    return insights.length > 0 ? insights : ['AI 分析正常完成'];
  }

  /**
   * 生成改进建议
   */
  private generateRecommendations(qualityStats: any): string[] {
    const recommendations: string[] = [];

    if (!qualityStats.averageScores) {
      return ['无法生成建议：缺少质量统计数据'];
    }

    const avgScores = qualityStats.averageScores;

    if (avgScores.relevance < 0.7) {
      recommendations.push('建议优化关键字策略以提高相关性');
    }

    if (avgScores.credibility < 0.7) {
      recommendations.push('建议增加权威来源的搜索权重');
    }

    if (avgScores.freshness < 0.7) {
      recommendations.push('建议缩短时间窗口，关注更新鲜的内容');
    }

    if (avgScores.uniqueness < 0.6) {
      recommendations.push('建议扩展搜索范围以获得更独特的内容');
    }

    if (avgScores.engagement < 0.6) {
      recommendations.push('建议关注社区参与度更高的内容');
    }

    if (qualityStats.passedFilter < qualityStats.totalAssessed * 0.3) {
      recommendations.push('质量通过率较低，建议降低质量阈值或调整搜索策略');
    }

    return recommendations.length > 0 ? recommendations : ['当前质量评估表现良好'];
  }

  /**
   * 备选筛选策略
   */
  private generateFallbackFilter(input: QualityFilterInput): QualityFilterOutput {
    console.log('⚠️ 使用备选质量筛选策略');

    const threshold = input.strategy?.qualityThreshold || 0.6;
    
    // 聚合所有内容
    const allContents: SearchContent[] = [];
    if (input.googleResults?.contents) allContents.push(...input.googleResults.contents);
    if (input.twitterResults?.contents) allContents.push(...input.twitterResults.contents);
    if (input.githubResults?.contents) allContents.push(...input.githubResults.contents);
    
    // 最小化过滤，保留更多内容
    const filteredContents = allContents
      .filter(content => {
        // 只做最基本的有效性检查
        if (!content.content) return false; // 内容不能为空
        if (!content.title) return false; // 标题不能为空
        if (!content.url) return false; // 链接不能为空
        
        return true;
      })
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime()) // 按时间排序
      // .slice(0, 100); // 大幅增加数量限制

    return {
      filteredContents,
      qualityAnalysis: {
        assessments: [],
        qualityStats: {
          totalAssessed: allContents.length,
          passedFilter: filteredContents.length,
          filterRate: filteredContents.length / allContents.length
        },
        aiInsights: ['使用了备选筛选策略'],
        recommendations: ['建议检查 DeepSeek API 配置']
      },
      summary: {
        totalInput: allContents.length,
        totalOutput: filteredContents.length,
        filterRate: filteredContents.length / allContents.length,
        processingTime: new Date(),
        qualityThreshold: threshold
      }
    };
  }

  /**
   * Component 数据转换逻辑
   */
  _transform($i: any, $o: any): void {
    $i('in').receive(async (input: QualityFilterInput) => {
      try {
        console.log(`[QualityFilterAgent] 开始质量筛选任务`);
        
        const result = await this.filterContent(input);
        
        console.log(`[QualityFilterAgent] 筛选完成: ${result.summary.totalOutput} 个高质量内容`);
        
        // 发送筛选结果
        $o('filtered').send({
          contents: result.filteredContents,
          summary: result.summary
        });
        
        // 发送分析报告
        $o('analysis').send(result.qualityAnalysis);
        
      } catch (error) {
        console.error(
          `[QualityFilterAgent] 处理失败: ${error instanceof Error ? error.message : String(error)}`
        );
        throw error;
      }
    });
  }
}

export default QualityFilterAgent;