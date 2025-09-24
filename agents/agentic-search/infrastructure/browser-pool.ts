import { chromium, Browser, BrowserContext, Page } from 'playwright';
import { Component } from '@astack-tech/core';

/**
 * 浏览器实例状态
 */
export interface BrowserInstance {
  id: string;
  browser: Browser;
  context: BrowserContext;
  status: 'idle' | 'busy' | 'error' | 'closed';
  createdAt: Date;
  lastUsed: Date;
  usageCount: number;
  maxUsage: number;
}

/**
 * 页面租借信息
 */
export interface PageLease {
  id: string;
  page: Page;
  browserInstance: BrowserInstance;
  leasedAt: Date;
  timeout: number;
}

/**
 * 浏览器池配置
 */
export interface BrowserPoolConfig {
  /**
   * 最小浏览器实例数
   */
  minInstances: number;
  
  /**
   * 最大浏览器实例数
   */
  maxInstances: number;
  
  /**
   * 单个浏览器最大使用次数
   */
  maxUsagePerBrowser: number;
  
  /**
   * 浏览器空闲超时时间（毫秒）
   */
  idleTimeout: number;
  
  /**
   * 页面操作超时时间（毫秒）
   */
  pageTimeout: number;
  
  /**
   * 是否启用隐身模式
   */
  incognito: boolean;
  
  /**
   * 反爬虫配置
   */
  antiCrawling: {
    /**
     * 用户代理轮换
     */
    userAgentRotation: boolean;
    
    /**
     * 请求延迟范围（毫秒）
     */
    requestDelayRange: [number, number];
    
    /**
     * 视口大小轮换
     */
    viewportRotation: boolean;
    
    /**
     * 禁用图片加载
     */
    disableImages: boolean;
    
    /**
     * 禁用 CSS 加载
     */
    disableCSS: boolean;
  };
}

/**
 * 浏览器池管理器
 * 
 * 功能特性：
 * 1. 动态扩缩容：根据负载自动调整浏览器实例数量
 * 2. 智能复用：避免频繁创建销毁浏览器实例
 * 3. 反爬虫机制：用户代理轮换、请求延迟、视口轮换
 * 4. 故障自愈：自动检测并重启异常实例
 * 5. 资源清理：定期清理超时和过期实例
 */
export class BrowserPool extends Component {
  private config: BrowserPoolConfig;
  private instances: Map<string, BrowserInstance>;
  private leases: Map<string, PageLease>;
  private userAgents: string[];
  private viewportSizes: { width: number; height: number }[];
  private cleanupInterval: NodeJS.Timeout | null;
  private currentUserAgentIndex: number;
  private currentViewportIndex: number;

  constructor(config: Partial<BrowserPoolConfig> = {}) {
    super({});

    // 默认配置
    this.config = {
      minInstances: 2,
      maxInstances: 10,
      maxUsagePerBrowser: 50,
      idleTimeout: 600000, // 10 分钟 - 增加闲置超时
      pageTimeout: 300000, // 5 分钟 - 大幅增加页面超时，适应Browser Use Agent和HILT
      incognito: true,
      antiCrawling: {
        userAgentRotation: true,
        requestDelayRange: [1000, 3000],
        viewportRotation: true,
        disableImages: true,
        disableCSS: false
      },
      ...config
    };

    // 初始化数据结构
    this.instances = new Map();
    this.leases = new Map();
    this.currentUserAgentIndex = 0;
    this.currentViewportIndex = 0;

    // 常见的用户代理字符串（用于反爬虫）
    this.userAgents = [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/121.0',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:109.0) Gecko/20100101 Firefox/121.0',
      'Mozilla/5.0 (X11; Linux x86_64; rv:109.0) Gecko/20100101 Firefox/121.0',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0'
    ];

    // 常见的视口大小
    this.viewportSizes = [
      { width: 1920, height: 1080 },
      { width: 1366, height: 768 },
      { width: 1536, height: 864 },
      { width: 1440, height: 900 },
      { width: 1280, height: 720 },
      { width: 1024, height: 768 }
    ];

    // 启动清理定时器
    this.startCleanupTimer();

    // 配置端口
    Component.Port.I('request').attach(this);
    Component.Port.O('lease').attach(this);

    console.log('🌐 浏览器池管理器已初始化');
    console.log(`   - 最小实例: ${this.config.minInstances}`);
    console.log(`   - 最大实例: ${this.config.maxInstances}`);
    console.log(`   - 反爬虫模式: ${this.config.antiCrawling.userAgentRotation ? '启用' : '禁用'}`);
  }

