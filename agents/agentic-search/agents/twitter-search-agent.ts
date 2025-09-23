import { Component } from '@astack-tech/core';
import { TwitterSearchTask, TwitterSearchResult, SearchContent } from '../types/multi-agent.js';
import { BrowserPool, type PageLease } from '../infrastructure/browser-pool.js';
import { environmentManager } from '../config/environment.js';
import { BrowserUseAgent } from './browser-use-agent.js';

/**
 * Twitter Search Agent
 * 
 * 专业的 Twitter/X 搜索代理，特点：
 * 1. 无需 Twitter API，使用浏览器模拟
 * 2. 智能反爬虫和请求频率控制
 * 3. 社交媒体内容专业解析
 * 4. 互动数据和影响力分析
 * 5. 24 小时热点和趋势捕捉
 */
export class TwitterSearchAgent extends Component {
  private browserPool: BrowserPool;
  private browserUseAgent: BrowserUseAgent | null;
  private loginState = {
    isLoggedIn: false,
    loginAttempts: 0,
    maxLoginAttempts: 5, // 增加重试次数
    lastLoginTime: 0,
    sessionDuration: 30 * 60 * 1000 // 30分钟会话有效期
  };

  constructor(browserPool: BrowserPool) {
    super({});
    this.browserPool = browserPool;
    
    // 延迟初始化BrowserUseAgent，在需要时才创建
    this.browserUseAgent = null;

    // 配置端口
    Component.Port.I('task').attach(this);
    Component.Port.O('result').attach(this);
  }

