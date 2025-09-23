import { Agent, type AgentConfig, type Tool } from '@astack-tech/components';
import { Component } from '@astack-tech/core';
import { ModelProvider } from '@astack-tech/integrations';
import { 
  SearchContent, 
  NewsletterGeneratorInput, 
  NewsletterGeneratorOutput,
  NewsletterSection,
  NewsletterTemplate
} from '../types/multi-agent.js';

/**
 * 内容分析和分类工具
 */
class ContentAnalysisTool implements Tool {
  name = 'analyze_and_categorize_content';
  description = '分析内容并按主题和重要性进行分类';
  parameters = {
    type: 'object',
    properties: {
      contents: { 
        type: 'array', 
        items: { type: 'object' },
        description: '需要分析的内容列表' 
      },
      focusKeywords: { 
        type: 'array', 
        items: { type: 'string' },
        description: '关注的关键词列表' 
      }
    },
    required: ['contents', 'focusKeywords']
  };

  async invoke(args: { contents: SearchContent[], focusKeywords: string[] }) {
    const { contents, focusKeywords } = args;
    
    console.log(`📊 开始内容分析: ${contents.length} 个内容`);

    // 按来源分类
    const bySource = this.categorizeBySource(contents);
    
    // 按主题分类
    const byTopic = this.categorizeByTopic(contents, focusKeywords);
    
    // 按重要性分类
    const byImportance = this.categorizeByImportance(contents);
    
    // 按时间分类
    const byTime = this.categorizeByTime(contents);

    // 识别趋势和亮点
    const trends = this.identifyTrends(contents, focusKeywords);
    const highlights = this.identifyHighlights(contents);

    return {
      categorization: {
        bySource,
        byTopic,
        byImportance,
        byTime
      },
      trends,
      highlights,
      summary: {
        totalContents: contents.length,
        uniqueSources: Object.keys(bySource).length,
        uniqueTopics: Object.keys(byTopic).length,
        timeSpan: this.calculateTimeSpan(contents)
      }
    };
  }

  private categorizeBySource(contents: SearchContent[]) {
    const categories: Record<string, SearchContent[]> = {
      github: [],
      twitter: [],
      google: [],
      other: []
    };

    for (const content of contents) {
      const source = (content.source || 'other').toLowerCase();
      if (categories[source]) {
        categories[source].push(content);
      } else {
        categories.other.push(content);
      }
    }

    return categories;
  }

  private categorizeByTopic(contents: SearchContent[], focusKeywords: string[]) {
    const categories: Record<string, SearchContent[]> = {};

    // 初始化主题分类
    for (const keyword of focusKeywords) {
      categories[keyword] = [];
    }
    categories['其他'] = [];

    for (const content of contents) {
      const title = (content.title || '').toLowerCase();
      const contentText = (content.content || '').toLowerCase();
      
      let categorized = false;
      
      for (const keyword of focusKeywords) {
        const keywordLower = (keyword || '').toLowerCase();
        if (title.includes(keywordLower) || contentText.includes(keywordLower)) {
          categories[keyword].push(content);
          categorized = true;
          break;
        }
      }
      
      if (!categorized) {
        categories['其他'].push(content);
      }
    }

    // 移除空分类
    Object.keys(categories).forEach(key => {
      if (categories[key].length === 0) {
        delete categories[key];
      }
    });

    return categories;
  }

  private categorizeByImportance(contents: SearchContent[]) {
    return {
      critical: contents.filter(c => (c as any).qualityScore >= 0.9),
      important: contents.filter(c => (c as any).qualityScore >= 0.75 && (c as any).qualityScore < 0.9),
      moderate: contents.filter(c => (c as any).qualityScore >= 0.6 && (c as any).qualityScore < 0.75),
      low: contents.filter(c => (c as any).qualityScore < 0.6)
    };
  }

  private categorizeByTime(contents: SearchContent[]) {
    const now = new Date();
    const sixHoursAgo = new Date(now.getTime() - 6 * 60 * 60 * 1000);
    const twelveHoursAgo = new Date(now.getTime() - 12 * 60 * 60 * 1000);
    const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    return {
      lastSixHours: contents.filter(c => {
        const timestamp = c.timestamp instanceof Date ? c.timestamp : new Date(c.timestamp || Date.now());
        return timestamp >= sixHoursAgo;
      }),
      lastTwelveHours: contents.filter(c => {
        const timestamp = c.timestamp instanceof Date ? c.timestamp : new Date(c.timestamp || Date.now());
        return timestamp >= twelveHoursAgo && timestamp < sixHoursAgo;
      }),
      lastTwentyFourHours: contents.filter(c => {
        const timestamp = c.timestamp instanceof Date ? c.timestamp : new Date(c.timestamp || Date.now());
        return timestamp >= twentyFourHoursAgo && timestamp < twelveHoursAgo;
      }),
      older: contents.filter(c => {
        const timestamp = c.timestamp instanceof Date ? c.timestamp : new Date(c.timestamp || Date.now());
        return timestamp < twentyFourHoursAgo;
      })
    };
  }