  /**
   * 启动清理定时器
   */
  private startCleanupTimer(): void {
    this.cleanupInterval = setInterval(() => {
      this.cleanupIdleInstances();
      this.cleanupExpiredLeases();
    }, 60000); // 每分钟清理一次
  }

  /**
   * 获取下一个用户代理
   */
  private getNextUserAgent(): string {
    if (!this.config.antiCrawling.userAgentRotation) {
      return this.userAgents[0];
    }

    const userAgent = this.userAgents[this.currentUserAgentIndex];
    this.currentUserAgentIndex = (this.currentUserAgentIndex + 1) % this.userAgents.length;
    return userAgent;
  }

  /**
   * 获取下一个视口大小
   */
  private getNextViewport(): { width: number; height: number } {
    if (!this.config.antiCrawling.viewportRotation) {
      return this.viewportSizes[0];
    }

    const viewport = this.viewportSizes[this.currentViewportIndex];
    this.currentViewportIndex = (this.currentViewportIndex + 1) % this.viewportSizes.length;
    return viewport;
  }

  /**
   * 创建新的浏览器实例
   */
  private async createBrowserInstance(): Promise<BrowserInstance> {
    console.log('🚀 创建新的浏览器实例...');

    try {
      // 浏览器启动选项 - 可视化模式便于调试和干预
      const launchOptions: any = {
        headless: false,         // 改为可视化模式
        slowMo: 50,             // 略微减慢操作速度，便于观察
        args: [
          '--start-maximized',    // 最大化窗口
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--no-first-run',
          '--disable-background-timer-throttling',
          '--disable-backgrounding-occluded-windows',
          '--disable-renderer-backgrounding',
          '--disable-features=TranslateUI',
          '--disable-ipc-flooding-protection'
        ]
      };

      // 启动浏览器
      const browser = await chromium.launch(launchOptions);

      // 创建浏览器上下文
      const contextOptions: any = {
        userAgent: this.getNextUserAgent(),
        viewport: this.getNextViewport(),
        ignoreHTTPSErrors: true,
        locale: 'en-US',
        timezoneId: 'America/New_York'
      };

      // 反爬虫配置
      if (this.config.antiCrawling.disableImages) {
        contextOptions.extraHTTPHeaders = {
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'
        };
      }

      const context = await browser.newContext(contextOptions);

      // 禁用图片和 CSS（如果配置）
      if (this.config.antiCrawling.disableImages || this.config.antiCrawling.disableCSS) {
        await context.route('**/*', (route) => {
          const resourceType = route.request().resourceType();
          
          if (this.config.antiCrawling.disableImages && resourceType === 'image') {
            route.abort();
            return;
          }
          
          if (this.config.antiCrawling.disableCSS && resourceType === 'stylesheet') {
            route.abort();
            return;
          }
          
          route.continue();
        });
      }

      const instance: BrowserInstance = {
        id: `browser_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        browser,
        context,
        status: 'idle',
        createdAt: new Date(),
        lastUsed: new Date(),
        usageCount: 0,
        maxUsage: this.config.maxUsagePerBrowser
      };

      this.instances.set(instance.id, instance);
      console.log(`✅ 浏览器实例创建成功: ${instance.id}`);
      
      return instance;

    } catch (error) {
      console.error('❌ 创建浏览器实例失败:', error);
      throw error;
    }
  }

  /**
   * 获取可用的浏览器实例
   */
  private async getAvailableInstance(): Promise<BrowserInstance> {
    // 查找空闲实例
    for (const instance of this.instances.values()) {
      if (instance.status === 'idle' && instance.usageCount < instance.maxUsage) {
        return instance;
      }
    }

    // 如果没有空闲实例且未达到最大数量，创建新实例
    if (this.instances.size < this.config.maxInstances) {
      return await this.createBrowserInstance();
    }

    // 等待实例可用
    return new Promise((resolve, reject) => {
      const checkInterval = setInterval(() => {
        for (const instance of this.instances.values()) {
          if (instance.status === 'idle' && instance.usageCount < instance.maxUsage) {
            clearInterval(checkInterval);
            resolve(instance);
            return;
          }
        }
      }, 1000);

      // 超时处理
      setTimeout(() => {
        clearInterval(checkInterval);
        reject(new Error('获取浏览器实例超时'));
      }, 30000);
    });
  }

  /**
   * 租借页面
   */
  async leasePage(timeout?: number): Promise<PageLease> {
    if (this.isDestroyed || this.isDestroying) {
      throw new Error('浏览器池已销毁或正在销毁，无法租借页面');
    }

    console.log('📄 租借新页面...');

    try {
      // 获取可用实例
      const instance = await this.getAvailableInstance();
      
      // 再次检查是否已被销毁
      if (this.isDestroyed || this.isDestroying) {
        throw new Error('浏览器池在租借过程中被销毁');
      }
      
      instance.status = 'busy';
      instance.lastUsed = new Date();
      instance.usageCount++;

      // 创建新页面
      const page = await instance.context.newPage();

      // 设置页面超时
      const pageTimeout = timeout || this.config.pageTimeout;
      page.setDefaultTimeout(pageTimeout);
      page.setDefaultNavigationTimeout(pageTimeout);

      // 反爬虫：随机延迟
      if (this.config.antiCrawling.requestDelayRange) {
        const [min, max] = this.config.antiCrawling.requestDelayRange;
        const delay = Math.floor(Math.random() * (max - min + 1)) + min;
        await new Promise(resolve => setTimeout(resolve, delay));
      }

      const lease: PageLease = {
        id: `lease_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        page,
        browserInstance: instance,
        leasedAt: new Date(),
        timeout: pageTimeout
      };

      this.leases.set(lease.id, lease);
      console.log(`✅ 页面租借成功: ${lease.id}`);

      return lease;

    } catch (error) {
      console.error('❌ 页面租借失败:', error);
      throw error;
    }
  }

