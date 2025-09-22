import { Tool } from '@astack-tech/tools';
import { SearchContent } from '../types/multi-agent.js';

/**
 * 数据格式转换工具
 * 转换不同格式的数据以适应不同的输出需求
 */
export class DataFormatConverterTool implements Tool {
  name = 'convert_data_format';
  description = '转换数据格式，支持 JSON、CSV、XML、Markdown 等格式';
  parameters = {
    type: 'object',
    properties: {
      data: {
        type: 'array',
        items: { type: 'object' },
        description: '需要转换的数据'
      },
      outputFormat: {
        type: 'string',
        enum: ['json', 'csv', 'xml', 'markdown', 'yaml'],
        description: '目标输出格式'
      },
      options: {
        type: 'object',
        description: '转换选项'
      }
    },
    required: ['data', 'outputFormat']
  };

  async invoke(args: { 
    data: SearchContent[] | any[], 
    outputFormat: 'json' | 'csv' | 'xml' | 'markdown' | 'yaml',
    options?: any
  }) {
    const { data, outputFormat, options = {} } = args;

    console.log(`🔄 数据格式转换: ${data.length} 个项目 → ${outputFormat.toUpperCase()}`);

    let convertedData: string;
    let metadata: any = {
      originalFormat: 'json',
      targetFormat: outputFormat,
      itemCount: data.length,
      convertedAt: new Date()
    };

    switch (outputFormat) {
      case 'json':
        convertedData = this.convertToJson(data, options);
        break;
      
      case 'csv':
        convertedData = this.convertToCsv(data, options);
        metadata.headers = this.extractCsvHeaders(data);
        break;
      
      case 'xml':
        convertedData = this.convertToXml(data, options);
        metadata.rootElement = options.rootElement || 'data';
        break;
      
      case 'markdown':
        convertedData = this.convertToMarkdown(data, options);
        metadata.tableFormat = options.tableFormat || 'list';
        break;
      
      case 'yaml':
        convertedData = this.convertToYaml(data, options);
        break;
      
      default:
        throw new Error(`不支持的输出格式: ${outputFormat}`);
    }

    return {
      convertedData,
      metadata,
      statistics: {
        originalSize: JSON.stringify(data).length,
        convertedSize: convertedData.length,
        compressionRatio: convertedData.length / JSON.stringify(data).length
      }
    };
  }

  private convertToJson(data: any[], options: any): string {
    const indent = options.indent !== false ? 2 : 0;
    return JSON.stringify(data, null, indent);
  }

  private convertToCsv(data: any[], options: any): string {
    if (data.length === 0) return '';

    const headers = this.extractCsvHeaders(data);
    const delimiter = options.delimiter || ',';
    const quoteChar = options.quoteChar || '"';

    const csvRows = [headers.join(delimiter)];

    data.forEach(item => {
      const row = headers.map(header => {
        let value = this.getNestedValue(item, header) || '';
        
        // 转换为字符串并处理特殊字符
        value = String(value);
        if (value.includes(delimiter) || value.includes(quoteChar) || value.includes('\n')) {
          value = `${quoteChar}${value.replace(new RegExp(quoteChar, 'g'), quoteChar + quoteChar)}${quoteChar}`;
        }
        
        return value;
      });
      
      csvRows.push(row.join(delimiter));
    });

    return csvRows.join('\n');
  }

  private convertToXml(data: any[], options: any): string {
    const rootElement = options.rootElement || 'data';
    const itemElement = options.itemElement || 'item';
    const indent = options.indent !== false;

    let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
    xml += `<${rootElement}>\n`;

    data.forEach(item => {
      xml += this.objectToXml(item, itemElement, indent ? '  ' : '');
    });

    xml += `</${rootElement}>`;
    return xml;
  }

  private convertToMarkdown(data: any[], options: any): string {
    const format = options.format || 'table';

    if (format === 'table' && data.length > 0) {
      return this.convertToMarkdownTable(data, options);
    } else {
      return this.convertToMarkdownList(data, options);
    }
  }

  private convertToYaml(data: any[], options: any): string {
    return this.objectToYaml(data, 0);
  }

