import { Component } from '@astack-tech/core';
import { Octokit } from '@octokit/rest';
import { 
  GitHubSearchTask, 
  SearchContent,
  GitHubSearchResult,
  AgentExecutionContext
} from '../types/multi-agent.js';

/**
 * GitHub Search Agent
 * 
 * 专门负责 GitHub 仓库和代码搜索的 Component
 * 特点：
 * 1. 使用官方 Octokit API，无需反爬虫
 * 2. 支持仓库搜索和代码搜索
 * 3. 智能评估项目质量和活跃度
 * 4. 提取技术栈和社区信息
 * 5. 24 小时时效性验证
 */
export class GitHubSearchAgent extends Component {

  private octokit: Octokit;
  private environment: any;
  private rateLimitRemaining: number = 30; // GitHub搜索API限制
  private lastRateLimitReset: number = 0;
  private isApiRateLimited: boolean = false;

  constructor() {
    super();

    // 添加输入输出端口
    Component.Port.I('input').attach(this);
    Component.Port.O('success').attach(this);
    Component.Port.O('error').attach(this);
    Component.Port.O('partial').attach(this);

    this.environment = {
      githubToken: process.env.GITHUB_TOKEN || '',
      deepseekApiKey: process.env.DEEPSEEK_API_KEY || ''
    };

    // 初始化 Octokit 客户端
    this.octokit = new Octokit({
      auth: this.environment.githubToken,
      userAgent: 'CreatorTelescope-AStack/1.0',
      timeZone: 'UTC'
    });
  }

  /**
   * 执行 GitHub 搜索
   */
  async executeSearch(task: GitHubSearchTask, context: AgentExecutionContext): Promise<GitHubSearchResult> {
    console.log('🐙 GitHub Search Agent 开始搜索...');
    console.log('🔍 搜索关键字:', task.keywords);
    console.log('📂 搜索范围:', task.searchScope);

    const startTime = Date.now();
    const allResults: SearchContent[] = [];
    const searchErrors: string[] = [];

    try {
      // 验证 GitHub Token
      if (!this.environment.githubToken) {
        throw new Error('GitHub Token 未配置，请设置 GITHUB_TOKEN 环境变量');
      }

      // 并行执行仓库搜索和代码搜索
      const searchPromises: Promise<SearchContent[]>[] = [];

      if (task.searchScope.includes('repositories')) {
        console.log('📦 执行仓库搜索...');
        searchPromises.push(this.searchRepositories(task));
      }

      if (task.searchScope.includes('code')) {
        console.log('💻 执行代码搜索...');
        searchPromises.push(this.searchCode(task));
      }

      // 等待所有搜索完成
      const searchResults = await Promise.allSettled(searchPromises);

      // 合并结果并处理错误
      for (const result of searchResults) {
        if (result.status === 'fulfilled') {
          allResults.push(...result.value);
        } else {
          searchErrors.push(result.reason?.message || '未知搜索错误');
          console.error('❌ GitHub 搜索部分失败:', result.reason);
        }
      }

      // 去重和排序
      const uniqueResults = this.deduplicateResults(allResults);
      const sortedResults = this.sortByRelevanceAndQuality(uniqueResults, task);
      const limitedResults = sortedResults.slice(0, task.maxResults);

      // 24 小时时效性验证
      const freshResults = this.validateFreshness(limitedResults);

      const executionTime = Date.now() - startTime;

      console.log(`✅ GitHub 搜索完成: ${freshResults.length}/${allResults.length} 个结果`);
      console.log(`⏱️ 执行时间: ${executionTime}ms`);

      return {
        agentType: 'github',
        executionTime: executionTime,
        success: true,
        contents: freshResults,
        developmentMetrics: {
          totalStars: freshResults.reduce((sum, result) => sum + (result.metadata?.stars || 0), 0),
          totalProjects: freshResults.filter(r => r.metadata?.type === 'repository').length,
          languageDistribution: this.calculateLanguageDistribution(freshResults)
        },
        metadata: {
          totalFound: allResults.length,
          processedCount: allResults.length,
          filteredCount: freshResults.length,
          searchScopes: task.searchScope,
          appliedFilters: this.getAppliedFilters(task),
          errorCount: searchErrors.length,
          errors: searchErrors,
          timestamp: new Date(),
          apiLimitsRemaining: await this.getApiLimits()
        }
      };

    } catch (error) {
      const executionTime = Date.now() - startTime;
      
      console.error('❌ GitHub 搜索失败:', error);

      return {
        agentType: 'github',
        executionTime: executionTime,
        success: false,
        error: error instanceof Error ? error.message : String(error),
        contents: allResults, // 返回部分结果
        developmentMetrics: {
          totalStars: allResults.reduce((sum, result) => sum + (result.metadata?.stars || 0), 0),
          totalProjects: allResults.filter(r => r.metadata?.type === 'repository').length,
          languageDistribution: this.calculateLanguageDistribution(allResults)
        },
        metadata: {
          totalFound: allResults.length,
          processedCount: allResults.length,
          filteredCount: allResults.length,
          searchScopes: task.searchScope,
          errorCount: searchErrors.length + 1,
          errors: [...searchErrors, error instanceof Error ? error.message : String(error)],
          timestamp: new Date()
        }
      };
    }
  }

