import { Tool } from '@astack-tech/tools';
import { SearchContent } from '../types/multi-agent.js';

/**
 * 关键词扩展工具
 * 智能扩展搜索关键词以提高搜索覆盖率
 */
export class KeywordExpansionTool implements Tool {
  name = 'expand_search_keywords';
  description = '基于原始关键词智能生成扩展关键词列表';
  parameters = {
    type: 'object',
    properties: {
      keywords: {
        type: 'array',
        items: { type: 'string' },
        description: '原始关键词列表'
      },
      domain: {
        type: 'string',
        description: '领域上下文（如：AI、区块链、前端等）'
      },
      expansionLevel: {
        type: 'string',
        enum: ['conservative', 'moderate', 'aggressive'],
        description: '扩展程度'
      }
    },
    required: ['keywords']
  };

  async invoke(args: { 
    keywords: string[], 
    domain?: string,
    expansionLevel?: 'conservative' | 'moderate' | 'aggressive'
  }) {
    const { keywords, domain = 'tech', expansionLevel = 'moderate' } = args;

    console.log(`🔍 关键词扩展: ${keywords.join(', ')} (${expansionLevel})`);

    const expandedKeywords = new Set<string>(keywords);

    // 添加时间相关的变体
    for (const keyword of keywords) {
      expandedKeywords.add(`${keyword} 2024`);
      expandedKeywords.add(`${keyword} latest`);
      expandedKeywords.add(`${keyword} news`);
      expandedKeywords.add(`${keyword} update`);
    }

    // 根据领域添加相关词汇
    const domainExpansions = this.getDomainSpecificExpansions(keywords, domain);
    domainExpansions.forEach(exp => expandedKeywords.add(exp));

    // 根据扩展程度添加更多变体
    if (expansionLevel === 'moderate' || expansionLevel === 'aggressive') {
      for (const keyword of keywords) {
        // 添加技术变体
        expandedKeywords.add(`${keyword} framework`);
        expandedKeywords.add(`${keyword} library`);
        expandedKeywords.add(`${keyword} tool`);
        expandedKeywords.add(`${keyword} guide`);
        expandedKeywords.add(`${keyword} tutorial`);
      }
    }

    if (expansionLevel === 'aggressive') {
      for (const keyword of keywords) {
        // 添加更多变体
        expandedKeywords.add(`${keyword} best practices`);
        expandedKeywords.add(`${keyword} implementation`);
        expandedKeywords.add(`${keyword} comparison`);
        expandedKeywords.add(`${keyword} vs`);
        expandedKeywords.add(`how to ${keyword}`);
        expandedKeywords.add(`${keyword} example`);
      }
    }

    // 生成组合关键词
    if (keywords.length > 1 && expansionLevel !== 'conservative') {
      const combinations = this.generateCombinations(keywords);
      combinations.forEach(combo => expandedKeywords.add(combo));
    }

    const finalKeywords = Array.from(expandedKeywords);

    return {
      originalKeywords: keywords,
      expandedKeywords: finalKeywords,
      expansionCount: finalKeywords.length - keywords.length,
      metadata: {
        domain,
        expansionLevel,
        generatedAt: new Date()
      }
    };
  }

  private getDomainSpecificExpansions(keywords: string[], domain: string): string[] {
    const expansions: string[] = [];

    const domainMaps: Record<string, string[]> = {
      ai: ['artificial intelligence', 'machine learning', 'deep learning', 'neural network', 'llm'],
      blockchain: ['cryptocurrency', 'defi', 'smart contract', 'web3', 'nft'],
      frontend: ['react', 'vue', 'angular', 'javascript', 'typescript', 'css'],
      backend: ['api', 'database', 'server', 'microservice', 'cloud'],
      mobile: ['ios', 'android', 'react native', 'flutter', 'app'],
      devops: ['docker', 'kubernetes', 'ci/cd', 'deployment', 'monitoring']
    };

    const domainTerms = domainMaps[domain.toLowerCase()] || [];

    for (const keyword of keywords) {
      for (const term of domainTerms) {
        if (!keyword.toLowerCase().includes(term.toLowerCase())) {
          expansions.push(`${keyword} ${term}`);
        }
      }
    }

    return expansions;
  }

