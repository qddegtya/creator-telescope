/**
 * Agentic Search 基础设施
 * 
 * 高性能并发处理基础设施，包括：
 * - 浏览器池管理（Playwright headless）
 * - 线程池管理（Piscina 集成）
 * - 反爬虫机制
 * - 故障自愈
 */

export {
  BrowserPool,
  type BrowserInstance,
  type PageLease,
  type BrowserPoolConfig
} from './browser-pool.js';

export {
  WorkerPool,
  type WorkerTask,
  type WorkerTaskResult,
  type WorkerPoolConfig,
  type WorkerTaskType,
  type TaskStats
} from './worker-pool.js';

/**
 * 基础设施管理器
 * 
 * 统一管理浏览器池和 Worker 池，提供高层次抽象
 */
export class Infrastructure {
  private browserPool?: BrowserPool;
  private workerPool?: WorkerPool;
  private initialized: boolean = false;

  constructor(
    private config: {
      browser?: Partial<BrowserPoolConfig>;
      worker?: Partial<WorkerPoolConfig>;
    } = {}
  ) {}

  /**
   * 初始化所有基础设施
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      console.log('⚠️ 基础设施已初始化');
      return;
    }

    console.log('🚀 初始化 Agentic Search 基础设施...');

    try {
      // 并行初始化浏览器池和 Worker 池
      const [browserResult, workerResult] = await Promise.allSettled([
        this.initializeBrowserPool(),
        this.initializeWorkerPool()
      ]);

      // 检查初始化结果
      if (browserResult.status === 'rejected') {
        console.error('❌ 浏览器池初始化失败:', browserResult.reason);
        throw new Error('浏览器池初始化失败');
      }

      if (workerResult.status === 'rejected') {
        console.error('❌ Worker 池初始化失败:', workerResult.reason);
        throw new Error('Worker 池初始化失败');
      }

      this.initialized = true;
      console.log('✅ 基础设施初始化完成');

    } catch (error) {
      console.error('❌ 基础设施初始化失败:', error);
      await this.cleanup();
      throw error;
    }
  }

  /**
   * 初始化浏览器池
   */
  private async initializeBrowserPool(): Promise<void> {
    this.browserPool = new BrowserPool(this.config.browser);
    await this.browserPool.initialize();
  }

  /**
   * 初始化 Worker 池
   */
  private async initializeWorkerPool(): Promise<void> {
    this.workerPool = new WorkerPool(this.config.worker);
    await this.workerPool.initialize();
  }

  /**
   * 获取浏览器池实例
   */
  getBrowserPool(): BrowserPool {
    if (!this.browserPool) {
      throw new Error('浏览器池未初始化');
    }
    return this.browserPool;
  }

  /**
   * 获取 Worker 池实例
   */
  getWorkerPool(): WorkerPool {
    if (!this.workerPool) {
      throw new Error('Worker 池未初始化');
    }
    return this.workerPool;
  }

  /**
   * 租借页面（便捷方法）
   */
  async leasePage(timeout?: number): Promise<PageLease> {
    return this.getBrowserPool().leasePage(timeout);
  }

  /**
   * 归还页面（便捷方法）
   */
  async returnPage(leaseId: string): Promise<void> {
    return this.getBrowserPool().returnPage(leaseId);
  }

  /**
   * 提交 Worker 任务（便捷方法）
   */
  async submitTask(
    type: WorkerTaskType,
    data: any,
    options?: {
      priority?: number;
      timeout?: number;
      id?: string;
    }
  ): Promise<string> {
    return this.getWorkerPool().submitTask(type, data, options);
  }

  /**
   * 等待任务完成（便捷方法）
   */
  async waitForTask(taskId: string): Promise<WorkerTaskResult> {
    return this.getWorkerPool().waitForTask(taskId);
  }

  /**
   * 批量提交任务（便捷方法）
   */
  async submitBatchTasks(
    tasks: Array<{
      type: WorkerTaskType;
      data: any;
      priority?: number;
      timeout?: number;
    }>
  ): Promise<string[]> {
    return this.getWorkerPool().submitBatchTasks(tasks);
  }

  /**
   * 等待批量任务完成（便捷方法）
   */
  async waitForBatchTasks(taskIds: string[]): Promise<WorkerTaskResult[]> {
    return this.getWorkerPool().waitForBatchTasks(taskIds);
  }

  /**
   * 获取基础设施状态
   */
  getStatus(): {
    initialized: boolean;
    browser: any;
    worker: any;
  } {
    return {
      initialized: this.initialized,
      browser: this.browserPool ? this.browserPool.getPoolStats() : null,
      worker: this.workerPool ? this.workerPool.getPoolStats() : null
    };
  }

  /**
   * 清理资源
   */
  async cleanup(): Promise<void> {
    console.log('🧹 清理基础设施资源...');

    const cleanupPromises = [];

    if (this.browserPool) {
      cleanupPromises.push(
        this.browserPool.destroy().catch(error => {
          console.error('浏览器池清理失败:', error);
        })
      );
    }

    if (this.workerPool) {
      cleanupPromises.push(
        this.workerPool.destroy().catch(error => {
          console.error('Worker 池清理失败:', error);
        })
      );
    }

    await Promise.all(cleanupPromises);

    this.browserPool = undefined;
    this.workerPool = undefined;
    this.initialized = false;

    console.log('✅ 基础设施资源清理完成');
  }

  /**
   * 健康检查
   */
  async healthCheck(): Promise<{
    healthy: boolean;
    issues: string[];
    details: any;
  }> {
    const issues: string[] = [];
    const details: any = {};

    if (!this.initialized) {
      issues.push('基础设施未初始化');
      return { healthy: false, issues, details };
    }

    try {
      // 检查浏览器池
      if (this.browserPool) {
        const browserStats = this.browserPool.getPoolStats();
        details.browser = browserStats;
        
        if (browserStats.totalInstances === 0) {
          issues.push('没有可用的浏览器实例');
        }
        
        if (browserStats.errorInstances > browserStats.totalInstances * 0.5) {
          issues.push('超过 50% 的浏览器实例处于错误状态');
        }
      }

      // 检查 Worker 池
      if (this.workerPool) {
        const workerStats = this.workerPool.getPoolStats();
        details.worker = workerStats;
        
        let totalPending = 0;
        let totalActive = 0;
        
        for (const stats of Object.values(workerStats)) {
          totalPending += stats.queueSize;
          totalActive += stats.activeTasks;
        }
        
        if (totalPending > 100) {
          issues.push('Worker 队列积压过多');
        }
        
        if (totalActive === 0 && totalPending > 0) {
          issues.push('有待处理任务但没有活动 Worker');
        }
      }

      return {
        healthy: issues.length === 0,
        issues,
        details
      };

    } catch (error) {
      issues.push(`健康检查失败: ${error instanceof Error ? error.message : '未知错误'}`);
      return { healthy: false, issues, details };
    }
  }
}

/**
 * 创建基础设施实例的便捷函数
 */
export function createInfrastructure(config?: {
  browser?: Partial<BrowserPoolConfig>;
  worker?: Partial<WorkerPoolConfig>;
}): Infrastructure {
  return new Infrastructure(config);
}

/**
 * 默认导出
 */
export default Infrastructure;