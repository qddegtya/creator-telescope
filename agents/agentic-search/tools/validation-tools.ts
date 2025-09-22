import { Tool } from '@astack-tech/tools';
import { SearchContent } from '../types/multi-agent.js';

/**
 * 内容新鲜度验证工具
 * 验证内容是否满足时效性要求
 */
export class FreshnessValidationTool implements Tool {
  name = 'validate_content_freshness';
  description = '验证内容的时效性，确保符合新鲜度要求';
  parameters = {
    type: 'object',
    properties: {
      contents: {
        type: 'array',
        items: { type: 'object' },
        description: '需要验证的内容列表'
      },
      maxAgeHours: {
        type: 'number',
        description: '最大允许年龄（小时）'
      },
      strictMode: {
        type: 'boolean',
        description: '严格模式，将移除不符合要求的内容'
      }
    },
    required: ['contents']
  };

  async invoke(args: { 
    contents: SearchContent[], 
    maxAgeHours?: number,
    strictMode?: boolean
  }) {
    const { contents, maxAgeHours = 24, strictMode = false } = args;

    console.log(`⏰ 新鲜度验证: ${contents.length} 个内容，最大年龄: ${maxAgeHours}h`);

    const now = new Date();
    const maxAgeMs = maxAgeHours * 60 * 60 * 1000;
    const cutoffTime = new Date(now.getTime() - maxAgeMs);

    const results = [];
    const freshContents = [];
    const staleContents = [];

    for (const content of contents) {
      const age = now.getTime() - content.timestamp.getTime();
      const ageHours = age / (1000 * 60 * 60);
      const isFresh = content.timestamp >= cutoffTime;

      const validation = {
        contentId: content.id,
        title: content.title,
        timestamp: content.timestamp,
        ageHours: Math.round(ageHours * 10) / 10,
        isFresh,
        freshnessScore: this.calculateFreshnessScore(ageHours, maxAgeHours),
        recommendation: this.getFreshnessRecommendation(ageHours, maxAgeHours)
      };

      results.push(validation);

      if (isFresh) {
        freshContents.push(content);
      } else {
        staleContents.push(content);
      }
    }

    // 生成统计信息
    const stats = {
      totalContents: contents.length,
      freshCount: freshContents.length,
      staleCount: staleContents.length,
      freshnessRate: freshContents.length / contents.length,
      averageAge: results.reduce((sum, r) => sum + r.ageHours, 0) / results.length,
      oldestContent: results.reduce((oldest, current) => 
        current.ageHours > oldest.ageHours ? current : oldest
      ),
      newestContent: results.reduce((newest, current) => 
        current.ageHours < newest.ageHours ? current : newest
      )
    };

    // 生成分布分析
    const ageDistribution = this.analyzeAgeDistribution(results, maxAgeHours);

    return {
      validationResults: results,
      freshContents: strictMode ? freshContents : contents,
      staleContents,
      statistics: stats,
      ageDistribution,
      recommendations: this.generateFreshnessRecommendations(stats, maxAgeHours),
      metadata: {
        maxAgeHours,
        strictMode,
        validatedAt: new Date(),
        cutoffTime
      }
    };
  }

  private calculateFreshnessScore(ageHours: number, maxAgeHours: number): number {
    if (ageHours <= 0) return 1.0;
    if (ageHours >= maxAgeHours) return 0.0;
    
    // 线性衰减
    return Math.max(0, 1 - (ageHours / maxAgeHours));
  }

  private getFreshnessRecommendation(ageHours: number, maxAgeHours: number): string {
    const ratio = ageHours / maxAgeHours;
    
    if (ratio <= 0.25) return 'excellent - 极新鲜';
    if (ratio <= 0.5) return 'good - 较新鲜';
    if (ratio <= 0.75) return 'fair - 一般';
    if (ratio <= 1.0) return 'poor - 接近过期';
    return 'stale - 已过期';
  }

