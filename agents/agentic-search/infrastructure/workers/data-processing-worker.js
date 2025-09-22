/**
 * Data Processing Worker
 * 通用数据处理和转换任务
 */

/**
 * 执行数据处理
 */
async function dataProcessing(taskData) {
  const { 
    operation,
    data,
    options = {}
  } = taskData;

  console.log(`🔧 Data Processing Worker 执行操作: ${operation}`);

  try {
    let result;

    switch (operation) {
      case 'deduplicate':
        result = await deduplicateContent(data, options);
        break;
      
      case 'merge':
        result = await mergeResults(data, options);
        break;
      
      case 'normalize':
        result = await normalizeContent(data, options);
        break;
      
      case 'filter':
        result = await filterContent(data, options);
        break;
      
      case 'transform':
        result = await transformContent(data, options);
        break;
      
      case 'aggregate':
        result = await aggregateData(data, options);
        break;
      
      default:
        throw new Error(`不支持的操作: ${operation}`);
    }

    console.log(`✅ 数据处理完成: ${operation}`);

    return {
      success: true,
      operation,
      result,
      metadata: {
        inputSize: Array.isArray(data) ? data.length : 1,
        outputSize: Array.isArray(result) ? result.length : 1,
        timestamp: new Date(),
        source: 'data-processing-worker'
      }
    };

  } catch (error) {
    console.error(`❌ 数据处理失败 (${operation}):`, error);
    
    return {
      success: false,
      operation,
      error: error.message,
      result: null,
      metadata: {
        timestamp: new Date(),
        source: 'data-processing-worker'
      }
    };
  }
}

/**
 * 去重处理
 */
async function deduplicateContent(contents, options) {
  const { 
    method = 'title-url',
    similarity = 0.8,
    keepFirst = true
  } = options;

  console.log(`🔄 去重处理: ${contents.length} 个内容`);

  const seen = new Set();
  const duplicates = new Set();
  const unique = [];

  for (const content of contents) {
    let key;
    
    switch (method) {
      case 'title-url':
        key = `${content.title?.toLowerCase()?.trim()}_${content.url}`;
        break;
      
      case 'title':
        key = content.title?.toLowerCase()?.trim();
        break;
      
      case 'url':
        key = content.url;
        break;
      
      case 'content-hash':
        key = generateContentHash(content);
        break;
      
      case 'similarity':
        // 基于相似度的去重（简化版）
        const isDuplicate = unique.some(existing => 
          calculateSimilarity(content.title, existing.title) > similarity
        );
        if (!isDuplicate) {
          unique.push(content);
        } else {
          duplicates.add(content);
        }
        continue;
      
      default:
        key = JSON.stringify(content);
    }

    if (seen.has(key)) {
      duplicates.add(content);
      if (!keepFirst) {
        // 如果不保留第一个，替换已存在的
        const index = unique.findIndex(u => 
          generateKey(u, method) === key
        );
        if (index !== -1) {
          unique[index] = content;
        }
      }
    } else {
      seen.add(key);
      unique.push(content);
    }
  }

  console.log(`✅ 去重完成: ${unique.length} 个唯一内容，移除 ${duplicates.size} 个重复`);

  return {
    unique,
    duplicates: Array.from(duplicates),
    stats: {
      original: contents.length,
      unique: unique.length,
      duplicates: duplicates.size,
      deduplicationRate: duplicates.size / contents.length
    }
  };
}

/**
 * 合并结果
 */
