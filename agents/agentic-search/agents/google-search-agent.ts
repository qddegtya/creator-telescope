import { Component } from '@astack-tech/core';
import { SearchContent, GoogleSearchTask, GoogleSearchResult } from '../types/multi-agent.js';
import { BrowserPool } from '../infrastructure/browser-pool.js';

/**
 * Google 搜索 Agent
 * 
 * 专业的 Google 搜索代理，使用 Playwright headless 浏览器进行反爬虫搜索
 */
export class GoogleSearchAgent extends Component {
  private browserPool: BrowserPool;

  constructor() {
    super();
    this.browserPool = new BrowserPool({
      maxConcurrent: 3,
      headless: true,
      timeout: 30000
    });
  }

  /**
   * 执行 Google 搜索
   */
  async executeSearch(task: GoogleSearchTask): Promise<GoogleSearchResult> {
    console.log(`🔍 Google Search Agent 开始搜索: ${task.keywords.join(', ')}`);

    try {
      const searchPromises = task.queries.map(query => 
        this.performSingleSearch(query, task)
      );

      const results = await Promise.allSettled(searchPromises);
      const contents: SearchContent[] = [];

      for (const result of results) {
        if (result.status === 'fulfilled') {
          contents.push(...result.value);
        } else {
          console.warn('Google 搜索失败:', result.reason);
        }
      }

      // 按时间排序 (最新的在前)
      const sortedContents = contents.sort((a, b) => {
        const freshnessA = this.getFreshnessWeight(a.timestamp);
        const freshnessB = this.getFreshnessWeight(b.timestamp);
        return freshnessB - freshnessA;
      });

      // 限制结果数量
      const limitedContents = sortedContents.slice(0, task.maxResults || 10);

      return {
        agentType: 'google',
        success: true,
        executionTime: 0, // Will be calculated by caller
        contents: limitedContents,
        metadata: {
          totalFound: contents.length,
          processedCount: limitedContents.length,
          filteredCount: contents.length - limitedContents.length
        },
        searchMetrics: {
          queriesExecuted: task.queries.length,
          pagesScraped: results.length,
          antiCrawlingBypass: true
        }
      };

    } catch (error) {
      console.error('Google Search Agent 搜索失败:', error);
      return {
        agentType: 'google',
        success: false,
        executionTime: 0, // Will be calculated by caller
        error: error instanceof Error ? error.message : String(error),
        contents: [],
        metadata: {
          totalFound: 0,
          processedCount: 0,
          filteredCount: 0
        },
        searchMetrics: {
          queriesExecuted: 0,
          pagesScraped: 0,
          antiCrawlingBypass: false
        }
      };
    }
  }

  /**
   * 执行单个搜索查询
   */
  private async performSingleSearch(query: string, task: GoogleSearchTask): Promise<SearchContent[]> {
    const browser = await this.browserPool.acquire();
    
    try {
      const page = await browser.newPage();
      
      // 设置随机 User Agent
      await page.setUserAgent(this.getRandomUserAgent());
      
      // 设置视口
      await page.setViewportSize({ width: 1920, height: 1080 });

      // 构建搜索 URL
      const searchUrl = this.buildSearchUrl(query, task);
      
      console.log(`  🌐 搜索查询: ${query}`);
      await page.goto(searchUrl, { waitUntil: 'networkidle' });

      // 等待搜索结果加载
      await page.waitForSelector('[data-ved]', { timeout: 10000 });

      // 提取搜索结果
      const results = await this.extractSearchResults(page, query, task);

      await page.close();
      return results;

    } catch (error) {
      console.error(`Google 搜索查询失败 [${query}]:`, error);
      return [];
    } finally {
      this.browserPool.release(browser);
    }
  }

  /**
   * 构建 Google 搜索 URL
   */
  private buildSearchUrl(query: string, task: GoogleSearchTask): string {
    const params = new URLSearchParams({
      q: query,
      hl: 'zh-CN',
      lr: 'lang_zh|lang_en',
      safe: 'off',
      filter: '0'
    });

    // 添加时间过滤
    if (task.timeRange) {
      const timeFilter = this.getTimeFilter(task.timeRange);
      if (timeFilter) {
        params.append('tbs', timeFilter);
      }
    }

    return `https://www.google.com/search?${params.toString()}`;
  }