  private identifyTrends(contents: SearchContent[], focusKeywords: string[]) {
    const trends = [];

    // 分析关键词频率
    const keywordFreq: Record<string, number> = {};
    for (const content of contents) {
      const text = ((content.title || '') + ' ' + (content.content || '')).toLowerCase();
      for (const keyword of focusKeywords) {
        const matches = (text.match(new RegExp((keyword || '').toLowerCase(), 'g')) || []).length;
        keywordFreq[keyword] = (keywordFreq[keyword] || 0) + matches;
      }
    }

    // 识别热门趋势
    const sortedKeywords = Object.entries(keywordFreq)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 5);

    for (const [keyword, freq] of sortedKeywords) {
      if (freq > 3) {
        trends.push({
          topic: keyword,
          frequency: freq,
          relatedContents: contents.filter(c => 
            (c.title || '').toLowerCase().includes((keyword || '').toLowerCase()) ||
            (c.content || '').toLowerCase().includes((keyword || '').toLowerCase())
          ).slice(0, 3)
        });
      }
    }

    return trends;
  }

  private identifyHighlights(contents: SearchContent[]) {
    return contents
      .sort((a, b) => ((b as any).qualityScore || 0) - ((a as any).qualityScore || 0))
      .slice(0, 5)
      .map(content => ({
        content,
        reason: this.getHighlightReason(content)
      }));
  }

  private getHighlightReason(content: SearchContent): string {
    const reasons = [];
    
    if ((content as any).qualityScore >= 0.9) {
      reasons.push('极高质量');
    }
    
    if (content.source === 'github' && content.metadata?.stars > 1000) {
      reasons.push('高星标项目');
    }
    
    if (content.source === 'twitter' && (content.metadata?.likes || 0) > 100) {
      reasons.push('高互动内容');
    }
    
    const timestamp = content.timestamp instanceof Date ? content.timestamp : new Date(content.timestamp || Date.now());
    const hoursSinceUpdate = (Date.now() - timestamp.getTime()) / (1000 * 60 * 60);
    if (hoursSinceUpdate < 6) {
      reasons.push('最新内容');
    }

    return reasons.join('，') || '优质内容';
  }

  private calculateTimeSpan(contents: SearchContent[]) {
    if (contents.length === 0) return '无';
    
    const timestamps = contents.map(c => {
      const timestamp = c.timestamp instanceof Date ? c.timestamp : new Date(c.timestamp || Date.now());
      return timestamp.getTime();
    });
    const earliest = new Date(Math.min(...timestamps));
    const latest = new Date(Math.max(...timestamps));
    
    const hoursDiff = (latest.getTime() - earliest.getTime()) / (1000 * 60 * 60);
    
    if (hoursDiff < 24) {
      return `${Math.round(hoursDiff)} 小时`;
    } else {
      return `${Math.round(hoursDiff / 24)} 天`;
    }
  }
}

/**
 * 新闻简报生成工具
 */
class NewsletterGenerationTool implements Tool {
  name = 'generate_newsletter_content';
  description = '基于分析结果生成结构化的新闻简报内容';
  parameters = {
    type: 'object',
    properties: {
      analysisResults: { 
        type: 'object', 
        description: '内容分析结果' 
      },
      template: { 
        type: 'object', 
        description: '新闻简报模板配置' 
      },
      focusKeywords: { 
        type: 'array', 
        items: { type: 'string' },
        description: '关注的关键词' 
      }
    },
    required: ['analysisResults', 'template', 'focusKeywords']
  };

