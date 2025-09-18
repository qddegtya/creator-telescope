import { chromium } from 'playwright';

/**
 * Twitter 爬虫工作线程
 * 
 * 独立的 worker 用于并行处理 Twitter 账号爬取
 */
export default async function twitterWorker({ accountInfo, config }) {
  const tweets = [];
  let browser = null;
  
  try {
    // 启动浏览器实例
    browser = await chromium.launch({ 
      headless: config.headless,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--disable-gpu',
        '--disable-background-timer-throttling',
        '--disable-backgrounding-occluded-windows',
        '--disable-renderer-backgrounding',
        '--disable-blink-features=AutomationControlled',
        '--disable-features=VizDisplayCompositor',
        '--disable-ipc-flooding-protection',
        '--disable-web-security',
        '--disable-features=Translate,BackForwardCache,AcceptCHFrame,MediaSessionService,OptimizationGuideModelDownloading',
        '--disable-component-extensions-with-background-pages',
        '--mute-audio',
        '--no-default-browser-check',
        '--no-first-run',
        '--disable-default-apps',
        '--disable-popup-blocking',
        '--disable-prompt-on-repost',
        '--disable-hang-monitor',
        '--disable-sync',
        '--disable-logging',
        '--disable-permissions-api',
        '--hide-scrollbars'
      ]
    });
    
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      viewport: { width: 1920, height: 1080 },
      locale: 'en-US',
      timezoneId: 'America/New_York',
      permissions: ['geolocation'],
      geolocation: { latitude: 40.7128, longitude: -74.0060 },
      extraHTTPHeaders: {
        'Accept-Language': 'en-US,en;q=0.9,zh-CN;q=0.8,zh;q=0.7',
        'Accept-Encoding': 'gzip, deflate, br',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-User': '?1',
        'Upgrade-Insecure-Requests': '1',
        'DNT': '1'
      }
    });
    
    // 注入反检测脚本
    await context.addInitScript(() => {
      // 移除 webdriver 属性
      Object.defineProperty(navigator, 'webdriver', {
        get: () => undefined,
      });
      
      // 伪造 plugins
      Object.defineProperty(navigator, 'plugins', {
        get: () => [1, 2, 3, 4, 5],
      });
      
      // 伪造 languages
      Object.defineProperty(navigator, 'languages', {
        get: () => ['en-US', 'en'],
      });
      
      // 伪造 chrome 对象
      window.chrome = {
        runtime: {},
        csi: () => {},
        loadTimes: () => {},
        app: {}
      };
      
      // 移除自动化标识
      const originalQuery = window.navigator.permissions.query;
      window.navigator.permissions.query = (parameters) => (
        parameters.name === 'notifications' ?
          Promise.resolve({ state: Cypress ? 'denied' : 'granted' }) :
          originalQuery(parameters)
      );
    });
    
    const page = await context.newPage();
    const url = `https://twitter.com/${accountInfo.handle}`;
    
    // 访问用户页面
    await page.goto(url, { 
      waitUntil: 'domcontentloaded', 
      timeout: 15000 
    });
    
    // 等待页面加载
    try {
      await Promise.race([
        page.waitForSelector('[data-testid="tweet"]', { timeout: 10000 }),
        page.waitForSelector('[data-testid="primaryColumn"]', { timeout: 10000 }),
        page.waitForSelector('article', { timeout: 10000 })
      ]);
      
      // 随机延迟模拟人类行为
      await delay(Math.random() * 3000 + 2000);
      
    } catch (error) {
      console.warn(`⚠️  @${accountInfo.handle} 页面内容加载超时，尝试继续处理`);
    }
    
    // 模拟人类滚动行为
    for (let i = 0; i < 4; i++) {
      // 随机滚动距离
      const scrollHeight = Math.random() * 800 + 400;
      await page.evaluate((height) => {
        window.scrollBy(0, height);
      }, scrollHeight);
      
      // 随机停留时间
      await delay(2000 + Math.random() * 2000);
      
      // 最后一次滚动到底部
      if (i === 3) {
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        await delay(3000);
      }
    }
    
    // 获取推文元素
    const tweetElements = await page.$$('[data-testid="tweet"]');
    const maxTweets = Math.min(tweetElements.length, config.maxTweetsPerAccount);
    
    for (let i = 0; i < maxTweets; i++) {
      try {
        const tweetData = await extractTweetData(page, tweetElements[i], accountInfo, config);
        if (tweetData && isRecentTweet(tweetData.publishedAt, config.dayRange)) {
          tweets.push(tweetData);
        }
      } catch (error) {
        console.warn(`⚠️  提取推文失败 @${accountInfo.handle}:`, error.message);
        continue;
      }
    }
    
    await context.close();
    
  } catch (error) {
    console.error(`❌ 爬取 @${accountInfo.handle} 失败:`, error.message);
  } finally {
    if (browser) {
      await browser.close();
    }
  }
  
  return {
    account: accountInfo.handle,
    tweets: tweets.filter(tweet => (tweet.metrics?.aiRelevanceScore || 0) > 0.2)
  };
}