  /**
   * 搜索 GitHub 仓库
   */
  private async searchRepositories(task: GitHubSearchTask): Promise<SearchContent[]> {
    const results: SearchContent[] = [];

    for (const keyword of task.keywords) {
      try {
        // 构建搜索查询
        const query = this.buildRepositoryQuery(keyword, task);
        
        console.log(`🔍 仓库搜索查询: ${query}`);

        // 检查限流状态
        if (this.isApiRateLimited) {
          console.warn('⚠️ GitHub API 限流中，跳过仓库搜索');
          break;
        }

        // 执行搜索，带限流处理
        const response = await this.executeWithRateLimit(async () => {
          return await this.octokit.rest.search.repos({
            q: query,
            sort: 'updated',
            order: 'desc',
            per_page: Math.min(task.maxResults, 100)
          });
        });

        console.log(`📦 找到 ${response.data.items.length} 个仓库`);

        // 处理搜索结果
        for (const repo of response.data.items) {
          // 应用过滤器
          if (!this.passesRepositoryFilters(repo, task)) {
            continue;
          }

          const searchContent: SearchContent = {
            id: `github-repo-${repo.id}`,
            title: repo.full_name,
            content: this.buildRepositoryContent(repo),
            url: repo.html_url,
            timestamp: new Date(repo.updated_at),
            source: 'github',
            author: repo.owner?.login || 'unknown',
            metadata: {
              type: 'repository',
              stars: repo.stargazers_count,
              forks: repo.forks_count,
              language: repo.language,
              topics: repo.topics || [],
              license: repo.license?.name,
              size: repo.size,
              openIssues: repo.open_issues_count,
              watchers: repo.watchers_count,
              isArchived: repo.archived,
              isFork: repo.fork,
              hasPages: repo.has_pages,
              defaultBranch: repo.default_branch,
              createdAt: repo.created_at,
              pushedAt: repo.pushed_at
            }
          };

          results.push(searchContent);
        }

        // API 限制保护
        await this.respectApiLimits();

      } catch (error) {
        console.error(`❌ 仓库搜索失败 (${keyword}):`, error);
        
        // GitHub API 限制处理
        if (error instanceof Error && error.message.includes('rate limit')) {
          console.log('⏳ 遇到 API 限制，等待恢复...');
          await new Promise(resolve => setTimeout(resolve, 60000)); // 等待 1 分钟
        }
      }
    }

    return results;
  }