  private generateCombinations(keywords: string[]): string[] {
    const combinations: string[] = [];

    for (let i = 0; i < keywords.length; i++) {
      for (let j = i + 1; j < keywords.length; j++) {
        combinations.push(`${keywords[i]} ${keywords[j]}`);
        combinations.push(`${keywords[j]} ${keywords[i]}`);
      }
    }

    return combinations.slice(0, 10); // 限制组合数量
  }
}

/**
 * 搜索查询优化工具
 * 为不同平台生成优化的搜索查询
 */
export class SearchQueryOptimizerTool implements Tool {
  name = 'optimize_search_queries';
  description = '为不同搜索平台生成优化的搜索查询语句';
  parameters = {
    type: 'object',
    properties: {
      keywords: {
        type: 'array',
        items: { type: 'string' },
        description: '关键词列表'
      },
      platforms: {
        type: 'array',
        items: { type: 'string' },
        description: '目标平台列表'
      },
      timeFilter: {
        type: 'string',
        description: '时间过滤器（如：24h, 7d, 1m）'
      }
    },
    required: ['keywords', 'platforms']
  };

  async invoke(args: { 
    keywords: string[], 
    platforms: string[],
    timeFilter?: string
  }) {
    const { keywords, platforms, timeFilter = '24h' } = args;

    console.log(`⚙️ 查询优化: ${platforms.join(', ')} 平台`);

    const optimizedQueries: Record<string, string[]> = {};

    for (const platform of platforms) {
      optimizedQueries[platform] = await this.generatePlatformQueries(
        keywords, 
        platform, 
        timeFilter
      );
    }

    return {
      originalKeywords: keywords,
      optimizedQueries,
      platforms,
      timeFilter,
      metadata: {
        totalQueries: Object.values(optimizedQueries).flat().length,
        generatedAt: new Date()
      }
    };
  }

  private async generatePlatformQueries(
    keywords: string[], 
    platform: string, 
    timeFilter: string
  ): Promise<string[]> {
    const queries: string[] = [];

    switch (platform.toLowerCase()) {
      case 'google':
        for (const keyword of keywords) {
          // 基础查询
          queries.push(keyword);
          
          // 站点限制查询
          queries.push(`${keyword} site:github.com`);
          queries.push(`${keyword} site:stackoverflow.com`);
          queries.push(`${keyword} site:medium.com`);
          queries.push(`${keyword} site:dev.to`);
          queries.push(`${keyword} site:reddit.com`);
          
          // 时间限制查询
          if (timeFilter === '24h') {
            queries.push(`${keyword} after:${this.getDateString(1)}`);
          }
          
          // 文件类型查询
          queries.push(`${keyword} filetype:pdf`);
          queries.push(`${keyword} filetype:md`);
          
          // 引号查询（精确匹配）
          if (keyword.includes(' ')) {
            queries.push(`"${keyword}"`);
          }
        }
        break;

      case 'twitter':
        for (const keyword of keywords) {
          // 基础查询
          queries.push(keyword);
          
          // 排除转发
          queries.push(`${keyword} -filter:retweets`);
          
          // 只包含链接
          queries.push(`${keyword} filter:links`);
          
          // 只包含媒体
          queries.push(`${keyword} filter:media`);
          
          // 语言过滤
          queries.push(`${keyword} lang:en`);
          
          // 最小互动数
          queries.push(`${keyword} min_replies:2`);
          queries.push(`${keyword} min_faves:5`);
          
          // 来源过滤
          queries.push(`${keyword} from:verified`);
        }
        break;

      case 'github':
        for (const keyword of keywords) {
          // 基础查询
          queries.push(keyword);
          
          // 仓库查询
          queries.push(`${keyword} in:name`);
          queries.push(`${keyword} in:description`);
          queries.push(`${keyword} in:readme`);
          
          // 代码查询
          queries.push(`${keyword} language:TypeScript`);
          queries.push(`${keyword} language:JavaScript`);
          queries.push(`${keyword} language:Python`);
          
          // 质量过滤
          queries.push(`${keyword} stars:>50`);
          queries.push(`${keyword} stars:>100`);
          queries.push(`${keyword} forks:>10`);
          
          // 时间过滤
          if (timeFilter === '24h') {
            queries.push(`${keyword} pushed:>${this.getDateString(1)}`);
          } else if (timeFilter === '7d') {
            queries.push(`${keyword} pushed:>${this.getDateString(7)}`);
          }
          
          // 组合查询
          queries.push(`${keyword} stars:>50 language:TypeScript`);
          queries.push(`${keyword} good-first-issues:>0`);
        }
        break;

      default:
        // 通用查询
        queries.push(...keywords);
    }

    return queries.slice(0, 20); // 限制查询数量
  }

