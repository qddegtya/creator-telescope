# Creator Telescope - Agentic Search System

AI-powered multi-agent search system for Creator Telescope using AStack framework and DeepSeek large language model.

## 🎯 项目概述

完全关键字驱动的智能搜索系统，使用 Multi-Agent 架构进行并行搜索任务：

- **📍 Google Search Agent**: 专业搜索 + 反爬虫机制 (Playwright headless)
- **🐦 Twitter Search Agent**: 社交媒体专家 (Playwright headless) 
- **🐙 GitHub Search Agent**: 代码和项目搜索 (Octokit API)
- **✨ Quality Filter Agent**: AI 驱动的质量评估 (DeepSeek)
- **📝 Newsletter Generator Agent**: 智能内容生成 (DeepSeek)
- **🧠 Coordinator Agent**: 策略制定和任务分发 (DeepSeek)

## 🏗️ 架构特点

- **🔄 静态 DAG + 动态路由**: 平衡 AStack 的可靠性与 AI 决策的灵活性
- **⚡ 高性能并发**: Piscina Worker 池 + Playwright 浏览器池
- **🎯 关键字驱动**: 完全动态配置，无需静态账号/RSS 设置
- **⏱️ 24 小时时效性**: 智能时间验证确保内容新鲜度
- **🛡️ 反爬虫机制**: User Agent 轮换 + 速率限制

## 🚀 快速开始

### 1. 环境配置

```bash
# 复制环境变量模板
cp agentic-search/.env.example .env

# 配置必需的 API 密钥
DEEPSEEK_API_KEY=your_deepseek_api_key_here
GITHUB_TOKEN=your_github_token_here
```

### 2. 安装依赖

```bash
yarn install
```

### 3. 验证配置

```bash
# 验证环境配置
yarn config-validate

# 生成配置报告
yarn config-report

# 健康检查
yarn config-health
```

### 4. 运行系统

```bash
# 开发模式 (支持热重载)
yarn dev

# 生产模式
yarn start

# 执行搜索任务
yarn agentic-search
```

## 📁 项目结构

```
agentic-search/
├── agents/                    # Multi-Agent 实现
│   ├── coordinator-agent.ts   # 策略协调 (继承 Agent)
│   ├── google-search-agent.ts # Google 搜索 (继承 Component)
│   ├── twitter-search-agent.ts # Twitter 搜索 (继承 Component)
│   ├── github-search-agent.ts # GitHub 搜索 (继承 Component)
│   ├── quality-filter-agent.ts # 质量过滤 (继承 Agent)
│   └── newsletter-generator-agent.ts # 内容生成 (继承 Agent)
├── config/                    # 配置系统
│   ├── environment.ts         # 环境变量管理
│   ├── validation.ts         # 配置验证
│   ├── dynamic-config-manager.ts # 动态配置
│   └── index.ts              # 统一入口
├── infrastructure/           # 基础设施
│   ├── browser-pool.ts       # Playwright 浏览器池
│   ├── worker-pool.ts        # Piscina Worker 池
│   └── workers/             # Worker 实现
├── tools/                   # 专用工具集
│   ├── search-tools.ts      # 搜索工具
│   ├── analysis-tools.ts    # 分析工具
│   ├── validation-tools.ts  # 验证工具
│   └── utility-tools.ts     # 实用工具
├── pipeline/                # 管道集成
│   └── multi-agent-pipeline.ts # 主要执行管道
├── prompts/                 # 提示词工程
│   └── prompt-engineering.ts # 所有 Agent 提示词
├── scripts/                 # 运维脚本
│   └── config-validator.ts  # 配置验证工具
└── types/                   # 类型定义
    ├── index.ts             # 基础类型
    └── multi-agent.ts       # Multi-Agent 类型
```

## 🔧 配置说明

### 环境变量

| 变量名 | 类型 | 默认值 | 说明 |
|-------|------|--------|------|
| `DEEPSEEK_API_KEY` | string | - | DeepSeek API 密钥 (必需) |
| `GITHUB_TOKEN` | string | - | GitHub 个人访问令牌 (必需) |
| `BROWSER_POOL_SIZE` | number | 5 | 浏览器池大小 (1-20) |
| `WORKER_POOL_SIZE` | number | 10 | Worker 池大小 (1-50) |
| `QUALITY_THRESHOLD` | number | 0.7 | 质量过滤阈值 (0-1) |
| `LOG_LEVEL` | string | info | 日志级别 (error/warn/info/debug) |

### 性能调优

```bash
# 高性能配置
BROWSER_POOL_SIZE=10
WORKER_POOL_SIZE=20
WORKER_CONCURRENCY=5

# 内存优化配置
BROWSER_POOL_SIZE=3
WORKER_POOL_SIZE=8
CACHE_MAX_SIZE=500
```

## 🧪 测试和验证

### 配置验证

```bash
# 完整验证
yarn config-validate

# 交互式配置向导
tsx agentic-search/scripts/config-validator.ts interactive

# 测试套件
tsx agentic-search/scripts/config-validator.ts test
```

### 时效性验证

```typescript
import { TimeValidator } from './agentic-search/config/time-validator';

const validator = new TimeValidator();
const result = await validator.run({
  contentTimestamp: new Date(),
  requiredTimeWindow: '24h'
});

console.log(`时效性评分: ${result.freshnessScore}`);
```

## 🔍 使用示例

### 基本搜索

```typescript
import { MultiAgentSearchPipeline } from './agentic-search/pipeline/multi-agent-pipeline';

const pipeline = new MultiAgentSearchPipeline();
const result = await pipeline.execute({
  keywords: ['agent', 'autonomous ai', 'llm framework'],
  timeWindow: '24h',
  sources: {
    google: { enabled: true },
    twitter: { enabled: true },
    github: { enabled: true }
  }
});

console.log(`找到 ${result.contents.length} 条高质量内容`);
```

### 高级配置

```typescript
import { createAgenticSearchConfig } from './agentic-search/config';

const config = createAgenticSearchConfig();
const result = await config.generateConfig(
  ['ai agent', 'multimodal', 'reasoning'],
  {
    focus: 'technical',
    depth: 'deep',
    freshness: 'latest',
    quality: 0.8
  }
);
```

## 📊 监控和日志

### 系统状态

```bash
# 实时健康检查
yarn config-health

# 详细系统报告
yarn config-report
```

### 性能指标

- **搜索延迟**: < 45 秒 (包含所有源)
- **质量过滤率**: > 70% (可配置)
- **时效性覆盖**: 24 小时内容 > 90%
- **并发能力**: 支持 20+ 并发搜索任务

## 🛠️ 开发指南

### 添加新的搜索源

1. 在 `agents/` 下创建新的搜索 Agent (继承 Component)
2. 在 `types/multi-agent.ts` 中定义相关类型
3. 在 `pipeline/multi-agent-pipeline.ts` 中集成新 Agent
4. 更新配置系统以支持新源

### 自定义质量评估

1. 在 `tools/validation-tools.ts` 中添加新的验证工具
2. 在 `agents/quality-filter-agent.ts` 中集成工具
3. 更新 `prompts/prompt-engineering.ts` 中的评估提示词

## 🔗 相关文档

- [AStack 框架文档](https://github.com/AStack-tech/astack)
- [DeepSeek API 文档](https://deepseek.com/api)
- [Playwright 文档](https://playwright.dev/)
- [Piscina Worker 池](https://github.com/piscinajs/piscina)

## 📄 许可证

MIT License - 详见 LICENSE 文件

---

**🔥 Creator Telescope Agentic Search** - 下一代 AI 驱动的智能搜索系统