import { Component } from '@astack-tech/core';

/**
 * 关键字处理器输入
 */
export interface KeywordProcessorInput {
  /**
   * 原始关键字输入
   */
  rawKeywords: string | string[];
  
  /**
   * 处理选项
   */
  options?: {
    /**
     * 最小关键字数量
     */
    minKeywords?: number;
    
    /**
     * 最大关键字数量
     */
    maxKeywords?: number;
    
    /**
     * 是否移除停用词
     */
    removeStopWords?: boolean;
    
    /**
     * 是否标准化格式
     */
    normalize?: boolean;
    
    /**
     * 自定义停用词列表
     */
    customStopWords?: string[];
  };
}

/**
 * 关键字处理器输出
 */
export interface KeywordProcessorOutput {
  /**
   * 处理后的关键字数组
   */
  processedKeywords: string[];
  
  /**
   * 原始关键字数组
   */
  originalKeywords: string[];
  
  /**
   * 处理统计信息
   */
  stats: {
    originalCount: number;
    processedCount: number;
    removedCount: number;
    removedWords: string[];
  };
  
  /**
   * 关键字分析
   */
  analysis: {
    /**
     * 领域分类
     */
    domains: string[];
    
    /**
     * 复杂度评分 (0-1)
     */
    complexity: number;
    
    /**
     * 时效性指标
     */
    timeRelevance: 'low' | 'medium' | 'high';
    
    /**
     * 技术相关度
     */
    techRelevance: number;
  };
}

/**
 * 关键字处理器组件
 * 
 * 功能：
 * 1. 标准化关键字格式
 * 2. 移除停用词和无效词
 * 3. 分析关键字语义特征
 * 4. 提供智能关键字建议
 */
export class KeywordProcessor extends Component {
  private stopWords: Set<string>;
  private techKeywords: Set<string>;
  private timeKeywords: Set<string>;
  private domainKeywords: Map<string, string[]>;

  constructor() {
    super({});

    // 初始化停用词表
    this.stopWords = new Set([
      'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
      'of', 'with', 'by', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
      'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
      'should', 'may', 'might', 'must', 'can', 'this', 'that', 'these',
      'those', 'i', 'you', 'he', 'she', 'it', 'we', 'they', 'me', 'him',
      'her', 'us', 'them', 'my', 'your', 'his', 'her', 'its', 'our', 'their',
      // 中文停用词
      '的', '了', '在', '是', '我', '有', '和', '就', '不', '人', '都', '一',
      '一个', '上', '也', '很', '到', '说', '要', '去', '你', '会', '着', '没有',
      '看', '好', '自己', '这'
    ]);

    // 技术相关关键字
    this.techKeywords = new Set([
      'api', 'framework', 'library', 'code', 'programming', 'development',
      'software', 'app', 'web', 'mobile', 'algorithm', 'data', 'ai', 'ml',
      'machine learning', 'artificial intelligence', 'deep learning',
      'neural network', 'llm', 'gpt', 'agent', 'automation', 'robot',
      'javascript', 'python', 'typescript', 'react', 'vue', 'angular',
      'node', 'npm', 'github', 'git', 'docker', 'kubernetes', 'aws',
      'azure', 'cloud', 'database', 'sql', 'nosql', 'mongodb', 'redis'
    ]);

    // 时效性关键字
    this.timeKeywords = new Set([
      'latest', 'new', 'recent', 'update', 'release', 'announcement',
      'breaking', 'today', 'yesterday', 'this week', 'this month',
      '2024', '2025', 'current', 'now', 'just released', 'beta',
      'alpha', 'preview', 'stable', 'version', 'v1', 'v2'
    ]);

    // 领域分类关键字
    this.domainKeywords = new Map([
      ['technology', ['ai', 'machine learning', 'programming', 'software', 'app', 'web', 'mobile', 'code']],
      ['business', ['startup', 'company', 'market', 'investment', 'funding', 'revenue', 'growth']],
      ['science', ['research', 'study', 'paper', 'journal', 'experiment', 'discovery', 'theory']],
      ['news', ['breaking', 'announcement', 'update', 'report', 'story', 'article']],
      ['social', ['community', 'discussion', 'forum', 'reddit', 'twitter', 'social media']],
      ['education', ['tutorial', 'course', 'learning', 'guide', 'documentation', 'example']]
    ]);

    // 配置端口
    Component.Port.I('input').attach(this);
    Component.Port.O('output').attach(this);
  }