  private extractCsvHeaders(data: any[]): string[] {
    const headers = new Set<string>();
    
    data.forEach(item => {
      this.extractKeys(item).forEach(key => headers.add(key));
    });
    
    return Array.from(headers).sort();
  }

  private extractKeys(obj: any, prefix = ''): string[] {
    const keys: string[] = [];
    
    Object.keys(obj).forEach(key => {
      const fullKey = prefix ? `${prefix}.${key}` : key;
      
      if (obj[key] && typeof obj[key] === 'object' && !Array.isArray(obj[key])) {
        keys.push(...this.extractKeys(obj[key], fullKey));
      } else {
        keys.push(fullKey);
      }
    });
    
    return keys;
  }

  private getNestedValue(obj: any, path: string): any {
    return path.split('.').reduce((current, key) => current?.[key], obj);
  }

  private objectToXml(obj: any, elementName: string, indent: string): string {
    let xml = `${indent}<${elementName}>\n`;
    
    Object.entries(obj).forEach(([key, value]) => {
      const safeKey = key.replace(/[^a-zA-Z0-9_-]/g, '_');
      
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        xml += this.objectToXml(value, safeKey, indent + '  ');
      } else if (Array.isArray(value)) {
        value.forEach(item => {
          xml += this.objectToXml(item, safeKey, indent + '  ');
        });
      } else {
        const safeValue = String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        xml += `${indent}  <${safeKey}>${safeValue}</${safeKey}>\n`;
      }
    });
    
    xml += `${indent}</${elementName}>\n`;
    return xml;
  }

  private convertToMarkdownTable(data: any[], options: any): string {
    if (data.length === 0) return '';

    const headers = this.extractCsvHeaders(data).slice(0, 10); // 限制列数
    
    let markdown = '| ' + headers.join(' | ') + ' |\n';
    markdown += '| ' + headers.map(() => '---').join(' | ') + ' |\n';

    data.forEach(item => {
      const row = headers.map(header => {
        let value = this.getNestedValue(item, header) || '';
        value = String(value).replace(/\|/g, '\\|').replace(/\n/g, ' ');
        return value.length > 50 ? value.substring(0, 47) + '...' : value;
      });
      
      markdown += '| ' + row.join(' | ') + ' |\n';
    });

    return markdown;
  }

  private convertToMarkdownList(data: any[], options: any): string {
    let markdown = '';

    data.forEach((item, index) => {
      markdown += `## 项目 ${index + 1}\n\n`;
      
      if (item.title) {
        markdown += `**标题:** ${item.title}\n\n`;
      }
      
      if (item.url) {
        markdown += `**链接:** [${item.url}](${item.url})\n\n`;
      }
      
      if (item.content) {
        const content = item.content.length > 200 ? 
          item.content.substring(0, 200) + '...' : item.content;
        markdown += `**内容:** ${content}\n\n`;
      }
      
      markdown += '---\n\n';
    });

    return markdown;
  }

  private objectToYaml(obj: any, depth: number): string {
    const indent = '  '.repeat(depth);
    
    if (Array.isArray(obj)) {
      if (obj.length === 0) return '[]';
      
      return obj.map(item => {
        if (typeof item === 'object') {
          return `${indent}- \n${this.objectToYaml(item, depth + 1).replace(/^/gm, '  ')}`;
        } else {
          return `${indent}- ${this.yamlValue(item)}`;
        }
      }).join('\n');
    } else if (obj && typeof obj === 'object') {
      return Object.entries(obj).map(([key, value]) => {
        const safeKey = /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(key) ? key : `"${key}"`;
        
        if (typeof value === 'object') {
          return `${indent}${safeKey}:\n${this.objectToYaml(value, depth + 1)}`;
        } else {
          return `${indent}${safeKey}: ${this.yamlValue(value)}`;
        }
      }).join('\n');
    } else {
      return `${indent}${this.yamlValue(obj)}`;
    }
  }

  private yamlValue(value: any): string {
    if (value === null || value === undefined) return 'null';
    if (typeof value === 'string') {
      if (value.includes('\n') || value.includes('"') || value.includes("'")) {
        return `"${value.replace(/"/g, '\\"')}"`;
      }
      return value;
    }
    return String(value);
  }
}

