import { Component } from '@astack-tech/core';
import * as fs from 'fs/promises';
import * as path from 'path';
import type { AnalyzedContentItem } from '../types/content.js';

/**
 * 周刊生成器组件
 * 
 * 将分析后的内容生成符合 Creator Telescope 格式的 Markdown 文件
 */
export class NewsletterGeneratorComponent extends Component {
  constructor() {
    super({});

    // 定义输入和输出端口
    Component.Port.I('analyzedContent').attach(this);  // 接收分析后的内容
    Component.Port.O('newsletterGenerated').attach(this); // 输出生成完成信号
  }

  /**
   * 组件转换方法
   */
  _transform($i: any, $o: any) {
    $i('analyzedContent').receive(async (analyzedItems: AnalyzedContentItem[]) => {
      console.log(`📄 开始生成周刊，${analyzedItems.length} 条分析内容...`);
      
      try {
        const newsletter = await this.generateNewsletter(analyzedItems);
        await this.saveNewsletter(newsletter);
        
        console.log('✅ 周刊生成完成');
        $o('newsletterGenerated').send({
          success: true,
          path: newsletter.filePath,
          contentCount: analyzedItems.length
        });
      } catch (error) {
        console.error('❌ 周刊生成失败:', error);
        $o('newsletterGenerated').send({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });
  }

  /**
   * 生成周刊内容
   */
  private async generateNewsletter(analyzedItems: AnalyzedContentItem[]) {
    const date = new Date();
    const weekNumber = this.getWeekNumber(date);
    const year = date.getFullYear();
    
    // 按重要性和评分分组内容
    const groupedContent = this.groupContentByCategory(analyzedItems);
    
    // 生成 frontmatter
    const frontmatter = this.generateFrontmatter(weekNumber, year, analyzedItems.length);
    
    // 生成内容各部分
    const summary = this.generateSummary(analyzedItems);
    const highlights = this.generateHighlights(groupedContent.critical, groupedContent.high);
    const categorizedContent = this.generateCategorizedContent(groupedContent);
    const insights = this.generateInsights(analyzedItems);
    
    // 组装完整的 Markdown 内容
    const markdown = [
      frontmatter,
      '',
      '## 本周亮点',
      '',
      highlights,
      '',
      '## 内容概览',
      '',
      summary,
      '',
      '## 分类内容',
      '',
      categorizedContent,
      '',
      '## 技术洞察',
      '',
      insights,
      '',
      '---',
      '',
      `*本周刊由 AI 自动生成，共收录 ${analyzedItems.length} 条内容*`
    ].join('\n');

    const fileName = `weekly-${year}-${String(weekNumber).padStart(2, '0')}.md`;
    const filePath = path.join(process.cwd(), '..', 'src', 'newsletters', fileName);

    return {
      content: markdown,
      fileName,
      filePath,
      week: weekNumber,
      year,
      contentCount: analyzedItems.length
    };
  }

  /**
   * 生成 frontmatter
   */
  private generateFrontmatter(week: number, year: number, contentCount: number): string {
    const date = new Date();
    const title = `第 ${week} 期 AI 前沿周刊`;
    const description = `本周收录了 ${contentCount} 条高质量 AI 前沿内容，涵盖技术突破、行业动态、开源项目等多个维度。`;
    
    return [
      '---',
      `title: "${title}"`,
      `description: "${description}"`,
      `pubDate: "${date.toISOString().split('T')[0]}"`,
      `week: ${week}`,
      `year: ${year}`,
      `contentCount: ${contentCount}`,
      'featured: true',
      'tags:',
      '  - "人工智能"',
      '  - "技术前沿"',
      '  - "行业动态"',
      '  - "开源项目"',
      '---'
    ].join('\n');
  }

  /**
   * 按类别分组内容
   */
  private groupContentByCategory(items: AnalyzedContentItem[]) {
    const groups = {
      critical: items.filter(item => item.importanceLevel === 'critical'),
      high: items.filter(item => item.importanceLevel === 'high'),
      medium: items.filter(item => item.importanceLevel === 'medium'),
      low: items.filter(item => item.importanceLevel === 'low')
    };

    // 按评分排序
    Object.values(groups).forEach(group => 
      group.sort((a, b) => b.finalScore - a.finalScore)
    );

    // 按来源分组
    const bySource = {
      twitter: items.filter(item => item.source === 'twitter'),
      rss: items.filter(item => item.source === 'rss')
    };

    // 按话题分组
    const topicGroups: { [key: string]: AnalyzedContentItem[] } = {};
    items.forEach(item => {
      item.relatedTopics.forEach(topic => {
        if (!topicGroups[topic]) topicGroups[topic] = [];
        topicGroups[topic].push(item);
      });
    });

    return { ...groups, bySource, topicGroups };
  }

  /**
   * 生成摘要
   */
  private generateSummary(items: AnalyzedContentItem[]): string {
    const stats = {
      total: items.length,
      sources: {
        twitter: items.filter(i => i.source === 'twitter').length,
        rss: items.filter(i => i.source === 'rss').length
      },
      importance: {
        critical: items.filter(i => i.importanceLevel === 'critical').length,
        high: items.filter(i => i.importanceLevel === 'high').length,
        medium: items.filter(i => i.importanceLevel === 'medium').length
      }
    };

    const topTopics = this.getTopTopics(items);
    const avgScore = items.reduce((sum, item) => sum + item.finalScore, 0) / items.length;

    return [
      `本周共收录 **${stats.total}** 条高质量内容，平均质量评分 **${avgScore.toFixed(2)}**。`,
      '',
      `**内容来源分布:**`,
      `- Twitter 动态: ${stats.sources.twitter} 条`,
      `- RSS 文章: ${stats.sources.rss} 条`,
      '',
      `**重要性分级:**`,
      `- 关键内容: ${stats.importance.critical} 条`,
      `- 重要内容: ${stats.importance.high} 条`,
      `- 一般内容: ${stats.importance.medium} 条`,
      '',
      `**主要话题:** ${topTopics.join('、')}`
    ].join('\n');
  }

  /**
   * 生成亮点内容
   */
  private generateHighlights(critical: AnalyzedContentItem[], high: AnalyzedContentItem[]): string {
    const highlights = [...critical, ...high.slice(0, 3)].slice(0, 5);
    
    if (highlights.length === 0) {
      return '本周暂无特别突出的亮点内容。';
    }

    return highlights.map((item, index) => {
      const emoji = index === 0 ? '🔥' : index === 1 ? '⭐' : '💡';
      return [
        `### ${emoji} ${item.title}`,
        '',
        `**来源:** ${item.source === 'twitter' ? 'Twitter' : 'RSS'} | **作者:** ${item.author}`,
        '',
        item.aiGeneratedSummary,
        '',
        `**关键洞察:** ${item.keyInsights.join('、')}`,
        '',
        `**技术难度:** ${this.translateTechnicalLevel(item.technicalLevel)} | **重要性:** ${this.translateImportance(item.importanceLevel)}`,
        '',
        `[查看原文](${item.url})`,
        ''
      ].join('\n');
    }).join('\n');
  }

  /**
   * 生成分类内容
   */
  private generateCategorizedContent(groups: any): string {
    const sections: string[] = [];

    // 按话题分组显示
    const topTopics = Object.entries(groups.topicGroups)
      .sort(([,a], [,b]) => (b as any[]).length - (a as any[]).length)
      .slice(0, 6);

    topTopics.forEach(([topic, items]) => {
      const topItems = (items as AnalyzedContentItem[])
        .sort((a, b) => b.finalScore - a.finalScore)
        .slice(0, 5);

      sections.push(`#### ${topic} (${(items as any[]).length} 条)`);
      sections.push('');

      topItems.forEach(item => {
        const sourceIcon = item.source === 'twitter' ? '🐦' : '📰';
        sections.push(`${sourceIcon} **[${item.title}](${item.url})**`);
        sections.push(`   *${item.author}* | 评分: ${item.finalScore.toFixed(2)}`);
        sections.push(`   ${item.aiGeneratedSummary.substring(0, 100)}...`);
        sections.push('');
      });
    });

    return sections.join('\n');
  }

  /**
   * 生成技术洞察
   */
  private generateInsights(items: AnalyzedContentItem[]): string {
    const insights: string[] = [];

    // 技术趋势分析
    const topicFrequency = this.analyzeTopicTrends(items);
    insights.push('### 技术趋势');
    insights.push('');
    Object.entries(topicFrequency)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 5)
      .forEach(([topic, count]) => {
        insights.push(`- **${topic}**: ${count} 条相关内容，热度较高`);
      });

    insights.push('');

    // 来源质量分析
    const sourceAnalysis = this.analyzeSourceQuality(items);
    insights.push('### 内容质量分析');
    insights.push('');
    insights.push(`- 平均 AI 相关性评分: ${sourceAnalysis.avgAiScore.toFixed(2)}`);
    insights.push(`- 平均新鲜度评分: ${sourceAnalysis.avgFreshness.toFixed(2)}`);
    insights.push(`- 高质量内容占比: ${sourceAnalysis.highQualityRatio.toFixed(1)}%`);

    insights.push('');

    // 技术难度分布
    const difficultyDist = this.analyzeDifficultyDistribution(items);
    insights.push('### 技术难度分布');
    insights.push('');
    Object.entries(difficultyDist).forEach(([level, count]) => {
      const percentage = ((count / items.length) * 100).toFixed(1);
      insights.push(`- ${this.translateTechnicalLevel(level)}: ${count} 条 (${percentage}%)`);
    });

    return insights.join('\n');
  }

  /**
   * 保存周刊文件
   */
  private async saveNewsletter(newsletter: any) {
    // 确保目录存在
    const dir = path.dirname(newsletter.filePath);
    await fs.mkdir(dir, { recursive: true });

    // 写入文件
    await fs.writeFile(newsletter.filePath, newsletter.content, 'utf-8');
    
    console.log(`📁 周刊已保存到: ${newsletter.filePath}`);
  }

  /**
   * 获取周数
   */
  private getWeekNumber(date: Date): number {
    const start = new Date(date.getFullYear(), 0, 1);
    const days = Math.floor((date.getTime() - start.getTime()) / (24 * 60 * 60 * 1000));
    return Math.ceil((days + start.getDay() + 1) / 7);
  }

  /**
   * 获取热门话题
   */
  private getTopTopics(items: AnalyzedContentItem[]): string[] {
    const topicCount: { [key: string]: number } = {};
    
    items.forEach(item => {
      item.relatedTopics.forEach(topic => {
        topicCount[topic] = (topicCount[topic] || 0) + 1;
      });
    });

    return Object.entries(topicCount)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 5)
      .map(([topic]) => topic);
  }

  /**
   * 分析话题趋势
   */
  private analyzeTopicTrends(items: AnalyzedContentItem[]): { [key: string]: number } {
    const trends: { [key: string]: number } = {};
    
    items.forEach(item => {
      item.relatedTopics.forEach(topic => {
        trends[topic] = (trends[topic] || 0) + 1;
      });
    });

    return trends;
  }

  /**
   * 分析来源质量
   */
  private analyzeSourceQuality(items: AnalyzedContentItem[]) {
    const totalItems = items.length;
    const avgAiScore = items.reduce((sum, item) => sum + (item.metrics?.aiRelevanceScore || 0), 0) / totalItems;
    const avgFreshness = items.reduce((sum, item) => sum + (item.metrics?.freshnessScore || 0), 0) / totalItems;
    const highQualityCount = items.filter(item => (item.metrics?.qualityScore || 0) > 0.7).length;
    
    return {
      avgAiScore,
      avgFreshness,
      highQualityRatio: (highQualityCount / totalItems) * 100
    };
  }

  /**
   * 分析技术难度分布
   */
  private analyzeDifficultyDistribution(items: AnalyzedContentItem[]): { [key: string]: number } {
    const distribution: { [key: string]: number } = {
      beginner: 0,
      intermediate: 0,
      advanced: 0,
      expert: 0
    };

    items.forEach(item => {
      distribution[item.technicalLevel]++;
    });

    return distribution;
  }

  /**
   * 翻译技术难度级别
   */
  private translateTechnicalLevel(level: string): string {
    const translations = {
      beginner: '入门',
      intermediate: '中级',
      advanced: '高级',
      expert: '专家'
    };
    return translations[level as keyof typeof translations] || level;
  }

  /**
   * 翻译重要性级别
   */
  private translateImportance(level: string): string {
    const translations = {
      low: '一般',
      medium: '重要',
      high: '很重要',
      critical: '关键'
    };
    return translations[level as keyof typeof translations] || level;
  }
}

export default NewsletterGeneratorComponent;