  /**
   * 标准化关键字
   */
  private normalizeKeywords(keywords: string[]): string[] {
    return keywords.map(keyword => {
      // 转换为小写
      let normalized = keyword.toLowerCase();
      
      // 移除多余空格
      normalized = normalized.trim().replace(/\s+/g, ' ');
      
      // 移除特殊字符（保留字母、数字、空格、连字符）
      normalized = normalized.replace(/[^\w\s\-\u4e00-\u9fff]/g, '');
      
      return normalized;
    }).filter(keyword => keyword.length > 0);
  }

  /**
   * 移除停用词
   */
  private removeStopWords(keywords: string[], customStopWords?: string[]): {
    filtered: string[];
    removed: string[];
  } {
    const allStopWords = new Set([
      ...this.stopWords,
      ...(customStopWords || [])
    ]);

    const filtered: string[] = [];
    const removed: string[] = [];

    for (const keyword of keywords) {
      if (allStopWords.has(keyword) || keyword.length < 2) {
        removed.push(keyword);
      } else {
        filtered.push(keyword);
      }
    }

    return { filtered, removed };
  }

  /**
   * 分析关键字特征
   */
  private analyzeKeywords(keywords: string[]): KeywordProcessorOutput['analysis'] {
    const domains: string[] = [];
    let techScore = 0;
    let timeScore = 0;

    // 计算各种得分
    for (const keyword of keywords) {
      // 技术相关度
      if (this.techKeywords.has(keyword)) {
        techScore += 1;
      }
      
      // 时效性得分
      if (this.timeKeywords.has(keyword)) {
        timeScore += 1;
      }

      // 领域分类
      for (const [domain, domainWords] of this.domainKeywords) {
        if (domainWords.some(word => keyword.includes(word) || word.includes(keyword))) {
          if (!domains.includes(domain)) {
            domains.push(domain);
          }
        }
      }
    }

    // 标准化得分
    const techRelevance = Math.min(techScore / keywords.length, 1);
    const timeRelevance = timeScore > 0 ? 'high' : 
                         keywords.some(k => /\d{4}/.test(k)) ? 'medium' : 'low';
    
    // 复杂度评分（基于关键字数量和语义多样性）
    const complexity = Math.min(
      (keywords.length / 10) + (domains.length / 6) + (techRelevance * 0.3),
      1
    );

    return {
      domains,
      complexity,
      timeRelevance: timeRelevance as 'low' | 'medium' | 'high',
      techRelevance
    };
  }

  /**
   * 处理关键字输入
   */
  private processRawInput(rawKeywords: string | string[]): string[] {
    let keywords: string[];

    if (typeof rawKeywords === 'string') {
      // 尝试解析 JSON 格式
      try {
        const parsed = JSON.parse(rawKeywords);
        if (Array.isArray(parsed)) {
          keywords = parsed;
        } else {
          throw new Error('Not an array');
        }
      } catch {
        // 按分隔符分割字符串
        keywords = rawKeywords
          .split(/[,;|\n\t]/)
          .map(k => k.trim())
          .filter(k => k.length > 0);
      }
    } else {
      keywords = [...rawKeywords];
    }

    return keywords;
  }