/**
 * 数据统计分析工具
 * 提供数据的基础统计分析功能
 */
export class DataStatisticsTool implements Tool {
  name = 'analyze_data_statistics';
  description = '分析数据的统计特征，提供数据洞察';
  parameters = {
    type: 'object',
    properties: {
      data: {
        type: 'array',
        items: { type: 'object' },
        description: '需要分析的数据'
      },
      analysisType: {
        type: 'string',
        enum: ['basic', 'detailed', 'comprehensive'],
        description: '分析类型'
      },
      groupBy: {
        type: 'string',
        description: '分组字段'
      }
    },
    required: ['data']
  };

  async invoke(args: { 
    data: SearchContent[] | any[], 
    analysisType?: 'basic' | 'detailed' | 'comprehensive',
    groupBy?: string
  }) {
    const { data, analysisType = 'basic', groupBy } = args;

    console.log(`📊 数据统计分析: ${data.length} 个项目`);

    const analysis: any = {
      basic: this.basicStatistics(data),
      metadata: {
        analysisType,
        dataCount: data.length,
        analyzedAt: new Date()
      }
    };

    if (analysisType === 'detailed' || analysisType === 'comprehensive') {
      analysis.detailed = this.detailedStatistics(data);
    }

    if (analysisType === 'comprehensive') {
      analysis.comprehensive = this.comprehensiveStatistics(data);
    }

    if (groupBy) {
      analysis.groupedAnalysis = this.groupedStatistics(data, groupBy);
    }

    return analysis;
  }

  private basicStatistics(data: any[]): any {
    const stats = {
      totalCount: data.length,
      dataTypes: this.analyzeDataTypes(data),
      fieldFrequency: this.analyzeFieldFrequency(data),
      nullValues: this.analyzeNullValues(data)
    };

    // 如果是搜索内容，添加特定统计
    if (data.length > 0 && data[0].source) {
      stats['sourceDistribution'] = this.analyzeSourceDistribution(data as SearchContent[]);
      stats['temporalDistribution'] = this.analyzeTemporalDistribution(data as SearchContent[]);
    }

    return stats;
  }

  private detailedStatistics(data: any[]): any {
    return {
      fieldStatistics: this.analyzeFieldStatistics(data),
      correlations: this.analyzeCorrelations(data),
      outliers: this.detectOutliers(data),
      patterns: this.identifyPatterns(data)
    };
  }

  private comprehensiveStatistics(data: any[]): any {
    return {
      qualityMetrics: this.analyzeQualityMetrics(data),
      trendsAnalysis: this.analyzeTrends(data),
      anomalies: this.detectAnomalies(data),
      recommendations: this.generateRecommendations(data)
    };
  }

  private analyzeDataTypes(data: any[]): Record<string, string> {
    if (data.length === 0) return {};

    const sample = data[0];
    const types: Record<string, string> = {};

    Object.keys(sample).forEach(key => {
      const value = sample[key];
      types[key] = Array.isArray(value) ? 'array' : typeof value;
    });

    return types;
  }

  private analyzeFieldFrequency(data: any[]): Record<string, number> {
    const frequency: Record<string, number> = {};

    data.forEach(item => {
      Object.keys(item).forEach(key => {
        frequency[key] = (frequency[key] || 0) + 1;
      });
    });

    return frequency;
  }

  private analyzeNullValues(data: any[]): Record<string, number> {
    const nullCounts: Record<string, number> = {};

    data.forEach(item => {
      Object.entries(item).forEach(([key, value]) => {
        if (value === null || value === undefined || value === '') {
          nullCounts[key] = (nullCounts[key] || 0) + 1;
        }
      });
    });

    return nullCounts;
  }

  private analyzeSourceDistribution(data: SearchContent[]): Record<string, number> {
    const distribution: Record<string, number> = {};

    data.forEach(item => {
      distribution[item.source] = (distribution[item.source] || 0) + 1;
    });

    return distribution;
  }

