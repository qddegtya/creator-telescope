/**
 * Twitter Search Worker
 * 使用 Playwright 进行 Twitter/X 搜索（无需 API）
 */

const { chromium } = require('playwright');

/**
 * 执行 Twitter 搜索
 */
async function twitterSearch(taskData) {
  const { 
    queries, 
    hashtags = [],
    maxResults = 15,
    timeFilter = '24h',
    engagement = { minLikes: 5, minRetweets: 2 },
    contentTypes = ['original', 'retweet']
  } = taskData;

  console.log(`🐦 Twitter Worker 开始搜索: ${queries.length} 个查询`);

  let browser = null;
  const results = [];

  try {
    // 启动浏览器
    browser = await chromium.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--no-first-run'
      ]
    });

    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      viewport: { width: 1920, height: 1080 },
      locale: 'en-US'
    });

    const page = await context.newPage();

    // 处理每个查询
    for (const query of queries) {
      try {
        console.log(`📝 Twitter 搜索: ${query}`);

        // 构建搜索查询
        let searchQuery = query;
        
        // 添加 hashtags
        if (hashtags.length > 0) {
          searchQuery += ' ' + hashtags.map(tag => tag.startsWith('#') ? tag : `#${tag}`).join(' ');
        }

        // 添加过滤器
        if (!contentTypes.includes('retweet')) {
          searchQuery += ' -filter:retweets';
        }
        
        if (timeFilter === '24h') {
          searchQuery += ' since:2024-01-01'; // 简化的时间过滤
        }

        // 构建搜索 URL
        const searchUrl = `https://twitter.com/search?q=${encodeURIComponent(searchQuery)}&src=typed_query&f=live`;

        // 导航到搜索页面
        await page.goto(searchUrl, { waitUntil: 'networkidle' });

        // 等待内容加载
        await page.waitForTimeout(3000);

        // 尝试滚动加载更多内容
        for (let i = 0; i < 3; i++) {
          await page.evaluate(() => {
            window.scrollTo(0, document.body.scrollHeight);
          });
          await page.waitForTimeout(2000);
        }

        // 提取搜索结果
        const searchResults = await page.evaluate((maxResults, engagement) => {
          const results = [];
          
          // Twitter 的推文选择器（可能需要根据实际页面调整）
          const tweetElements = document.querySelectorAll('article[data-testid="tweet"]');
          
          for (let i = 0; i < Math.min(tweetElements.length, maxResults); i++) {
            try {
              const tweet = tweetElements[i];
              
              // 提取文本内容
              const textElement = tweet.querySelector('[data-testid="tweetText"]');
              const content = textElement?.textContent?.trim() || '';
              
              if (!content) continue;
              
              // 提取用户信息
              const userElement = tweet.querySelector('[data-testid="User-Name"]');
              const author = userElement?.textContent?.trim() || '';
              
              // 提取链接（如果有）
              const linkElements = tweet.querySelectorAll('a[href*="//"]');
              const urls = Array.from(linkElements)
                .map(link => link.href)
                .filter(url => !url.includes('twitter.com') && !url.includes('t.co'));
              
              // 提取互动数据
              const likeElement = tweet.querySelector('[data-testid="like"]');
              const retweetElement = tweet.querySelector('[data-testid="retweet"]');
              
              const likes = parseInt(likeElement?.textContent?.replace(/[^\d]/g, '') || '0');
              const retweets = parseInt(retweetElement?.textContent?.replace(/[^\d]/g, '') || '0');
              
              // 检查互动门槛
              if (likes < engagement.minLikes && retweets < engagement.minRetweets) {
                continue;
              }
              
              // 提取时间信息
              const timeElement = tweet.querySelector('time');
              const timestamp = timeElement?.getAttribute('datetime') || new Date().toISOString();
              
              results.push({
                title: content.substring(0, 100) + (content.length > 100 ? '...' : ''),
                content: content,
                url: urls[0] || `https://twitter.com/search?q=${encodeURIComponent(content.substring(0, 50))}`,
                source: 'twitter',
                timestamp: new Date(timestamp),
                metadata: {
                  author,
                  likes,
                  retweets,
                  comments: 0, // Twitter 评论数较难提取
                  urls: urls
                }
              });
              
            } catch (extractError) {
              console.error('提取推文失败:', extractError);
            }
          }
          
          return results;
        }, maxResults, engagement);

        results.push(...searchResults);
        console.log(`✅ 找到 ${searchResults.length} 个 Twitter 结果`);

        // 查询间延迟
        if (queries.indexOf(query) < queries.length - 1) {
          await page.waitForTimeout(Math.random() * 4000 + 3000);
        }

      } catch (queryError) {
        console.error(`❌ Twitter 查询失败: ${query}`, queryError.message);
        // 继续处理下一个查询
      }
    }

    await browser.close();
    
    console.log(`✅ Twitter 搜索完成，总计 ${results.length} 个结果`);

    return {
      success: true,
      results,
      metadata: {
        totalQueries: queries.length,
        totalResults: results.length,
        hashtags,
        timestamp: new Date(),
        source: 'twitter-worker'
      }
    };

  } catch (error) {
    if (browser) {
      try {
        await browser.close();
      } catch (closeError) {
        console.error('关闭浏览器失败:', closeError);
      }
    }

    console.error('❌ Twitter 搜索失败:', error);
    
    return {
      success: false,
      error: error.message,
      results: [],
      metadata: {
        timestamp: new Date(),
        source: 'twitter-worker'
      }
    };
  }
}

// Piscina Worker 入口
module.exports = twitterSearch;