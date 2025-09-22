# 🚀 Creator Telescope Agentic Search - 部署指南

完整的生产环境部署和运维指南。

## 📋 部署前检查清单

### 1. 环境要求

```bash
# Node.js 版本
node --version  # >= 18.0.0

# 内存要求
free -h  # 推荐 >= 4GB RAM

# 磁盘空间
df -h  # 推荐 >= 10GB 可用空间
```

### 2. 必需的 API 密钥

- ✅ **DeepSeek API Key**: 用于 AI 决策和内容生成
- ✅ **GitHub Token**: 用于代码仓库搜索
- ⚠️ **浏览器权限**: Playwright 需要系统权限

### 3. 系统依赖

```bash
# 安装 Playwright 浏览器
npx playwright install

# 验证浏览器安装
npx playwright install-deps
```

## 🏗️ 部署步骤

### 第一步：克隆和安装

```bash
# 克隆项目
git clone <repository-url>
cd creator-telescope/agents

# 安装依赖
yarn install

# 验证安装
yarn build
```

### 第二步：环境配置

```bash
# 复制环境变量模板
cp agentic-search/.env.example .env

# 编辑环境变量
nano .env
```

**生产环境配置示例：**

```bash
# 基础配置
NODE_ENV=production
PORT=3000

# API 密钥 (必需)
DEEPSEEK_API_KEY=your_production_deepseek_key
GITHUB_TOKEN=your_production_github_token

# 性能配置
BROWSER_POOL_SIZE=8
WORKER_POOL_SIZE=16
WORKER_CONCURRENCY=4

# 超时配置
SEARCH_TIMEOUT=45000
WORKER_TIMEOUT=90000
BROWSER_TIMEOUT=60000

# 质量配置
QUALITY_THRESHOLD=0.7
CONTENT_MIN_SCORE=0.6
DUPLICATE_THRESHOLD=0.8

# 缓存配置
CACHE_ENABLED=true
CACHE_TTL=1800
CACHE_MAX_SIZE=2000

# 监控配置
MONITORING_ENABLED=true
LOG_LEVEL=info
LOG_TO_FILE=true
LOG_DIRECTORY=/var/log/agentic-search

# 安全配置
CORS_ORIGINS=https://yourdomain.com,https://api.yourdomain.com
```

### 第三步：配置验证

```bash
# 完整配置验证
yarn config-validate

# 生成配置报告
yarn config-report

# 健康检查
yarn config-health

# 时效性验证
yarn validate-time

# 快速功能测试
yarn test-quick
```

### 第四步：性能测试

```bash
# 快速性能检查
yarn test-performance-quick

# 完整性能测试 (可选)
yarn test-performance
```

### 第五步：启动服务

```bash
# 生产环境启动
yarn start

# 或使用 PM2 进程管理
npm install -g pm2
pm2 start yarn --name "agentic-search" -- start
```

## 🏢 生产环境配置

### 使用 PM2 进程管理

创建 `ecosystem.config.js`:

```javascript
module.exports = {
  apps: [{
    name: 'agentic-search',
    script: 'yarn',
    args: 'start',
    instances: 1,
    exec_mode: 'fork',
    watch: false,
    max_memory_restart: '2G',
    env: {
      NODE_ENV: 'production',
      PORT: 3000
    },
    error_file: '/var/log/agentic-search/err.log',
    out_file: '/var/log/agentic-search/out.log',
    log_file: '/var/log/agentic-search/combined.log',
    time: true
  }]
};
```

启动服务：

```bash
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

### 使用 Docker 部署

创建 `Dockerfile`:

```dockerfile
FROM node:18-alpine

# 安装系统依赖
RUN apk add --no-cache \
    chromium \
    nss \
    freetype \
    freetype-dev \
    harfbuzz \
    ca-certificates \
    ttf-freefont

# 设置 Puppeteer 使用系统 Chromium
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

WORKDIR /app

# 复制包文件
COPY package*.json yarn.lock ./

# 安装依赖
RUN yarn install --production

# 复制应用代码
COPY . .

# 构建应用
RUN yarn build

# 创建非 root 用户
RUN addgroup -g 1001 -S nodejs
RUN adduser -S agentic -u 1001

# 切换到非 root 用户
USER agentic

EXPOSE 3000

CMD ["yarn", "start"]
```

创建 `docker-compose.yml`:

```yaml
version: '3.8'

services:
  agentic-search:
    build: .
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - DEEPSEEK_API_KEY=${DEEPSEEK_API_KEY}
      - GITHUB_TOKEN=${GITHUB_TOKEN}
    volumes:
      - ./logs:/var/log/agentic-search
    restart: unless-stopped
    deploy:
      resources:
        limits:
          memory: 4G
        reservations:
          memory: 2G

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data
    restart: unless-stopped

volumes:
  redis_data:
```

## 📊 监控和日志

### 应用监控

```bash
# PM2 监控
pm2 monit

# 查看日志
pm2 logs agentic-search

# 查看状态
pm2 status
```

### 系统监控

创建 `monitoring.sh`:

```bash
#!/bin/bash