  /**
   * 执行 Twitter 搜索任务
   */
  private async executeTwitterSearch(task: TwitterSearchTask): Promise<TwitterSearchResult> {
    console.log('🐦 Twitter Search Agent 开始搜索...');
    console.log(`   - 关键字数量: ${task.keywords.length}`);
    console.log(`   - Hashtags: ${task.hashtags.join(', ')}`);
    console.log(`   - 最大结果: ${task.maxResults}`);
    console.log(`   - 互动要求: ${task.engagement.minLikes}+ 赞, ${task.engagement.minRetweets}+ 转发`);

    const startTime = Date.now();
    const contents: SearchContent[] = [];
    let totalEngagement = 0;
    let influencerPosts = 0;
    const trendingHashtags = new Set<string>();

    let lease: PageLease | null = null;

    try {
      // 从浏览器池租借页面
      lease = await this.browserPool.leasePage(task.timeoutMs);
      const page = lease.page;

      // 配置页面以适应 Twitter
      await this.configurePageForTwitter(page);

      // 预先检查并确保已登录 Twitter
      console.log('🔐 检查 Twitter 登录状态...');
      if (!this.isLoginSessionValid()) {
        console.log('⚠️ 需要登录 Twitter，尝试自动登录...');
        const preLoginSuccess = await this.loginToTwitter(page);
        if (!preLoginSuccess) {
          console.warn('❌ Twitter 预登录失败，搜索可能受限');
        }
      } else {
        console.log('✅ Twitter 登录状态有效');
      }

      // 执行搜索查询
      for (const keyword of task.keywords) {
        try {
          console.log(`📝 搜索关键字: ${keyword}`);

          // 构建搜索查询
          const searchQuery = this.buildTwitterSearchQuery(keyword, task);
          
          // 尝试不同的URL策略
          const searchUrls = [
            `https://x.com/search?q=${encodeURIComponent(searchQuery)}&src=typed_query&f=live`,
            `https://twitter.com/search?q=${encodeURIComponent(searchQuery)}&src=typed_query&f=live`
          ];

          let successful = false;
          let queryResults: any[] = [];

          for (const searchUrl of searchUrls) {
            try {
              console.log(`🔗 尝试访问: ${searchUrl.includes('x.com') ? 'X.com' : 'Twitter.com'}`);
              
              // 检查页面是否仍然有效
              if (page.isClosed()) {
                console.warn('⚠️ 页面已关闭，跳过此URL');
                continue;
              }
              
              await page.goto(searchUrl, { 
                waitUntil: 'domcontentloaded',
                timeout: 30000 
              });

              // 检查是否成功加载
              await page.waitForTimeout(3000);
              
              // 再次检查页面状态
              if (page.isClosed()) {
                console.warn('⚠️ 页面在导航过程中被关闭，跳过此URL');
                continue;
              }
              
              const currentUrl = page.url();
              
              if (currentUrl.includes('login') || currentUrl.includes('i/flow')) {
                console.log('🔐 检测到需要登录，尝试自动登录...');
                const loginSuccess = await this.loginToTwitter(page);
                
                if (!loginSuccess) {
                  console.warn('⚠️ 登录失败，尝试下一个URL');
                  // 检查页面是否在登录过程中被破坏
                  if (page.isClosed()) {
                    console.warn('⚠️ 页面在登录过程中被关闭');
                    break; // 退出URL循环，需要重新获取页面
                  }
                  continue;
                }
                
                // 登录成功后重新尝试搜索URL
                console.log('✅ 登录成功，重新访问搜索页面...');
                
                // 验证页面仍然有效
                if (page.isClosed()) {
                  console.warn('⚠️ 页面在登录后被关闭');
                  break; // 退出URL循环
                }
                
                await page.goto(searchUrl, { 
                  waitUntil: 'domcontentloaded',
                  timeout: 30000 
                });
                await page.waitForTimeout(3000);
              }

              // 检查页面是否正常加载
              const title = await page.title();
              if (title.includes('Just a moment') || title.includes('Cloudflare')) {
                console.warn('⚠️ Cloudflare保护激活，尝试下一个URL');
                continue;
              }

              // 反爬虫延迟
              await page.waitForTimeout(Math.random() * 3000 + 2000);

              // 滚动加载更多内容
              await this.scrollToLoadMoreTweets(page);

              // 提取搜索结果
              queryResults = await this.extractTwitterResults(page, keyword, task);
              successful = true;
              break;

            } catch (urlError) {
              console.warn(`⚠️ URL ${searchUrl.includes('x.com') ? 'X.com' : 'Twitter.com'} 访问失败:`, urlError instanceof Error ? urlError.message : 'Unknown error');
              continue;
            }
          }

          if (!successful) {
            console.warn(`⚠️ 所有Twitter URL都无法访问，跳过关键字: ${keyword}`);
            continue;
          }
          
          // 更新统计数据
          for (const result of queryResults) {
            if (result.metadata?.engagement) {
              totalEngagement += (result.metadata.engagement.likes || 0) + 
                                (result.metadata.engagement.shares || 0);
            }
            
            // 检查是否为影响者发布
            if (this.isInfluencerPost(result, task.influencers)) {
              influencerPosts++;
            }

            // 提取trending hashtags
            this.extractHashtagsFromContent(result.content, trendingHashtags);
          }

          contents.push(...queryResults);
          console.log(`✅ 关键字搜索完成，获得 ${queryResults.length} 个结果`);

          // 检查是否达到最大结果数
          if (contents.length >= task.maxResults) {
            console.log(`🎯 已达到最大结果数限制 (${task.maxResults})`);
            break;
          }

          // 关键字间延迟
          if (task.keywords.indexOf(keyword) < task.keywords.length - 1) {
            await page.waitForTimeout(Math.random() * 4000 + 3000);
          }

        } catch (queryError) {
          console.error(`❌ Twitter 关键字搜索失败: ${keyword}`, queryError);
          // 继续处理下一个关键字
        }
      }

      // 限制结果数量并按互动数排序
      const sortedContents = contents
        .sort((a, b) => {
          const aEngagement = (a.metadata?.engagement?.likes || 0) + (a.metadata?.engagement?.shares || 0);
          const bEngagement = (b.metadata?.engagement?.likes || 0) + (b.metadata?.engagement?.shares || 0);
          return bEngagement - aEngagement;
        })
        .slice(0, task.maxResults);

      const executionTime = Date.now() - startTime;

      const result: TwitterSearchResult = {
        agentType: 'twitter',
        executionTime,
        success: true,
        contents: sortedContents,
        metadata: {
          totalFound: contents.length,
          processedCount: sortedContents.length,
          filteredCount: contents.length - sortedContents.length
        },
        socialMetrics: {
          totalEngagement,
          influencerPosts,
          trendingHashtags: Array.from(trendingHashtags).slice(0, 10)
        }
      };

      console.log(`✅ Twitter 搜索完成: ${sortedContents.length} 个结果 (${executionTime}ms)`);
      console.log(`   - 总互动数: ${totalEngagement}`);
      console.log(`   - 影响者发布: ${influencerPosts}`);
      console.log(`   - 趋势标签: ${result.socialMetrics.trendingHashtags.join(', ')}`);

      return result;

    } catch (error) {
      const executionTime = Date.now() - startTime;
      
      console.error('❌ Twitter 搜索失败:', error);

      return {
        agentType: 'twitter',
        executionTime,
        success: false,
        error: error instanceof Error ? error.message : '未知错误',
        contents: [],
        metadata: {
          totalFound: 0,
          processedCount: 0,
          filteredCount: 0
        },
        socialMetrics: {
          totalEngagement: 0,
          influencerPosts: 0,
          trendingHashtags: []
        }
      };

    } finally {
      // 归还页面到浏览器池
      if (lease) {
        await this.browserPool.returnPage(lease.id);
      }
    }
  }