  private analyzeTemporalDistribution(data: SearchContent[]): any {
    const now = new Date();
    const distribution = {
      'last1h': 0,
      'last6h': 0,
      'last24h': 0,
      'last7d': 0,
      'older': 0
    };

    data.forEach(item => {
      const ageMs = now.getTime() - item.timestamp.getTime();
      const ageHours = ageMs / (1000 * 60 * 60);

      if (ageHours <= 1) distribution.last1h++;
      else if (ageHours <= 6) distribution.last6h++;
      else if (ageHours <= 24) distribution.last24h++;
      else if (ageHours <= 168) distribution.last7d++;
      else distribution.older++;
    });

    return distribution;
  }

  private analyzeFieldStatistics(data: any[]): Record<string, any> {
    const stats: Record<string, any> = {};

    if (data.length === 0) return stats;

    const allKeys = new Set<string>();
    data.forEach(item => {
      Object.keys(item).forEach(key => allKeys.add(key));
    });

    allKeys.forEach(key => {
      const values = data.map(item => item[key]).filter(val => val !== null && val !== undefined);
      
      if (values.length === 0) {
        stats[key] = { type: 'empty', count: 0 };
        return;
      }

      const firstValue = values[0];
      
      if (typeof firstValue === 'number') {
        stats[key] = {
          type: 'numeric',
          count: values.length,
          min: Math.min(...values),
          max: Math.max(...values),
          mean: values.reduce((sum, val) => sum + val, 0) / values.length,
          median: this.calculateMedian(values)
        };
      } else if (typeof firstValue === 'string') {
        const lengths = values.map(val => val.length);
        stats[key] = {
          type: 'string',
          count: values.length,
          minLength: Math.min(...lengths),
          maxLength: Math.max(...lengths),
          avgLength: lengths.reduce((sum, len) => sum + len, 0) / lengths.length,
          uniqueValues: new Set(values).size
        };
      } else {
        stats[key] = {
          type: typeof firstValue,
          count: values.length,
          uniqueValues: new Set(values.map(v => JSON.stringify(v))).size
        };
      }
    });

    return stats;
  }

  private analyzeCorrelations(data: any[]): any[] {
    // 简化的相关性分析
    const correlations: any[] = [];
    
    // 这里可以实现更复杂的相关性分析
    // 目前返回基础的字段关联分析
    
    return correlations;
  }

  private detectOutliers(data: any[]): any[] {
    const outliers: any[] = [];
    
    // 简化的异常值检测
    // 检测数值字段的异常值
    
    return outliers;
  }

  private identifyPatterns(data: any[]): any[] {
    const patterns: any[] = [];
    
    // 识别数据模式
    // 如：URL 模式、时间模式等
    
    return patterns;
  }

  private analyzeQualityMetrics(data: any[]): any {
    return {
      completeness: this.calculateCompleteness(data),
      consistency: this.calculateConsistency(data),
      accuracy: this.calculateAccuracy(data)
    };
  }

  private analyzeTrends(data: any[]): any {
    // 趋势分析
    return {
      timeBasedTrends: this.analyzeTimeBasedTrends(data),
      valueBasedTrends: this.analyzeValueBasedTrends(data)
    };
  }

  private detectAnomalies(data: any[]): any[] {
    // 异常检测
    return [];
  }

  private generateRecommendations(data: any[]): string[] {
    const recommendations: string[] = [];
    
    if (data.length < 10) {
      recommendations.push('数据量较小，建议增加样本量以提高分析可靠性');
    }
    
    if (data.length > 1000) {
      recommendations.push('数据量较大，建议考虑采样分析以提高性能');
    }
    
    return recommendations;
  }

  private calculateMedian(values: number[]): number {
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    
    return sorted.length % 2 === 0 
      ? (sorted[mid - 1] + sorted[mid]) / 2 
      : sorted[mid];
  }

  private calculateCompleteness(data: any[]): number {
    if (data.length === 0) return 0;
    
    const totalFields = Object.keys(data[0]).length * data.length;
    let filledFields = 0;
    
    data.forEach(item => {
      Object.values(item).forEach(value => {
        if (value !== null && value !== undefined && value !== '') {
          filledFields++;
        }
      });
    });
    
    return filledFields / totalFields;
  }

  private calculateConsistency(data: any[]): number {
    // 计算数据一致性
    return 0.9; // 简化实现
  }

  private calculateAccuracy(data: any[]): number {
    // 计算数据准确性
    return 0.85; // 简化实现
  }