  private analyzeAgeDistribution(results: any[], maxAgeHours: number): any {
    const bins = {
      '0-6h': 0,
      '6-12h': 0,
      '12-24h': 0,
      '24-48h': 0,
      '48h+': 0
    };

    results.forEach(result => {
      const hours = result.ageHours;
      
      if (hours <= 6) bins['0-6h']++;
      else if (hours <= 12) bins['6-12h']++;
      else if (hours <= 24) bins['12-24h']++;
      else if (hours <= 48) bins['24-48h']++;
      else bins['48h+']++;
    });

    return {
      bins,
      percentages: Object.fromEntries(
        Object.entries(bins).map(([key, count]) => [
          key, 
          Math.round((count / results.length) * 100)
        ])
      )
    };
  }

  private generateFreshnessRecommendations(stats: any, maxAgeHours: number): string[] {
    const recommendations = [];

    if (stats.freshnessRate < 0.5) {
      recommendations.push('新鲜度不足，建议缩短搜索时间窗口');
    }

    if (stats.averageAge > maxAgeHours * 0.8) {
      recommendations.push('平均内容年龄偏高，建议增加实时搜索频率');
    }

    if (stats.staleCount > stats.totalContents * 0.3) {
      recommendations.push('过期内容比例较高，建议优化搜索策略');
    }

    if (stats.freshnessRate > 0.8) {
      recommendations.push('新鲜度表现良好，保持当前搜索策略');
    }

    return recommendations.length > 0 ? recommendations : ['内容新鲜度验证正常'];
  }
}

/**
 * 内容质量验证工具
 * 验证内容的基本质量指标
 */
export class QualityValidationTool implements Tool {
  name = 'validate_content_quality';
  description = '验证内容质量，检查基本质量指标和完整性';
  parameters = {
    type: 'object',
    properties: {
      contents: {
        type: 'array',
        items: { type: 'object' },
        description: '需要验证的内容列表'
      },
      qualityThreshold: {
        type: 'number',
        description: '质量阈值（0-1）'
      },
      validationRules: {
        type: 'array',
        items: { type: 'string' },
        description: '验证规则列表'
      }
    },
    required: ['contents']
  };

  async invoke(args: { 
    contents: SearchContent[], 
    qualityThreshold?: number,
    validationRules?: string[]
  }) {
    const { 
      contents, 
      qualityThreshold = 0.6,
      validationRules = ['completeness', 'readability', 'relevance', 'authenticity']
    } = args;

    console.log(`✅ 质量验证: ${contents.length} 个内容`);

    const results = [];
    const passedContents = [];
    const failedContents = [];

    for (const content of contents) {
      const validation = await this.validateSingleContent(content, validationRules, qualityThreshold);
      
      results.push(validation);

      if (validation.overallScore >= qualityThreshold) {
        passedContents.push({
          ...content,
          qualityValidation: validation
        });
      } else {
        failedContents.push({
          ...content,
          qualityValidation: validation
        });
      }
    }

    // 生成质量统计
    const stats = this.generateQualityStats(results, qualityThreshold);

    // 识别质量问题
    const qualityIssues = this.identifyQualityIssues(results);

    return {
      validationResults: results,
      passedContents,
      failedContents,
      statistics: stats,
      qualityIssues,
      recommendations: this.generateQualityRecommendations(stats, qualityIssues),
      metadata: {
        qualityThreshold,
        validationRules,
        validatedAt: new Date()
      }
    };
  }

  private async validateSingleContent(
    content: SearchContent, 
    rules: string[], 
    threshold: number
  ): Promise<any> {
    const scores: Record<string, number> = {};
    const issues: string[] = [];

    // 完整性验证
    if (rules.includes('completeness')) {
      scores.completeness = this.validateCompleteness(content, issues);
    }

    // 可读性验证
    if (rules.includes('readability')) {
      scores.readability = this.validateReadability(content, issues);
    }

    // 相关性验证
    if (rules.includes('relevance')) {
      scores.relevance = this.validateRelevance(content, issues);
    }

    // 真实性验证
    if (rules.includes('authenticity')) {
      scores.authenticity = this.validateAuthenticity(content, issues);
    }

    // 计算总体分数
    const validScores = Object.values(scores).filter(score => score !== undefined);
    const overallScore = validScores.length > 0 ? 
      validScores.reduce((sum, score) => sum + score, 0) / validScores.length : 0;

    return {
      contentId: content.id,
      title: content.title,
      scores,
      overallScore: Math.round(overallScore * 100) / 100,
      passed: overallScore >= threshold,
      issues,
      recommendation: this.getQualityRecommendation(overallScore),
      validatedAt: new Date()
    };
  }