# 系统资源监控
echo "=== 系统资源使用情况 ==="
echo "CPU 使用率:"
top -bn1 | grep "Cpu(s)" | awk '{print $2}' | awk -F'%' '{print $1"%"}'

echo "内存使用率:"
free | grep Mem | awk '{printf("%.2f%%\n", $3/$2 * 100.0)}'

echo "磁盘使用率:"
df -h | grep -vE '^Filesystem|tmpfs|cdrom' | awk '{print $5 " " $1}'

# 应用状态检查
echo "=== 应用状态 ==="
curl -f http://localhost:3000/health || echo "应用健康检查失败"

# 进程检查
echo "=== 进程状态 ==="
pm2 jlist | jq '.[0] | {name: .name, status: .pm2_env.status, memory: .monit.memory, cpu: .monit.cpu}'
```

### 日志管理

```bash
# 日志轮转配置 (/etc/logrotate.d/agentic-search)
/var/log/agentic-search/*.log {
    daily
    missingok
    rotate 30
    compress
    delaycompress
    notifempty
    create 644 agentic agentic
    postrotate
        pm2 reloadLogs
    endscript
}
```

## 🔧 性能优化

### 内存优化

```bash
# Node.js 内存优化
export NODE_OPTIONS="--max-old-space-size=4096 --optimize-for-size"

# 垃圾回收优化
export NODE_OPTIONS="$NODE_OPTIONS --gc-interval=100"
```

### 浏览器优化

```javascript
// 在生产环境配置中
{
  browserPoolSize: 8,
  browserHeadless: true,
  browserTimeout: 60000,
  browserUserAgentRotation: true
}
```

### 缓存优化

如果使用 Redis：

```bash
# Redis 配置优化
echo "maxmemory 1gb" >> /etc/redis/redis.conf
echo "maxmemory-policy allkeys-lru" >> /etc/redis/redis.conf
```

## 🛡️ 安全配置

### 环境变量安全

```bash
# 设置文件权限
chmod 600 .env

# 仅限应用用户访问
chown agentic:agentic .env
```

### 网络安全

```bash
# 防火墙配置
ufw allow 3000/tcp  # 应用端口
ufw allow 22/tcp    # SSH
ufw enable
```

### HTTPS 配置

使用 Nginx 反向代理：

```nginx
server {
    listen 443 ssl http2;
    server_name yourdomain.com;

    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

## 🔄 更新和维护

### 自动更新脚本

创建 `update.sh`:

```bash
#!/bin/bash

echo "🔄 开始更新 Agentic Search..."

# 备份当前版本
cp .env .env.backup

# 拉取最新代码
git pull origin main

# 安装依赖
yarn install

# 构建应用
yarn build

# 验证配置
yarn config-validate

# 快速测试
yarn test-quick

# 重启服务
pm2 restart agentic-search

echo "✅ 更新完成！"
```

### 健康检查脚本

创建 `health-check.sh`:

```bash
#!/bin/bash

# 执行健康检查
yarn config-health

# 检查进程状态
if ! pm2 list | grep -q "agentic-search.*online"; then
    echo "❌ 应用进程异常，尝试重启..."
    pm2 restart agentic-search
fi

# 检查内存使用
MEMORY_USAGE=$(pm2 jlist | jq '.[0].monit.memory // 0')
if [ "$MEMORY_USAGE" -gt 2147483648 ]; then  # 2GB
    echo "⚠️ 内存使用过高 (${MEMORY_USAGE} bytes)，重启应用..."
    pm2 restart agentic-search
fi
```

### 定期维护任务

添加到 crontab：

```bash
# 编辑 crontab
crontab -e

# 添加任务
# 每小时执行健康检查
0 * * * * /path/to/health-check.sh

# 每天凌晨 2 点清理日志
0 2 * * * find /var/log/agentic-search -name "*.log" -mtime +7 -delete

# 每周一凌晨 3 点重启服务
0 3 * * 1 pm2 restart agentic-search
```

## 🆘 故障排除

### 常见问题

1. **浏览器启动失败**
   ```bash
   # 检查浏览器依赖
   npx playwright install-deps
   
   # 检查权限
   ls -la /usr/bin/chromium-browser
   ```

2. **内存不足**
   ```bash
   # 检查内存使用
   free -h
   
   # 增加 swap 空间
   sudo fallocate -l 2G /swapfile
   sudo chmod 600 /swapfile
   sudo mkswap /swapfile
   sudo swapon /swapfile
   ```

3. **API 限制**
   ```bash
   # 检查 API 配额
   curl -H "Authorization: Bearer $DEEPSEEK_API_KEY" https://api.deepseek.com/quota
   ```

### 应急恢复

```bash
# 快速重启
pm2 restart agentic-search

# 强制重启
pm2 delete agentic-search
pm2 start ecosystem.config.js

# 回滚到备份配置
cp .env.backup .env
pm2 restart agentic-search
```

## 📞 技术支持

- **配置问题**: 运行 `yarn config-report` 生成详细报告
- **性能问题**: 运行 `yarn test-performance-quick` 诊断
- **日志分析**: 查看 `/var/log/agentic-search/` 目录
- **监控数据**: 访问 PM2 监控面板

---

**🔥 部署成功后，你将拥有一个高性能的 AI 驱动搜索系统！**