import { Component } from '@astack-tech/core';
import { combineLatest } from 'rxjs';
import { map } from 'rxjs/operators';
import type { ContentItem } from '../types/content.js';

/**
 * 内容合并器组件
 * 
 * 使用 RxJS combineLatest 等待所有爬虫完成，合并来自不同数据源的内容
 * 支持任意数量的并行数据源，真正的响应式并行处理
 */
export class ContentMergerComponent extends Component {
  constructor() {
    super({});

    // 定义输入和输出端口
    Component.Port.I('twitterContent').attach(this);    // 接收 Twitter 内容
    Component.Port.I('rssContent').attach(this);        // 接收 RSS 内容
    Component.Port.O('mergedContent').attach(this);     // 输出合并后的内容
  }

  /**
   * 组件转换方法 - 使用 RxJS combineLatest 实现真正的响应式并行等待
   */
  _transform($i: any, $o: any) {
    const startTime = Date.now();
    
    console.log('🔄 ContentMerger 启动响应式并行等待模式...');
    
    // 创建可观察序列 - $i() 返回的就是 Subject
    const twitterContent$ = $i('twitterContent').$;
    const rssContent$ = $i('rssContent').$;
    
    // 使用 combineLatest 等待所有数据源完成 - 真正的多线程屏障逻辑
    combineLatest([twitterContent$, rssContent$])
      .pipe(
        map(([twitterContent, rssContent]: [ContentItem[], ContentItem[]]) => {
          console.log(`🔗 ContentMerger 接收到所有数据源:`);
          console.log(`   📱 Twitter: ${twitterContent.length} 条内容`);
          console.log(`   📰 RSS: ${rssContent.length} 条内容`);
          
          return this.mergeAndDeduplicate(twitterContent, rssContent);
        })
      )
      .subscribe((mergedContent: ContentItem[]) => {
        const processingTime = Date.now() - startTime;
        console.log(`✅ 内容合并完成，共 ${mergedContent.length} 条去重后的内容 (耗时: ${processingTime}ms)`);
        $o('mergedContent').send(mergedContent);
      });
  }

  /**
   * 合并并去重内容 - 支持任意数量的数据源
   */
  private mergeAndDeduplicate(twitterContent: ContentItem[], rssContent: ContentItem[]): ContentItem[] {
    // 确保所有内容都有正确的 source 标识
    const normalizedTwitterContent = twitterContent.map(item => ({ ...item, source: 'twitter' }));
    const normalizedRssContent = rssContent.map(item => ({ ...item, source: 'rss' }));
    
    // 合并所有内容
    const allContent = [
      ...normalizedTwitterContent,
      ...normalizedRssContent
    ];

    console.log(`📊 原始内容统计: Twitter ${normalizedTwitterContent.length} 条, RSS ${normalizedRssContent.length} 条`);

    // 去重处理
    const seenUrls = new Set<string>();
    const seenTitles = new Set<string>();
    const uniqueContent: ContentItem[] = [];

    for (const item of allContent) {
      // 标准化标题用于比较
      const normalizedTitle = this.normalizeTitle(item.title);
      
      // 检查 URL 和标题去重
      if (!seenUrls.has(item.url) && !seenTitles.has(normalizedTitle)) {
        seenUrls.add(item.url);
        seenTitles.add(normalizedTitle);
        uniqueContent.push(item);
      }
    }

    // 按时间倒序排列（最新的在前）
    const sortedContent = uniqueContent.sort((a, b) => 
      new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
    );

    console.log(`🔄 去重结果: ${allContent.length} → ${uniqueContent.length} 条内容`);
    
    return sortedContent;
  }

  /**
   * 标准化标题用于去重比较
   */
  private normalizeTitle(title: string): string {
    return title
      .toLowerCase()
      .replace(/[^\w\s\u4e00-\u9fff]/g, '') // 移除特殊字符，保留中文
      .replace(/\s+/g, ' ')
      .trim()
      .substring(0, 50); // 只比较前50个字符
  }

}

export default ContentMergerComponent;