  /**
   * 配置页面以适应 Twitter
   */
  private async configurePageForTwitter(page: any): Promise<void> {
    // 设置更真实的浏览器 headers
    await page.setExtraHTTPHeaders({
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
      'Accept-Language': 'en-US,en;q=0.9,zh-CN;q=0.8,zh;q=0.7',
      'Accept-Encoding': 'gzip, deflate, br',
      'Cache-Control': 'max-age=0',
      'Upgrade-Insecure-Requests': '1',
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'none',
      'Sec-Fetch-User': '?1',
      'sec-ch-ua': '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
      'sec-ch-ua-mobile': '?0',
      'sec-ch-ua-platform': '"macOS"'
    });

    // 注入强化的反检测脚本
    await page.addInitScript(() => {
      // 隐藏 webdriver 属性
      Object.defineProperty(navigator, 'webdriver', {
        get: () => false,
      });

      // 模拟真实的插件环境
      Object.defineProperty(navigator, 'plugins', {
        get: () => Array.from({ length: 4 }, (_, i) => ({
          name: `Plugin ${i}`,
          filename: `plugin${i}.so`,
          description: `Plugin ${i} description`
        })),
      });

      // 模拟语言属性
      Object.defineProperty(navigator, 'languages', {
        get: () => ['en-US', 'en', 'zh-CN'],
      });

      // 模拟真实的屏幕属性
      Object.defineProperty(screen, 'availWidth', { get: () => 1440 });
      Object.defineProperty(screen, 'availHeight', { get: () => 900 });
      Object.defineProperty(screen, 'width', { get: () => 1440 });
      Object.defineProperty(screen, 'height', { get: () => 900 });

      // 覆盖权限查询
      if (navigator.permissions && navigator.permissions.query) {
        const originalQuery = navigator.permissions.query;
        navigator.permissions.query = (parameters) => (
          parameters.name === 'notifications' ?
            Promise.resolve({ state: Notification.permission }) :
            originalQuery(parameters)
        );
      }

      // 禁用 DevTools 检测
      const devtools = { open: false, orientation: null };
      setInterval(() => {
        if (devtools.open) {
          devtools.open = false;
        }
      }, 500);
    });

    console.log('🛡️ Twitter 页面配置完成');
  }