  private getDateString(daysAgo: number): string {
    const date = new Date();
    date.setDate(date.getDate() - daysAgo);
    return date.toISOString().split('T')[0];
  }
}

/**
 * 搜索结果去重工具
 * 智能识别和移除重复的搜索结果
 */
export class SearchDeduplicationTool implements Tool {
  name = 'deduplicate_search_results';
  description = '智能去重搜索结果，识别相似和重复内容';
  parameters = {
    type: 'object',
    properties: {
      contents: {
        type: 'array',
        items: { type: 'object' },
        description: '搜索结果列表'
      },
      similarityThreshold: {
        type: 'number',
        description: '相似度阈值（0-1）'
      },
      deduplicationStrategy: {
        type: 'string',
        enum: ['url', 'title', 'content', 'intelligent'],
        description: '去重策略'
      }
    },
    required: ['contents']
  };

  async invoke(args: { 
    contents: SearchContent[], 
    similarityThreshold?: number,
    deduplicationStrategy?: 'url' | 'title' | 'content' | 'intelligent'
  }) {
    const { 
      contents, 
      similarityThreshold = 0.8,
      deduplicationStrategy = 'intelligent'
    } = args;

    console.log(`🧹 搜索结果去重: ${contents.length} 个结果`);

    let deduplicatedContents: SearchContent[] = [];
    const duplicateGroups: SearchContent[][] = [];

    switch (deduplicationStrategy) {
      case 'url':
        deduplicatedContents = this.deduplicateByUrl(contents);
        break;
      
      case 'title':
        deduplicatedContents = this.deduplicateByTitle(contents, similarityThreshold);
        break;
      
      case 'content':
        const contentResult = this.deduplicateByContent(contents, similarityThreshold);
        deduplicatedContents = contentResult.unique;
        duplicateGroups.push(...contentResult.duplicateGroups);
        break;
      
      case 'intelligent':
        const intelligentResult = this.intelligentDeduplication(contents, similarityThreshold);
        deduplicatedContents = intelligentResult.unique;
        duplicateGroups.push(...intelligentResult.duplicateGroups);
        break;
    }

    return {
      originalCount: contents.length,
      deduplicatedCount: deduplicatedContents.length,
      removedCount: contents.length - deduplicatedContents.length,
      deduplicatedContents,
      duplicateGroups,
      metadata: {
        strategy: deduplicationStrategy,
        similarityThreshold,
        deduplicationRate: (contents.length - deduplicatedContents.length) / contents.length,
        processedAt: new Date()
      }
    };
  }

  private deduplicateByUrl(contents: SearchContent[]): SearchContent[] {
    const seen = new Set<string>();
    return contents.filter(content => {
      if (seen.has(content.url)) {
        return false;
      }
      seen.add(content.url);
      return true;
    });
  }

