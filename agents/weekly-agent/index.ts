#!/usr/bin/env node

import { config } from 'dotenv';
import { runWeeklyGeneration } from './weekly-pipeline.js';

// 加载环境变量
config();

/**
 * Creator Telescope 周刊生成器入口文件
 * 
 * 使用方法:
 * npm run weekly:generate
 * 或
 * node index.js
 */

async function main() {
  console.log('🔭 Creator Telescope 周刊生成器启动');
  console.log('=======================================');
  console.log('');

  const startTime = Date.now();

  try {
    await runWeeklyGeneration();
    
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log('');
    console.log('=======================================');
    console.log(`🎉 周刊生成成功! 耗时: ${duration}s`);
    console.log('✨ 生成的 Markdown 文件已保存到 ../src/newsletters/ 目录');
    console.log('📝 请检查生成的内容并按需调整');
    
    // 确保进程正常退出
    process.exit(0);
    
  } catch (error) {
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log('');
    console.log('=======================================');
    console.error(`❌ 周刊生成失败! 耗时: ${duration}s`);
    console.error('错误详情:', error);
    process.exit(1);
  }
}

// 处理未捕获的异常
process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ 未处理的 Promise 拒绝:', reason);
  process.exit(1);
});

process.on('uncaughtException', (error) => {
  console.error('❌ 未捕获的异常:', error);
  process.exit(1);
});

// 优雅退出处理
process.on('SIGINT', () => {
  console.log('\n🛑 接收到退出信号，正在清理资源...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n🛑 接收到终止信号，正在清理资源...');
  process.exit(0);
});

// 运行主函数
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { runWeeklyGeneration };