  private analyzeTimeBasedTrends(data: any[]): any {
    // 基于时间的趋势分析
    return {};
  }

  private analyzeValueBasedTrends(data: any[]): any {
    // 基于数值的趋势分析
    return {};
  }

  private groupedStatistics(data: any[], groupBy: string): Record<string, any> {
    const groups: Record<string, any[]> = {};
    
    data.forEach(item => {
      const groupValue = item[groupBy] || 'unknown';
      if (!groups[groupValue]) {
        groups[groupValue] = [];
      }
      groups[groupValue].push(item);
    });
    
    const groupedStats: Record<string, any> = {};
    
    Object.entries(groups).forEach(([groupValue, groupData]) => {
      groupedStats[groupValue] = this.basicStatistics(groupData);
    });
    
    return groupedStats;
  }
}

/**
 * 数据缓存管理工具
 * 管理搜索结果和分析数据的缓存
 */
export class CacheManagementTool implements Tool {
  name = 'manage_data_cache';
  description = '管理数据缓存，支持存储、检索和清理操作';
  parameters = {
    type: 'object',
    properties: {
      operation: {
        type: 'string',
        enum: ['store', 'retrieve', 'clear', 'info'],
        description: '缓存操作类型'
      },
      key: {
        type: 'string',
        description: '缓存键'
      },
      data: {
        type: 'any',
        description: '要缓存的数据'
      },
      ttl: {
        type: 'number',
        description: '生存时间（秒）'
      }
    },
    required: ['operation']
  };

  private cache: Map<string, { data: any, expires: number, created: Date }> = new Map();

  async invoke(args: { 
    operation: 'store' | 'retrieve' | 'clear' | 'info',
    key?: string,
    data?: any,
    ttl?: number
  }) {
    const { operation, key, data, ttl = 3600 } = args; // 默认 1 小时 TTL

    console.log(`💾 缓存操作: ${operation}${key ? ` (${key})` : ''}`);

    switch (operation) {
      case 'store':
        return this.storeData(key!, data, ttl);
      
      case 'retrieve':
        return this.retrieveData(key!);
      
      case 'clear':
        return this.clearCache(key);
      
      case 'info':
        return this.getCacheInfo();
      
      default:
        throw new Error(`不支持的缓存操作: ${operation}`);
    }
  }

  private storeData(key: string, data: any, ttl: number): any {
    const expires = Date.now() + ttl * 1000;
    
    this.cache.set(key, {
      data,
      expires,
      created: new Date()
    });

    return {
      success: true,
      key,
      size: JSON.stringify(data).length,
      expiresAt: new Date(expires),
      message: '数据已成功缓存'
    };
  }

  private retrieveData(key: string): any {
    const entry = this.cache.get(key);
    
    if (!entry) {
      return {
        success: false,
        key,
        error: '缓存项不存在'
      };
    }

    if (Date.now() > entry.expires) {
      this.cache.delete(key);
      return {
        success: false,
        key,
        error: '缓存项已过期'
      };
    }

    return {
      success: true,
      key,
      data: entry.data,
      createdAt: entry.created,
      expiresAt: new Date(entry.expires)
    };
  }

  private clearCache(key?: string): any {
    if (key) {
      const existed = this.cache.has(key);
      this.cache.delete(key);
      
      return {
        success: true,
        operation: 'clear_single',
        key,
        existed,
        message: existed ? '缓存项已删除' : '缓存项不存在'
      };
    } else {
      const count = this.cache.size;
      this.cache.clear();
      
      return {
        success: true,
        operation: 'clear_all',
        clearedCount: count,
        message: `已清理 ${count} 个缓存项`
      };
    }
  }

