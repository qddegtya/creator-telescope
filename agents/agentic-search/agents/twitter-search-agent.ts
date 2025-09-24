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
  
  // Twitter会话目录路径
  private readonly twitterSessionDir = './tmp/twitter-session';
  
  // 会话状态标记
  private hasValidSession = false;

  constructor(browserPool: BrowserPool) {
    super({});
    this.browserPool = browserPool;
    
    // 检查是否存在会话目录
    this.checkExistingSession();
    
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
      // 从浏览器池租借页面 - Twitter需要使用共享会话目录
      const twitterTimeout = Math.max(task.timeoutMs || 120000, 300000); // 至少5分钟
      
      // 如果有共享会话，需要用特殊方式创建浏览器
      if (this.hasValidSession) {
        lease = await this.createSharedSessionPage(twitterTimeout);
      } else {
        lease = await this.browserPool.leasePage(twitterTimeout);
      }
      
      const page = lease.page;

      // 配置页面以适应 Twitter
      await this.configurePageForTwitter(page);
      
      // 检查是否有共享会话数据
      if (this.hasValidSession) {
        console.log('🍪 检测到共享会话目录，验证登录状态...');
        await this.checkSharedSessionStatus(page);
      }

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
      
      // 额外检查：如果有共享会话目录，重新验证实际浏览器登录状态
      if (this.hasValidSession) {
        console.log('🔍 验证共享会话的实际登录状态...');
        
        // 导航到Twitter主页来检查登录状态
        try {
          await page.goto('https://x.com', { waitUntil: 'domcontentloaded', timeout: 15000 });
          await page.waitForTimeout(2000);
          
          const actualLoginStatus = await this.checkLoginSuccess(page);
          console.log(`📊 实际浏览器登录状态: ${actualLoginStatus ? '✅ 已登录' : '❌ 未登录'}`);
          
          if (actualLoginStatus) {
            // 实际已登录，同步内存状态
            console.log('🔄 同步登录状态到内存...');
            this.loginState.isLoggedIn = true;
            this.loginState.lastLoginTime = Date.now();
            this.loginState.loginAttempts = 0;
          } else {
            console.log('⚠️ 共享会话已过期，清理会话状态...');
            this.hasValidSession = false;
            this.resetLoginState();
            await this.clearSessionDirectory();
          }
        } catch (error) {
          console.warn('⚠️ 验证共享会话状态时出错:', error);
          // 出错时保守处理，假设需要重新登录
          this.hasValidSession = false;
          this.resetLoginState();
        }
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

              // 检查当前页面状态
              const finalUrl = page.url();
              console.log(`📍 搜索后页面URL: ${finalUrl}`);
              
              // 检查页面是否有登录提示
              if (finalUrl.includes('login') || finalUrl.includes('i/flow')) {
                console.warn('⚠️ 页面重定向到登录页面，会话可能无效');
                throw new Error('页面需要登录，会话无效');
              }
              
              // 检查页面基本内容
              const pageTitle = await page.title().catch(() => 'N/A');
              console.log(`📄 页面标题: ${pageTitle}`);
              
              // 确保切换到"最新"标签以获取推文结果
              await this.ensureLatestTab(page);
              
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
        console.log(`🔍 登录后页面URL: ${currentUrl}`);
        
        // 详细检查登录状态
        const urlCheck = currentUrl.includes('home') || currentUrl === 'https://x.com/';
        const sideNavCheck = await page.locator('[data-testid="SideNav_AccountSwitcher_Button"]').isVisible().catch(() => false);
        
        console.log(`📊 登录状态检查:`);
        console.log(`   URL检查: ${urlCheck ? '✅' : '❌'} (${currentUrl})`);
        console.log(`   侧边栏检查: ${sideNavCheck ? '✅' : '❌'}`);
        
        const isLoggedIn = urlCheck || sideNavCheck;

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
   * 使用Browser Use Agent执行智能登录 - 支持HILT (Human In The Loop)
   */
  private async performSmartLogin(page: any, credentials: { username: string; password: string; email?: string }): Promise<boolean> {
    try {
      console.log('🤖 使用Browser Use Agent进行智能登录（支持人工干预）...');
      
      // 先初始化Agent
      const browserAgent = await this.initBrowserUseAgent();
      
      // 关键：设置page上下文到Browser Use Agent
      (browserAgent as any).currentPage = page;
      
      // HILT增强的登录任务
      const loginTask = `请帮我登录Twitter账户。步骤如下：
1. 使用get_page_snapshot()分析当前页面，找到用户名输入框
2. 使用type_text()在用户名输入框中输入：${credentials.username}
3. 点击下一步按钮（如果存在）
4. 找到密码输入框，使用type_text()输入密码
5. 点击登录按钮完成登录

如果遇到以下情况，请提示需要人工干预：
- 出现验证码（CAPTCHA）
- 需要短信或邮件验证
- 页面出现安全检查
- 任何无法自动处理的情况

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

      // 尝试自动登录，支持多轮交互
      const result = await this.performLoginWithHILT(browserAgent, input, page);
      
      console.log('📝 Browser Use Agent 登录结果:', result);
      
      return result;
      
    } catch (error) {
      console.error('❌ Smart login error:', error);
      return false;
    }
  }

  /**
   * 执行支持HILT的登录过程
   */
  private async performLoginWithHILT(browserAgent: any, input: any, page: any): Promise<boolean> {
    const maxIterations = 15; // 允许更多迭代，应对复杂登录流程
    let currentIteration = 0;
    let lastAgentOutput: any = null;

    while (currentIteration < maxIterations) {
      currentIteration++;
      console.log(`🔄 登录迭代 ${currentIteration}/${maxIterations}`);

      try {
        // 检查页面是否仍然有效
        if (page.isClosed && page.isClosed()) {
          console.error('❌ 页面已关闭，无法继续登录');
          break;
        }

        // 运行Browser Use Agent
        const result = await browserAgent.agent.run(input);
        lastAgentOutput = result;

        // 检查是否需要人工干预
        if (this.needsHumanIntervention(result, page)) {
          console.log('🙋 检测到需要人工干预的情况');
          
          // 启动HILT模式
          const humanResult = await this.requestHumanIntervention(page, result);
          
          if (humanResult.action === 'continue') {
            // 人工处理完成，继续自动化
            input.messages.push({
              role: 'assistant',
              content: result.message || 'Attempted login step'
            });
            input.messages.push({
              role: 'user', 
              content: '人工干预已完成，请继续登录流程。'
            });
            continue;
          } else if (humanResult.action === 'success') {
            // 人工确认登录成功
            return true;
          } else {
            // 人工放弃
            console.log('❌ 用户选择放弃登录');
            return false;
          }
        }

        // 检查登录是否成功
        const isLoggedIn = await this.checkLoginSuccess(page);
        if (isLoggedIn) {
          console.log('✅ 自动登录成功');
          return true;
        }

        // 准备下一轮迭代的输入
        if (result && result.message) {
          input.messages.push({
            role: 'assistant',
            content: result.message
          });
          input.messages.push({
            role: 'user',
            content: '请继续下一步登录操作，或者告诉我是否需要人工干预。'
          });
        }

        // 等待一段时间再继续
        await page.waitForTimeout(2000);

      } catch (error) {
        console.error(`❌ 迭代 ${currentIteration} 失败:`, error);
        
        // 如果是网络错误或页面错误，可能需要人工干预
        const humanResult = await this.requestHumanIntervention(page, { 
          error: error instanceof Error ? error.message : String(error),
          needsHuman: true 
        });
        
        if (humanResult.action !== 'continue') {
          return humanResult.action === 'success';
        }
      }
    }

    console.warn('⚠️ 登录迭代达到上限，尝试最后一次人工干预');
    const finalHumanResult = await this.requestHumanIntervention(page, lastAgentOutput);
    return finalHumanResult.action === 'success';
  }

  /**
   * 检查是否需要人工干预
   */
  private needsHumanIntervention(agentResult: any, page: any): boolean {
    if (!agentResult) return false; // 改为false，避免无结果时触发HILT

    const message = agentResult.message || '';
    const error = agentResult.error || '';
    
    // 排除明显的技术错误，这些不需要人工干预
    const technicalErrors = [
      'require is not defined',
      'timeout',
      'net::err_timed_out',
      'net::err_connection_closed',
      'navigation is interrupted',
      'target page.*has been closed'
    ];

    // 如果是技术错误，不需要人工干预
    if (technicalErrors.some(techError => 
      message.toLowerCase().includes(techError.toLowerCase()) || 
      error.toLowerCase().includes(techError.toLowerCase())
    )) {
      return false;
    }

    // 只有这些情况才需要人工干预
    const needsHumanKeywords = [
      'captcha', 'verification code', 'verify your identity', '验证码',
      'security check', '安全检查', 'suspicious activity', '可疑活动',
      'phone number', 'email verification', '手机验证', '邮箱验证'
    ];

    return needsHumanKeywords.some(keyword => 
      message.toLowerCase().includes(keyword.toLowerCase()) ||
      error.toLowerCase().includes(keyword.toLowerCase())
    );
  }

  /**
   * 请求人工干预 - 支持临时显示浏览器
   */
  private async requestHumanIntervention(page: any, context: any): Promise<{action: 'continue' | 'success' | 'abort'}> {
    console.log('\n' + '='.repeat(60));
    console.log('🙋 需要人工干预 - Twitter登录');
    console.log('='.repeat(60));
    console.log('当前情况:', context?.message || context?.error || '自动登录遇到问题');
    
    try {
      console.log('页面URL:', page.url());
    } catch (e) {
      console.log('页面URL: 无法获取（页面已关闭）');
    }
    
    console.log('\n🤖 检测到需要人工处理的登录问题！');
    console.log('👀 浏览器已在可视化模式打开，您可以直接在浏览器中操作！');
    console.log('='.repeat(60));

    // 可视化浏览器的HILT处理
    return this.handleVisualBrowserHILT(page, context);
  }

  /**
   * 可视化浏览器的HILT处理 - 简化的用户交互
   */
  private async handleVisualBrowserHILT(page: any, context?: any): Promise<{ action: string }> {
    try {
      console.log('🔍 分析当前页面状态...');
      
      // 获取基本页面信息
      const pageInfo = {
        url: page.url(),
        title: await page.title().catch(() => 'N/A')
      };
      
      console.log(`📄 当前页面: ${pageInfo.title}`);
      console.log(`🔗 URL: ${pageInfo.url}`);
      
      // 智能分析页面，给出简化的指导
      let guidance = this.getSimplePageGuidance(pageInfo, context);
      
      console.log('\n' + '='.repeat(50));
      console.log('📋 操作指导:');
      console.log(guidance);
      console.log('='.repeat(50));
      
      // 简单的用户确认
      const response = await this.getSimpleUserConfirmation();
      
      if (response === 'success') {
        console.log('✅ 用户确认操作成功');
        return { action: 'success' };
      } else if (response === 'continue') {
        console.log('🔄 用户请求继续自动化流程');
        return { action: 'continue' };
      } else {
        console.log('⏹️ 用户选择中止');
        return { action: 'abort' };
      }
      
    } catch (error) {
      console.error('❌ Visual HITL处理失败:', error);
      return { action: 'abort' };
    }
  }

  /**
   * AI辅助的终端HILT处理（保留备用）
   */
  private async handleTerminalHILT(page: any, context?: any): Promise<{ action: string }> {
    try {
      console.log('🔍 分析页面内容...');
      
      // 获取页面信息
      const pageInfo = {
        url: page.url(),
        title: await page.title().catch(() => 'N/A'),
        html: await page.content().catch(() => ''),
      };
      
      console.log(`📄 当前页面: ${pageInfo.title}`);
      console.log(`🔗 URL: ${pageInfo.url}`);
      
      // 使用AI分析页面并识别需要的信息
      const analysis = await this.analyzePageForHILT(page, context);
      
      if (!analysis.needsInput) {
        console.log('✅ 页面不需要额外输入，尝试自动处理...');
        return await this.autoHandlePage(page);
      }
      
      console.log('\n📋 AI分析结果:');
      console.log(`🎯 检测到的问题: ${analysis.issue}`);
      console.log(`📝 需要的信息: ${analysis.requiredInputs.join(', ')}`);
      
      // 从用户获取信息
      const userInputs = await this.getUserInputsFromTerminal(analysis.requiredInputs);
      
      // 使用AI自动填写信息
      console.log('🤖 AI自动填写信息...');
      const fillResult = await this.autoFillWithUserInputs(page, userInputs, analysis);
      
      if (fillResult.success) {
        console.log('✅ 信息填写成功，尝试提交...');
        const submitResult = await this.autoSubmitForm(page);
        return { action: submitResult.success ? 'success' : 'retry' };
      } else {
        console.log('❌ 信息填写失败:', fillResult.error);
        return { action: 'abort' };
      }
      
    } catch (error) {
      console.error('❌ Terminal HILT处理失败:', error);
      return { action: 'abort' };
    }
  }

  /**
   * 分析页面内容，识别HILT所需信息
   */
  private async analyzePageForHILT(page: any, context?: any): Promise<{
    needsInput: boolean;
    issue: string;
    requiredInputs: string[];
    elements: any[];
  }> {
    try {
      // 检查常见的登录元素
      const elements = await page.evaluate(() => {
        const inputs = Array.from(document.querySelectorAll('input')).map(input => ({
          type: input.type,
          name: input.name,
          placeholder: input.placeholder,
          id: input.id,
          required: input.required,
          value: input.value,
          selector: input.tagName + (input.id ? `#${input.id}` : '') + (input.className ? `.${input.className.split(' ').join('.')}` : '')
        }));
        
        const buttons = Array.from(document.querySelectorAll('button, input[type="submit"]')).map(btn => ({
          text: btn.textContent?.trim(),
          type: btn.type,
          selector: btn.tagName + (btn.id ? `#${btn.id}` : '') + (btn.className ? `.${btn.className.split(' ').join('.')}` : '')
        }));
        
        const messages = Array.from(document.querySelectorAll('div, span, p')).map(el => ({
          text: el.textContent?.trim(),
          className: el.className
        })).filter(el => el.text && el.text.length > 0 && el.text.length < 200);
        
        return { inputs, buttons, messages };
      });
      
      // 基于页面内容推断需要的信息
      const requiredInputs = [];
      let issue = '未知登录问题';
      
      // 检查输入框类型
      for (const input of elements.inputs) {
        if (input.type === 'password' && !input.value) {
          requiredInputs.push('密码');
        }
        if ((input.type === 'text' || input.type === 'email') && 
            (input.name?.includes('user') || input.name?.includes('email') || 
             input.placeholder?.includes('用户') || input.placeholder?.includes('邮箱'))) {
          if (!input.value) requiredInputs.push('用户名/邮箱');
        }
        if (input.name?.includes('code') || input.placeholder?.includes('验证码') || 
            input.placeholder?.includes('code')) {
          requiredInputs.push('验证码');
        }
      }
      
      // 检查错误消息
      for (const msg of elements.messages) {
        if (msg.text.includes('验证码') || msg.text.includes('code')) {
          issue = '需要验证码验证';
          if (!requiredInputs.includes('验证码')) requiredInputs.push('验证码');
        }
        if (msg.text.includes('手机') || msg.text.includes('phone')) {
          issue = '需要手机号验证';
          if (!requiredInputs.includes('手机号')) requiredInputs.push('手机号');
        }
        if (msg.text.includes('异地') || msg.text.includes('异常')) {
          issue = '异地登录验证';
        }
      }
      
      return {
        needsInput: requiredInputs.length > 0,
        issue,
        requiredInputs,
        elements
      };
      
    } catch (error) {
      console.warn('⚠️ 页面分析失败:', error);
      return {
        needsInput: false,
        issue: '页面分析失败',
        requiredInputs: [],
        elements: []
      };
    }
  }

  /**
   * 从终端获取用户输入
   */
  private async getUserInputsFromTerminal(requiredInputs: string[]): Promise<Record<string, string>> {
    const { createInterface } = await import('readline');
    const rl = createInterface({
      input: process.stdin,
      output: process.stdout
    });
    
    const inputs: Record<string, string> = {};
    
    for (const inputType of requiredInputs) {
      await new Promise<void>((resolve) => {
        const isPassword = inputType.includes('密码');
        const prompt = `📝 请输入${inputType}: `;
        
        rl.question(prompt, (answer) => {
          inputs[inputType] = answer.trim();
          resolve();
        });
      });
    }
    
    rl.close();
    return inputs;
  }

  /**
   * 使用AI自动填写用户提供的信息
   */
  private async autoFillWithUserInputs(page: any, userInputs: Record<string, string>, analysis: any): Promise<{
    success: boolean;
    error?: string;
  }> {
    try {
      // 根据分析结果和用户输入自动填写表单
      for (const [inputType, value] of Object.entries(userInputs)) {
        let filled = false;
        
        // 尝试多种选择器策略
        const strategies = [];
        
        if (inputType.includes('用户') || inputType.includes('邮箱')) {
          strategies.push(
            'input[name*="user"]',
            'input[name*="email"]',
            'input[placeholder*="用户名"]',
            'input[placeholder*="邮箱"]',
            'input[type="email"]'
          );
        }
        
        if (inputType.includes('密码')) {
          strategies.push(
            'input[type="password"]',
            'input[name*="password"]',
            'input[placeholder*="密码"]'
          );
        }
        
        if (inputType.includes('验证码')) {
          strategies.push(
            'input[name*="code"]',
            'input[placeholder*="验证码"]',
            'input[placeholder*="code"]'
          );
        }
        
        if (inputType.includes('手机')) {
          strategies.push(
            'input[name*="phone"]',
            'input[name*="mobile"]',
            'input[placeholder*="手机"]'
          );
        }
        
        for (const selector of strategies) {
          try {
            const element = await page.locator(selector).first();
            if (await element.isVisible({ timeout: 2000 })) {
              await element.fill(value);
              console.log(`✅ 成功填写${inputType}`);
              filled = true;
              break;
            }
          } catch (e) {
            // 继续尝试下一个选择器
          }
        }
        
        if (!filled) {
          console.warn(`⚠️ 未能找到${inputType}的输入框`);
        }
      }
      
      return { success: true };
      
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * 自动提交表单
   */
  private async autoSubmitForm(page: any): Promise<{ success: boolean }> {
    try {
      // 尝试多种提交按钮选择器
      const submitSelectors = [
        'button[type="submit"]',
        'input[type="submit"]',
        'button:has-text("登录")',
        'button:has-text("Login")',
        'button:has-text("Sign in")',
        'button:has-text("提交")',
        'button:has-text("Submit")',
        '[data-testid*="login"]',
        '[data-testid*="submit"]'
      ];
      
      for (const selector of submitSelectors) {
        try {
          const button = await page.locator(selector).first();
          if (await button.isVisible({ timeout: 2000 }) && await button.isEnabled()) {
            await button.click();
            console.log('✅ 成功点击提交按钮');
            
            // 等待页面跳转或响应
            await page.waitForTimeout(3000);
            return { success: true };
          }
        } catch (e) {
          // 继续尝试下一个选择器
        }
      }
      
      // 如果没有找到按钮，尝试按回车键
      console.log('🔄 未找到提交按钮，尝试按回车键...');
      await page.keyboard.press('Enter');
      await page.waitForTimeout(3000);
      
      return { success: true };
      
    } catch (error) {
      console.error('❌ 提交表单失败:', error);
      return { success: false };
    }
  }

  /**
   * 自动处理不需要用户输入的页面
   */
  private async autoHandlePage(page: any): Promise<{ action: string }> {
    try {
      // 尝试自动点击常见的继续按钮
      const continueSelectors = [
        'button:has-text("继续")',
        'button:has-text("Continue")',
        'button:has-text("下一步")',
        'button:has-text("Next")',
        'button:has-text("确定")',
        'button:has-text("OK")',
        '[data-testid*="continue"]'
      ];
      
      for (const selector of continueSelectors) {
        try {
          const button = await page.locator(selector).first();
          if (await button.isVisible({ timeout: 2000 }) && await button.isEnabled()) {
            await button.click();
            console.log('✅ 自动点击继续按钮');
            await page.waitForTimeout(3000);
            return { action: 'success' };
          }
        } catch (e) {
          // 继续尝试
        }
      }
      
      return { action: 'retry' };
      
    } catch (error) {
      console.error('❌ 自动处理页面失败:', error);
      return { action: 'abort' };
    }
  }

  /**
   * 生成简化的页面操作指导
   */
  private getSimplePageGuidance(pageInfo: { url: string; title: string }, context?: any): string {
    const url = pageInfo.url?.toLowerCase() || '';
    const title = pageInfo.title?.toLowerCase() || '';
    
    // 根据页面特征提供针对性指导
    if (url.includes('login') || url.includes('signin')) {
      return `
🔐 这是 Twitter 登录页面
📝 请在浏览器中：
   1. 输入用户名: ${process.env.TWITTER_USERNAME || '[从环境变量获取]'}
   2. 输入密码
   3. 完成任何验证步骤（验证码、短信等）
   4. 点击登录

💡 登录成功后，回到终端按 Enter 继续`;
    } else if (url.includes('challenge') || title.includes('verify') || title.includes('suspicious')) {
      return `
🛡️ 这是 Twitter 安全验证页面
📝 请在浏览器中：
   1. 完成人机验证（CAPTCHA）
   2. 输入手机验证码（如需要）
   3. 完成任何身份验证步骤
   
💡 验证完成后，回到终端按 Enter 继续`;
    } else if (url.includes('x.com') || url.includes('twitter.com')) {
      return `
🐦 这是 Twitter 主页面
📝 如果看到正常的 Twitter 界面，说明登录成功
📝 如果仍然看到登录相关内容，请完成登录

💡 确认页面状态正常后，回到终端按 Enter 继续`;
    } else {
      return `
❓ 当前页面: ${pageInfo.title}
📝 请检查页面状态并完成必要的操作
📝 如果遇到验证码或安全检查，请按提示完成

💡 操作完成后，回到终端按 Enter 继续`;
    }
  }

  /**
   * 简化的用户确认机制
   */
  private async getSimpleUserConfirmation(): Promise<string> {
    const { createInterface } = await import('readline');
    
    const rl = createInterface({
      input: process.stdin,
      output: process.stdout
    });

    return new Promise((resolve) => {
      console.log('\n🎯 请选择下一步操作:');
      console.log('   [Enter] - 我已完成操作，继续执行');
      console.log('   [s] - 我已完成，标记为成功');
      console.log('   [q] - 退出程序');
      
      rl.question('\n请输入您的选择: ', (answer) => {
        rl.close();
        
        const choice = answer.trim().toLowerCase();
        if (choice === 's' || choice === 'success') {
          resolve('success');
        } else if (choice === 'q' || choice === 'quit' || choice === 'abort') {
          resolve('abort');
        } else {
          resolve('continue');
        }
      });
    });
  }

  /**
   * 打开可视化浏览器进行人工干预 - 使用共享userDataDir
   */
  private async openVisualBrowserForIntervention(): Promise<boolean> {
    const { chromium } = await import('playwright');
    const fs = await import('fs');
    const path = await import('path');
    
    console.log('🚀 启动可视化浏览器，请手动完成Twitter登录...');
    
    // 确保会话目录存在
    if (!fs.existsSync(this.twitterSessionDir)) {
      fs.mkdirSync(this.twitterSessionDir, { recursive: true });
      console.log(`📁 创建Twitter会话目录: ${this.twitterSessionDir}`);
    }
    
    // 创建使用共享userDataDir的可视化浏览器上下文
    const context = await chromium.launchPersistentContext(this.twitterSessionDir, {
      headless: false,           // 关键：可视化模式
      viewport: null,           // 使用默认视口
      slowMo: 100,              // 略微减慢操作速度
      args: [
        '--start-maximized',
        '--disable-web-security',
        '--disable-features=VizDisplayCompositor'
      ]
    });
    
    const page = await context.newPage();
    
    // 导航到Twitter登录页
    console.log('📍 导航到Twitter登录页面...');
    try {
      await page.goto('https://x.com/i/flow/login', { 
        waitUntil: 'domcontentloaded',
        timeout: 30000 
      });
    } catch (error) {
      console.log('⚠️ 登录页面访问失败，尝试主页...');
      await page.goto('https://x.com', { 
        waitUntil: 'domcontentloaded',
        timeout: 30000 
      });
    }
    
    console.log('\n' + '='.repeat(60));
    console.log('🖥️  可视化浏览器已打开！');
    console.log('📍 当前URL:', page.url());
    console.log('='.repeat(60));
    console.log('👤 请在浏览器中手动完成以下操作：');
    console.log('1. 如果未登录，请点击登录按钮');
    console.log('2. 输入用户名/邮箱：qddegtya@gmail.com');
    console.log('3. 输入密码');
    console.log('4. 处理验证码或安全验证（异地登录等）');
    console.log('5. 完成登录直到看到Twitter主页');
    console.log('='.repeat(60));
    
    // 等待用户完成操作
    const { createInterface } = await import('readline');
    const rl = createInterface({
      input: process.stdin,
      output: process.stdout
    });
    
    return new Promise((resolve) => {
      const checkCompletion = () => {
        rl.question('\n✅ 登录完成了吗？请确认已经看到Twitter主页 (y/n): ', async (answer) => {
          if (answer.toLowerCase() === 'y') {
            console.log('✅ 登录成功确认！正在验证登录状态...');
            
            // 验证登录状态
            try {
              const currentUrl = page.url();
              console.log('📍 当前页面URL:', currentUrl);
              
              // 检查多种登录状态指示器
              const isLoggedIn = currentUrl.includes('home') || 
                               currentUrl === 'https://x.com/' ||
                               await page.locator('[data-testid="SideNav_AccountSwitcher_Button"]')
                                 .isVisible({ timeout: 5000 }).catch(() => false) ||
                               await page.locator('a[href="/compose/tweet"]')
                                 .isVisible({ timeout: 5000 }).catch(() => false);
              
              if (isLoggedIn) {
                console.log('🎉 登录状态验证成功！');
                console.log('💾 会话数据已自动保存到共享目录：', this.twitterSessionDir);
                
                // 标记会话有效
                this.hasValidSession = true;
                this.loginState.isLoggedIn = true;
                this.loginState.lastLoginTime = Date.now();
                this.loginState.loginAttempts = 0;
                
                rl.close();
                
                // 保存认证状态到文件，而不是依赖userDataDir
                const storageStatePath = `${this.twitterSessionDir}/auth.json`;
                try {
                  await page.context().storageState({ path: storageStatePath });
                  console.log('✅ 认证状态已保存到:', storageStatePath);
                } catch (error) {
                  console.warn('⚠️ 保存认证状态失败:', error);
                }
                
                // 关闭可视化浏览器上下文
                await context.close();
                console.log('🔒 可视化浏览器已关闭');
                console.log(`💾 会话数据已保存到: ${storageStatePath}`);
                console.log('🔄 后续的headless浏览器将使用相同的认证状态');
                resolve(true);
              } else {
                console.warn('⚠️ 登录状态验证失败，请确保已经登录到主页');
                rl.close();
                await context.close();
                resolve(false);
              }
              
            } catch (error) {
              console.warn('⚠️ 无法验证登录状态:', error);
              rl.close();
              await context.close();
              resolve(false);
            }
            
          } else if (answer.toLowerCase() === 'n') {
            checkCompletion(); // 继续等待
          } else {
            console.log('❌ 请输入 y 或 n');
            checkCompletion();
          }
        });
      };
      
      checkCompletion();
    });
  }

  /**
   * 检查登录是否成功
   */
  private async checkLoginSuccess(page: any): Promise<boolean> {
    try {
      const currentUrl = page.url();
      
      // 检查URL
      if (currentUrl.includes('home') || currentUrl === 'https://x.com/') {
        return true;
      }

      // 检查页面元素
      const isLoggedIn = await page.locator('[data-testid="SideNav_AccountSwitcher_Button"]')
        .isVisible({ timeout: 3000 })
        .catch(() => false);

      return isLoggedIn;
    } catch (error) {
      return false;
    }
  }


  /**
   * 检查是否存在有效的会话目录
   */
  private async checkExistingSession(): Promise<void> {
    try {
      const fs = await import('fs');
      const storageStatePath = `${this.twitterSessionDir}/auth.json`;
      
      if (fs.existsSync(storageStatePath)) {
        console.log('🔍 发现现有Twitter认证状态文件:', storageStatePath);
        // 检查文件是否有效且非空
        const stat = fs.statSync(storageStatePath);
        if (stat.size > 0) {
          this.hasValidSession = true;
          console.log('✅ 认证状态文件有效');
        } else {
          console.warn('⚠️ 认证状态文件为空');
          this.hasValidSession = false;
        }
      } else {
        console.log('ℹ️ 未找到现有认证状态文件');
        this.hasValidSession = false;
      }
    } catch (error) {
      console.warn('⚠️ 检查现有会话失败:', error);
      this.hasValidSession = false;
    }
  }

  /**
   * 检查共享会话的登录状态
   */
  private async checkSharedSessionStatus(page: any): Promise<void> {
    try {
      // 导航到Twitter主页检查登录状态
      await page.goto('https://x.com', { 
        waitUntil: 'domcontentloaded',
        timeout: 15000 
      });
      
      // 检查登录状态
      const isLoggedIn = await page.locator('[data-testid="SideNav_AccountSwitcher_Button"]')
        .isVisible({ timeout: 5000 }).catch(() => false) ||
        await page.locator('a[href="/compose/tweet"]')
        .isVisible({ timeout: 5000 }).catch(() => false);
      
      if (isLoggedIn) {
        console.log('✅ 共享会话仍然有效，已登录状态');
        this.loginState.isLoggedIn = true;
        this.loginState.lastLoginTime = Date.now();
      } else {
        console.log('⚠️ 共享会话已过期，需要重新登录');
        this.hasValidSession = false;
        // 清理过期的会话目录
        await this.clearSessionDirectory();
      }
      
    } catch (error) {
      console.warn('⚠️ 检查共享会话状态失败:', error);
      this.hasValidSession = false;
    }
  }

  /**
   * 清理会话目录
   */
  private async clearSessionDirectory(): Promise<void> {
    try {
      const fs = await import('fs');
      const storageStatePath = `${this.twitterSessionDir}/auth.json`;
      
      if (fs.existsSync(storageStatePath)) {
        fs.unlinkSync(storageStatePath);
        console.log('🧹 已清理过期的认证状态文件');
      }
      
      // 如果整个目录为空，也删除目录
      if (fs.existsSync(this.twitterSessionDir)) {
        const files = fs.readdirSync(this.twitterSessionDir);
        if (files.length === 0) {
          fs.rmdirSync(this.twitterSessionDir);
          console.log('🧹 已清理空的会话目录');
        }
      }
    } catch (error) {
      console.warn('⚠️ 清理会话数据失败:', error);
    }
  }

  /**
   * 创建使用共享会话的页面
   */
  private async createSharedSessionPage(timeout: number): Promise<PageLease> {
    const { chromium } = await import('playwright');
    const fs = await import('fs');
    
    console.log('🔗 创建带认证状态的headless浏览器...');
    
    // 检查认证状态文件是否存在
    const storageStatePath = `${this.twitterSessionDir}/auth.json`;
    let storageState = undefined;
    
    if (fs.existsSync(storageStatePath)) {
      try {
        console.log('📖 加载保存的认证状态:', storageStatePath);
        storageState = JSON.parse(fs.readFileSync(storageStatePath, 'utf8'));
      } catch (error) {
        console.warn('⚠️ 读取认证状态失败:', error);
        storageState = undefined;
      }
    }
    
    // 启动可视化浏览器 - 便于用户干预
    const browser = await chromium.launch({
      headless: false,           // 改为可视化模式
      args: [
        '--start-maximized',     // 最大化窗口
        '--disable-web-security',
        '--disable-features=VizDisplayCompositor',
        '--no-sandbox'
      ]
    });
    
    // 创建带认证状态的浏览器上下文
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
      storageState: storageState  // 关键：注入认证状态
    });
    
    const page = await context.newPage();
    page.setDefaultTimeout(timeout);
    page.setDefaultNavigationTimeout(timeout);
    
    // 创建一个lease对象来模拟BrowserPool的返回格式
    const lease: PageLease = {
      id: `shared_session_${Date.now()}`,
      page,
      browserInstance: {
        id: `shared_browser_${Date.now()}`,
        browser: browser, // 现在有真正的browser对象了
        context,
        status: 'busy' as const,
        createdAt: new Date(),
        usageCount: 1,
        lastUsed: new Date()
      },
      leasedAt: new Date(),
      timeout,
      // 自定义的返回方法
      return: async () => {
        console.log('🔒 关闭共享会话浏览器');
        await context.close();
      }
    };
    
    console.log('✅ 共享会话页面创建成功');
    return lease;
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
   * 确保在搜索结果页面切换到"最新"标签
   */
  private async ensureLatestTab(page: any): Promise<void> {
    try {
      console.log('🔍 检查搜索结果标签页...');
      
      // 等待搜索结果页面加载
      await page.waitForTimeout(2000);
      
      // 尝试多种可能的"最新"标签选择器
      const latestSelectors = [
        'a[href*="&f=live"]',           // 最新标签的直接链接
        'a[data-testid="SearchTabs_Latest"]', // 可能的测试ID
        'nav[role="tablist"] a:nth-child(2)', // 通常最新是第二个标签
        'a:has-text("Latest")',         // 包含"Latest"文本的链接
        'a:has-text("最新")',           // 中文界面
      ];
      
      let clicked = false;
      for (const selector of latestSelectors) {
        try {
          const element = await page.locator(selector).first();
          if (await element.isVisible({ timeout: 3000 })) {
            console.log(`📱 找到"最新"标签，选择器: ${selector}`);
            await element.click();
            await page.waitForTimeout(2000);
            clicked = true;
            break;
          }
        } catch (e) {
          // 继续尝试下一个选择器
        }
      }
      
      if (!clicked) {
        // 如果找不到标签，尝试直接修改URL
        const currentUrl = page.url();
        if (currentUrl.includes('search') && !currentUrl.includes('f=live')) {
          const newUrl = currentUrl.includes('?') ? 
            currentUrl + '&f=live' : currentUrl + '?f=live';
          console.log('🔗 直接导航到最新搜索结果:', newUrl);
          await page.goto(newUrl, { waitUntil: 'domcontentloaded' });
          await page.waitForTimeout(2000);
        }
      }
      
      console.log('✅ 已切换到最新推文标签');
      
    } catch (error) {
      console.warn('⚠️ 切换到最新标签失败，继续使用当前页面:', error);
    }
  }

  /**
   * 滚动加载更多推文
   */
  private async scrollToLoadMoreTweets(page: any): Promise<void> {
    try {
      console.log('🔄 开始寻找推文元素...');
      
      // 等待初始内容加载
      await page.waitForSelector('article[data-testid="tweet"]', { timeout: 10000 });
      console.log('✅ 找到推文元素');

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
            
            // 提取文本内容 - 确保完整性
            const textElement = tweet.querySelector('[data-testid="tweetText"]');
            let content = textElement?.textContent?.trim() || '';
            
            if (!content || content.length < 10) continue;
            
            // 提取并保留推文中的结构化信息
            const mentions = Array.from(tweet.querySelectorAll('[data-testid="tweetText"] a[href*="/"]'))
              .map(el => el.textContent?.trim())
              .filter(text => text && text.startsWith('@'))
              .slice(0, 3);
              
            const hashtags = Array.from(tweet.querySelectorAll('[data-testid="tweetText"] a[href*="/hashtag/"]'))
              .map(el => el.textContent?.trim())
              .filter(text => text && text.startsWith('#'))
              .slice(0, 5);
            
            // 如果内容被截断，尝试获取更完整的文本
            if (content.length > 0) {
              // 检查是否有展开按钮或更多内容
              const expandedText = tweet.querySelector('[data-testid="tweetText"] span')?.textContent?.trim();
              if (expandedText && expandedText.length > content.length) {
                content = expandedText;
              }
            }
            
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
            
            // 提取链接 - 保留更多链接信息
            const linkElements = tweet.querySelectorAll('a[href*="//"]');
            const allUrls = Array.from(linkElements)
              .map(link => (link as HTMLAnchorElement).href)
              .filter(url => url && url.startsWith('http'));
              
            // 分类链接：外部链接优先，但保留所有有效链接
            const externalUrls = allUrls.filter(url => !url.includes('twitter.com') && !url.includes('x.com'));
            const twitterUrls = allUrls.filter(url => url.includes('twitter.com') || url.includes('x.com'));
            
            // 保留所有有效链接，外部链接排在前面
            const urls = [...externalUrls, ...twitterUrls].slice(0, 5);
            
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
              mentions,
              hashtags,
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

      // 转换为 SearchContent 格式 - 增强内容完整性
      const searchContents: SearchContent[] = results.map(tweet => {
        // 构建完整的推文内容，包含链接信息
        let enhancedContent = tweet.content;
        
        // 如果有外部链接，在内容末尾添加链接信息
        if (tweet.urls && tweet.urls.length > 0) {
          const linkSection = tweet.urls.map(url => `🔗 ${url}`).join('\n');
          enhancedContent += `\n\n${linkSection}`;
        }
        
        // 如果有提及的用户，添加到内容中
        if (tweet.mentions && tweet.mentions.length > 0) {
          enhancedContent += `\n\n👤 提及: ${tweet.mentions.join(' ')}`;
        }
        
        return {
          id: this.generateContentId(tweet),
          title: this.generateTweetTitle(tweet.content),
          content: enhancedContent,
          url: tweet.urls.find(url => !url.includes('twitter.com') && !url.includes('x.com')) || 
               tweet.urls[0] || 
               `https://x.com/${tweet.userHandle}`,
          source: 'twitter',
          timestamp: new Date(tweet.timestamp),
          author: tweet.userDisplayName || tweet.userHandle,
          metadata: {
            author: tweet.userDisplayName || tweet.userHandle,
            platform: 'twitter',
            tags: [...(tweet.hashtags || []), ...this.extractHashtagsFromText(tweet.content)],
            engagement: {
              likes: tweet.likes,
              shares: tweet.retweets,
              comments: tweet.replies
            },
            userHandle: tweet.userHandle,
            mentions: tweet.mentions || [],
            isRetweet: tweet.isRetweet,
            hasMedia: tweet.hasImage || tweet.hasVideo,
            mediaTypes: {
              hasImage: tweet.hasImage,
              hasVideo: tweet.hasVideo
            },
            allUrls: tweet.urls || [],
            externalUrls: tweet.urls?.filter(url => !url.includes('twitter.com') && !url.includes('x.com')) || [],
            tweetUrl: `https://x.com/${tweet.userHandle}`
          }
        };
      });

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