  async invoke(args: { 
    analysisResults: any, 
    template: NewsletterTemplate,
    focusKeywords: string[] 
  }) {
    const { analysisResults, template, focusKeywords } = args;
    
    console.log(`📝 开始生成新闻简报内容`);

    const sections: NewsletterSection[] = [];

    // 生成标题摘要
    if (template.sections.includes('summary')) {
      sections.push(await this.generateSummarySection(analysisResults, focusKeywords));
    }

    // 生成亮点内容
    if (template.sections.includes('highlights')) {
      sections.push(await this.generateHighlightsSection(analysisResults));
    }

    // 生成趋势分析
    if (template.sections.includes('trends')) {
      sections.push(await this.generateTrendsSection(analysisResults));
    }

    // 生成技术动态
    if (template.sections.includes('technical')) {
      sections.push(await this.generateTechnicalSection(analysisResults));
    }

    // 生成社区动态
    if (template.sections.includes('community')) {
      sections.push(await this.generateCommunitySection(analysisResults));
    }

    // 生成项目推荐
    if (template.sections.includes('projects')) {
      sections.push(await this.generateProjectsSection(analysisResults));
    }

    // 生成结论和展望
    if (template.sections.includes('conclusion')) {
      sections.push(await this.generateConclusionSection(analysisResults, focusKeywords));
    }

    return {
      sections: sections.filter(section => section.content.trim().length > 0),
      metadata: {
        generatedAt: new Date(),
        contentSources: this.getSourcesSummary(analysisResults),
        keywordFocus: focusKeywords,
        totalSections: sections.length
      }
    };
  }

  private async generateSummarySection(analysisResults: any, focusKeywords: string[]): Promise<NewsletterSection> {
    const { summary, trends, highlights } = analysisResults;
    
    const content = `## 📊 今日概览

在过去 24 小时内，我们从 ${summary.uniqueSources} 个不同来源收集了 ${summary.totalContents} 条相关信息，涵盖 ${focusKeywords.join('、')} 等关键领域。

**核心数据：**
- 🔍 信息总量：${summary.totalContents} 条
- 📈 识别趋势：${trends.length} 个
- ⭐ 重点内容：${highlights.length} 条
- ⏰ 时间跨度：${summary.timeSpan}

**主要关注点：**
${focusKeywords.map(keyword => `- ${keyword}`).join('\n')}`;

    return {
      title: '今日概览',
      type: 'summary',
      content,
      priority: 1
    };
  }

  private async generateHighlightsSection(analysisResults: any): Promise<NewsletterSection> {
    const { highlights } = analysisResults;
    
    if (highlights.length === 0) {
      return {
        title: '今日亮点',
        type: 'highlights',
        content: '',
        priority: 2
      };
    }

    let content = `## ⭐ 今日亮点\n\n`;
    
    for (let i = 0; i < Math.min(highlights.length, 5); i++) {
      const highlight = highlights[i];
      const item = highlight.content;
      
      content += `### ${i + 1}. ${item.title}\n\n`;
      content += `**来源：** ${this.formatSource(item.source, item.url)}\n`;
      content += `**亮点：** ${highlight.reason}\n`;
      content += `**时间：** ${this.formatTime(item.timestamp)}\n\n`;
      
      // 添加简短描述
      const shortDesc = item.content.substring(0, 200);
      content += `${shortDesc}${item.content.length > 200 ? '...' : ''}\n\n`;
      
      // 添加元数据（如果有）
      if (item.metadata) {
        const meta = this.formatMetadata(item);
        if (meta) content += `${meta}\n\n`;
      }
      
      content += `---\n\n`;
    }

    return {
      title: '今日亮点',
      type: 'highlights',
      content,
      priority: 2
    };
  }

  private async generateTrendsSection(analysisResults: any): Promise<NewsletterSection> {
    const { trends } = analysisResults;
    
    if (trends.length === 0) {
      return {
        title: '趋势分析',
        type: 'trends',
        content: '',
        priority: 3
      };
    }

    let content = `## 📈 趋势分析\n\n`;
    
    for (const trend of trends) {
      content += `### 🔥 ${trend.topic}\n\n`;
      content += `**热度：** ${trend.frequency} 次提及\n`;
      content += `**相关内容：**\n\n`;
      
      for (const relatedContent of trend.relatedContents) {
        content += `- [${relatedContent.title}](${relatedContent.url}) - ${this.formatSource(relatedContent.source)}\n`;
      }
      
      content += `\n`;
    }

    return {
      title: '趋势分析',
      type: 'trends',
      content,
      priority: 3
    };
  }

