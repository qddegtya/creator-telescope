import { Component } from '@astack-tech/core';
import Piscina from 'piscina';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import type { ContentItem } from '../types/content.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Twitter 账号配置接口
 */
interface TwitterAccount {
  handle: string;
  name: string;
  category: string;
  weight: number;
  description: string;
}

/**
 * Twitter 配置接口
 */
interface TwitterConfig {
  enabled: boolean;
  accounts: TwitterAccount[];
  config: {
    maxTweetsPerAccount: number;
    dayRange: number;
    headless: boolean;
    delayBetweenRequests: number;
  };
}

/**
 * 简化版 Twitter 爬虫组件
 * 
 * 构造时接收配置，启动后直接运行并输出结果
 */
export class TwitterScraperV2Component extends Component {
  private config: TwitterConfig;
  private pool: Piscina;

  constructor(config: TwitterConfig) {
    super({});

    this.config = config;

    // 初始化 Piscina 线程池
    this.pool = new Piscina({
      filename: join(__dirname, '../workers/twitter-worker.js'),
      maxThreads: Math.min(config.accounts.length, 10), // 动态调整线程数
      minThreads: 2,
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
    console.log('🐦 清理 Twitter 爬虫线程池...');
    try {
      await this.pool.destroy();
      console.log('✅ Twitter 线程池已关闭');
    } catch (error) {
      console.warn('⚠️  关闭 Twitter 线程池失败:', error);
    }
  }

  /**
   * 组件转换方法
   */
  _transform($i: any, $o: any) {
    console.log('🐦 Twitter 爬虫 _transform 初始化');
    console.log(`🐦 配置状态: ${this.config.enabled ? '启用' : '禁用'}, ${this.config.accounts.length} 个账号`);

    // 建立开始信号订阅
    $i('start').receive(async () => {
      if (!this.config.enabled) {
        console.log('⏭️  Twitter 爬虫已禁用，跳过');
        $o('scrapedContent').send([]);
        return;
      }

      console.log('🐦 开始 Twitter 内容爬取...');
      
      try {
        const content = await this.scrapeTwitterContent();
        $o('scrapedContent').send(content);
        console.log(`✅ Twitter 爬取完成，获得 ${content.length} 条内容`);
      } catch (error) {
        console.error('❌ Twitter 爬取失败:', error);
        $o('scrapedContent').send([]);
      }
    });
  }

  /**
   * 爬取 Twitter 内容
   */
  private async scrapeTwitterContent(): Promise<ContentItem[]> {
    const allContent: ContentItem[] = [];
    
    try {
      console.log(`🚀 启动 Piscina 线程池并行爬取 ${this.config.accounts.length} 个 Twitter 账号...`);
      
      // 使用 Piscina 线程池处理所有账号
      const accountTasks = this.config.accounts.map(accountInfo => 
        this.pool.run({
          accountInfo,
          config: this.config.config
        }).then(result => {
          console.log(`✅ @${result.account}: ${result.tweets.length} 条推文`);
          return result.tweets;
        }).catch(error => {
          console.warn(`⚠️  爬取 @${accountInfo.handle} 失败:`, error.message);
          return [];
        })
      );
      
      // 等待所有线程任务完成
      const results = await Promise.allSettled(accountTasks);
      results.forEach(result => {
        if (result.status === 'fulfilled') {
          allContent.push(...result.value);
        }
      });
      
    } catch (error) {
      console.error('🚨 Twitter 线程池操作失败:', error);
    }

    return this.filterContent(allContent);
  }


  /**
   * 过滤内容
   */
  private filterContent(content: ContentItem[]): ContentItem[] {
    return content
      .filter(item => (item.metrics?.aiRelevanceScore || 0) > 0.2)
      .sort((a, b) => (b.metrics?.aiRelevanceScore || 0) - (a.metrics?.aiRelevanceScore || 0));
  }
}

export default TwitterScraperV2Component;