  /**
   * 提取搜索结果
   */
  private async extractSearchResults(page: any, query: string, task: GoogleSearchTask): Promise<SearchContent[]> {
    return await page.evaluate((query: string, timeWindow: string) => {
      const results: any[] = [];
      const searchResults = document.querySelectorAll('[data-ved] h3');

      for (let i = 0; i < Math.min(searchResults.length, 15); i++) {
        const titleElement = searchResults[i];
        const linkElement = titleElement.closest('a');
        const containerElement = titleElement.closest('[data-ved]');

        if (!linkElement || !containerElement) continue;

        const title = titleElement.textContent?.trim();
        const url = linkElement.href;
        
        if (!title || !url || url.includes('google.com')) continue;

        // 获取描述
        const descElements = containerElement.querySelectorAll('[data-sncf]');
        let description = '';
        for (const descElement of descElements) {
          const text = descElement.textContent?.trim();
          if (text && text.length > description.length) {
            description = text;
          }
        }

        // 获取发布时间
        const timeElements = containerElement.querySelectorAll('span[aria-label*="天前"], span[aria-label*="小时前"], span[aria-label*="分钟前"]');
        let publishedAt: Date | undefined;
        
        if (timeElements.length > 0) {
          const timeText = timeElements[0].textContent;
          // 简单时间解析，会在外部处理
          publishedAt = new Date();
        }

        results.push({
          id: `google_${Date.now()}_${i}`,
          title,
          content: description,
          url,
          source: 'google',
          timestamp: publishedAt || new Date(),
          metadata: {
            author: new URL(url).hostname.replace('www.', ''),
            platform: 'google',
            tags: [query]
          }
        });
      }

      return results;
    }, query, task.timeRange || '');
  }

  /**
   * 解析相对时间
   */
  private parseRelativeTime(timeText: string | null): Date | undefined {
    if (!timeText) return undefined;

    const now = new Date();
    
    if (timeText.includes('分钟前')) {
      const minutes = parseInt(timeText.match(/\d+/)?.[0] || '0');
      return new Date(now.getTime() - minutes * 60 * 1000);
    }
    
    if (timeText.includes('小时前')) {
      const hours = parseInt(timeText.match(/\d+/)?.[0] || '0');
      return new Date(now.getTime() - hours * 60 * 60 * 1000);
    }
    
    if (timeText.includes('天前')) {
      const days = parseInt(timeText.match(/\d+/)?.[0] || '0');
      return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
    }

    return undefined;
  }

  /**
   * 计算内容质量分数
   */
  private calculateQualityScore(title: string, description: string, url: string): number {
    let score = 0.5; // 基础分数

    // 标题质量
    if (title.length > 10 && title.length < 100) score += 0.1;
    if (title.includes('AI') || title.includes('人工智能') || title.includes('machine learning')) score += 0.1;

    // 描述质量
    if (description.length > 50) score += 0.1;
    if (description.length > 100) score += 0.1;

    // URL 质量
    const domain = this.extractDomain(url);
    if (this.isHighQualityDomain(domain)) score += 0.2;

    return Math.min(score, 1.0);
  }

  /**
   * 提取域名
   */
  private extractDomain(url: string): string {
    try {
      return new URL(url).hostname.replace('www.', '');
    } catch {
      return 'unknown';
    }
  }

  /**
   * 判断是否为高质量域名
   */
  private isHighQualityDomain(domain: string): boolean {
    const highQualityDomains = [
      'arxiv.org', 'github.com', 'stackoverflow.com', 'medium.com',
      'towardsdatascience.com', 'nature.com', 'science.org',
      'ieee.org', 'acm.org', 'openai.com', 'deepmind.com'
    ];
    
    return highQualityDomains.some(hqd => domain.includes(hqd));
  }

  /**
   * 获取时间过滤器
   */
  private getTimeFilter(timeWindow: string): string | null {
    switch (timeWindow) {
      case '1h': return 'qdr:h';
      case '6h': return 'qdr:h6';
      case '24h': return 'qdr:d';
      case '7d': return 'qdr:w';
      case '30d': return 'qdr:m';
      default: return null;
    }
  }

  /**
   * 获取新鲜度权重
   */
  private getFreshnessWeight(timestamp: Date): number {
    const now = new Date();
    const diffHours = (now.getTime() - timestamp.getTime()) / (1000 * 60 * 60);
    
    if (diffHours < 1) return 1.0;
    if (diffHours < 6) return 0.9;
    if (diffHours < 24) return 0.8;
    if (diffHours < 72) return 0.6;
    
    return 0.4;
  }

  /**
   * 获取随机 User Agent
   */
  private getRandomUserAgent(): string {
    const userAgents = [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15'
    ];
    
    return userAgents[Math.floor(Math.random() * userAgents.length)];
  }

  /**
   * 清理资源
   */
  async cleanup(): Promise<void> {
    await this.browserPool.destroy();
  }
}