  private validateCompleteness(content: SearchContent, issues: string[]): number {
    let score = 1.0;

    // 检查必需字段
    if (!content.title || content.title.trim().length === 0) {
      score -= 0.3;
      issues.push('缺少标题');
    }

    if (!content.content || content.content.trim().length === 0) {
      score -= 0.4;
      issues.push('缺少内容');
    }

    if (!content.url || !this.isValidUrl(content.url)) {
      score -= 0.2;
      issues.push('URL 无效或缺失');
    }

    if (!content.source) {
      score -= 0.1;
      issues.push('缺少来源信息');
    }

    // 检查内容长度
    if (content.content && content.content.length < 50) {
      score -= 0.2;
      issues.push('内容过短');
    }

    return Math.max(0, score);
  }

  private validateReadability(content: SearchContent, issues: string[]): number {
    let score = 0.8; // 基础分

    const text = content.content;
    if (!text) return 0;

    // 检查文本质量
    const words = text.split(/\s+/).filter(word => word.length > 0);
    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
    
    // 平均句长
    const avgSentenceLength = words.length / Math.max(sentences.length, 1);
    if (avgSentenceLength > 30) {
      score -= 0.1;
      issues.push('句子过长，影响可读性');
    }

    // 检查是否有过多的特殊字符
    const specialCharRatio = (text.match(/[^\w\s.!?,-]/g) || []).length / text.length;
    if (specialCharRatio > 0.1) {
      score -= 0.2;
      issues.push('包含过多特殊字符');
    }

    // 检查编码问题
    if (text.includes('�') || text.includes('\\u')) {
      score -= 0.3;
      issues.push('存在编码问题');
    }

    // 检查重复内容
    const uniqueWords = new Set(words.map(w => w.toLowerCase())).size;
    const repetitionRatio = uniqueWords / words.length;
    if (repetitionRatio < 0.3) {
      score -= 0.2;
      issues.push('内容重复度过高');
    }

    return Math.max(0, score);
  }

  private validateRelevance(content: SearchContent, issues: string[]): number {
    let score = 0.7; // 基础相关性分

    // 这里可以基于关键词匹配来判断相关性
    // 简化实现：检查内容是否与技术相关
    const techKeywords = [
      'technology', 'software', 'programming', 'development', 'api', 'framework',
      'library', 'tool', 'application', 'system', 'platform', 'service'
    ];

    const text = `${content.title} ${content.content}`.toLowerCase();
    const matchedKeywords = techKeywords.filter(keyword => text.includes(keyword));

    if (matchedKeywords.length === 0) {
      score -= 0.3;
      issues.push('与技术主题相关性较低');
    } else if (matchedKeywords.length >= 3) {
      score += 0.2;
    }

    // 检查是否为垃圾内容
    const spamIndicators = ['click here', 'buy now', 'limited time', 'special offer'];
    const spamMatches = spamIndicators.filter(indicator => text.includes(indicator));
    
    if (spamMatches.length > 0) {
      score -= 0.4;
      issues.push('疑似垃圾内容');
    }

    return Math.max(0, Math.min(1, score));
  }