  /**
   * 搜索 GitHub 代码
   */
  private async searchCode(task: GitHubSearchTask): Promise<SearchContent[]> {
    const results: SearchContent[] = [];

    for (const keyword of task.keywords) {
      try {
        // 构建代码搜索查询
        const query = this.buildCodeQuery(keyword, task);
        
        console.log(`💻 代码搜索查询: ${query}`);

        // 检查限流状态
        if (this.isApiRateLimited) {
          console.warn('⚠️ GitHub API 限流中，跳过代码搜索');
          break;
        }

        // 执行搜索，带限流处理
        const response = await this.executeWithRateLimit(async () => {
          return await this.octokit.rest.search.code({
            q: query,
            sort: 'indexed',
            order: 'desc',
            per_page: Math.min(Math.floor(task.maxResults / 2), 50) // 代码搜索限制更严
          });
        });

        console.log(`💻 找到 ${response.data.items.length} 个代码片段`);

        // 处理搜索结果
        for (const code of response.data.items) {
          const searchContent: SearchContent = {
            id: `github-code-${code.sha}`,
            title: `${code.repository.full_name}/${code.name}`,
            content: this.buildCodeContent(code),
            url: code.html_url,
            timestamp: new Date(), // 代码搜索不提供时间戳，使用当前时间
            source: 'github',
            author: code.repository.owner?.login || 'unknown',
            metadata: {
              type: 'code',
              fileName: code.name,
              path: code.path,
              repository: code.repository.full_name,
              repositoryStars: code.repository.stargazers_count,
              repositoryLanguage: code.repository.language,
              sha: code.sha,
              score: code.score
            }
          };

          results.push(searchContent);
        }

        // API 限制保护
        await this.respectApiLimits();

      } catch (error) {
        console.error(`❌ 代码搜索失败 (${keyword}):`, error);
        
        // GitHub API 限制处理
        if (error instanceof Error && error.message.includes('rate limit')) {
          console.log('⏳ 遇到 API 限制，等待恢复...');
          await new Promise(resolve => setTimeout(resolve, 60000));
        }
      }
    }

    return results;
  }

  /**
   * 构建仓库搜索查询
   */
  private buildRepositoryQuery(keyword: string, task: GitHubSearchTask): string {
    const queryParts: string[] = [keyword];

    // 如果有语言过滤，只选择一个主要语言避免复杂查询
    if (task.languages && task.languages.length > 0) {
      queryParts.push(`language:${task.languages[0]}`);
    }

    // 星标过滤
    if (task.filters?.minStars && task.filters.minStars > 0) {
      queryParts.push(`stars:>=${task.filters.minStars}`);
    }

    // 更新时间过滤 - 使用更宽松的时间范围
    if (task.filters?.maxAge) {
      const timeFilter = this.convertAgeToDate(task.filters.maxAge);
      if (timeFilter) {
        queryParts.push(`pushed:>=${timeFilter.toISOString().split('T')[0]}`);
      }
    }

    // 排除 fork 仓库
    queryParts.push('fork:false');

    // 排除已归档的仓库
    queryParts.push('archived:false');

    return queryParts.join(' ');
  }

  /**
   * 构建代码搜索查询
   */
  private buildCodeQuery(keyword: string, task: GitHubSearchTask): string {
    // GitHub 代码搜索要求简化查询
    const queryParts: string[] = [keyword];

    // 如果有语言过滤，只选择一个主要语言避免复杂查询
    if (task.languages && task.languages.length > 0) {
      queryParts.push(`language:${task.languages[0]}`);
    }

    // 文件大小限制（避免搜索到过大的文件）
    queryParts.push('size:<10000'); // 小于 10KB，避免查询复杂度

    return queryParts.join(' ');
  }