  private async generateTechnicalSection(analysisResults: any): Promise<NewsletterSection> {
    const { categorization } = analysisResults;
    const githubContents = categorization.bySource.github || [];
    
    if (githubContents.length === 0) {
      return {
        title: '技术动态',
        type: 'technical',
        content: '',
        priority: 4
      };
    }

    let content = `## 💻 技术动态\n\n`;
    
    // 按星标数排序，展示前 5 个项目
    const topProjects = githubContents
      .filter(item => item.metadata?.type === 'repository')
      .sort((a, b) => (b.metadata?.stars || 0) - (a.metadata?.stars || 0))
      .slice(0, 5);

    for (const project of topProjects) {
      content += `### ${project.title}\n\n`;
      content += `**⭐ Stars：** ${project.metadata?.stars || 0}\n`;
      content += `**🍴 Forks：** ${project.metadata?.forks || 0}\n`;
      content += `**💻 语言：** ${project.metadata?.language || '未知'}\n`;
      content += `**🔗 链接：** [${project.url}](${project.url})\n\n`;
      
      // 项目描述
      const description = project.content.split('\n')[0];
      content += `${description}\n\n`;
      
      content += `---\n\n`;
    }

    return {
      title: '技术动态',
      type: 'technical',
      content,
      priority: 4
    };
  }

  private async generateCommunitySection(analysisResults: any): Promise<NewsletterSection> {
    const { categorization } = analysisResults;
    const twitterContents = categorization.bySource.twitter || [];
    
    if (twitterContents.length === 0) {
      return {
        title: '社区动态',
        type: 'community',
        content: '',
        priority: 5
      };
    }

    let content = `## 🐦 社区动态\n\n`;
    
    // 按互动数排序
    const topTweets = twitterContents
      .sort((a, b) => {
        const aEngagement = (a.metadata?.likes || 0) + (a.metadata?.retweets || 0);
        const bEngagement = (b.metadata?.likes || 0) + (b.metadata?.retweets || 0);
        return bEngagement - aEngagement;
      })
      .slice(0, 5);

    for (const tweet of topTweets) {
      content += `### ${tweet.author ? `@${tweet.author}` : '社区用户'}\n\n`;
      content += `**❤️ 点赞：** ${tweet.metadata?.likes || 0}\n`;
      content += `**🔄 转发：** ${tweet.metadata?.retweets || 0}\n`;
      content += `**💬 回复：** ${tweet.metadata?.replies || 0}\n`;
      content += `**🔗 链接：** [查看推文](${tweet.url})\n\n`;
      
      // 推文内容
      const tweetText = tweet.content.substring(0, 280);
      content += `> ${tweetText}${tweet.content.length > 280 ? '...' : ''}\n\n`;
      
      content += `---\n\n`;
    }

    return {
      title: '社区动态',
      type: 'community',
      content,
      priority: 5
    };
  }

  private async generateProjectsSection(analysisResults: any): Promise<NewsletterSection> {
    const { categorization, highlights } = analysisResults;
    
    // 收集所有推荐项目
    const projects = [];
    
    // 从 GitHub 内容中选择
    const githubRepos = (categorization.bySource.github || [])
      .filter((item: any) => item.metadata?.type === 'repository')
      .slice(0, 3);
    projects.push(...githubRepos);
    
    // 从亮点中选择
    const highlightProjects = highlights
      .filter((h: any) => h.content.source === 'github')
      .map((h: any) => h.content)
      .slice(0, 2);
    projects.push(...highlightProjects);
    
    if (projects.length === 0) {
      return {
        title: '项目推荐',
        type: 'projects',
        content: '',
        priority: 6
      };
    }

    let content = `## 🚀 项目推荐\n\n`;
    
    // 去重并按质量排序
    const uniqueProjects = projects
      .filter((project, index, self) => 
        index === self.findIndex(p => p.url === project.url)
      )
      .sort((a, b) => ((b as any).qualityScore || 0) - ((a as any).qualityScore || 0))
      .slice(0, 5);

    for (const project of uniqueProjects) {
      content += `### 🔧 ${project.title}\n\n`;
      
      if (project.metadata) {
        content += `**⭐ Stars：** ${project.metadata.stars || 0} | `;
        content += `**🍴 Forks：** ${project.metadata.forks || 0} | `;
        content += `**💻 语言：** ${project.metadata.language || '未知'}\n\n`;
      }
      
      // 项目描述（取第一段）
      const description = project.content.split('\n\n')[0];
      content += `${description}\n\n`;
      
      content += `**🔗 访问项目：** [${project.url}](${project.url})\n\n`;
      content += `---\n\n`;
    }

    return {
      title: '项目推荐',
      type: 'projects',
      content,
      priority: 6
    };
  }

  private async generateConclusionSection(analysisResults: any, focusKeywords: string[]): Promise<NewsletterSection> {
    const { summary, trends } = analysisResults;
    
    const content = `## 🎯 总结与展望

今天我们重点关注了 ${focusKeywords.join('、')} 相关领域的最新动态。从收集的 ${summary.totalContents} 条信息中，我们发现了以下关键趋势：

${trends.map((trend: any, index: number) => `${index + 1}. **${trend.topic}** 正在获得越来越多的关注`).join('\n')}

**明日关注重点：**
- 持续追踪当前热门话题的发展
- 关注新兴技术和工具的动态
- 监控社区反馈和讨论热点

---

*本简报由 AI 自动生成，数据来源于 GitHub、Twitter 和 Google 搜索结果。*
*生成时间：${new Date().toLocaleString('zh-CN')}*`;

    return {
      title: '总结与展望',
      type: 'conclusion',
      content,
      priority: 7
    };
  }

