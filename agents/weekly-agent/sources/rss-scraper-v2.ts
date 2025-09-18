import { Component } from '@astack-tech/core';
import Piscina from 'piscina';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import type { ContentItem } from '../types/content.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * RSS 源配置接口
 */
interface RSSFeedConfig {
  name: string;
  url: string;
  category: string;
  weight: number;
  isHighQuality: boolean;
  description: string;
}

/**
 * RSS 配置接口
 */
interface RSSConfig {
  enabled: boolean;
  feeds: RSSFeedConfig[];
  config: {
    maxItemsPerFeed: number;
    dayRange: number;
    requestTimeout: number;
    delayBetweenRequests: number;
    fetchFullContent: boolean;
  };
}

/**
 * 简化版 RSS 爬虫组件
 * 
 * 构造时接收配置，启动后直接运行并输出结果
 */
export class RSSScraperV2Component extends Component {
  private config: RSSConfig;
  private pool: Piscina;

  constructor(config: RSSConfig) {
    super({});
    
    this.config = config;
    
    // 初始化 Piscina 线程池
    this.pool = new Piscina({
      filename: join(__dirname, '../workers/rss-worker.js'),
      maxThreads: Math.min(config.feeds.length, 15), // RSS 可以更高并发
      minThreads: 3,
      idleTimeout: 60000
    });

    // 定义输入和输出端口
    Component.Port.I('start').attach(this);            // 开始信号
    Component.Port.O('scrapedContent').attach(this);   // 输出内容
  }

  /**
   * 组件清理方法
   */
  async cleanup(): Promise<void> {
    console.log('📰 清理 RSS 爬虫线程池...');
    try {
      await this.pool.destroy();
      console.log('✅ RSS 线程池已关闭');
    } catch (error) {
      console.warn('⚠️  关闭 RSS 线程池失败:', error);
    }
  }

  /**
   * 组件转换方法
   */
  _transform($i: any, $o: any) {
    console.log('📰 RSS 爬虫 _transform 初始化');
    console.log(`📰 配置状态: ${this.config.enabled ? '启用' : '禁用'}, ${this.config.feeds.length} 个源`);

    // 建立开始信号订阅
    $i('start').receive(async () => {
      if (!this.config.enabled) {
        console.log('⏭️  RSS 爬虫已禁用，跳过');
        $o('scrapedContent').send([]);
        return;
      }

      console.log('📰 开始 RSS 内容爬取...');
      
      try {
        const content = await this.scrapeRSSFeeds();
        $o('scrapedContent').send(content);
        console.log(`✅ RSS 爬取完成，获得 ${content.length} 篇文章`);
      } catch (error) {
        console.error('❌ RSS 爬取失败:', error);
        $o('scrapedContent').send([]);
      }
    });
  }

  /**
   * 爬取所有 RSS 源
   */
  private async scrapeRSSFeeds(): Promise<ContentItem[]> {
    if (!this.config) return [];
    
    const allArticles: ContentItem[] = [];
    
    // 处理所有高质量 RSS 源
    const feedsToProcess = this.config.feeds.filter(feed => feed.isHighQuality);
    
    console.log(`🚀 启动 Piscina 线程池并行爬取 ${feedsToProcess.length} 个 RSS 源...`);
    
    // 使用 Piscina 线程池处理所有 RSS 源
    const feedTasks = feedsToProcess.map(feedConfig => 
      this.pool.run({
        feedConfig,
        config: this.config.config
      }).then(result => {
        console.log(`✅ ${result.feedName}: ${result.articles.length} 篇文章`);
        return result.articles;
      }).catch(error => {
        console.warn(`⚠️  爬取 RSS 源失败 ${feedConfig.name}:`, error.message);
        return [];
      })
    );
    
    // 等待所有线程任务完成
    const results = await Promise.allSettled(feedTasks);
    results.forEach(result => {
      if (result.status === 'fulfilled') {
        allArticles.push(...result.value);
      }
    });

    return this.filterArticles(allArticles);
  }


  /**
   * 过滤文章
   */
  private filterArticles(articles: ContentItem[]): ContentItem[] {
    return articles
      .filter(article => (article.metrics?.aiRelevanceScore || 0) > 0.3)
      .sort((a, b) => (b.metrics?.aiRelevanceScore || 0) - (a.metrics?.aiRelevanceScore || 0));
  }
}

export default RSSScraperV2Component;