  /**
   * 归还页面
   */
  async returnPage(leaseId: string): Promise<void> {
    console.log(`🔄 归还页面: ${leaseId}`);

    const lease = this.leases.get(leaseId);
    if (!lease) {
      console.warn(`⚠️ 未找到租借记录: ${leaseId}`);
      return;
    }

    try {
      // 关闭页面
      if (!lease.page.isClosed()) {
        await lease.page.close();
      }

      // 更新实例状态
      lease.browserInstance.status = 'idle';
      lease.browserInstance.lastUsed = new Date();

      // 移除租借记录
      this.leases.delete(leaseId);

      console.log(`✅ 页面归还成功: ${leaseId}`);

    } catch (error) {
      console.error(`❌ 页面归还失败: ${leaseId}`, error);
      
      // 标记实例为错误状态
      lease.browserInstance.status = 'error';
      this.leases.delete(leaseId);
    }
  }

  /**
   * 清理空闲实例
   */
  private async cleanupIdleInstances(): Promise<void> {
    const now = new Date();
    const instancesToRemove: string[] = [];

    for (const [id, instance] of this.instances) {
      const idleTime = now.getTime() - instance.lastUsed.getTime();
      
      // 清理条件：空闲超时、使用次数超限、错误状态
      if (
        (instance.status === 'idle' && idleTime > this.config.idleTimeout) ||
        (instance.usageCount >= instance.maxUsage) ||
        (instance.status === 'error')
      ) {
        instancesToRemove.push(id);
      }
    }

    // 保持最小实例数
    const activeInstances = this.instances.size - instancesToRemove.length;
    if (activeInstances < this.config.minInstances) {
      const keepCount = this.config.minInstances - activeInstances;
      instancesToRemove.splice(0, Math.min(keepCount, instancesToRemove.length));
    }

    // 清理实例
    for (const id of instancesToRemove) {
      await this.closeInstance(id);
    }

    if (instancesToRemove.length > 0) {
      console.log(`🧹 清理了 ${instancesToRemove.length} 个浏览器实例`);
    }
  }

  /**
   * 清理过期租借
   */
  private async cleanupExpiredLeases(): Promise<void> {
    const now = new Date();
    const expiredLeases: string[] = [];

    for (const [id, lease] of this.leases) {
      const leaseTime = now.getTime() - lease.leasedAt.getTime();
      if (leaseTime > lease.timeout) {
        expiredLeases.push(id);
      }
    }

    // 强制归还过期租借
    for (const leaseId of expiredLeases) {
      console.warn(`⚠️ 强制归还过期页面: ${leaseId}`);
      await this.returnPage(leaseId);
    }
  }

  /**
   * 关闭浏览器实例
   */
  private async closeInstance(instanceId: string): Promise<void> {
    const instance = this.instances.get(instanceId);
    if (!instance) return;

    try {
      instance.status = 'closed';
      
      // 关闭所有该实例的租借页面
      const relatedLeases = Array.from(this.leases.entries())
        .filter(([_, lease]) => lease.browserInstance.id === instanceId)
        .map(([leaseId]) => leaseId);
      
      for (const leaseId of relatedLeases) {
        try {
          await this.returnPage(leaseId);
        } catch (error) {
          console.error(`❌ 关闭租借 ${leaseId} 失败:`, error);
        }
      }

      // 关闭浏览器上下文
      if (instance.context && !instance.context.closed) {
        await instance.context.close();
      }
      
      // 关闭浏览器
      if (instance.browser && instance.browser.isConnected()) {
        await instance.browser.close();
      }
      
      this.instances.delete(instanceId);
      console.log(`🗑️ 浏览器实例已关闭: ${instanceId}`);
    } catch (error) {
      console.error(`❌ 关闭浏览器实例失败: ${instanceId}`, error);
      // 即使关闭失败，也要从集合中移除
      this.instances.delete(instanceId);
    }
  }

