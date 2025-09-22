import Piscina from 'piscina';
import { Component } from '@astack-tech/core';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { cpus } from 'os';

/**
 * Worker 任务类型
 */
export type WorkerTaskType = 
  | 'google-search'
  | 'twitter-search' 
  | 'github-search'
  | 'content-analysis'
  | 'quality-assessment'
  | 'data-processing';

/**
 * Worker 任务输入
 */
export interface WorkerTask {
  /**
   * 任务唯一标识
   */
  id: string;
  
  /**
   * 任务类型
   */
  type: WorkerTaskType;
  
  /**
   * 任务数据
   */
  data: any;
  
  /**
   * 任务优先级 (1-10, 10 最高)
   */
  priority: number;
  
  /**
   * 任务超时时间（毫秒）
   */
  timeout: number;
  
  /**
   * 创建时间
   */
  createdAt: Date;
}

/**
 * Worker 任务结果
 */
export interface WorkerTaskResult {
  /**
   * 任务 ID
   */
  taskId: string;
  
  /**
   * 执行是否成功
   */
  success: boolean;
  
  /**
   * 结果数据
   */
  data?: any;
  
  /**
   * 错误信息
   */
  error?: string;
  
  /**
   * 执行时间（毫秒）
   */
  executionTime: number;
  
  /**
   * Worker ID
   */
  workerId: string;
  
  /**
   * 完成时间
   */
  completedAt: Date;
}

/**
 * Worker 池配置
 */
export interface WorkerPoolConfig {
  /**
   * 最小 Worker 数量
   */
  minWorkers: number;
  
  /**
   * 最大 Worker 数量
   */
  maxWorkers: number;
  
  /**
   * Worker 空闲超时时间（毫秒）
   */
  idleTimeout: number;
  
  /**
   * 任务队列最大长度
   */
  maxQueueSize: number;
  
  /**
   * 任务默认超时时间（毫秒）
   */
  defaultTimeout: number;
  
  /**
   * 是否启用任务优先级
   */
  enablePriority: boolean;
  
  /**
   * Worker 文件路径配置
   */
  workerFiles: {
    [K in WorkerTaskType]: string;
  };
}

/**
 * 任务执行统计
 */
export interface TaskStats {
  total: number;
  completed: number;
  failed: number;
  pending: number;
  averageExecutionTime: number;
  throughput: number; // 每秒完成任务数
}

/**
 * Worker 池管理器
 * 
 * 功能特性：
 * 1. 多类型任务支持：搜索、分析、处理等不同类型任务
 * 2. 动态扩缩容：根据负载自动调整 Worker 数量
 * 3. 优先级队列：支持任务优先级调度
 * 4. 故障隔离：单个 Worker 失败不影响其他任务
 * 5. 性能监控：实时统计任务执行效率
 */
export class WorkerPool extends Component {
  private config: WorkerPoolConfig;
  private pools: Map<WorkerTaskType, Piscina>;
  private taskQueue: Map<WorkerTaskType, WorkerTask[]>;
  private activeTasks: Map<string, WorkerTask>;
  private taskResults: Map<string, WorkerTaskResult>;
  private stats: Map<WorkerTaskType, TaskStats>;
  private __dirname: string;