  private formatSource(source: string, url?: string): string {
    const sourceMap: Record<string, string> = {
      github: '🐙 GitHub',
      twitter: '🐦 Twitter/X',
      google: '🔍 Google'
    };
    
    const displayName = sourceMap[source] || source;
    return url ? `[${displayName}](${url})` : displayName;
  }

  private formatTime(timestamp: Date | string): string {
    const now = new Date();
    const timestampDate = timestamp instanceof Date ? timestamp : new Date(timestamp || Date.now());
    const diff = now.getTime() - timestampDate.getTime();
    const hours = Math.floor(diff / (1000 * 60 * 60));
    
    if (hours < 1) return '刚刚';
    if (hours < 24) return `${hours} 小时前`;
    return `${Math.floor(hours / 24)} 天前`;
  }

  private formatMetadata(item: SearchContent): string {
    const parts = [];
    
    if (item.source === 'github' && item.metadata) {
      if (item.metadata.stars) parts.push(`⭐ ${item.metadata.stars}`);
      if (item.metadata.forks) parts.push(`🍴 ${item.metadata.forks}`);
      if (item.metadata.language) parts.push(`💻 ${item.metadata.language}`);
    }
    
    if (item.source === 'twitter' && item.metadata) {
      if (item.metadata.likes) parts.push(`❤️ ${item.metadata.likes}`);
      if (item.metadata.retweets) parts.push(`🔄 ${item.metadata.retweets}`);
    }
    
    return parts.length > 0 ? `**数据：** ${parts.join(' | ')}` : '';
  }

  private getSourcesSummary(analysisResults: any): Record<string, number> {
    const { categorization } = analysisResults;
    const summary: Record<string, number> = {};
    
    for (const [source, contents] of Object.entries(categorization.bySource)) {
      summary[source] = (contents as any[]).length;
    }
    
    return summary;
  }
}

/**
 * Newsletter Generator Agent
 * 
 * 使用 AStack Agent 架构进行智能新闻简报生成
 * 特点：
 * 1. 内容智能分析和分类
 * 2. 多样化的简报结构
 * 3. 个性化的内容展示
 * 4. 丰富的格式化选项
 * 5. AI 驱动的洞察生成
 */
export class NewsletterGeneratorAgent extends Agent {

  constructor() {
    const config: AgentConfig = {
      model: new ModelProvider.Deepseek({
        apiKey: process.env.DEEPSEEK_API_KEY || '',
        model: 'deepseek-chat',
        temperature: 0.4
      }),
      tools: [
        new ContentAnalysisTool(),
        new NewsletterGenerationTool()
      ],
      systemPrompt: `你是一个专业的 AI 技术新闻简报生成专家，具备卓越的内容组织和写作能力。

## 📝 专业使命
将高质量的搜索内容转化为结构化、易读的 AI 技术新闻简报，为读者提供有价值的信息摘要。

## 🎨 写作风格
- **简洁明了**: 重点突出，表达清晰
- **专业客观**: 保持中性立场，避免主观偏见
- **结构化**: 使用清晰的章节和层次结构
- **易读性**: 适当使用 emoji 和格式化增强可读性

## 📋 内容组织
1. **今日概览**: 整体数据和核心亮点
2. **重点内容**: 高质量内容的详细展示
3. **趋势分析**: 识别和分析技术趋势
4. **技术动态**: GitHub 项目和技术更新
5. **社区讨论**: Twitter 等社交媒体热点
6. **项目推荐**: 值得关注的开源项目
7. **总结展望**: 整体总结和未来展望

## 🎯 内容原则
1. **价值优先**: 优先展示对读者有价值的内容
2. **多样性平衡**: 确保不同来源和类型的内容都有展现
3. **时效性考虑**: 新鲜内容获得更多关注
4. **可读性优化**: 合理的信息密度和展示层次

## 📊 质量控制
- 事实准确性检查
- 链接有效性验证
- 格式一致性保证
- 内容完整性确认

## 🔧 工具使用
1. 使用 analyze_and_categorize_content 工具进行深度内容分析
2. 识别关键趋势、重要亮点和话题分布
3. 使用 generate_newsletter_content 工具生成结构化简报
4. 确保简报的完整性和专业性

## 💡 创新要素
- 数据驱动的洞察分析
- 可视化数据展示
- 个性化推荐逻辑
- 交互式内容链接

你的任务是创造有价值、易读、专业的 AI 技术新闻简报。`,
      maxIterations: 4,
      verbose: true
    };

    super(config);

    // 添加输出端口
    Component.Port.O('newsletter').attach(this);
    Component.Port.O('analysis').attach(this);
  }