  private validateAuthenticity(content: SearchContent, issues: string[]): number {
    let score = 0.8; // 基础真实性分

    // 检查来源可信度
    const trustedDomains = [
      'github.com', 'stackoverflow.com', 'medium.com', 'dev.to',
      'twitter.com', 'reddit.com', 'news.ycombinator.com'
    ];

    try {
      const url = new URL(content.url);
      const domain = url.hostname.toLowerCase();
      
      if (trustedDomains.some(trusted => domain.includes(trusted))) {
        score += 0.1;
      } else {
        // 检查是否为可疑域名
        if (domain.includes('spam') || domain.includes('fake') || domain.length < 5) {
          score -= 0.3;
          issues.push('来源域名可信度较低');
        }
      }
    } catch (error) {
      score -= 0.2;
      issues.push('URL 格式异常');
    }

    // 检查作者信息
    if (content.author && content.author.trim().length > 0) {
      score += 0.1;
    } else {
      score -= 0.1;
      issues.push('缺少作者信息');
    }

    // 检查时间戳合理性
    const now = new Date();
    const maxFutureTime = new Date(now.getTime() + 24 * 60 * 60 * 1000); // 允许 24 小时误差
    
    if (content.timestamp > maxFutureTime) {
      score -= 0.3;
      issues.push('时间戳异常（未来时间）');
    }

    return Math.max(0, score);
  }

  private isValidUrl(url: string): boolean {
    try {
      new URL(url);
      return true;
    } catch (error) {
      return false;
    }
  }

  private getQualityRecommendation(score: number): string {
    if (score >= 0.9) return 'excellent - 优秀质量';
    if (score >= 0.8) return 'good - 良好质量';
    if (score >= 0.7) return 'acceptable - 可接受质量';
    if (score >= 0.6) return 'fair - 一般质量';
    return 'poor - 质量不佳';
  }

  private generateQualityStats(results: any[], threshold: number): any {
    const total = results.length;
    const passed = results.filter(r => r.passed).length;
    
    const avgScores = {
      overall: results.reduce((sum, r) => sum + r.overallScore, 0) / total
    };

    // 计算各维度平均分
    const dimensions = ['completeness', 'readability', 'relevance', 'authenticity'];
    dimensions.forEach(dim => {
      const scores = results
        .map(r => r.scores[dim])
        .filter(score => score !== undefined);
      
      if (scores.length > 0) {
        avgScores[dim] = scores.reduce((sum, score) => sum + score, 0) / scores.length;
      }
    });

    return {
      totalValidated: total,
      passedCount: passed,
      failedCount: total - passed,
      passRate: passed / total,
      averageScores: avgScores,
      qualityThreshold: threshold
    };
  }

  private identifyQualityIssues(results: any[]): any {
    const issueFrequency: Record<string, number> = {};
    const totalIssues = results.reduce((sum, r) => sum + r.issues.length, 0);

    results.forEach(result => {
      result.issues.forEach((issue: string) => {
        issueFrequency[issue] = (issueFrequency[issue] || 0) + 1;
      });
    });

    const sortedIssues = Object.entries(issueFrequency)
      .sort(([,a], [,b]) => b - a)
      .map(([issue, count]) => ({
        issue,
        count,
        percentage: Math.round((count / results.length) * 100)
      }));

    return {
      totalIssues,
      averageIssuesPerContent: totalIssues / results.length,
      mostCommonIssues: sortedIssues.slice(0, 5),
      issueDistribution: issueFrequency
    };
  }

  private generateQualityRecommendations(stats: any, issues: any): string[] {
    const recommendations = [];

    if (stats.passRate < 0.5) {
      recommendations.push('质量通过率较低，建议提高搜索源的质量标准');
    }

    if (stats.averageScores.completeness < 0.7) {
      recommendations.push('内容完整性不足，建议改进数据提取流程');
    }

    if (stats.averageScores.readability < 0.7) {
      recommendations.push('内容可读性有待提高，建议增加文本清洗步骤');
    }

    if (issues.mostCommonIssues.length > 0) {
      const topIssue = issues.mostCommonIssues[0];
      recommendations.push(`需要重点关注：${topIssue.issue}（${topIssue.percentage}% 的内容存在此问题）`);
    }

    if (stats.passRate > 0.8) {
      recommendations.push('内容质量表现良好，保持当前验证标准');
    }

    return recommendations.length > 0 ? recommendations : ['质量验证正常完成'];
  }
}

