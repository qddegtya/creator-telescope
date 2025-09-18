import { Pipeline } from '@astack-tech/core';
import { WeeklyControllerComponent } from './components/weekly-controller.js';
import { TwitterScraperV2Component } from './sources/twitter-scraper-v2.js';
import { RSSScraperV2Component } from './sources/rss-scraper-v2.js';
import { ContentMergerComponent } from './components/content-merger.js';
import { ContentAnalyzerV2Component } from './components/content-analyzer-v2.js';
import { NewsletterGeneratorComponent } from './components/newsletter-generator.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Creator Telescope 周刊生成 Pipeline
 * 
 * 简化架构:
 * Trigger → [TwitterScraper, RSSScraper] → ContentMerger → ContentAnalyzer → NewsletterGenerator → Output
 */
export class WeeklyPipeline extends Pipeline {
  private initialized = false;

  constructor() {
    super();
  }

  /**
   * 异步初始化Pipeline
   */
  async initialize() {
    if (this.initialized) return;
    
    // 初始化所有组件（包含配置）
    await this.initializeComponents();
    
    // 建立组件连接
    this.setupConnections();
    
    this.initialized = true;
    console.log('🚀 Creator Telescope 周刊 Pipeline 初始化完成');
  }

  /**
   * 加载配置文件
   */
  private async loadConfig(): Promise<any> {
    try {
      const configPath = path.join(__dirname, 'config', 'sources.json');
      const configFile = await fs.readFile(configPath, 'utf-8');
      return JSON.parse(configFile);
    } catch (error) {
      console.error('❌ 读取配置文件失败:', error);
      throw new Error('无法加载数据源配置文件');
    }
  }

  /**
   * 初始化所有组件
   */
  private async initializeComponents() {
    // 加载配置
    const config = await this.loadConfig();
    console.log(`📝 配置加载完成: Twitter ${config.twitter.accounts?.length || 0} 个账号, RSS ${config.rss.feeds?.length || 0} 个源`);
    
    // 网关控制器
    this.addComponent('weeklyController', new WeeklyControllerComponent());
    
    // 数据源爬虫 - 直接传入配置
    this.addComponent('twitterScraper', new TwitterScraperV2Component(config.twitter));
    this.addComponent('rssScraper', new RSSScraperV2Component(config.rss));
    
    // 内容处理
    this.addComponent('contentMerger', new ContentMergerComponent());
    
    // 内容分析器 - 使用 DeepSeek API
    this.addComponent('contentAnalyzer', new ContentAnalyzerV2Component({
      apiKey: process.env.DEEPSEEK_API_KEY,
      model: 'deepseek-chat',
      batchSize: 3,
      maxRetries: 2,
      useLocalRules: !process.env.DEEPSEEK_API_KEY
    }));
    
    // 周刊生成
    this.addComponent('newsletterGenerator', new NewsletterGeneratorComponent());
    
    console.log('✅ 所有组件初始化完成');
    if (process.env.DEEPSEEK_API_KEY) {
      console.log('🧠 已配置 DeepSeek API，将使用 AI 智能分析');
    } else {
      console.log('⚙️  未配置 DeepSeek API Key，将使用本地规则分析');
    }
  }

  /**
   * 建立组件之间的连接
   */
  private setupConnections() {
    try {
      console.log('🔗 开始建立组件连接...');
      
      // 简化的数据流: Trigger → 爬虫们 → 合并 → 分析 → 生成 → 输出
      
      // 1. Gateway 触发爬虫
      console.log('🔗 连接 WeeklyController → 爬虫');
      this.connect('weeklyController.triggerScrape', 'twitterScraper.start');
      this.connect('weeklyController.triggerScrape', 'rssScraper.start');
      
      // 2. 爬虫结果合并
      console.log('🔗 连接 爬虫 → ContentMerger');
      this.connect('twitterScraper.scrapedContent', 'contentMerger.twitterContent');
      this.connect('rssScraper.scrapedContent', 'contentMerger.rssContent');
      
      // 3. 合并后内容分析
      console.log('🔗 连接 ContentMerger → ContentAnalyzer');
      this.connect('contentMerger.mergedContent', 'contentAnalyzer.mergedContent');
      
      // 4. 分析后生成周刊
      console.log('🔗 连接 ContentAnalyzer → NewsletterGenerator');
      this.connect('contentAnalyzer.analyzedContent', 'newsletterGenerator.analyzedContent');
      
      // 5. 最终结果回传给 Gateway
      console.log('🔗 连接 NewsletterGenerator → WeeklyController');
      this.connect('newsletterGenerator.newsletterGenerated', 'weeklyController.newsletterGenerated');
      
      console.log('✅ 组件连接建立完成');
      
      // 验证连接
      this.verifyConnections();
      
    } catch (error) {
      console.error('❌ 建立组件连接失败:', error);
      throw error;
    }
  }