  private getCacheInfo(): any {
    const now = Date.now();
    const entries = Array.from(this.cache.entries());
    
    const activeEntries = entries.filter(([, entry]) => now <= entry.expires);
    const expiredEntries = entries.filter(([, entry]) => now > entry.expires);
    
    // 清理过期项
    expiredEntries.forEach(([key]) => this.cache.delete(key));
    
    const totalSize = activeEntries.reduce((sum, [, entry]) => 
      sum + JSON.stringify(entry.data).length, 0
    );

    return {
      totalEntries: activeEntries.length,
      expiredEntries: expiredEntries.length,
      totalSize,
      averageSize: activeEntries.length > 0 ? totalSize / activeEntries.length : 0,
      entries: activeEntries.map(([key, entry]) => ({
        key,
        size: JSON.stringify(entry.data).length,
        createdAt: entry.created,
        expiresAt: new Date(entry.expires),
        ttlRemaining: Math.max(0, Math.floor((entry.expires - now) / 1000))
      })),
      statistics: {
        hitRate: 0, // 需要实现命中率统计
        memoryUsage: `${Math.round(totalSize / 1024)} KB`
      }
    };
  }
}

/**
 * 性能监控工具
 * 监控各个组件和操作的性能指标
 */
export class PerformanceMonitorTool implements Tool {
  name = 'monitor_performance';
  description = '监控性能指标，收集和分析系统性能数据';
  parameters = {
    type: 'object',
    properties: {
      operation: {
        type: 'string',
        enum: ['start', 'end', 'report', 'reset'],
        description: '监控操作'
      },
      operationName: {
        type: 'string',
        description: '操作名称'
      },
      metadata: {
        type: 'object',
        description: '附加元数据'
      }
    },
    required: ['operation']
  };

  private metrics: Map<string, any> = new Map();
  private timers: Map<string, number> = new Map();

  async invoke(args: { 
    operation: 'start' | 'end' | 'report' | 'reset',
    operationName?: string,
    metadata?: any
  }) {
    const { operation, operationName, metadata = {} } = args;

    console.log(`⚡ 性能监控: ${operation}${operationName ? ` (${operationName})` : ''}`);

    switch (operation) {
      case 'start':
        return this.startTimer(operationName!, metadata);
      
      case 'end':
        return this.endTimer(operationName!, metadata);
      
      case 'report':
        return this.generateReport(operationName);
      
      case 'reset':
        return this.resetMetrics(operationName);
      
      default:
        throw new Error(`不支持的监控操作: ${operation}`);
    }
  }

  private startTimer(operationName: string, metadata: any): any {
    const startTime = Date.now();
    this.timers.set(operationName, startTime);

    if (!this.metrics.has(operationName)) {
      this.metrics.set(operationName, {
        count: 0,
        totalTime: 0,
        minTime: Infinity,
        maxTime: 0,
        avgTime: 0,
        lastExecution: null,
        errors: 0,
        successRate: 0
      });
    }

    return {
      success: true,
      operationName,
      startTime: new Date(startTime),
      message: '性能监控已开始'
    };
  }

  private endTimer(operationName: string, metadata: any): any {
    const endTime = Date.now();
    const startTime = this.timers.get(operationName);

    if (!startTime) {
      return {
        success: false,
        operationName,
        error: '未找到对应的开始时间'
      };
    }

    const duration = endTime - startTime;
    this.timers.delete(operationName);

    const metrics = this.metrics.get(operationName)!;
    metrics.count++;
    metrics.totalTime += duration;
    metrics.minTime = Math.min(metrics.minTime, duration);
    metrics.maxTime = Math.max(metrics.maxTime, duration);
    metrics.avgTime = metrics.totalTime / metrics.count;
    metrics.lastExecution = new Date(endTime);

    // 记录成功或失败
    if (metadata.success !== false) {
      metrics.successRate = ((metrics.successRate * (metrics.count - 1)) + 1) / metrics.count;
    } else {
      metrics.errors++;
      metrics.successRate = ((metrics.successRate * (metrics.count - 1)) + 0) / metrics.count;
    }

    return {
      success: true,
      operationName,
      duration,
      currentMetrics: { ...metrics },
      message: `操作完成，耗时 ${duration}ms`
    };
  }

  private generateReport(operationName?: string): any {
    if (operationName) {
      const metrics = this.metrics.get(operationName);
      if (!metrics) {
        return {
          success: false,
          error: `未找到操作 ${operationName} 的性能数据`
        };
      }

      return {
        success: true,
        operationName,
        metrics,
        analysis: this.analyzeMetrics(metrics),
        recommendations: this.generateRecommendations(operationName, metrics)
      };
    } else {
      const allMetrics = Object.fromEntries(this.metrics.entries());
      const summary = this.generateSummary(allMetrics);

      return {
        success: true,
        summary,
        allMetrics,
        topPerformers: this.getTopPerformers(allMetrics),
        recommendations: this.generateGlobalRecommendations(allMetrics)
      };
    }
  }