  /**
   * 验证仓库是否通过过滤器
   */
  private passesRepositoryFilters(repo: any, task: GitHubSearchTask): boolean {
    // 星标过滤
    if (task.filters?.minStars && repo.stargazers_count < task.filters.minStars) {
      return false;
    }

    // 语言过滤
    if (task.languages && task.languages.length > 0) {
      if (!repo.language || !task.languages.includes(repo.language)) {
        return false;
      }
    }

    // 更新时间过滤
    if (task.filters?.maxAge) {
      const maxAgeDate = this.convertAgeToDate(task.filters.maxAge);
      if (maxAgeDate && new Date(repo.updated_at) < maxAgeDate) {
        return false;
      }
    }

    // README 要求（这里假设大多数有星标的仓库都有 README）
    if (task.filters?.hasReadme && repo.stargazers_count < 5) {
      return false;
    }

    // 排除已归档或 fork 的仓库
    if (repo.archived || repo.fork) {
      return false;
    }

    return true;
  }

  /**
   * 构建仓库内容描述
   */
  private buildRepositoryContent(repo: any): string {
    const parts: string[] = [];

    // 基本描述
    if (repo.description) {
      parts.push(repo.description);
    }

    // 技术栈信息
    const techInfo: string[] = [];
    if (repo.language) {
      techInfo.push(`主要语言: ${repo.language}`);
    }
    if (repo.topics && repo.topics.length > 0) {
      techInfo.push(`标签: ${repo.topics.join(', ')}`);
    }
    if (techInfo.length > 0) {
      parts.push(techInfo.join(' | '));
    }

    // 社区活跃度
    const activityInfo = [
      `⭐ ${repo.stargazers_count} stars`,
      `🍴 ${repo.forks_count} forks`,
      `👁️ ${repo.watchers_count} watchers`,
      `🐛 ${repo.open_issues_count} open issues`
    ].join(' | ');
    parts.push(activityInfo);

    // 最后更新时间
    const lastUpdate = new Date(repo.updated_at).toISOString().split('T')[0];
    parts.push(`最后更新: ${lastUpdate}`);

    // 许可证信息
    if (repo.license) {
      parts.push(`许可证: ${repo.license.name}`);
    }

    return parts.join('\n\n');
  }

  /**
   * 构建代码内容描述
   */
  private buildCodeContent(code: any): string {
    const parts: string[] = [];

    // 代码片段信息
    parts.push(`文件: ${code.path}`);
    parts.push(`仓库: ${code.repository.full_name} (⭐ ${code.repository.stargazers_count})`);
    
    if (code.repository.language) {
      parts.push(`语言: ${code.repository.language}`);
    }

    // 代码片段（如果有的话）
    if (code.text_matches && code.text_matches.length > 0) {
      const matches = code.text_matches
        .slice(0, 3) // 只取前 3 个匹配
        .map(match => match.fragment)
        .join('\n---\n');
      parts.push(`匹配片段:\n${matches}`);
    }

    return parts.join('\n\n');
  }

  /**
   * 去重结果
   */
  private deduplicateResults(results: SearchContent[]): SearchContent[] {
    const seen = new Set<string>();
    const uniqueResults: SearchContent[] = [];

    for (const result of results) {
      // 基于 URL 去重
      if (!seen.has(result.url)) {
        seen.add(result.url);
        uniqueResults.push(result);
      }
    }

    return uniqueResults;
  }

  /**
   * 按相关性和质量排序
   */
  private sortByRelevanceAndQuality(results: SearchContent[], task: GitHubSearchTask): SearchContent[] {
    return results.sort((a, b) => {
      // 仓库优先于代码片段
      if (a.metadata?.type !== b.metadata?.type) {
        return a.metadata?.type === 'repository' ? -1 : 1;
      }

      // 按星标数排序（仓库）
      if (a.metadata?.type === 'repository' && b.metadata?.type === 'repository') {
        const starsA = a.metadata?.stars || 0;
        const starsB = b.metadata?.stars || 0;
        return starsB - starsA;
      }

      // 按仓库星标数排序（代码）
      if (a.metadata?.type === 'code' && b.metadata?.type === 'code') {
        const starsA = a.metadata?.repositoryStars || 0;
        const starsB = b.metadata?.repositoryStars || 0;
        return starsB - starsA;
      }

      // 按时间排序
      return b.timestamp.getTime() - a.timestamp.getTime();
    });
  }

