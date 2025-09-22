/**
 * Google Search Worker
 * 使用 Playwright 进行专业搜索和反爬虫处理
 */

const { chromium } = require('playwright');

/**
 * 执行 Google 搜索
 */
async function googleSearch(taskData) {
  const { 
    queries, 
    maxResults = 10, 
    timeFilter = '24h',
    siteFilters = [],
    antiCrawling = {}
  } = taskData;

  console.log(`🔍 Google Worker 开始搜索: ${queries.length} 个查询`);

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
        console.log(`📝 搜索查询: ${query}`);

        // 构建搜索 URL
        let searchQuery = query;
        
        // 添加站点过滤器
        if (siteFilters.length > 0) {
          const siteFilter = siteFilters.map(site => `site:${site}`).join(' OR ');
          searchQuery = `${query} (${siteFilter})`;
        }

        // 添加时间过滤器
        let searchUrl = `https://www.google.com/search?q=${encodeURIComponent(searchQuery)}`;
        if (timeFilter === '24h') {
          searchUrl += '&tbs=qdr:d';
        } else if (timeFilter === '7d') {
          searchUrl += '&tbs=qdr:w';
        }

        // 导航到搜索页面
        await page.goto(searchUrl, { waitUntil: 'networkidle' });

        // 反爬虫延迟
        if (antiCrawling.requestDelay) {
          await page.waitForTimeout(antiCrawling.requestDelay);
        } else {
          await page.waitForTimeout(Math.random() * 2000 + 1000);
        }

        // 提取搜索结果
        const searchResults = await page.evaluate((maxResults) => {
          const results = [];
          const resultElements = document.querySelectorAll('div[data-ved] h3');
          
          for (let i = 0; i < Math.min(resultElements.length, maxResults); i++) {
            const element = resultElements[i];
            const linkElement = element.closest('a');
            
            if (linkElement) {
              const title = element.textContent?.trim() || '';
              const url = linkElement.href;
              
              // 获取描述片段
              const parentResult = element.closest('[data-ved]');
              const descElement = parentResult?.querySelector('[data-ved] span:not([class])');
              const description = descElement?.textContent?.trim() || '';
              
              if (title && url && !url.includes('google.com')) {
                results.push({
                  title,
                  url,
                  description,
                  source: 'google',
                  timestamp: new Date(),
                  query: query
                });
              }
            }
          }
          
          return results;
        }, maxResults);

        results.push(...searchResults);
        console.log(`✅ 找到 ${searchResults.length} 个结果`);

        // 查询间延迟
        if (queries.indexOf(query) < queries.length - 1) {
          await page.waitForTimeout(Math.random() * 3000 + 2000);
        }

      } catch (queryError) {
        console.error(`❌ 查询失败: ${query}`, queryError.message);
        // 继续处理下一个查询
      }
    }

    await browser.close();
    
    console.log(`✅ Google 搜索完成，总计 ${results.length} 个结果`);

    return {
      success: true,
      results,
      metadata: {
        totalQueries: queries.length,
        totalResults: results.length,
        timestamp: new Date(),
        source: 'google-worker'
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

    console.error('❌ Google 搜索失败:', error);
    
    return {
      success: false,
      error: error.message,
      results: [],
      metadata: {
        timestamp: new Date(),
        source: 'google-worker'
      }
    };
  }
}

// Piscina Worker 入口
module.exports = googleSearch;