  /**
   * 自动登录 Twitter/X
   */
  private async loginToTwitter(page: any): Promise<boolean> {
    const config = environmentManager.getConfig();
    
    if (!config.twitterUsername || !config.twitterPassword) {
      console.warn('⚠️ Twitter 登录凭据未配置，跳过登录');
      return false;
    }

    // 检查登录状态是否仍然有效
    if (this.isLoginSessionValid()) {
      console.log('✅ Twitter 登录会话仍然有效');
      return true;
    }

    if (this.loginState.loginAttempts >= this.loginState.maxLoginAttempts) {
      console.error('❌ Twitter 登录尝试次数已达上限');
      return false;
    }

    try {
      console.log('🤖 开始智能 Twitter 登录...');
      this.loginState.loginAttempts++;

      // 导航到登录页面
      await page.goto('https://x.com/i/flow/login', { 
        waitUntil: 'domcontentloaded',
        timeout: 30000 
      });
      await page.waitForTimeout(3000);

      // 使用智能视觉Agent进行登录
      const credentials = {
        username: config.twitterUsername,
        password: config.twitterPassword,
        email: config.twitterEmail
      };

      // 使用新的Browser Use Agent进行智能登录
      const loginSuccess = await this.performSmartLogin(page, credentials);

      if (loginSuccess) {
        // 等待登录完成并验证
        await page.waitForTimeout(5000);
        
        const currentUrl = page.url();
        const isLoggedIn = currentUrl.includes('home') || 
                          currentUrl === 'https://x.com/' ||
                          await page.locator('[data-testid="SideNav_AccountSwitcher_Button"]').isVisible().catch(() => false);

        if (isLoggedIn) {
          console.log('✅ 智能 Twitter 登录成功');
          this.loginState.isLoggedIn = true;
          this.loginState.lastLoginTime = Date.now();
          this.loginState.loginAttempts = 0;
          return true;
        }
      }

      console.error('❌ 智能 Twitter 登录失败');
      return false;

    } catch (error) {
      console.error('❌ Twitter 登录过程中出错:', error instanceof Error ? error.message : 'Unknown error');
      return false;
    }
  }

  /**
   * 初始化Browser Use Agent
   */
  private async initBrowserUseAgent(): Promise<BrowserUseAgent> {
    if (this.browserUseAgent) {
      return this.browserUseAgent;
    }

    try {
      // 动态导入模型提供者
      const { Deepseek } = await import('@astack-tech/integrations/model-provider');
      
      const config = environmentManager.getConfig();
      const modelProvider = new Deepseek({
        apiKey: config.deepseekApiKey,
        model: 'deepseek-chat',
        temperature: 0.3
      });
      
      this.browserUseAgent = new BrowserUseAgent({ modelProvider });
      return this.browserUseAgent;
    } catch (error) {
      console.error('❌ Failed to initialize Browser Use Agent:', error);
      throw error;
    }
  }

  /**
   * 使用Browser Use Agent执行智能登录 - AStack独立运行模式
   */
  private async performSmartLogin(page: any, credentials: { username: string; password: string; email?: string }): Promise<boolean> {
    try {
      console.log('🤖 使用Browser Use Agent进行智能登录...');
      
      // 先初始化Agent
      const browserAgent = await this.initBrowserUseAgent();
      
      // 关键：设置page上下文到Browser Use Agent
      (browserAgent as any).currentPage = page;
      
      // AStack独立运行模式 - 直接调用agent.run()
      const loginTask = `请帮我登录Twitter账户。步骤如下：
1. 使用get_page_snapshot()分析当前页面，找到用户名输入框
2. 使用type_text()在用户名输入框中输入：${credentials.username}
3. 点击下一步按钮（如果存在）
4. 找到密码输入框，使用type_text()输入密码
5. 点击登录按钮完成登录
请确保每个步骤之间有适当的等待时间。`;

      // 创建输入，包含页面上下文
      const input = {
        messages: [{
          role: 'user',
          content: loginTask,
          metadata: { page }
        }],
        context: { page }
      };

      // 独立运行Browser Use Agent
      const result = await browserAgent.agent.run(input);
      
      console.log('📝 Browser Use Agent 登录结果:', result);
      
      // 简单验证是否成功
      if (result && result.message) {
        return true;
      }
      
      return false;
      
    } catch (error) {
      console.error('❌ Smart login error:', error);
      return false;
    }
  }