  /**
   * 生成新闻简报
   */
  async generateNewsletter(input: NewsletterGeneratorInput): Promise<NewsletterGeneratorOutput> {
    console.log('📝 Newsletter Generator Agent 开始生成简报...');
    console.log('📊 输入内容数量:', input.filteredContents.length);
    console.log('🎯 关注关键词:', input.strategy?.searchFocus?.join(', ') || '无特定关键词');

    // 构建 Agent 消息
    const userMessage = `请为以下内容生成一份专业的 AI 技术新闻简报：

**内容概况：**
- 内容数量：${input.filteredContents.length} 条
- 关注关键词：${input.strategy?.searchFocus?.join('、') || 'AI技术'}
- 简报模板：标准技术简报

**内容列表：**
${input.filteredContents.slice(0, 10).map((content, i) => 
  `${i + 1}. ${content.title} (${content.source}) - 质量分: ${(content as any).qualityScore || 'N/A'}`
).join('\n')}
${input.filteredContents.length > 10 ? `... 另外还有 ${input.filteredContents.length - 10} 条内容` : ''}

**生成要求：**
1. 使用 analyze_and_categorize_content 工具对所有内容进行深度分析
2. 识别关键趋势、重要亮点和话题分布
3. 使用 generate_newsletter_content 工具生成完整的简报内容
4. 确保简报结构清晰、内容丰富、格式规范

**关注重点：**
- 优先展示高质量和新鲜的内容
- 平衡不同来源（GitHub、Twitter、Google）的内容
- 突出技术趋势和社区动态
- 生成有洞察价值的分析和总结

请生成一份专业、易读、有价值的 AI 技术新闻简报。`;

    try {
      // 使用 Agent 的智能分析和生成能力，增加超时保护
      const agentOutput = await Promise.race([
        super.run(userMessage),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Newsletter Agent 执行超时')), 60000) // 60秒超时
        )
      ]) as any;
      
      console.log('🧠 Agent 分析完成:', agentOutput.message);
      console.log('🔧 工具调用次数:', agentOutput.toolCalls?.length || 0);

      // 从工具调用结果中提取数据
      const { newsletter, analysisData } = this.extractGenerationResults(agentOutput, input);

      const output: NewsletterGeneratorOutput = {
        newsletter,
        analysisData,
        metadata: {
          generatedAt: new Date(),
          contentCount: input.filteredContents.length,
          focusKeywords: input.strategy?.searchFocus || [],
          processingTime: new Date(),
          qualitySummary: this.generateQualitySummary(input.filteredContents)
        }
      };

      console.log('✅ Newsletter Generator Agent 完成');
      console.log(`   📄 生成章节数: ${newsletter.sections.length}`);
      console.log(`   📊 内容覆盖率: ${this.calculateCoverageRate(input.filteredContents, newsletter)}%`);

      return output;

    } catch (error) {
      console.error('❌ Newsletter Generator Agent 失败:', error instanceof Error ? error.message : String(error));
      
      // 返回基础简报
      return this.generateFallbackNewsletter(input);
    }
  }

  /**
   * 从 Agent 输出中提取生成结果
   */
  private extractGenerationResults(agentOutput: any, input: NewsletterGeneratorInput): {
    newsletter: NewsletterGeneratorOutput['newsletter'];
    analysisData: any;
  } {
    // 获取内容分析结果
    const analysisTool = agentOutput.toolCalls?.find(
      (call: any) => call.tool === 'analyze_and_categorize_content'
    );

    // 获取简报生成结果
    const generationTool = agentOutput.toolCalls?.find(
      (call: any) => call.tool === 'generate_newsletter_content'
    );

    if (!analysisTool || !generationTool) {
      console.warn('⚠️ Agent 工具调用不完整，使用退化策略');
      console.log(`   - 分析工具: ${analysisTool ? '✅' : '❌'}`);
      console.log(`   - 生成工具: ${generationTool ? '✅' : '❌'}`);
      
      // 使用退化策略，不抛出错误
      return this.createFallbackGenerationResults(input);
    }

    try {
      const analysisResult = analysisTool.result || {};
      const generationResult = generationTool.result || {};

      // 构建完整的简报
      const newsletter = {
        title: this.generateNewsletterTitle(input.focusKeywords || input.strategy?.searchFocus || []),
        subtitle: this.generateNewsletterSubtitle(analysisResult.summary || {}),
        sections: generationResult.sections || [],
        footer: this.generateNewsletterFooter(),
        generatedAt: new Date()
      };

      return {
        newsletter,
        analysisData: {
          categorization: analysisResult.categorization || {},
          trends: analysisResult.trends || [],
          highlights: analysisResult.highlights || [],
          summary: analysisResult.summary || {},
          aiInsights: this.extractAIInsights(agentOutput.message || '')
        }
      };
    } catch (error) {
      console.error('❌ 提取生成结果失败:', error);
      return this.createFallbackGenerationResults(input);
    }
  }

  /**
   * 创建退化生成结果
   */
  private createFallbackGenerationResults(input: NewsletterGeneratorInput): {
    newsletter: NewsletterGeneratorOutput['newsletter'];
    analysisData: any;
  } {
    const newsletter = {
      title: this.generateNewsletterTitle(input.strategy?.searchFocus || ['AI技术']),
      subtitle: `简化版简报 - ${input.filteredContents.length} 条内容`,
      sections: this.createBasicSections(input.filteredContents),
      footer: this.generateNewsletterFooter(),
      generatedAt: new Date()
    };

    return {
      newsletter,
      analysisData: {
        categorization: {},
        trends: [],
        highlights: [],
        summary: { totalContents: input.filteredContents.length },
        aiInsights: ['使用了退化生成策略']
      }
    };
  }

  /**
   * 创建基础章节
   */
  private createBasicSections(contents: SearchContent[]): NewsletterSection[] {
    const sections: NewsletterSection[] = [];
    
    // 按来源分组
    const bySource = {
      github: contents.filter(c => c.source === 'github'),
      twitter: contents.filter(c => c.source === 'twitter'),
      google: contents.filter(c => c.source === 'google')
    };
    
    Object.entries(bySource).forEach(([source, items], index) => {
      if (items.length > 0) {
        const sourceEmoji = source === 'github' ? '🐙' : source === 'twitter' ? '🐦' : '🔍';
        let content = `## ${sourceEmoji} ${source.toUpperCase()} 动态\n\n`;
        
        items.slice(0, 3).forEach((item, i) => {
          content += `### ${i + 1}. ${item.title}\n\n`;
          content += `**链接：** [查看详情](${item.url})\n`;
          content += `**时间：** ${item.timestamp.toLocaleString('zh-CN')}\n\n`;
          content += `${item.content.substring(0, 150)}...\n\n---\n\n`;
        });

        sections.push({
          title: `${source.toUpperCase()} 动态`,
          type: source as any,
          content,
          priority: index + 1
        });
      }
    });
    
    return sections;
  }

  /**
   * 生成简报标题
   */
  private generateNewsletterTitle(focusKeywords: string[] = []): string {
    const today = new Date().toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
    
    const mainTopic = focusKeywords[0] || 'AI 技术';
    return `${mainTopic} 日报 - ${today}`;
  }

  /**
   * 生成简报副标题
   */
  private generateNewsletterSubtitle(summary: any): string {
    return `精选 ${summary.totalContents} 条优质内容，涵盖 ${summary.uniqueTopics} 个主题领域`;
  }

  /**
   * 生成简报页脚
   */
  private generateNewsletterFooter(): string {
    return `---

**关于本简报**
- 🤖 由 AI 自动生成和筛选
- 📊 数据来源：GitHub、Twitter/X、Google
- ⏰ 更新频率：每日一期
- 🔍 内容筛选：基于质量评估和相关性分析

*如有问题或建议，欢迎反馈。*`;
  }

  /**
   * 提取 AI 洞察
   */
  private extractAIInsights(agentMessage: string): string[] {
    const insights: string[] = [];
    
    // 从 Agent 回复中提取关键洞察
    const lines = agentMessage.split('\n');
    for (const line of lines) {
      if (line.includes('趋势') || line.includes('发现') || line.includes('亮点') || line.includes('观察')) {
        insights.push(line.trim());
      }
    }

    return insights.length > 0 ? insights : ['AI 分析和生成正常完成'];
  }

  /**
   * 生成质量摘要
   */
  private generateQualitySummary(contents: SearchContent[]) {
    const withScores = contents.filter(c => (c as any).qualityScore !== undefined);
    const avgScore = withScores.length > 0 ? 
      withScores.reduce((sum, c) => sum + ((c as any).qualityScore || 0), 0) / withScores.length : 0;

    return {
      averageQuality: avgScore,
      highQualityCount: contents.filter(c => ((c as any).qualityScore || 0) >= 0.8).length,
      totalAssessed: withScores.length
    };
  }

  /**
   * 计算内容覆盖率
   */
  private calculateCoverageRate(contents: SearchContent[], newsletter: any): number {
    // 简单计算：检查有多少内容在简报中被引用
    const newsletterText = newsletter.sections.map((s: any) => s.content).join(' ').toLowerCase();
    const coveredCount = contents.filter(content => 
      newsletterText.includes((content.title || '').toLowerCase().substring(0, 20))
    ).length;
    
    return Math.round((coveredCount / contents.length) * 100);
  }

  /**
   * 备选简报生成
   */
  private generateFallbackNewsletter(input: NewsletterGeneratorInput): NewsletterGeneratorOutput {
    console.log('⚠️ 使用备选简报生成策略');

    // 简单的内容分组
    const bySource = {
      github: input.filteredContents.filter(c => c.source === 'github'),
      twitter: input.filteredContents.filter(c => c.source === 'twitter'),
      google: input.filteredContents.filter(c => c.source === 'google')
    };

    const sections: NewsletterSection[] = [];

    // 生成简单的摘要
    sections.push({
      title: '今日概览',
      type: 'summary',
      content: `## 📊 今日概览\n\n今日收集了 ${input.filteredContents.length} 条相关内容，关注 ${input.strategy?.searchFocus?.join('、') || 'AI技术'} 等领域。`,
      priority: 1
    });

    // 按来源展示内容
    Object.entries(bySource).forEach(([source, contents], index) => {
      if (contents.length > 0) {
        const sourceEmoji = source === 'github' ? '🐙' : source === 'twitter' ? '🐦' : '🔍';
        let content = `## ${sourceEmoji} ${source.toUpperCase()} 动态\n\n`;
        
        contents.slice(0, 3).forEach((item, i) => {
          content += `### ${i + 1}. ${item.title}\n\n`;
          content += `**链接：** [查看详情](${item.url})\n`;
          content += `**时间：** ${item.timestamp.toLocaleString('zh-CN')}\n\n`;
          content += `${item.content.substring(0, 150)}...\n\n---\n\n`;
        });

        sections.push({
          title: `${source.toUpperCase()} 动态`,
          type: source as any,
          content,
          priority: index + 2
        });
      }
    });

    return {
      newsletter: {
        title: this.generateNewsletterTitle(input.strategy?.searchFocus || ['AI技术']),
        subtitle: `基础简报 - ${input.filteredContents.length} 条内容`,
        sections,
        footer: this.generateNewsletterFooter(),
        generatedAt: new Date()
      },
      analysisData: {
        trends: [],
        highlights: [],
        summary: { totalContents: input.filteredContents.length },
        aiInsights: ['使用了备选生成策略']
      },
      metadata: {
        generatedAt: new Date(),
        contentCount: input.filteredContents.length,
        focusKeywords: input.strategy?.searchFocus || [],
        processingTime: new Date(),
        qualitySummary: this.generateQualitySummary(input.filteredContents)
      }
    };
  }

  /**
   * Component 数据转换逻辑
   */
  _transform($i: any, $o: any): void {
    $i('in').receive(async (input: NewsletterGeneratorInput) => {
      try {
        console.log(`[NewsletterGeneratorAgent] 开始生成简报任务`);
        
        const result = await this.generateNewsletter(input);
        
        console.log(`[NewsletterGeneratorAgent] 简报生成完成: ${result.newsletter.sections.length} 个章节`);
        
        // 构建完整的最终输出结果
        const finalOutput = {
          success: true,
          newsletter: result.newsletter,
          contents: input.contents || [], // 添加 contents 字段，从输入获取过滤后的内容
          analysisData: result.analysisData,
          metadata: result.metadata || {},
          timestamp: new Date()
        };
        
        // 发送到默认的 out 端口 - 这是 Pipeline 期望的终止点
        $o('out').send(finalOutput);
        console.log('[NewsletterGeneratorAgent] 最终结果已发送到 out 端口');
        
        // 保持兼容性，继续发送到原有端口
        $o('newsletter').send(result.newsletter);
        $o('analysis').send({
          analysisData: result.analysisData,
          metadata: result.metadata
        });
        
      } catch (error) {
        console.error(
          `[NewsletterGeneratorAgent] 处理失败: ${error instanceof Error ? error.message : String(error)}`
        );
        throw error;
      }
    });
  }
}

export default NewsletterGeneratorAgent;