  private resetMetrics(operationName?: string): any {
    if (operationName) {
      const existed = this.metrics.has(operationName);
      this.metrics.delete(operationName);
      this.timers.delete(operationName);

      return {
        success: true,
        operationName,
        existed,
        message: existed ? '性能数据已重置' : '操作不存在'
      };
    } else {
      const count = this.metrics.size;
      this.metrics.clear();
      this.timers.clear();

      return {
        success: true,
        clearedOperations: count,
        message: `已重置 ${count} 个操作的性能数据`
      };
    }
  }

  private analyzeMetrics(metrics: any): any {
    return {
      performance: metrics.avgTime < 1000 ? 'excellent' : 
                  metrics.avgTime < 5000 ? 'good' : 
                  metrics.avgTime < 10000 ? 'fair' : 'poor',
      reliability: metrics.successRate > 0.95 ? 'excellent' :
                  metrics.successRate > 0.90 ? 'good' :
                  metrics.successRate > 0.80 ? 'fair' : 'poor',
      consistency: (metrics.maxTime - metrics.minTime) / metrics.avgTime < 2 ? 'consistent' : 'variable'
    };
  }

  private generateRecommendations(operationName: string, metrics: any): string[] {
    const recommendations = [];

    if (metrics.avgTime > 5000) {
      recommendations.push('平均执行时间较长，建议优化算法或增加缓存');
    }

    if (metrics.successRate < 0.9) {
      recommendations.push('成功率较低，建议检查错误处理逻辑');
    }

    if ((metrics.maxTime - metrics.minTime) / metrics.avgTime > 3) {
      recommendations.push('执行时间变化较大，建议检查性能瓶颈');
    }

    if (metrics.count < 10) {
      recommendations.push('样本数量较少，建议增加测试次数以提高统计可靠性');
    }

    return recommendations.length > 0 ? recommendations : ['性能表现良好'];
  }

  private generateSummary(allMetrics: Record<string, any>): any {
    const operations = Object.keys(allMetrics);
    const totalExecutions = operations.reduce((sum, op) => sum + allMetrics[op].count, 0);
    const avgSuccessRate = operations.reduce((sum, op) => sum + allMetrics[op].successRate, 0) / operations.length;

    return {
      totalOperations: operations.length,
      totalExecutions,
      averageSuccessRate: Math.round(avgSuccessRate * 100) / 100,
      slowestOperation: operations.reduce((slowest, current) => 
        allMetrics[current].avgTime > allMetrics[slowest].avgTime ? current : slowest
      ),
      fastestOperation: operations.reduce((fastest, current) => 
        allMetrics[current].avgTime < allMetrics[fastest].avgTime ? current : fastest
      )
    };
  }

  private getTopPerformers(allMetrics: Record<string, any>): any[] {
    return Object.entries(allMetrics)
      .sort(([,a], [,b]) => a.avgTime - b.avgTime)
      .slice(0, 5)
      .map(([name, metrics]) => ({ name, avgTime: metrics.avgTime }));
  }

  private generateGlobalRecommendations(allMetrics: Record<string, any>): string[] {
    const recommendations = [];
    const operations = Object.values(allMetrics);

    const avgTime = operations.reduce((sum: number, m: any) => sum + m.avgTime, 0) / operations.length;
    const avgSuccessRate = operations.reduce((sum: number, m: any) => sum + m.successRate, 0) / operations.length;

    if (avgTime > 3000) {
      recommendations.push('整体性能偏慢，建议进行系统优化');
    }

    if (avgSuccessRate < 0.9) {
      recommendations.push('整体可靠性有待提高，建议加强错误处理');
    }

    if (operations.length > 20) {
      recommendations.push('监控的操作较多，建议关注核心操作的性能');
    }

    return recommendations.length > 0 ? recommendations : ['整体性能表现良好'];
  }
}