  /**
   * 初始化浏览器池
   */
  async initialize(): Promise<void> {
    console.log('🎯 初始化浏览器池...');

    // 创建最小数量的实例
    const initPromises = Array.from({ length: this.config.minInstances }, () =>
      this.createBrowserInstance().catch(error => {
        console.error('初始化浏览器实例失败:', error);
        return null;
      })
    );

    const results = await Promise.all(initPromises);
    const successCount = results.filter(result => result !== null).length;

    console.log(`✅ 浏览器池初始化完成: ${successCount}/${this.config.minInstances} 个实例`);

    if (successCount === 0) {
      throw new Error('浏览器池初始化失败：无法创建任何实例');
    }
  }

  /**
   * 获取池状态统计
   */
  getPoolStats(): {
    totalInstances: number;
    idleInstances: number;
    busyInstances: number;
    errorInstances: number;
    activeLeases: number;
    totalUsage: number;
  } {
    let idle = 0, busy = 0, error = 0, totalUsage = 0;

    for (const instance of this.instances.values()) {
      switch (instance.status) {
        case 'idle': idle++; break;
        case 'busy': busy++; break;
        case 'error': error++; break;
      }
      totalUsage += instance.usageCount;
    }

    return {
      totalInstances: this.instances.size,
      idleInstances: idle,
      busyInstances: busy,
      errorInstances: error,
      activeLeases: this.leases.size,
      totalUsage
    };
  }

  /**
   * 独立运行组件
   */
  async run(request: { action: 'lease' | 'return', leaseId?: string, timeout?: number }): Promise<any> {
    switch (request.action) {
      case 'lease':
        return await this.leasePage(request.timeout);
      
      case 'return':
        if (!request.leaseId) {
          throw new Error('归还页面需要提供 leaseId');
        }
        await this.returnPage(request.leaseId);
        return { success: true };
      
      default:
        throw new Error(`不支持的操作: ${request.action}`);
    }
  }

  /**
   * 在流水线中运行组件
   */
  _transform($i: any, $o: any): void {
    $i('request').receive(async (request: any) => {
      try {
        const result = await this.run(request);
        $o('lease').send(result);
      } catch (error) {
        console.error(
          `[BrowserPool] 操作失败: ${error instanceof Error ? error.message : String(error)}`
        );
        throw error;
      }
    });
  }

  /**
   * 销毁浏览器池
   */
  private isDestroyed = false;
  private isDestroying = false;

  async destroy(): Promise<void> {
    if (this.isDestroyed) {
      console.log('⚠️ 浏览器池已经销毁，跳过重复销毁');
      return;
    }

    if (this.isDestroying) {
      console.log('⚠️ 浏览器池正在销毁中，等待完成...');
      // 等待正在进行的销毁操作完成
      while (this.isDestroying && !this.isDestroyed) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      return;
    }

    console.log('💥 销毁浏览器池...');
    this.isDestroying = true;

    try {
      // 停止清理定时器
      if (this.cleanupInterval) {
        clearInterval(this.cleanupInterval);
        this.cleanupInterval = null;
      }

      // 先关闭所有租借
      console.log(`🔄 关闭 ${this.leases.size} 个活跃租借...`);
      const leaseIds = Array.from(this.leases.keys());
      await Promise.all(leaseIds.map(id => this.returnPage(id)));

      // 再关闭所有实例
      console.log(`🔄 关闭 ${this.instances.size} 个浏览器实例...`);
      const closePromises = Array.from(this.instances.keys()).map(id => 
        this.closeInstance(id).catch(error => {
          console.error(`❌ 关闭实例 ${id} 失败:`, error);
        })
      );

      await Promise.all(closePromises);
      
      // 清空数据结构
      this.instances.clear();
      this.leases.clear();
      
      console.log('✅ 浏览器池已销毁');
    } catch (error) {
      console.error('❌ 浏览器池销毁过程中出错:', error);
    } finally {
      this.isDestroyed = true;
      this.isDestroying = false;
    }
  }
}

export default BrowserPool;