  /**
   * 检查登录会话是否仍然有效
   */
  private isLoginSessionValid(): boolean {
    if (!this.loginState.isLoggedIn) {
      return false;
    }

    const sessionAge = Date.now() - this.loginState.lastLoginTime;
    return sessionAge < this.loginState.sessionDuration;
  }

  /**
   * 重置登录状态
   */
  private resetLoginState(): void {
    this.loginState.isLoggedIn = false;
    this.loginState.loginAttempts = 0;
    this.loginState.lastLoginTime = 0;
  }

  /**
   * 构建 Twitter 搜索查询
   */
  private buildTwitterSearchQuery(keyword: string, task: TwitterSearchTask): string {
    let query = keyword;

    // 添加 hashtags
    if (task.hashtags.length > 0) {
      const hashtagStr = task.hashtags
        .map(tag => tag.startsWith('#') ? tag : `#${tag}`)
        .join(' OR ');
      query += ` (${hashtagStr})`;
    }

    // 添加内容类型过滤器
    if (!task.contentTypes.includes('retweet')) {
      query += ' -filter:retweets';
    }
    
    if (!task.contentTypes.includes('reply')) {
      query += ' -filter:replies';
    }

    // 只包含原创内容
    if (task.contentTypes.includes('original') && task.contentTypes.length === 1) {
      query += ' -filter:retweets -filter:replies';
    }

    // 添加语言过滤
    query += ' lang:en';

    // 添加互动度过滤
    if (task.engagement.minLikes > 0) {
      query += ` min_faves:${task.engagement.minLikes}`;
    }

    if (task.engagement.minRetweets > 0) {
      query += ` min_retweets:${task.engagement.minRetweets}`;
    }

    console.log(`🔗 Twitter 搜索查询: ${query}`);
    return query;
  }

  /**
   * 滚动加载更多推文
   */
  private async scrollToLoadMoreTweets(page: any): Promise<void> {
    try {
      // 等待初始内容加载
      await page.waitForSelector('article[data-testid="tweet"]', { timeout: 10000 });

      // 滚动 3-5 次以加载更多内容
      const scrollCount = Math.floor(Math.random() * 3) + 3;
      
      for (let i = 0; i < scrollCount; i++) {
        await page.evaluate(() => {
          window.scrollTo(0, document.body.scrollHeight);
        });
        
        // 等待新内容加载
        await page.waitForTimeout(2000);
      }

      console.log(`📜 完成 ${scrollCount} 次滚动加载`);

    } catch (error) {
      console.warn('⚠️ 滚动加载失败:', error);
    }
  }