/**
 * 提取推文数据
 */
async function extractTweetData(page, tweetElement, account, config) {
  try {
    // 提取推文文本
    const textElement = await tweetElement.$('[data-testid="tweetText"]');
    const text = textElement ? await textElement.textContent() : '';
    
    if (!text || text.length < 20) return null;

    // 提取推文链接
    const linkElement = await tweetElement.$('a[href*="/status/"]');
    const tweetUrl = linkElement ? 
      `https://twitter.com${await linkElement.getAttribute('href')}` : '';

    // 提取时间
    const timeElement = await tweetElement.$('time');
    const datetime = timeElement ? await timeElement.getAttribute('datetime') : '';
    
    // 提取互动数据
    const likes = await extractSimpleCount(tweetElement, '[data-testid="like"]');
    const retweets = await extractSimpleCount(tweetElement, '[data-testid="retweet"]');
    
    // 计算 AI 相关性
    const aiScore = calculateAIRelevance(text) * account.weight;
    
    if (aiScore < 0.2) return null;

    return {
      id: `twitter_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      title: extractTitle(text),
      description: cleanText(text),
      url: tweetUrl,
      author: `@${account.handle}`,
      publishedAt: new Date(datetime || Date.now()),
      source: 'twitter',
      tags: extractHashtags(text),
      imageUrl: '',
      metrics: {
        likes,
        shares: retweets,
        aiRelevanceScore: aiScore,
        qualityScore: account.weight,
        freshnessScore: calculateFreshnessScore(new Date(datetime || Date.now()))
      },
      metadata: {
        platform: 'twitter',
        contentType: 'tweet',
        accountHandle: account.handle,
        accountName: account.name,
        language: /[\u4e00-\u9fff]/.test(text) ? 'zh' : 'en'
      }
    };
    
  } catch (error) {
    console.warn('⚠️  解析推文数据失败:', error);
    return null;
  }
}

/**
 * 提取简单的计数
 */
async function extractSimpleCount(element, selector) {
  try {
    const countElement = await element.$(selector);
    if (!countElement) return 0;
    
    const text = await countElement.textContent();
    if (!text) return 0;
    
    const match = text.match(/(\d+(?:\.\d+)?)(K|M)?/i);
    if (!match) return 0;
    
    const num = parseFloat(match[1]);
    const unit = match[2]?.toUpperCase();
    
    if (unit === 'K') return Math.floor(num * 1000);
    if (unit === 'M') return Math.floor(num * 1000000);
    return Math.floor(num);
    
  } catch {
    return 0;
  }
}

/**
 * 计算 AI 相关性
 */
function calculateAIRelevance(text) {
  const lowerText = text.toLowerCase();
  const keywords = [
    { term: 'gpt', weight: 0.3 },
    { term: 'claude', weight: 0.3 },
    { term: 'openai', weight: 0.25 },
    { term: 'anthropic', weight: 0.25 },
    { term: 'ai', weight: 0.15 },
    { term: 'machine learning', weight: 0.2 },
    { term: 'deep learning', weight: 0.2 },
    { term: 'llm', weight: 0.25 },
    { term: '人工智能', weight: 0.2 },
    { term: '大模型', weight: 0.25 }
  ];
  
  let score = 0;
  for (const { term, weight } of keywords) {
    if (lowerText.includes(term)) {
      score += weight;
    }
  }
  
  return Math.min(score, 1.0);
}

/**
 * 提取标题
 */
function extractTitle(text) {
  const cleaned = cleanText(text);
  return cleaned.length > 60 ? `${cleaned.substring(0, 57)}...` : cleaned;
}

/**
 * 清理文本
 */
function cleanText(text) {
  return text
    .replace(/https?:\/\/\S+/g, '')
    .replace(/@\w+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * 提取话题标签
 */
function extractHashtags(text) {
  const hashtags = text.match(/#\w+/g);
  return hashtags ? hashtags.map(tag => tag.substring(1).toLowerCase()).slice(0, 5) : [];
}

/**
 * 计算新鲜度评分
 */
function calculateFreshnessScore(publishedAt) {
  const now = new Date();
  const hoursDiff = (now.getTime() - publishedAt.getTime()) / (1000 * 60 * 60);
  
  if (hoursDiff <= 6) return 1.0;
  if (hoursDiff <= 24) return 0.8;
  if (hoursDiff <= 72) return 0.6;
  if (hoursDiff <= 168) return 0.4;
  return 0.2;
}

/**
 * 检查是否为最近推文
 */
function isRecentTweet(publishedAt, dayRange) {
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