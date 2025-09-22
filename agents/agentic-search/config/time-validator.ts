import { Component } from '@astack-tech/core';

/**
 * 时间窗口类型
 */
export type TimeWindow = '1h' | '6h' | '12h' | '24h' | '48h' | '7d' | '30d';

/**
 * 时效性验证器输入
 */
export interface TimeValidatorInput {
  /**
   * 内容时间戳
   */
  contentTimestamp: Date | string;
  
  /**
   * 要求的时间窗口
   */
  requiredTimeWindow: TimeWindow;
  
  /**
   * 参考时间（默认为当前时间）
   */
  referenceTime?: Date;
  
  /**
   * 内容元数据
   */
  metadata?: {
    source: 'google' | 'twitter' | 'github';
    contentType: string;
    url?: string;
    title?: string;
  };
}

/**
 * 时效性验证器输出
 */
export interface TimeValidatorOutput {
  /**
   * 是否通过时效性验证
   */
  isValid: boolean;
  
  /**
   * 内容年龄（毫秒）
   */
  ageMs: number;
  
  /**
   * 内容年龄（人类可读格式）
   */
  ageHuman: string;
  
  /**
   * 时效性得分 (0-1)
   */
  freshnessScore: number;
  
  /**
   * 验证详情
   */
  validation: {
    requiredWindow: TimeWindow;
    actualAge: string;
    passed: boolean;
    reason?: string;
  };
  
  /**
   * 时间分析
   */
  analysis: {
    /**
     * 时效性等级
     */
    freshnessLevel: 'expired' | 'stale' | 'fresh' | 'very-fresh';
    
    /**
     * 是否为近期热点
     */
    isTrending: boolean;
    
    /**
     * 推荐的时间窗口
     */
    recommendedWindow: TimeWindow;
  };
}

/**
 * 时效性验证器组件
 * 
 * 核心功能：
 * 1. 验证内容是否满足 24 小时时效性要求
 * 2. 计算内容新鲜度得分
 * 3. 提供时间窗口建议
 * 4. 支持多种时间格式解析
 */
export class TimeValidator extends Component {
  private timeWindowMs: Map<TimeWindow, number>;

  constructor() {
    super({});

    // 时间窗口映射（毫秒）
    this.timeWindowMs = new Map([
      ['1h', 60 * 60 * 1000],
      ['6h', 6 * 60 * 60 * 1000],
      ['12h', 12 * 60 * 60 * 1000],
      ['24h', 24 * 60 * 60 * 1000],
      ['48h', 48 * 60 * 60 * 1000],
      ['7d', 7 * 24 * 60 * 60 * 1000],
      ['30d', 30 * 24 * 60 * 60 * 1000]
    ]);

    // 配置端口
    Component.Port.I('input').attach(this);
    Component.Port.O('output').attach(this);
  }

  /**
   * 解析时间戳
   */
  private parseTimestamp(timestamp: Date | string): Date {
    if (timestamp instanceof Date) {
      return timestamp;
    }

    // 尝试多种时间格式
    const formats = [
      // ISO 8601
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z?$/,
      // Unix timestamp (秒)
      /^\d{10}$/,
      // Unix timestamp (毫秒)
      /^\d{13}$/,
      // 相对时间格式
      /^(\d+)\s*(minute|hour|day|week|month)s?\s*ago$/i,
      // GitHub API 格式
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/,
      // Twitter 格式示例
      /^[A-Za-z]{3}\s[A-Za-z]{3}\s\d{1,2}\s\d{2}:\d{2}:\d{2}\s\+\d{4}\s\d{4}$/
    ];

    try {
      // 直接尝试解析
      const parsed = new Date(timestamp);
      if (!isNaN(parsed.getTime())) {
        return parsed;
      }

      // Unix timestamp 处理
      if (/^\d{10}$/.test(timestamp)) {
        return new Date(parseInt(timestamp) * 1000);
      }
      
      if (/^\d{13}$/.test(timestamp)) {
        return new Date(parseInt(timestamp));
      }

      // 相对时间处理
      const relativeMatch = timestamp.match(/^(\d+)\s*(minute|hour|day|week|month)s?\s*ago$/i);
      if (relativeMatch) {
        const amount = parseInt(relativeMatch[1]);
        const unit = relativeMatch[2].toLowerCase();
        const now = new Date();
        
        switch (unit) {
          case 'minute':
            return new Date(now.getTime() - amount * 60 * 1000);
          case 'hour':
            return new Date(now.getTime() - amount * 60 * 60 * 1000);
          case 'day':
            return new Date(now.getTime() - amount * 24 * 60 * 60 * 1000);
          case 'week':
            return new Date(now.getTime() - amount * 7 * 24 * 60 * 60 * 1000);
          case 'month':
            return new Date(now.getTime() - amount * 30 * 24 * 60 * 60 * 1000);
        }
      }

      throw new Error(`无法解析时间格式: ${timestamp}`);
    } catch (error) {
      throw new Error(`时间解析失败: ${timestamp} - ${error instanceof Error ? error.message : '未知错误'}`);
    }
  }