async function mergeResults(resultArrays, options) {
  const { 
    strategy = 'concatenate',
    priority = [],
    maxItems = null
  } = options;

  console.log(`🔗 合并结果: ${resultArrays.length} 个数组`);

  let merged = [];

  switch (strategy) {
    case 'concatenate':
      merged = resultArrays.flat();
      break;
    
    case 'priority':
      // 按优先级合并
      for (const source of priority) {
        const sourceResults = resultArrays.find(arr => 
          arr.length > 0 && arr[0].source === source
        );
        if (sourceResults) {
          merged.push(...sourceResults);
        }
      }
      // 添加未在优先级中的结果
      for (const arr of resultArrays) {
        if (arr.length > 0 && !priority.includes(arr[0].source)) {
          merged.push(...arr);
        }
      }
      break;
    
    case 'interleave':
      // 交替合并
      const maxLength = Math.max(...resultArrays.map(arr => arr.length));
      for (let i = 0; i < maxLength; i++) {
        for (const arr of resultArrays) {
          if (i < arr.length) {
            merged.push(arr[i]);
          }
        }
      }
      break;
    
    case 'best-quality':
      // 按质量得分合并
      merged = resultArrays.flat().sort((a, b) => 
        (b.qualityScore || 0) - (a.qualityScore || 0)
      );
      break;
    
    default:
      merged = resultArrays.flat();
  }

  // 限制最大数量
  if (maxItems && merged.length > maxItems) {
    merged = merged.slice(0, maxItems);
  }

  console.log(`✅ 合并完成: ${merged.length} 个项目`);

  return {
    merged,
    stats: {
      inputArrays: resultArrays.length,
      totalInputItems: resultArrays.reduce((sum, arr) => sum + arr.length, 0),
      outputItems: merged.length,
      strategy
    }
  };
}

/**
 * 标准化内容
 */
async function normalizeContent(contents, options) {
  const { 
    fields = ['title', 'content', 'url'],
    trimWhitespace = true,
    removeHtml = true,
    standardizeUrls = true
  } = options;

  console.log(`📝 标准化内容: ${contents.length} 个项目`);

  const normalized = contents.map(content => {
    const result = { ...content };

    for (const field of fields) {
      if (result[field] && typeof result[field] === 'string') {
        let value = result[field];

        if (trimWhitespace) {
          value = value.trim();
        }

        if (removeHtml) {
          value = value.replace(/<[^>]*>/g, '');
        }

        if (field === 'url' && standardizeUrls) {
          value = standardizeUrl(value);
        }

        result[field] = value;
      }
    }

    // 添加标准化时间戳
    if (result.timestamp && typeof result.timestamp === 'string') {
      result.timestamp = new Date(result.timestamp);
    }

    return result;
  });

  console.log(`✅ 标准化完成`);

  return normalized;
}

/**
 * 过滤内容
 */
async function filterContent(contents, options) {
  const { 
    filters = {},
    mode = 'include' // 'include' or 'exclude'
  } = options;

  console.log(`🔍 过滤内容: ${contents.length} 个项目`);

  const filtered = contents.filter(content => {
    let match = true;

    // 应用各种过滤器
    for (const [key, value] of Object.entries(filters)) {
      switch (key) {
        case 'minQualityScore':
          if (!content.qualityScore || content.qualityScore < value) {
            match = false;
          }
          break;
        
        case 'sources':
          if (!value.includes(content.source)) {
            match = false;
          }
          break;
        
        case 'keywords':
          const hasKeyword = value.some(keyword => 
            content.title?.toLowerCase().includes(keyword.toLowerCase()) ||
            content.content?.toLowerCase().includes(keyword.toLowerCase())
          );
          if (!hasKeyword) {
            match = false;
          }
          break;
        
        case 'timeRange':
          const contentTime = new Date(content.timestamp);
          const now = new Date();
          const hours = (now - contentTime) / (1000 * 60 * 60);
          if (hours > value) {
            match = false;
          }
          break;
        
        case 'minLength':
          if (!content.content || content.content.length < value) {
            match = false;
          }
          break;
        
        default:
          if (content[key] !== value) {
            match = false;
          }
      }

      if (!match) break;
    }

    return mode === 'include' ? match : !match;
  });

  console.log(`✅ 过滤完成: ${filtered.length}/${contents.length} 通过过滤`);

  return {
    filtered,
    removed: contents.filter(c => !filtered.includes(c)),
    stats: {
      original: contents.length,
      filtered: filtered.length,
      removed: contents.length - filtered.length,
      filterRate: (contents.length - filtered.length) / contents.length
    }
  };
}

/**
 * 转换内容
 */