  /**
   * 验证内容时效性 - 调整为更合理的策略
   */
  private validateFreshness(results: SearchContent[]): SearchContent[] {
    const now = new Date();
    const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    return results.filter(result => {
      // 仓库：检查最后推送时间，放宽到7天（开源项目更新频率相对较低）
      if (result.metadata?.type === 'repository') {
        const pushedAt = result.metadata?.pushedAt ? new Date(result.metadata.pushedAt) : result.timestamp;
        return pushedAt >= sevenDaysAgo;
      }

      // 代码：所有代码结果都认为是新鲜的（因为我们搜索的是最新索引的）
      if (result.metadata?.type === 'code') {
        return true;
      }

      // 默认检查：保持24小时严格要求
      return result.timestamp >= twentyFourHoursAgo;
    });
  }

  /**
   * 转换年龄字符串为日期
   */
  private convertAgeToDate(age: string): Date | null {
    const now = new Date();
    
    if (age.endsWith('d')) {
      const days = parseInt(age);
      return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
    }
    
    if (age.endsWith('w')) {
      const weeks = parseInt(age);
      return new Date(now.getTime() - weeks * 7 * 24 * 60 * 60 * 1000);
    }
    
    if (age.endsWith('m')) {
      const months = parseInt(age);
      return new Date(now.getTime() - months * 30 * 24 * 60 * 60 * 1000);
    }
    
    if (age.endsWith('y')) {
      const years = parseInt(age);
      return new Date(now.getTime() - years * 365 * 24 * 60 * 60 * 1000);
    }

    return null;
  }

  /**
   * 获取已应用的过滤器信息
   */
  private getAppliedFilters(task: GitHubSearchTask): Record<string, any> {
    return {
      minStars: task.filters?.minStars || 0,
      maxAge: task.filters?.maxAge || 'none',
      languages: task.languages || [],
      hasReadme: task.filters?.hasReadme || false,
      hasLicense: task.filters?.hasLicense || false,
      searchScope: task.searchScope
    };
  }

  /**
   * 获取 API 限制信息
   */
  private async getApiLimits(): Promise<Record<string, number>> {
    try {
      const response = await this.octokit.rest.rateLimit.get();
      return {
        searchRemaining: response.data.resources.search.remaining,
        coreRemaining: response.data.resources.core.remaining,
        searchResetAt: response.data.resources.search.reset,
        coreResetAt: response.data.resources.core.reset
      };
    } catch (error) {
      console.warn('⚠️ 无法获取 API 限制信息:', error);
      return {};
    }
  }

  /**
   * 尊重 API 限制
   */
  private async respectApiLimits(): Promise<void> {
    // GitHub 搜索 API 有更严格的限制（每分钟 30 次）
    // 添加延迟以避免触发限制
    const delay = Math.random() * 2000 + 3000; // 3-5秒随机延迟
    console.log(`⏳ API限制保护，等待 ${delay.toFixed(0)}ms...`);
    await new Promise(resolve => setTimeout(resolve, delay));
  }

  /**
   * 计算语言分布
   */
  private calculateLanguageDistribution(results: SearchContent[]): Record<string, number> {
    const distribution: Record<string, number> = {};
    
    for (const result of results) {
      const language = result.metadata?.language || result.metadata?.repositoryLanguage || 'unknown';
      distribution[language] = (distribution[language] || 0) + 1;
    }
    
    return distribution;
  }