/**
 * 重复内容检测工具
 * 检测和标记重复或相似的内容
 */
export class DuplicationDetectionTool implements Tool {
  name = 'detect_content_duplication';
  description = '检测重复内容，识别相似度过高的内容项';
  parameters = {
    type: 'object',
    properties: {
      contents: {
        type: 'array',
        items: { type: 'object' },
        description: '需要检测的内容列表'
      },
      similarityThreshold: {
        type: 'number',
        description: '相似度阈值（0-1）'
      },
      detectionMethod: {
        type: 'string',
        enum: ['exact', 'fuzzy', 'semantic'],
        description: '检测方法'
      }
    },
    required: ['contents']
  };

  async invoke(args: { 
    contents: SearchContent[], 
    similarityThreshold?: number,
    detectionMethod?: 'exact' | 'fuzzy' | 'semantic'
  }) {
    const { 
      contents, 
      similarityThreshold = 0.8,
      detectionMethod = 'fuzzy'
    } = args;

    console.log(`🔍 重复检测: ${contents.length} 个内容，相似度阈值: ${similarityThreshold}`);

    const duplicateGroups: SearchContent[][] = [];
    const uniqueContents: SearchContent[] = [];
    const similarityMatrix: number[][] = [];

    // 构建相似度矩阵
    for (let i = 0; i < contents.length; i++) {
      similarityMatrix[i] = [];
      for (let j = 0; j < contents.length; j++) {
        if (i === j) {
          similarityMatrix[i][j] = 1.0;
        } else {
          similarityMatrix[i][j] = this.calculateSimilarity(
            contents[i], 
            contents[j], 
            detectionMethod
          );
        }
      }
    }

    // 检测重复组
    const processed = new Set<number>();
    
    for (let i = 0; i < contents.length; i++) {
      if (processed.has(i)) continue;

      const duplicates = [contents[i]];
      processed.add(i);

      for (let j = i + 1; j < contents.length; j++) {
        if (processed.has(j)) continue;

        if (similarityMatrix[i][j] >= similarityThreshold) {
          duplicates.push(contents[j]);
          processed.add(j);
        }
      }

      if (duplicates.length > 1) {
        duplicateGroups.push(duplicates);
        // 选择最佳代表
        const representative = this.selectBestRepresentative(duplicates);
        uniqueContents.push(representative);
      } else {
        uniqueContents.push(duplicates[0]);
      }
    }

    // 生成检测统计
    const stats = this.generateDuplicationStats(contents, duplicateGroups, uniqueContents);

    return {
      uniqueContents,
      duplicateGroups,
      similarityMatrix,
      statistics: stats,
      recommendations: this.generateDuplicationRecommendations(stats),
      metadata: {
        similarityThreshold,
        detectionMethod,
        detectedAt: new Date()
      }
    };
  }

  private calculateSimilarity(
    content1: SearchContent, 
    content2: SearchContent, 
    method: string
  ): number {
    switch (method) {
      case 'exact':
        return this.exactSimilarity(content1, content2);
      case 'fuzzy':
        return this.fuzzySimilarity(content1, content2);
      case 'semantic':
        return this.semanticSimilarity(content1, content2);
      default:
        return this.fuzzySimilarity(content1, content2);
    }
  }

  private exactSimilarity(content1: SearchContent, content2: SearchContent): number {
    // 完全匹配检测
    if (content1.url === content2.url) return 1.0;
    if (content1.title === content2.title && content1.content === content2.content) return 1.0;
    return 0.0;
  }

  private fuzzySimilarity(content1: SearchContent, content2: SearchContent): number {
    // 基于 Jaccard 相似度的模糊匹配
    const text1 = `${content1.title} ${content1.content}`.toLowerCase();
    const text2 = `${content2.title} ${content2.content}`.toLowerCase();

    const words1 = new Set(text1.split(/\s+/).filter(w => w.length > 2));
    const words2 = new Set(text2.split(/\s+/).filter(w => w.length > 2));

    const intersection = new Set([...words1].filter(word => words2.has(word)));
    const union = new Set([...words1, ...words2]);

    return intersection.size / union.size;
  }