  /**
   * 独立运行组件
   */
  async run(input: KeywordProcessorInput): Promise<KeywordProcessorOutput> {
    console.log('🔍 关键字处理器开始工作...');
    
    const options = {
      minKeywords: 1,
      maxKeywords: 20,
      removeStopWords: true,
      normalize: true,
      ...input.options
    };

    try {
      // 处理原始输入
      const originalKeywords = this.processRawInput(input.rawKeywords);
      console.log('📝 原始关键字:', originalKeywords);

      if (originalKeywords.length === 0) {
        throw new Error('没有有效的关键字输入');
      }

      // 标准化处理
      let processedKeywords = options.normalize ? 
        this.normalizeKeywords(originalKeywords) : 
        [...originalKeywords];

      // 移除停用词
      let removedWords: string[] = [];
      if (options.removeStopWords) {
        const result = this.removeStopWords(processedKeywords, options.customStopWords);
        processedKeywords = result.filtered;
        removedWords = result.removed;
      }

      // 确保关键字数量在合理范围内
      if (processedKeywords.length < options.minKeywords) {
        throw new Error(`关键字数量不足，至少需要 ${options.minKeywords} 个有效关键字`);
      }

      if (processedKeywords.length > options.maxKeywords) {
        console.warn(`⚠️ 关键字数量过多，截取前 ${options.maxKeywords} 个`);
        processedKeywords = processedKeywords.slice(0, options.maxKeywords);
      }

      // 分析关键字特征
      const analysis = this.analyzeKeywords(processedKeywords);

      const output: KeywordProcessorOutput = {
        processedKeywords,
        originalKeywords,
        stats: {
          originalCount: originalKeywords.length,
          processedCount: processedKeywords.length,
          removedCount: removedWords.length,
          removedWords
        },
        analysis
      };

      console.log('✅ 关键字处理完成:');
      console.log('   - 处理后数量:', output.stats.processedCount);
      console.log('   - 技术相关度:', output.analysis.techRelevance.toFixed(2));
      console.log('   - 时效性:', output.analysis.timeRelevance);
      console.log('   - 领域分类:', output.analysis.domains.join(', '));

      return output;

    } catch (error) {
      console.error('❌ 关键字处理失败:', error);
      throw new Error(`关键字处理失败: ${error instanceof Error ? error.message : '未知错误'}`);
    }
  }

  /**
   * 在流水线中运行组件
   */
  _transform($i: any, $o: any): void {
    $i('input').receive(async (input: KeywordProcessorInput) => {
      try {
        const output = await this.run(input);
        $o('output').send(output);
      } catch (error) {
        console.error(
          `[KeywordProcessor] 处理失败: ${error instanceof Error ? error.message : String(error)}`
        );
        throw error;
      }
    });
  }

  /**
   * 获取建议关键字
   */
  getSuggestedKeywords(domain?: string): string[] {
    if (!domain) {
      return Array.from(this.techKeywords).slice(0, 10);
    }

    const domainWords = this.domainKeywords.get(domain);
    return domainWords ? [...domainWords] : [];
  }

  /**
   * 验证关键字质量
   */
  validateKeywords(keywords: string[]): {
    isValid: boolean;
    issues: string[];
    suggestions: string[];
  } {
    const issues: string[] = [];
    const suggestions: string[] = [];

    if (keywords.length === 0) {
      issues.push('没有提供关键字');
      suggestions.push('至少提供一个有效的关键字');
    }

    if (keywords.length > 20) {
      issues.push('关键字数量过多');
      suggestions.push('建议控制在 20 个以内以获得最佳效果');
    }

    const duplicates = keywords.filter((keyword, index) => 
      keywords.indexOf(keyword) !== index
    );
    if (duplicates.length > 0) {
      issues.push('存在重复关键字');
      suggestions.push(`移除重复的关键字: ${duplicates.join(', ')}`);
    }

    const tooShort = keywords.filter(k => k.length < 2);
    if (tooShort.length > 0) {
      issues.push('某些关键字过短');
      suggestions.push('确保关键字长度至少为 2 个字符');
    }

    return {
      isValid: issues.length === 0,
      issues,
      suggestions
    };
  }
}

export default KeywordProcessor;