async function transformContent(contents, options) {
  const { 
    transformations = [],
    addMetadata = true
  } = options;

  console.log(`🔄 转换内容: ${contents.length} 个项目`);

  const transformed = contents.map((content, index) => {
    let result = { ...content };

    // 应用转换
    for (const transformation of transformations) {
      switch (transformation.type) {
        case 'addField':
          result[transformation.field] = transformation.value;
          break;
        
        case 'renameField':
          if (result[transformation.from]) {
            result[transformation.to] = result[transformation.from];
            delete result[transformation.from];
          }
          break;
        
        case 'extractDomain':
          if (result.url) {
            try {
              result.domain = new URL(result.url).hostname;
            } catch (e) {
              result.domain = 'unknown';
            }
          }
          break;
        
        case 'truncateContent':
          if (result.content && transformation.maxLength) {
            result.content = result.content.substring(0, transformation.maxLength);
          }
          break;
        
        case 'addIndex':
          result.index = index;
          break;
      }
    }

    // 添加处理元数据
    if (addMetadata) {
      result.processedAt = new Date();
      result.processingWorker = 'data-processing-worker';
    }

    return result;
  });

  console.log(`✅ 转换完成`);

  return transformed;
}

/**
 * 聚合数据
 */
async function aggregateData(data, options) {
  const { 
    groupBy = 'source',
    metrics = ['count', 'avgQuality'],
    includeItems = false
  } = options;

  console.log(`📊 聚合数据: ${data.length} 个项目`);

  const groups = {};

  // 分组
  for (const item of data) {
    const key = item[groupBy] || 'unknown';
    if (!groups[key]) {
      groups[key] = [];
    }
    groups[key].push(item);
  }

  // 计算指标
  const aggregated = {};
  for (const [key, items] of Object.entries(groups)) {
    const group = { groupKey: key };

    for (const metric of metrics) {
      switch (metric) {
        case 'count':
          group.count = items.length;
          break;
        
        case 'avgQuality':
          const qualityItems = items.filter(item => item.qualityScore);
          group.avgQuality = qualityItems.length > 0 ?
            qualityItems.reduce((sum, item) => sum + item.qualityScore, 0) / qualityItems.length : 0;
          break;
        
        case 'latestTimestamp':
          const timestamps = items.map(item => new Date(item.timestamp)).filter(d => !isNaN(d));
          group.latestTimestamp = timestamps.length > 0 ? new Date(Math.max(...timestamps)) : null;
          break;
        
        case 'uniqueDomains':
          const domains = [...new Set(items.map(item => {
            try {
              return new URL(item.url).hostname;
            } catch {
              return 'unknown';
            }
          }))];
          group.uniqueDomains = domains.length;
          break;
      }
    }

    if (includeItems) {
      group.items = items;
    }

    aggregated[key] = group;
  }

  console.log(`✅ 聚合完成: ${Object.keys(aggregated).length} 个组`);

  return aggregated;
}

/**
 * 辅助函数
 */
function generateContentHash(content) {
  const crypto = require('crypto');
  const text = (content.title || '') + (content.content || '') + (content.url || '');
  return crypto.createHash('md5').update(text).digest('hex');
}

function generateKey(content, method) {
  switch (method) {
    case 'title-url':
      return `${content.title?.toLowerCase()?.trim()}_${content.url}`;
    case 'title':
      return content.title?.toLowerCase()?.trim();
    case 'url':
      return content.url;
    default:
      return JSON.stringify(content);
  }
}

function calculateSimilarity(str1, str2) {
  if (!str1 || !str2) return 0;
  
  const words1 = str1.toLowerCase().split(/\s+/);
  const words2 = str2.toLowerCase().split(/\s+/);
  
  const intersection = words1.filter(word => words2.includes(word));
  const union = [...new Set([...words1, ...words2])];
  
  return intersection.length / union.length;
}

function standardizeUrl(url) {
  try {
    const parsed = new URL(url);
    // 移除追踪参数
    parsed.searchParams.delete('utm_source');
    parsed.searchParams.delete('utm_medium');
    parsed.searchParams.delete('utm_campaign');
    parsed.searchParams.delete('fbclid');
    parsed.searchParams.delete('gclid');
    
    return parsed.toString();
  } catch {
    return url;
  }
}

// Piscina Worker 入口
module.exports = dataProcessing;