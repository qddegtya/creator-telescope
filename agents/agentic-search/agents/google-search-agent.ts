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
      
      // 设置反爬虫措施
      await this.setupAntiDetection(page);
      
      // 构建搜索 URL
      const searchUrl = this.buildSearchUrl(query, task);
      
      console.log(`  🌐 搜索查询: ${query}`);
      
      // 随机延迟
      await this.randomDelay(1000, 3000);
      
      await page.goto(searchUrl, { 
        waitUntil: 'domcontentloaded',
        timeout: 30000 
      });

      // 等待搜索结果加载 - 尝试多种选择器
      try {
        await page.waitForSelector('div[data-ved], .g, [jscontroller]', { timeout: 15000 });
      } catch (e) {
        console.warn('主要选择器等待超时，尝试备用选择器');
        await page.waitForSelector('h3, a', { timeout: 5000 });
      }

      // 模拟人类行为
      await this.simulateHumanBehavior(page);

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
   * 设置反检测措施
   */
  private async setupAntiDetection(page: any): Promise<void> {
    // 设置随机 User Agent
    await page.setUserAgent(this.getRandomUserAgent());
    
    // 设置随机视口
    const viewports = [
      { width: 1920, height: 1080 },
      { width: 1366, height: 768 },
      { width: 1440, height: 900 },
      { width: 1536, height: 864 }
    ];
    const viewport = viewports[Math.floor(Math.random() * viewports.length)];
    await page.setViewportSize(viewport);

    // 设置额外的请求头
    await page.setExtraHTTPHeaders({
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
      'Accept-Encoding': 'gzip, deflate, br',
      'DNT': '1',
      'Connection': 'keep-alive',
      'Upgrade-Insecure-Requests': '1',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'none',
      'Cache-Control': 'max-age=0'
    });

    // 注入脚本隐藏webdriver特征
    await page.addInitScript(() => {
      // 隐藏webdriver属性
      Object.defineProperty(navigator, 'webdriver', {
        get: () => undefined,
      });

      // 伪造plugins
      Object.defineProperty(navigator, 'plugins', {
        get: () => [1, 2, 3, 4, 5],
      });

      // 伪造语言
      Object.defineProperty(navigator, 'languages', {
        get: () => ['zh-CN', 'zh', 'en'],
      });

      // 隐藏自动化特征
      window.chrome = {
        runtime: {},
      };

      Object.defineProperty(navigator, 'permissions', {
        get: () => ({
          query: () => Promise.resolve({ state: 'granted' }),
        }),
      });
    });
  }

  /**
   * 模拟人类行为
   */
  private async simulateHumanBehavior(page: any): Promise<void> {
    try {
      // 随机鼠标移动
      await page.mouse.move(
        Math.random() * 1000,
        Math.random() * 600
      );

      // 随机滚动
      await page.evaluate(() => {
        window.scrollTo(0, Math.random() * 500);
      });

      // 随机短暂等待
      await this.randomDelay(500, 1500);
    } catch (e) {
      // 忽略模拟行为错误
    }
  }

  /**
   * 随机延迟
   */
  private async randomDelay(min: number, max: number): Promise<void> {
    const delay = Math.floor(Math.random() * (max - min + 1)) + min;
    await new Promise(resolve => setTimeout(resolve, delay));
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
      
      // 尝试多种选择器，适应Google的不同版本
      const possibleSelectors = [
        'div[data-ved] h3',           // 新版Google
        '[jscontroller] h3',          // 另一种新版格式
        '.g h3',                      // 传统格式
        '[data-header-feature] h3',   // 特殊情况
        'div.g div.yuRUbf h3'         // 最新格式
      ];

      let searchResults: NodeListOf<Element> | null = null;
      
      // 尝试每个选择器，直到找到结果
      for (const selector of possibleSelectors) {
        const elements = document.querySelectorAll(selector);
        if (elements.length > 0) {
          searchResults = elements;
          console.log(`使用选择器: ${selector}, 找到 ${elements.length} 个结果`);
          break;
        }
      }

      if (!searchResults || searchResults.length === 0) {
        console.warn('未找到任何搜索结果，尝试备用方案');
        // 备用方案：查找所有包含链接的h3元素
        searchResults = document.querySelectorAll('h3 a, a h3');
      }

      for (let i = 0; i < Math.min(searchResults.length, 15); i++) {
        const element = searchResults[i];
        let titleElement: Element;
        let linkElement: HTMLAnchorElement | null;

        // 根据元素类型确定title和link
        if (element.tagName === 'H3') {
          titleElement = element;
          linkElement = element.closest('a') || element.querySelector('a');
        } else if (element.tagName === 'A') {
          linkElement = element as HTMLAnchorElement;
          titleElement = linkElement.querySelector('h3') || linkElement;
        } else {
          continue;
        }

        if (!linkElement) continue;

        const title = titleElement.textContent?.trim();
        let url = linkElement.href;
        
        // 清理Google重定向URL
        if (url?.includes('/url?q=')) {
          try {
            const urlParams = new URLSearchParams(url.split('?')[1]);
            url = urlParams.get('q') || url;
          } catch (e) {
            // 保持原URL
          }
        }
        
        if (!title || !url || url.includes('google.com') || url.startsWith('javascript:')) continue;

        // 获取描述 - 尝试多种方式
        let description = '';
        const containerElement = element.closest('[data-ved], .g, [jscontroller]');
        
        if (containerElement) {
          // 尝试多种描述选择器
          const descSelectors = [
            '.VwiC3b',           // 新版描述
            '[data-sncf]',       // 旧版描述
            '.s',                // 传统描述
            '.st',               // 另一种传统描述
            'span[data-ved]'     // 备用描述
          ];

          for (const descSelector of descSelectors) {
            const descElements = containerElement.querySelectorAll(descSelector);
            for (const descElement of descElements) {
              const text = descElement.textContent?.trim();
              if (text && text.length > 20 && text.length > description.length) {
                description = text;
              }
            }
            if (description) break;
          }
        }

        // 获取发布时间
        let publishedAt: Date | undefined;
        if (containerElement) {
          const timeSelectors = [
            'span[aria-label*="ago"]',
            'span[aria-label*="天前"]', 
            'span[aria-label*="小时前"]', 
            'span[aria-label*="分钟前"]',
            '.f, .fG14ld, .LEwnzc'
          ];

          for (const timeSelector of timeSelectors) {
            const timeElements = containerElement.querySelectorAll(timeSelector);
            if (timeElements.length > 0) {
              publishedAt = new Date(); // 简化时间处理
              break;
            }
          }
        }

        // 验证URL格式
        try {
          new URL(url);
        } catch (e) {
          continue; // 跳过无效URL
        }

        results.push({
          id: `google_${Date.now()}_${i}`,
          title,
          content: description || title, // 如果没有描述，使用标题
          url,
          source: 'google',
          timestamp: publishedAt || new Date(),
          metadata: {
            author: new URL(url).hostname.replace('www.', ''),
            platform: 'google',
            tags: [query],
            hasDescription: !!description
          }
        });
      }

      console.log(`Google搜索提取完成: 找到 ${results.length} 个有效结果`);
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