  /**
   * 提取 Twitter 搜索结果
   */
  private async extractTwitterResults(page: any, keyword: string, task: TwitterSearchTask): Promise<SearchContent[]> {
    try {
      // 提取推文数据
      const results = await page.evaluate(({ keyword, minLikes, minRetweets }) => {
        const tweets: any[] = [];
        
        // Twitter 推文选择器
        const tweetElements = document.querySelectorAll('article[data-testid="tweet"]');
        
        for (let i = 0; i < Math.min(tweetElements.length, 50); i++) {
          try {
            const tweet = tweetElements[i];
            
            // 提取文本内容
            const textElement = tweet.querySelector('[data-testid="tweetText"]');
            const content = textElement?.textContent?.trim() || '';
            
            if (!content || content.length < 10) continue;
            
            // 提取用户信息
            const userNameElement = tweet.querySelector('[data-testid="User-Name"] a');
            const userHandle = userNameElement?.getAttribute('href')?.replace('/', '') || '';
            const userDisplayName = tweet.querySelector('[data-testid="User-Name"] span')?.textContent?.trim() || '';
            
            // 提取时间
            const timeElement = tweet.querySelector('time');
            const timestamp = timeElement?.getAttribute('datetime') || new Date().toISOString();
            
            // 提取互动数据
            const likeElement = tweet.querySelector('[data-testid="like"] span[data-testid="app-text-transition-container"]');
            const retweetElement = tweet.querySelector('[data-testid="retweet"] span[data-testid="app-text-transition-container"]');
            const replyElement = tweet.querySelector('[data-testid="reply"] span[data-testid="app-text-transition-container"]');
            
            const likes = parseInt(likeElement?.textContent?.replace(/[^\d]/g, '') || '0');
            const retweets = parseInt(retweetElement?.textContent?.replace(/[^\d]/g, '') || '0');
            const replies = parseInt(replyElement?.textContent?.replace(/[^\d]/g, '') || '0');
            
            // 检查互动门槛
            if (likes < minLikes || retweets < minRetweets) {
              continue;
            }
            
            // 提取链接
            const linkElements = tweet.querySelectorAll('a[href*="//"]');
            const urls = Array.from(linkElements)
              .map(link => (link as HTMLAnchorElement).href)
              .filter(url => url && !url.includes('twitter.com') && !url.includes('t.co'))
              .slice(0, 3);
            
            // 检查是否为转发
            const isRetweet = tweet.querySelector('[data-testid="socialContext"]')?.textContent?.includes('Retweeted') || false;
            
            // 提取媒体信息
            const hasImage = tweet.querySelector('[data-testid="tweetPhoto"]') !== null;
            const hasVideo = tweet.querySelector('[data-testid="videoPlayer"]') !== null;
            
            tweets.push({
              content,
              userHandle,
              userDisplayName,
              timestamp,
              likes,
              retweets,
              replies,
              urls,
              isRetweet,
              hasImage,
              hasVideo,
              query: keyword
            });
            
          } catch (extractError) {
            console.error('单条推文提取失败:', extractError);
          }
        }
        
        return tweets;
      }, { keyword, minLikes: task.engagement.minLikes, minRetweets: task.engagement.minRetweets });

      // 转换为 SearchContent 格式
      const searchContents: SearchContent[] = results.map(tweet => ({
        id: this.generateContentId(tweet),
        title: this.generateTweetTitle(tweet.content),
        content: tweet.content,
        url: tweet.urls[0] || `https://twitter.com/${tweet.userHandle}`,
        source: 'twitter',
        timestamp: new Date(tweet.timestamp),
        metadata: {
          author: tweet.userDisplayName || tweet.userHandle,
          platform: 'twitter',
          tags: this.extractHashtagsFromText(tweet.content),
          engagement: {
            likes: tweet.likes,
            shares: tweet.retweets,
            comments: tweet.replies
          },
          userHandle: tweet.userHandle,
          isRetweet: tweet.isRetweet,
          hasMedia: tweet.hasImage || tweet.hasVideo,
          externalUrls: tweet.urls
        }
      }));

      // 过滤和验证结果
      const filteredResults = searchContents.filter(content => 
        content.content.length > 15 &&
        this.isRelevantContent(content, task.keywords) &&
        this.meetsEngagementThreshold(content, task.engagement)
      );

      console.log(`📊 Twitter 结果提取: ${results.length} 个原始，${filteredResults.length} 个过滤后`);
      return filteredResults;

    } catch (error) {
      console.error('Twitter 结果提取失败:', error);
      return [];
    }
  }

  /**
   * 生成推文标题
   */
  private generateTweetTitle(content: string): string {
    // 提取第一句或前 100 个字符作为标题
    const firstSentence = content.split(/[.!?]/, 1)[0];
    if (firstSentence.length > 10 && firstSentence.length < 100) {
      return firstSentence.trim();
    }
    
    return content.substring(0, 100).trim() + (content.length > 100 ? '...' : '');
  }

  /**
   * 从文本中提取 hashtags
   */
  private extractHashtagsFromText(text: string): string[] {
    const hashtagRegex = /#\w+/g;
    const matches = text.match(hashtagRegex);
    return matches ? matches.slice(0, 5) : [];
  }