  private deduplicateByTitle(contents: SearchContent[], threshold: number): SearchContent[] {
    const unique: SearchContent[] = [];
    
    for (const content of contents) {
      const isDuplicate = unique.some(existing => 
        this.calculateTitleSimilarity(content.title, existing.title) > threshold
      );
      
      if (!isDuplicate) {
        unique.push(content);
      }
    }
    
    return unique;
  }

  private deduplicateByContent(contents: SearchContent[], threshold: number): {
    unique: SearchContent[];
    duplicateGroups: SearchContent[][];
  } {
    const unique: SearchContent[] = [];
    const duplicateGroups: SearchContent[][] = [];
    
    for (const content of contents) {
      let foundGroup = false;
      
      for (const group of duplicateGroups) {
        if (this.calculateContentSimilarity(content.content, group[0].content) > threshold) {
          group.push(content);
          foundGroup = true;
          break;
        }
      }
      
      if (!foundGroup) {
        const existingIndex = unique.findIndex(existing => 
          this.calculateContentSimilarity(content.content, existing.content) > threshold
        );
        
        if (existingIndex !== -1) {
          // 创建新的重复组
          const existing = unique[existingIndex];
          unique.splice(existingIndex, 1);
          duplicateGroups.push([existing, content]);
          // 选择质量更高的作为代表
          unique.push(this.selectBetterContent(existing, content));
        } else {
          unique.push(content);
        }
      }
    }
    
    return { unique, duplicateGroups };
  }

  private intelligentDeduplication(contents: SearchContent[], threshold: number): {
    unique: SearchContent[];
    duplicateGroups: SearchContent[][];
  } {
    // 先按 URL 去重
    let filtered = this.deduplicateByUrl(contents);
    
    // 再按内容相似度去重
    const contentResult = this.deduplicateByContent(filtered, threshold);
    
    // 最后检查标题相似度
    const titleFiltered = this.deduplicateByTitle(contentResult.unique, threshold * 0.9);
    
    return {
      unique: titleFiltered,
      duplicateGroups: contentResult.duplicateGroups
    };
  }

  private calculateTitleSimilarity(title1: string, title2: string): number {
    const words1 = title1.toLowerCase().split(/\s+/);
    const words2 = title2.toLowerCase().split(/\s+/);
    
    const intersection = words1.filter(word => words2.includes(word)).length;
    const union = new Set([...words1, ...words2]).size;
    
    return intersection / union;
  }

  private calculateContentSimilarity(content1: string, content2: string): number {
    // 简单的 Jaccard 相似度计算
    const words1 = new Set(content1.toLowerCase().split(/\s+/));
    const words2 = new Set(content2.toLowerCase().split(/\s+/));
    
    const intersection = new Set([...words1].filter(word => words2.has(word))).size;
    const union = new Set([...words1, ...words2]).size;
    
    return intersection / union;
  }

  private selectBetterContent(content1: SearchContent, content2: SearchContent): SearchContent {
    // 优先选择质量分更高的
    const score1 = (content1 as any).qualityScore || 0;
    const score2 = (content2 as any).qualityScore || 0;
    
    if (score1 !== score2) {
      return score1 > score2 ? content1 : content2;
    }
    
    // 其次选择更新鲜的
    if (content1.timestamp !== content2.timestamp) {
      return content1.timestamp > content2.timestamp ? content1 : content2;
    }
    
    // 最后选择内容更丰富的
    return content1.content.length > content2.content.length ? content1 : content2;
  }
}

/**
 * 搜索结果聚合工具
 * 将多个来源的搜索结果进行智能聚合
 */
