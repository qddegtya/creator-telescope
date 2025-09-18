import Parser from 'rss-parser';

/**
 * RSS 爬虫工作线程
 * 
 * 独立的 worker 用于并行处理 RSS 源爬取
 */
export default async function rssWorker({ feedConfig, config }) {
  const articles = [];
  
  try {
    const userAgents = [
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15'
    ];
    
    const randomUserAgent = userAgents[Math.floor(Math.random() * userAgents.length)];
    
    const parser = new Parser({
      timeout: config.requestTimeout,
      headers: {
        'User-Agent': randomUserAgent,
        'Accept': 'application/rss+xml, application/xml, text/xml, application/atom+xml, */*',
        'Accept-Encoding': 'gzip, deflate, br',
        'Accept-Language': 'en-US,en;q=0.9,zh-CN;q=0.8,zh;q=0.7',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'DNT': '1',
        'Connection': 'keep-alive',
        'Referer': 'https://www.google.com/'
      }
    });

    // 随机延迟避免请求过于集中，模拟人类访问模式
    await delay(Math.random() * 3000 + 1000);
    
    const feed = await parser.parseURL(feedConfig.url);
    
    // 不限制数量，处理所有可用条目
    const items = feed.items || [];
    
    for (const item of items) {
      try {
        const article = parseRSSItem(item, feedConfig, config);
        if (article && isRecentArticle(article.publishedAt, config.dayRange)) {
          articles.push(article);
        }
      } catch (error) {
        console.warn(`⚠️  解析 RSS 条目失败 ${feedConfig.name}:`, error.message);
        continue;
      }
    }
    
    return {
      feedName: feedConfig.name,
      articles: articles.filter(article => (article.metrics?.aiRelevanceScore || 0) > 0.3)
    };
    
  } catch (error) {
    console.error(`❌ 解析 RSS 源失败: ${feedConfig.name}`, error.message);
    return {
      feedName: feedConfig.name,
      articles: []
    };
  }
}

/**
 * 解析单个 RSS 条目
 */
function parseRSSItem(item, feedConfig, config) {
  try {
    const title = item.title?.trim() || '';
    const description = extractDescription(item);
    const url = item.link || item.guid || '';
    const publishedAt = new Date(item.pubDate || item.isoDate || Date.now());
    const author = item.creator || item.author || feedConfig.name;
    
    if (!title || !url) return null;

    // 计算 AI 相关性
    const aiScore = calculateAIRelevance(title, description) * feedConfig.weight;
    
    if (aiScore < 0.3) return null;

    return {
      id: `rss_${generateId(url)}`,
      title: cleanText(title),
      description: cleanText(description).substring(0, 300),
      url,
      author,
      publishedAt,
      source: 'rss',
      tags: extractTags(title + ' ' + description),
      imageUrl: extractImageUrl(item),
      metrics: {
        aiRelevanceScore: aiScore,
        qualityScore: feedConfig.isHighQuality ? 0.9 : 0.7,
        freshnessScore: calculateFreshnessScore(publishedAt)
      },
      metadata: {
        platform: 'rss',
        contentType: 'article',
        feedName: feedConfig.name,
        feedCategory: feedConfig.category,
        isHighQualitySource: feedConfig.isHighQuality,
        language: detectLanguage(title + ' ' + description)
      }
    };
    
  } catch (error) {
    console.warn('⚠️  解析 RSS 条目失败:', error);
    return null;
  }
}

/**
 * 提取文章描述
 */
function extractDescription(item) {
  const desc = item.contentSnippet || item.content || item.summary || item.description || '';
  return stripHtml(desc);
}

/**
 * 去除 HTML 标签
 */
function stripHtml(html) {
  return html.replace(/<[^>]*>/g, '').trim();
}

/**
 * 提取图片 URL
 */
function extractImageUrl(item) {
  return item.enclosure?.url || item['media:thumbnail']?.url || '';
}

/**
 * 计算 AI 相关性
 */
function calculateAIRelevance(title, description) {
  const text = (title + ' ' + description).toLowerCase();
  const keywords = [
    { term: 'openai', weight: 0.3 },
    { term: 'anthropic', weight: 0.3 },
    { term: 'gpt', weight: 0.25 },
    { term: 'claude', weight: 0.25 },
    { term: 'artificial intelligence', weight: 0.2 },
    { term: 'machine learning', weight: 0.2 },
    { term: 'deep learning', weight: 0.2 },
    { term: 'neural network', weight: 0.15 },
    { term: 'llm', weight: 0.25 },
    { term: 'large language model', weight: 0.3 },
    { term: 'transformer', weight: 0.2 },
    { term: 'diffusion model', weight: 0.2 },
    { term: '人工智能', weight: 0.2 },
    { term: '大模型', weight: 0.25 },
    { term: 'computer vision', weight: 0.15 },
    { term: 'natural language processing', weight: 0.2 },
    { term: 'reinforcement learning', weight: 0.18 }
  ];
  
  let score = 0;
  for (const { term, weight } of keywords) {
    if (text.includes(term)) {
      score += weight;
    }
  }
  
  return Math.min(score, 1.0);
}

/**
 * 提取标签
 */
function extractTags(text) {
  const aiTags = [
    'ai', 'machine-learning', 'deep-learning', 'gpt', 'llm', 
    'openai', 'anthropic', 'neural-networks', 'computer-vision',
    'nlp', 'transformer', 'diffusion', 'reinforcement-learning'
  ];
  const lowerText = text.toLowerCase();
  return aiTags.filter(tag => 
    lowerText.includes(tag.replace('-', ' ')) || lowerText.includes(tag)
  ).slice(0, 8);
}

/**
 * 计算新鲜度评分
 */
function calculateFreshnessScore(publishedAt) {
  const now = new Date();
  const hoursDiff = (now.getTime() - publishedAt.getTime()) / (1000 * 60 * 60);
  
  if (hoursDiff <= 12) return 1.0;
  if (hoursDiff <= 24) return 0.8;
  if (hoursDiff <= 72) return 0.6;
  if (hoursDiff <= 168) return 0.4;
  return 0.2;
}

/**
 * 检测语言
 */
function detectLanguage(text) {
  return /[\u4e00-\u9fff]/.test(text) ? 'zh' : 'en';
}

/**
 * 清理文本
 */
function cleanText(text) {
  return text.replace(/\s+/g, ' ').trim();
}

/**
 * 生成内容 ID
 */
function generateId(url) {
  return url.split('/').pop()?.replace(/[^a-zA-Z0-9]/g, '').substring(0, 10) + '_' + Date.now();
}

/**
 * 检查文章是否最近
 */
function isRecentArticle(publishedAt, dayRange) {
  const now = new Date();
  const daysDiff = (now.getTime() - publishedAt.getTime()) / (1000 * 60 * 60 * 24);
  return daysDiff <= dayRange;
}

/**
 * 延迟函数
 */
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}