  /**
   * 验证连接是否建立成功
   */
  private verifyConnections() {
    console.log('🔍 验证组件连接状态...');
    
    const components = ['weeklyController', 'twitterScraper', 'rssScraper', 'contentMerger', 'contentAnalyzer', 'newsletterGenerator'];
    
    components.forEach(name => {
      const component = this.getComponent(name);
      if (component) {
        console.log(`✅ 组件 ${name} 已添加到 Pipeline`);
      } else {
        console.error(`❌ 组件 ${name} 未找到`);
      }
    });
  }

  /**
   * 启动周刊生成流程
   */
  async run(): Promise<void> {
    // 确保Pipeline已初始化
    await this.initialize();
    
    console.log('🎯 开始 Creator Telescope 周刊生成流程...');
    console.log('📋 流程步骤:');
    console.log('   1. Gateway 接收启动信号');
    console.log('   2. 并行爬取 Twitter 和 RSS 内容');
    console.log('   3. 合并并去重内容');
    console.log('   4. AI 智能分析内容');
    console.log('   5. 生成周刊 Markdown 文件');
    console.log('');

    try {
      // 使用 Gateway 模式启动 Pipeline
      console.log('🎯 通过 WeeklyController Gateway 启动流程...');
      
      const result = await super.run('weeklyController.input', { 
        action: 'generateWeekly',
        timestamp: Date.now()
      });
      
      console.log('🎉 周刊生成流程完成!');
      console.log('📊 Pipeline 执行结果:', result);
      
      return Promise.resolve();

    } catch (error) {
      console.error('❌ Pipeline 启动失败:', error);
      throw error;
    }
  }

  /**
   * 获取 Pipeline 状态信息
   */
  getStatus(): any {
    const components = [
      'weeklyController',
      'twitterScraper', 
      'rssScraper',
      'contentMerger',
      'contentAnalyzer',
      'newsletterGenerator'
    ];

    return {
      totalComponents: components.length,
      components: components.map(name => ({
        name,
        status: this.getComponent(name) ? 'initialized' : 'missing'
      })),
      isReady: this.initialized && components.every(name => this.getComponent(name))
    };
  }

  /**
   * 清理资源
   */
  async cleanup(): Promise<void> {
    console.log('🧹 开始清理 Pipeline 资源...');
    
    // 清理所有组件，优先清理爬虫组件（需要关闭线程池）
    const cleanupOrder = ['twitterScraper', 'rssScraper', 'contentMerger', 'contentAnalyzer', 'newsletterGenerator', 'weeklyController'];
    
    for (const componentName of cleanupOrder) {
      try {
        const component = this.getComponent(componentName) as any;
        if (component && typeof component.cleanup === 'function') {
          console.log(`🧹 清理组件: ${componentName}`);
          await component.cleanup();
        }
      } catch (error) {
        console.warn(`⚠️  清理组件 ${componentName} 失败:`, error);
      }
    }
    
    console.log('✅ Pipeline 资源清理完成');
  }
}

/**
 * 导出便捷的运行函数
 */
export async function runWeeklyGeneration(): Promise<void> {
  const pipeline = new WeeklyPipeline();
  
  try {
    await pipeline.initialize();
    await pipeline.run();
  } catch (error) {
    console.error('❌ 周刊生成失败:', error);
    throw error;
  } finally {
    await pipeline.cleanup();
  }
}

export default WeeklyPipeline;