  constructor(config: Partial<WorkerPoolConfig> = {}) {
    super({});

    // 获取当前文件目录
    const __filename = fileURLToPath(import.meta.url);
    this.__dirname = dirname(__filename);

    // 默认配置
    this.config = {
      minWorkers: 2,
      maxWorkers: cpus().length,
      idleTimeout: 300000, // 5 分钟
      maxQueueSize: 1000,
      defaultTimeout: 60000, // 1 分钟
      enablePriority: true,
      workerFiles: {
        'google-search': join(this.__dirname, 'workers', 'google-search-worker.js'),
        'twitter-search': join(this.__dirname, 'workers', 'twitter-search-worker.js'),
        'github-search': join(this.__dirname, 'workers', 'github-search-worker.js'),
        'content-analysis': join(this.__dirname, 'workers', 'content-analysis-worker.js'),
        'quality-assessment': join(this.__dirname, 'workers', 'quality-assessment-worker.js'),
        'data-processing': join(this.__dirname, 'workers', 'data-processing-worker.js')
      },
      ...config
    };

    // 初始化数据结构
    this.pools = new Map();
    this.taskQueue = new Map();
    this.activeTasks = new Map();
    this.taskResults = new Map();
    this.stats = new Map();

    // 初始化各任务类型的队列和统计
    const taskTypes: WorkerTaskType[] = [
      'google-search', 'twitter-search', 'github-search',
      'content-analysis', 'quality-assessment', 'data-processing'
    ];

    for (const taskType of taskTypes) {
      this.taskQueue.set(taskType, []);
      this.stats.set(taskType, {
        total: 0,
        completed: 0,
        failed: 0,
        pending: 0,
        averageExecutionTime: 0,
        throughput: 0
      });
    }

    // 配置端口
    Component.Port.I('task').attach(this);
    Component.Port.O('result').attach(this);

    console.log('⚡ Worker 池管理器已初始化');
    console.log(`   - 最大 Worker 数: ${this.config.maxWorkers}`);
    console.log(`   - 支持任务类型: ${taskTypes.length} 种`);
  }

  /**
   * 初始化 Worker 池
   */
  async initialize(): Promise<void> {
    console.log('🎯 初始化 Worker 池...');

    const taskTypes: WorkerTaskType[] = [
      'google-search', 'twitter-search', 'github-search',
      'content-analysis', 'quality-assessment', 'data-processing'
    ];

    const initPromises = taskTypes.map(async (taskType) => {
      try {
        const pool = new Piscina({
          filename: this.config.workerFiles[taskType],
          minThreads: Math.max(1, Math.floor(this.config.minWorkers / taskTypes.length)),
          maxThreads: Math.max(2, Math.floor(this.config.maxWorkers / taskTypes.length)),
          idleTimeout: this.config.idleTimeout,
          maxQueue: Math.floor(this.config.maxQueueSize / taskTypes.length)
        });

        this.pools.set(taskType, pool);
        console.log(`✅ ${taskType} Worker 池已创建`);
        return true;
      } catch (error) {
        console.error(`❌ 创建 ${taskType} Worker 池失败:`, error);
        return false;
      }
    });

    const results = await Promise.all(initPromises);
    const successCount = results.filter(success => success).length;

    console.log(`✅ Worker 池初始化完成: ${successCount}/${taskTypes.length} 个类型`);

    if (successCount === 0) {
      throw new Error('Worker 池初始化失败：无法创建任何池');
    }
  }

