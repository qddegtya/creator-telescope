#!/usr/bin/env tsx
/**
 * 简单测试脚本 - 只测试核心功能，不涉及网络请求
 */

import { NewsletterGeneratorAgent } from '../agents/newsletter-generator-agent.js';
import { SearchContent } from '../types/multi-agent.js';
import dotenv from 'dotenv';

// 加载环境变量
dotenv.config();

async function testNewsletterGenerator() {
  console.log('🧪 测试 Newsletter Generator...');
  
  // 创建测试数据
  const testContents: SearchContent[] = [
    {
      id: 'test1',
      title: 'AI技术突破',
      content: 'OpenAI发布了新的GPT模型，具有更强的推理能力。',
      url: 'https://github.com/openai/test',
      source: 'github',
      timestamp: new Date(),
      metadata: {
        author: 'OpenAI',
        platform: 'github',
        tags: ['AI', '技术'],
        engagement: { stars: 1000 }
      }
    },
    {
      id: 'test2',
      title: '机器学习新进展',
      content: 'Google推出了新的机器学习框架，提高了训练效率。',
      url: 'https://github.com/google/ml',
      source: 'github', 
      timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000), // 2小时前
      metadata: {
        author: 'Google',
        platform: 'github',
        tags: ['ML', '框架'],
        engagement: { stars: 500 }
      }
    }
  ];

  const agent = new NewsletterGeneratorAgent();
  
  try {
    console.log('📝 生成简报...');
    const result = await agent.run({
      filteredContents: testContents,
      qualityAssessments: [],
      strategy: {
        searchTargets: ['github'],
        priority: 'quality',
        timeWindow: '24h',
        maxConcurrency: 1,
        maxResults: { google: 5, twitter: 5, github: 5 },
        qualityThreshold: 0.6,
        expandedKeywords: ['AI', '技术'],
        optimizedQueries: { google: [], twitter: [], github: [] },
        searchFocus: ['AI技术', '机器学习'],
        expectedContentTypes: ['project']
      },
      userPreferences: {
        focus: '技术',
        depth: 'deep'
      }
    });

    console.log('✅ Newsletter 生成成功！');
    console.log(`   - 标题: ${result.newsletter.title}`);
    console.log(`   - 章节数: ${result.newsletter.sections.length}`);
    console.log(`   - 内容总数: ${result.newsletter.metadata.totalContents}`);
    
    return true;
  } catch (error) {
    console.error('❌ Newsletter 生成失败:', error instanceof Error ? error.message : String(error));
    return false;
  }
}

async function main() {
  console.log('🧪 简单功能测试开始...\n');
  
  try {
    const success = await testNewsletterGenerator();
    
    if (success) {
      console.log('\n✅ 所有测试通过！');
      process.exit(0);
    } else {
      console.log('\n❌ 测试失败！');
      process.exit(1);
    }
  } catch (error) {
    console.error('\n💥 测试异常:', error);
    process.exit(1);
  }
}

// 运行测试
main();