  /**
   * 从内容中提取 hashtags 到集合
   */
  private extractHashtagsFromContent(content: string, hashtagSet: Set<string>): void {
    const hashtags = this.extractHashtagsFromText(content);
    hashtags.forEach(tag => hashtagSet.add(tag));
  }

  /**
   * 检查是否为影响者发布
   */
  private isInfluencerPost(content: SearchContent, influencers: string[]): boolean {
    if (influencers.length === 0) return false;
    
    const userHandle = content.metadata?.userHandle || '';
    return influencers.some(influencer => 
      userHandle.toLowerCase().includes(influencer.toLowerCase())
    );
  }

  /**
   * 检查互动度是否达标
   */
  private meetsEngagementThreshold(content: SearchContent, engagement: TwitterSearchTask['engagement']): boolean {
    const likes = content.metadata?.engagement?.likes || 0;
    const shares = content.metadata?.engagement?.shares || 0;
    
    return likes >= engagement.minLikes && shares >= engagement.minRetweets;
  }

  /**
   * 生成内容 ID
   */
  private generateContentId(tweet: any): string {
    // 简单的 hash 函数，不依赖 crypto 模块
    const text = tweet.content + tweet.userHandle + tweet.timestamp;
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
      const char = text.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // 转换为 32 位整数
    }
    return Math.abs(hash).toString(16).substring(0, 12);
  }

  /**
   * 检查内容相关性
   */
  private isRelevantContent(content: SearchContent, keywords: string[]): boolean {
    const text = (content.title + ' ' + content.content).toLowerCase();
    
    // 至少包含一个关键字
    return keywords.some(keyword => 
      text.includes(keyword.toLowerCase())
    );
  }

  /**
   * 独立运行组件
   */
  async run(task: TwitterSearchTask): Promise<TwitterSearchResult> {
    if (!task.enabled) {
      console.log('⏭️ Twitter Search Agent 已禁用，跳过执行');
      return {
        agentType: 'twitter',
        executionTime: 0,
        success: true,
        contents: [],
        metadata: {
          totalFound: 0,
          processedCount: 0,
          filteredCount: 0
        },
        socialMetrics: {
          totalEngagement: 0,
          influencerPosts: 0,
          trendingHashtags: []
        }
      };
    }

    return await this.executeTwitterSearch(task);
  }

  /**
   * 在流水线中运行组件
   */
  _transform($i: any, $o: any): void {
    $i('task').receive(async (task: TwitterSearchTask) => {
      try {
        const result = await this.run(task);
        $o('result').send(result);
      } catch (error) {
        console.error(
          `[TwitterSearchAgent] 处理失败: ${error instanceof Error ? error.message : String(error)}`
        );
        
        // 发送错误结果
        $o('result').send({
          agentType: 'twitter',
          executionTime: 0,
          success: false,
          error: error instanceof Error ? error.message : '未知错误',
          contents: [],
          metadata: {
            totalFound: 0,
            processedCount: 0,
            filteredCount: 0
          },
          socialMetrics: {
            totalEngagement: 0,
            influencerPosts: 0,
            trendingHashtags: []
          }
        });
      }
    });
  }

  /**
   * 健康检查
   */
  async healthCheck(): Promise<{ healthy: boolean; message: string }> {
    try {
      // 检查浏览器池状态
      const poolStats = this.browserPool.getPoolStats();
      
      if (poolStats.totalInstances === 0) {
        return { healthy: false, message: '浏览器池中没有可用实例' };
      }

      if (poolStats.errorInstances > poolStats.totalInstances * 0.5) {
        return { healthy: false, message: '超过 50% 的浏览器实例处于错误状态' };
      }

      return { healthy: true, message: 'Twitter Search Agent 运行正常' };

    } catch (error) {
      return { 
        healthy: false, 
        message: `健康检查失败: ${error instanceof Error ? error.message : '未知错误'}` 
      };
    }
  }
}

export default TwitterSearchAgent;