export class SearchAggregationTool implements Tool {
  name = 'aggregate_search_results';
  description = '聚合多个来源的搜索结果，提供统一的数据视图';
  parameters = {
    type: 'object',
    properties: {
      searchResults: {
        type: 'object',
        description: '按来源分组的搜索结果'
      },
      aggregationMode: {
        type: 'string',
        enum: ['merge', 'prioritize', 'balance'],
        description: '聚合模式'
      },
      maxResults: {
        type: 'number',
        description: '最大结果数量'
      }
    },
    required: ['searchResults']
  };

  async invoke(args: { 
    searchResults: Record<string, SearchContent[]>,
    aggregationMode?: 'merge' | 'prioritize' | 'balance',
    maxResults?: number
  }) {
    const { 
      searchResults, 
      aggregationMode = 'balance',
      maxResults = 100
    } = args;

    console.log(`🔗 搜索结果聚合: ${Object.keys(searchResults).length} 个来源`);

    let aggregatedResults: SearchContent[] = [];
    const sourceStats: Record<string, number> = {};

    // 计算每个来源的统计信息
    for (const [source, results] of Object.entries(searchResults)) {
      sourceStats[source] = results.length;
    }

    switch (aggregationMode) {
      case 'merge':
        // 简单合并所有结果
        aggregatedResults = this.mergeResults(searchResults);
        break;
      
      case 'prioritize':
        // 按来源优先级聚合
        aggregatedResults = this.prioritizeResults(searchResults);
        break;
      
      case 'balance':
        // 平衡聚合
        aggregatedResults = this.balanceResults(searchResults, maxResults);
        break;
    }

    // 限制最终结果数量
    if (aggregatedResults.length > maxResults) {
      aggregatedResults = aggregatedResults.slice(0, maxResults);
    }

    return {
      aggregatedResults,
      sourceStats,
      totalResults: aggregatedResults.length,
      aggregationMode,
      metadata: {
        originalTotal: Object.values(searchResults).flat().length,
        finalTotal: aggregatedResults.length,
        compressionRate: 1 - (aggregatedResults.length / Object.values(searchResults).flat().length),
        processedAt: new Date()
      }
    };
  }

  private mergeResults(searchResults: Record<string, SearchContent[]>): SearchContent[] {
    const allResults: SearchContent[] = [];
    
    for (const results of Object.values(searchResults)) {
      allResults.push(...results);
    }
    
    // 按时间戳降序排序
    return allResults.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }

  private prioritizeResults(searchResults: Record<string, SearchContent[]>): SearchContent[] {
    // 定义来源优先级
    const sourcePriority: Record<string, number> = {
      github: 3,
      google: 2,
      twitter: 1
    };
    
    const prioritizedResults: SearchContent[] = [];
    
    // 按优先级顺序添加结果
    const sortedSources = Object.keys(searchResults).sort(
      (a, b) => (sourcePriority[b] || 0) - (sourcePriority[a] || 0)
    );
    
    for (const source of sortedSources) {
      const results = searchResults[source] || [];
      prioritizedResults.push(...results);
    }
    
    return prioritizedResults;
  }

  private balanceResults(searchResults: Record<string, SearchContent[]>, maxResults: number): SearchContent[] {
    const sources = Object.keys(searchResults);
    const resultsPerSource = Math.floor(maxResults / sources.length);
    const remainder = maxResults % sources.length;
    
    const balancedResults: SearchContent[] = [];
    
    // 为每个来源分配配额
    sources.forEach((source, index) => {
      const quota = resultsPerSource + (index < remainder ? 1 : 0);
      const sourceResults = searchResults[source] || [];
      
      // 选择该来源的最高质量结果
      const selectedResults = sourceResults
        .sort((a, b) => ((b as any).qualityScore || 0) - ((a as any).qualityScore || 0))
        .slice(0, quota);
      
      balancedResults.push(...selectedResults);
    });
    
    // 按质量分数排序最终结果
    return balancedResults.sort((a, b) => 
      ((b as any).qualityScore || 0) - ((a as any).qualityScore || 0)
    );
  }
}