  /**
   * 计算人类可读的时间差
   */
  private formatTimeDiff(ageMs: number): string {
    const seconds = Math.floor(ageMs / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    const weeks = Math.floor(days / 7);
    const months = Math.floor(days / 30);

    if (months > 0) return `${months} 个月前`;
    if (weeks > 0) return `${weeks} 周前`;
    if (days > 0) return `${days} 天前`;
    if (hours > 0) return `${hours} 小时前`;
    if (minutes > 0) return `${minutes} 分钟前`;
    return `${seconds} 秒前`;
  }

  /**
   * 计算新鲜度得分
   */
  private calculateFreshnessScore(ageMs: number): number {
    // 基于指数衰减计算新鲜度
    const hours = ageMs / (60 * 60 * 1000);
    
    if (hours <= 1) return 1.0;          // 1 小时内：满分
    if (hours <= 6) return 0.9;          // 6 小时内：优秀
    if (hours <= 24) return 0.7;         // 24 小时内：良好
    if (hours <= 48) return 0.5;         // 48 小时内：一般
    if (hours <= 168) return 0.3;        // 1 周内：较差
    return 0.1;                          // 超过 1 周：很差
  }

  /**
   * 分析时效性等级
   */
  private analyzeFreshness(ageMs: number, source?: string): TimeValidatorOutput['analysis'] {
    const hours = ageMs / (60 * 60 * 1000);
    
    let freshnessLevel: TimeValidatorOutput['analysis']['freshnessLevel'];
    let isTrending = false;
    let recommendedWindow: TimeWindow;

    if (hours <= 1) {
      freshnessLevel = 'very-fresh';
      isTrending = true;
      recommendedWindow = '1h';
    } else if (hours <= 6) {
      freshnessLevel = 'fresh';
      isTrending = hours <= 3; // 3 小时内可能是热点
      recommendedWindow = '6h';
    } else if (hours <= 24) {
      freshnessLevel = 'fresh';
      isTrending = false;
      recommendedWindow = '24h';
    } else if (hours <= 48) {
      freshnessLevel = 'stale';
      isTrending = false;
      recommendedWindow = '48h';
    } else {
      freshnessLevel = 'expired';
      isTrending = false;
      recommendedWindow = '7d';
    }

    // 根据来源调整判断
    if (source === 'github') {
      // GitHub 项目更新频率较低，标准可以放宽
      if (hours <= 168) { // 1 周内
        freshnessLevel = freshnessLevel === 'expired' ? 'stale' : freshnessLevel;
      }
    } else if (source === 'twitter') {
      // Twitter 内容时效性要求更高
      if (hours > 12) {
        freshnessLevel = freshnessLevel === 'fresh' ? 'stale' : freshnessLevel;
      }
    }

    return {
      freshnessLevel,
      isTrending,
      recommendedWindow
    };
  }

  /**
   * 独立运行组件
   */
  async run(input: TimeValidatorInput): Promise<TimeValidatorOutput> {
    console.log('⏰ 时效性验证器开始工作...');
    
    try {
      // 解析时间戳
      const contentTime = this.parseTimestamp(input.contentTimestamp);
      const referenceTime = input.referenceTime || new Date();
      
      // 计算时间差
      const ageMs = referenceTime.getTime() - contentTime.getTime();
      
      if (ageMs < 0) {
        console.warn('⚠️ 检测到未来时间，可能是时区问题');
      }

      // 获取要求的时间窗口
      const requiredWindowMs = this.timeWindowMs.get(input.requiredTimeWindow);
      if (!requiredWindowMs) {
        throw new Error(`不支持的时间窗口: ${input.requiredTimeWindow}`);
      }

      // 验证是否通过
      const isValid = Math.abs(ageMs) <= requiredWindowMs;
      const ageHuman = this.formatTimeDiff(Math.abs(ageMs));
      const freshnessScore = this.calculateFreshnessScore(Math.abs(ageMs));
      const analysis = this.analyzeFreshness(Math.abs(ageMs), input.metadata?.source);

      const output: TimeValidatorOutput = {
        isValid,
        ageMs: Math.abs(ageMs),
        ageHuman,
        freshnessScore,
        validation: {
          requiredWindow: input.requiredTimeWindow,
          actualAge: ageHuman,
          passed: isValid,
          reason: isValid ? undefined : `内容过期，超出 ${input.requiredTimeWindow} 时间窗口`
        },
        analysis
      };

      console.log('✅ 时效性验证完成:');
      console.log('   - 内容年龄:', ageHuman);
      console.log('   - 验证结果:', isValid ? '通过' : '未通过');
      console.log('   - 新鲜度得分:', freshnessScore.toFixed(2));
      console.log('   - 时效性等级:', analysis.freshnessLevel);

      return output;

    } catch (error) {
      console.error('❌ 时效性验证失败:', error);
      throw new Error(`时效性验证失败: ${error instanceof Error ? error.message : '未知错误'}`);
    }
  }

  /**
   * 在流水线中运行组件
   */
  _transform($i: any, $o: any): void {
    $i('input').receive(async (input: TimeValidatorInput) => {
      try {
        const output = await this.run(input);
        $o('output').send(output);
      } catch (error) {
        console.error(
          `[TimeValidator] 验证失败: ${error instanceof Error ? error.message : String(error)}`
        );
        throw error;
      }
    });
  }

  /**
   * 批量验证时效性
   */
  async validateBatch(inputs: TimeValidatorInput[]): Promise<TimeValidatorOutput[]> {
    console.log(`⏰ 批量验证 ${inputs.length} 个内容的时效性...`);
    
    const results = await Promise.all(
      inputs.map(input => this.run(input).catch(error => {
        console.warn(`验证失败: ${error.message}`);
        return null;
      }))
    );

    const validResults = results.filter(result => result !== null) as TimeValidatorOutput[];
    
    console.log(`✅ 批量验证完成: ${validResults.length}/${inputs.length} 个有效`);
    
    return validResults;
  }

  /**
   * 获取建议的时间窗口
   */
  getRecommendedTimeWindow(source: 'google' | 'twitter' | 'github', contentType?: string): TimeWindow {
    switch (source) {
      case 'twitter':
        // Twitter 内容时效性要求高
        return contentType === 'news' ? '6h' : '24h';
      
      case 'google':
        // Google 搜索结果中等时效性
        return contentType === 'news' ? '24h' : '48h';
      
      case 'github':
        // GitHub 项目更新较慢
        return contentType === 'release' ? '24h' : '7d';
      
      default:
        return '24h';
    }
  }

  /**
   * 检查是否为热点内容
   */
  isTrendingContent(timestamp: Date | string): boolean {
    try {
      const contentTime = this.parseTimestamp(timestamp);
      const ageMs = Date.now() - contentTime.getTime();
      const hours = ageMs / (60 * 60 * 1000);
      
      // 3 小时内的内容可能是热点
      return hours <= 3 && hours >= 0;
    } catch {
      return false;
    }
  }

  /**
   * 获取时效性统计
   */
  getTimeStats(timestamps: (Date | string)[]): {
    total: number;
    valid24h: number;
    fresh: number;
    stale: number;
    expired: number;
    averageAge: string;
  } {
    const now = new Date();
    const results = timestamps.map(ts => {
      try {
        const contentTime = this.parseTimestamp(ts);
        return now.getTime() - contentTime.getTime();
      } catch {
        return null;
      }
    }).filter(age => age !== null) as number[];

    const valid24h = results.filter(age => age <= 24 * 60 * 60 * 1000).length;
    const fresh = results.filter(age => age <= 6 * 60 * 60 * 1000).length;
    const stale = results.filter(age => age > 24 * 60 * 60 * 1000 && age <= 7 * 24 * 60 * 60 * 1000).length;
    const expired = results.filter(age => age > 7 * 24 * 60 * 60 * 1000).length;
    
    const averageAgeMs = results.length > 0 ? 
      results.reduce((sum, age) => sum + age, 0) / results.length : 0;

    return {
      total: results.length,
      valid24h,
      fresh,
      stale,
      expired,
      averageAge: this.formatTimeDiff(averageAgeMs)
    };
  }
}

export default TimeValidator;