  private semanticSimilarity(content1: SearchContent, content2: SearchContent): number {
    // 简化的语义相似度计算
    // 在实际应用中，这里应该使用词向量或句向量模型

    // 检查标题相似度
    const titleSim = this.fuzzySimilarity(
      { ...content1, content: '' },
      { ...content2, content: '' }
    );

    // 检查内容相似度
    const contentSim = this.fuzzySimilarity(
      { ...content1, title: '' },
      { ...content2, title: '' }
    );

    // 检查 URL 相似度
    const urlSim = this.calculateUrlSimilarity(content1.url, content2.url);

    // 加权平均
    return titleSim * 0.4 + contentSim * 0.4 + urlSim * 0.2;
  }

  private calculateUrlSimilarity(url1: string, url2: string): number {
    try {
      const parsed1 = new URL(url1);
      const parsed2 = new URL(url2);

      // 相同域名
      if (parsed1.hostname === parsed2.hostname) {
        // 检查路径相似度
        const path1 = parsed1.pathname.split('/').filter(p => p.length > 0);
        const path2 = parsed2.pathname.split('/').filter(p => p.length > 0);

        const commonParts = path1.filter(part => path2.includes(part)).length;
        const totalParts = Math.max(path1.length, path2.length);

        return 0.5 + (commonParts / totalParts) * 0.5; // 基础 0.5 + 路径相似度
      }

      return 0.0;
    } catch (error) {
      return 0.0;
    }
  }

  private selectBestRepresentative(duplicates: SearchContent[]): SearchContent {
    // 选择最佳代表内容
    return duplicates.reduce((best, current) => {
      // 优先选择质量分更高的
      const bestScore = (best as any).qualityScore || 0;
      const currentScore = (current as any).qualityScore || 0;
      
      if (currentScore > bestScore) return current;
      if (bestScore > currentScore) return best;

      // 质量相同时，选择更新鲜的
      if (current.timestamp > best.timestamp) return current;
      if (best.timestamp > current.timestamp) return best;

      // 时间相同时，选择内容更丰富的
      if (current.content.length > best.content.length) return current;
      
      return best;
    });
  }

  private generateDuplicationStats(
    original: SearchContent[], 
    duplicateGroups: SearchContent[][], 
    unique: SearchContent[]
  ): any {
    const totalDuplicates = duplicateGroups.reduce((sum, group) => sum + group.length - 1, 0);
    
    return {
      originalCount: original.length,
      uniqueCount: unique.length,
      duplicateGroups: duplicateGroups.length,
      totalDuplicates,
      deduplicationRate: totalDuplicates / original.length,
      compressionRatio: unique.length / original.length,
      largestDuplicateGroup: duplicateGroups.length > 0 ? 
        Math.max(...duplicateGroups.map(group => group.length)) : 0,
      averageGroupSize: duplicateGroups.length > 0 ?
        duplicateGroups.reduce((sum, group) => sum + group.length, 0) / duplicateGroups.length : 0
    };
  }

  private generateDuplicationRecommendations(stats: any): string[] {
    const recommendations = [];

    if (stats.deduplicationRate > 0.3) {
      recommendations.push('重复率较高，建议优化数据源或搜索策略');
    }

    if (stats.duplicateGroups > stats.originalCount * 0.1) {
      recommendations.push('重复组数量较多，建议加强预处理过滤');
    }

    if (stats.largestDuplicateGroup > 5) {
      recommendations.push('存在大型重复组，可能需要更严格的去重策略');
    }

    if (stats.deduplicationRate < 0.1) {
      recommendations.push('重复率较低，当前去重策略有效');
    }

    if (stats.compressionRatio > 0.9) {
      recommendations.push('内容独特性较高，搜索多样性良好');
    }

    return recommendations.length > 0 ? recommendations : ['重复检测正常完成'];
  }
}