  /**
   * 提交任务
   */
  async submitTask(
    type: WorkerTaskType,
    data: any,
    options: {
      priority?: number;
      timeout?: number;
      id?: string;
    } = {}
  ): Promise<string> {
    const task: WorkerTask = {
      id: options.id || `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type,
      data,
      priority: options.priority || 5,
      timeout: options.timeout || this.config.defaultTimeout,
      createdAt: new Date()
    };

    console.log(`📋 提交任务: ${task.id} (${type})`);

    // 检查队列容量
    const queue = this.taskQueue.get(type)!;
    if (queue.length >= Math.floor(this.config.maxQueueSize / 6)) {
      throw new Error(`${type} 任务队列已满`);
    }

    // 添加到队列
    queue.push(task);
    
    // 如果启用优先级，则排序队列
    if (this.config.enablePriority) {
      queue.sort((a, b) => b.priority - a.priority);
    }

    // 更新统计
    const stats = this.stats.get(type)!;
    stats.total++;
    stats.pending++;

    // 立即尝试执行任务
    this.processNextTask(type);

    return task.id;
  }

  /**
   * 处理下一个任务
   */
  private async processNextTask(type: WorkerTaskType): Promise<void> {
    const queue = this.taskQueue.get(type)!;
    const pool = this.pools.get(type);

    if (queue.length === 0 || !pool) {
      return;
    }

    const task = queue.shift()!;
    this.activeTasks.set(task.id, task);

    console.log(`🔄 开始执行任务: ${task.id}`);

    const startTime = Date.now();

    try {
      // 使用 Piscina 执行任务
      const result = await Promise.race([
        pool.run(task.data),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('任务执行超时')), task.timeout)
        )
      ]);

      const executionTime = Date.now() - startTime;

      const taskResult: WorkerTaskResult = {
        taskId: task.id,
        success: true,
        data: result,
        executionTime,
        workerId: `worker_${type}`,
        completedAt: new Date()
      };

      this.taskResults.set(task.id, taskResult);
      this.updateStats(type, true, executionTime);

      console.log(`✅ 任务完成: ${task.id} (${executionTime}ms)`);

    } catch (error) {
      const executionTime = Date.now() - startTime;

      const taskResult: WorkerTaskResult = {
        taskId: task.id,
        success: false,
        error: error instanceof Error ? error.message : '未知错误',
        executionTime,
        workerId: `worker_${type}`,
        completedAt: new Date()
      };

      this.taskResults.set(task.id, taskResult);
      this.updateStats(type, false, executionTime);

      console.error(`❌ 任务失败: ${task.id}`, error);

    } finally {
      this.activeTasks.delete(task.id);
      
      // 继续处理队列中的下一个任务
      if (queue.length > 0) {
        setTimeout(() => this.processNextTask(type), 100);
      }
    }
  }

  /**
   * 更新统计信息
   */
  private updateStats(type: WorkerTaskType, success: boolean, executionTime: number): void {
    const stats = this.stats.get(type)!;
    
    if (success) {
      stats.completed++;
    } else {
      stats.failed++;
    }
    
    stats.pending--;
    
    // 更新平均执行时间
    const totalCompleted = stats.completed + stats.failed;
    stats.averageExecutionTime = (
      (stats.averageExecutionTime * (totalCompleted - 1) + executionTime) / totalCompleted
    );
    
    // 计算吞吐量（简化版，基于最近的性能）
    stats.throughput = totalCompleted > 0 ? 1000 / stats.averageExecutionTime : 0;
  }

  /**
   * 获取任务结果
   */
  getTaskResult(taskId: string): WorkerTaskResult | null {
    return this.taskResults.get(taskId) || null;
  }

  /**
   * 等待任务完成
   */
  async waitForTask(taskId: string, checkInterval: number = 1000): Promise<WorkerTaskResult> {
    return new Promise((resolve, reject) => {
      const checkResult = () => {
        const result = this.getTaskResult(taskId);
        if (result) {
          resolve(result);
          return;
        }

        // 检查任务是否还在队列或执行中
        const isActive = this.activeTasks.has(taskId);
        const isQueued = Array.from(this.taskQueue.values()).some(queue =>
          queue.some(task => task.id === taskId)
        );

        if (!isActive && !isQueued) {
          reject(new Error(`任务不存在: ${taskId}`));
          return;
        }

        setTimeout(checkResult, checkInterval);
      };

      checkResult();
    });
  }

  /**
   * 批量提交任务
   */
  async submitBatchTasks(
    tasks: Array<{
      type: WorkerTaskType;
      data: any;
      priority?: number;
      timeout?: number;
    }>
  ): Promise<string[]> {
    console.log(`📦 批量提交 ${tasks.length} 个任务`);

    const taskIds = await Promise.all(
      tasks.map(task => this.submitTask(task.type, task.data, {
        priority: task.priority,
        timeout: task.timeout
      }))
    );

    return taskIds;
  }

  /**
   * 等待批量任务完成
   */
  async waitForBatchTasks(taskIds: string[]): Promise<WorkerTaskResult[]> {
    console.log(`⏳ 等待 ${taskIds.length} 个任务完成`);

    const results = await Promise.all(
      taskIds.map(taskId => this.waitForTask(taskId))
    );

    const successCount = results.filter(result => result.success).length;
    console.log(`✅ 批量任务完成: ${successCount}/${taskIds.length} 成功`);

    return results;
  }

  /**
   * 获取池状态统计
   */
  getPoolStats(): {
    [K in WorkerTaskType]: TaskStats & {
      queueSize: number;
      activeTasks: number;
      poolUtilization: number;
    };
  } {
    const result = {} as any;

    for (const [type, stats] of this.stats) {
      const queue = this.taskQueue.get(type)!;
      const pool = this.pools.get(type);
      const activeCount = Array.from(this.activeTasks.values())
        .filter(task => task.type === type).length;

      result[type] = {
        ...stats,
        queueSize: queue.length,
        activeTasks: activeCount,
        poolUtilization: pool ? (activeCount / pool.threads.length) : 0
      };
    }

    return result;
  }

  /**
   * 清理完成的任务结果
   */
  cleanupResults(olderThanMs: number = 3600000): void {
    const cutoffTime = Date.now() - olderThanMs;
    let cleanedCount = 0;

    for (const [taskId, result] of this.taskResults) {
      if (result.completedAt.getTime() < cutoffTime) {
        this.taskResults.delete(taskId);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      console.log(`🧹 清理了 ${cleanedCount} 个历史任务结果`);
    }
  }

  /**
   * 独立运行组件
   */
  async run(input: {
    action: 'submit' | 'result' | 'batch' | 'stats';
    type?: WorkerTaskType;
    data?: any;
    taskId?: string;
    tasks?: Array<{ type: WorkerTaskType; data: any; priority?: number; }>;
    options?: any;
  }): Promise<any> {
    switch (input.action) {
      case 'submit':
        if (!input.type || input.data === undefined) {
          throw new Error('提交任务需要 type 和 data');
        }
        return await this.submitTask(input.type, input.data, input.options || {});

      case 'result':
        if (!input.taskId) {
          throw new Error('获取结果需要 taskId');
        }
        return this.getTaskResult(input.taskId);

      case 'batch':
        if (!input.tasks) {
          throw new Error('批量任务需要 tasks 数组');
        }
        const taskIds = await this.submitBatchTasks(input.tasks);
        const results = await this.waitForBatchTasks(taskIds);
        return { taskIds, results };

      case 'stats':
        return this.getPoolStats();

      default:
        throw new Error(`不支持的操作: ${input.action}`);
    }
  }

  /**
   * 在流水线中运行组件
   */
  _transform($i: any, $o: any): void {
    $i('task').receive(async (input: any) => {
      try {
        const result = await this.run(input);
        $o('result').send(result);
      } catch (error) {
        console.error(
          `[WorkerPool] 操作失败: ${error instanceof Error ? error.message : String(error)}`
        );
        throw error;
      }
    });
  }

  /**
   * 销毁 Worker 池
   */
  async destroy(): Promise<void> {
    console.log('💥 销毁 Worker 池...');

    // 等待所有活动任务完成或超时
    const maxWaitTime = 30000; // 30 秒
    const startTime = Date.now();

    while (this.activeTasks.size > 0 && (Date.now() - startTime) < maxWaitTime) {
      console.log(`⏳ 等待 ${this.activeTasks.size} 个任务完成...`);
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    // 强制关闭所有池
    const destroyPromises = Array.from(this.pools.values()).map(pool => 
      pool.destroy().catch(error => {
        console.error('关闭 Worker 池失败:', error);
      })
    );

    await Promise.all(destroyPromises);

    // 清理数据
    this.activeTasks.clear();
    this.taskResults.clear();
    this.pools.clear();

    console.log('✅ Worker 池已销毁');
  }
}

export default WorkerPool;