  /**
   * Component 数据转换逻辑
   */
  _transform($i: any, $o: any): void {
    $i('in').receive(async (data: GitHubSearchTask | { task: GitHubSearchTask; context: AgentExecutionContext }) => {
      try {
        console.log(`[GitHubSearchAgent] 开始处理搜索任务`);
        
        // 兼容两种数据格式
        let task: GitHubSearchTask;
        let context: AgentExecutionContext;
        
        if ('task' in data) {
          // 新格式：包含 task 和 context
          task = data.task;
          context = data.context;
        } else {
          // 直接传入 task 对象
          task = data as GitHubSearchTask;
          context = {
            executionId: Date.now().toString(),
            startTime: new Date(),
            timeout: task.timeoutMs || 30000
          };
        }
        
        const result = await this.executeSearch(task, context);
        
        // 统一输出到 'out' 端口
        console.log(`[GitHubSearchAgent] 搜索完成，返回 ${result.contents?.length || 0} 个结果`);
        $o('out').send(result);
        
      } catch (error) {
        console.error(
          `[GitHubSearchAgent] 处理失败: ${error instanceof Error ? error.message : String(error)}`
        );
        
        const errorResult: GitHubSearchResult = {
          agentType: 'github',
          executionTime: 0,
          success: false,
          error: error instanceof Error ? error.message : String(error),
          contents: [],
          developmentMetrics: {
            totalStars: 0,
            totalProjects: 0,
            languageDistribution: {}
          },
          metadata: {
            totalFound: 0,
            processedCount: 0,
            filteredCount: 0,
            timestamp: new Date(),
            errorCount: 1,
            errors: [error instanceof Error ? error.message : String(error)]
          }
        };
        
        $o('out').send(errorResult);
      }
    });
  }

  /**
   * 执行API调用并处理限流
   */
  private async executeWithRateLimit<T>(apiCall: () => Promise<T>): Promise<T> {
    // 检查是否已经被限流
    if (this.isApiRateLimited) {
      const waitTime = this.lastRateLimitReset - Date.now();
      if (waitTime > 0 && waitTime < 3600000) {
        console.log(`⏳ API已被限流，等待 ${Math.ceil(waitTime / 60000)} 分钟后重试`);
        throw new Error(`GitHub API 限流中，请等待 ${Math.ceil(waitTime / 60000)} 分钟`);
      } else {
        // 重置时间已过，清除限流状态
        this.isApiRateLimited = false;
      }
    }

    try {
      const result = await apiCall();
      
      // 更新限流状态（从响应头获取）
      this.isApiRateLimited = false;
      
      return result;
    } catch (error: any) {
      // 检查是否为限流错误
      if (error.status === 403 && (error.message?.includes('rate limit') || error.message?.includes('API rate limit'))) {
        console.error('❌ GitHub API 限流:', error.message);
        this.isApiRateLimited = true;
        
        // 从错误响应头获取重置时间
        const resetTime = error.response?.headers?.['x-ratelimit-reset'];
        if (resetTime) {
          this.lastRateLimitReset = parseInt(resetTime) * 1000; // 转换为毫秒
          const waitTime = this.lastRateLimitReset - Date.now();
          if (waitTime > 0 && waitTime < 3600000) { // 最多等待1小时
            console.log(`⏳ 等待限流重置，剩余时间: ${Math.ceil(waitTime / 60000)} 分钟`);
          }
        } else {
          // 如果没有重置时间，设置默认等待时间（1小时）
          this.lastRateLimitReset = Date.now() + 3600000;
        }
        
        throw new Error(`GitHub API 限流: ${error.message}`);
      }
      
      // 检查是否为其他API错误
      if (error.status >= 400) {
        console.error(`❌ GitHub API 错误 ${error.status}:`, error.message);
        throw new Error(`GitHub API 错误 ${error.status}: ${error.message}`);
      }
      
      // 其他错误直接抛出
      throw error;
    }
  }

  /**
   * 重置Agent状态（用于测试间隔离）
   */
  resetState(): void {
    this.isApiRateLimited = false;
    this.rateLimitRemaining = 30;
    this.lastRateLimitReset = 0;
    console.log('🔄 GitHub Agent 状态已重置');
  }
}

export default GitHubSearchAgent;