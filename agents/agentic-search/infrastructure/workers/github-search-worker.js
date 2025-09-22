/**
 * GitHub Search Worker
 * 使用官方 Octokit API 进行高效搜索
 */

const { Octokit } = require('@octokit/rest');

/**
 * 执行 GitHub 搜索
 */
async function githubSearch(taskData) {
  const { 
    keywords,
    languages = [],
    maxResults = 10,
    filters = {
      minStars: 10,
      maxAge: '1y',
      hasReadme: true,
      hasLicense: false
    },
    searchScope = ['repositories', 'code'],
    githubToken
  } = taskData;

  console.log(`🐙 GitHub Worker 开始搜索: ${keywords.length} 个关键字`);

  const results = [];

  try {
    // 初始化 Octokit 客户端
    const octokit = new Octokit({
      auth: githubToken || process.env.GITHUB_TOKEN,
      userAgent: 'agentic-search/1.0.0'
    });

    // 处理每个关键字
    for (const keyword of keywords) {
      try {
        console.log(`📝 GitHub 搜索: ${keyword}`);

        // 搜索仓库
        if (searchScope.includes('repositories')) {
          const repoResults = await searchRepositories(octokit, keyword, languages, filters, Math.ceil(maxResults / 2));
          results.push(...repoResults);
        }

        // 搜索代码
        if (searchScope.includes('code')) {
          const codeResults = await searchCode(octokit, keyword, languages, Math.floor(maxResults / 2));
          results.push(...codeResults);
        }

        // API 请求间延迟，避免触发限制
        if (keywords.indexOf(keyword) < keywords.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }

      } catch (keywordError) {
        console.error(`❌ GitHub 关键字搜索失败: ${keyword}`, keywordError.message);
        // 继续处理下一个关键字
      }
    }

    console.log(`✅ GitHub 搜索完成，总计 ${results.length} 个结果`);

    return {
      success: true,
      results,
      metadata: {
        totalKeywords: keywords.length,
        totalResults: results.length,
        searchScope,
        filters,
        timestamp: new Date(),
        source: 'github-worker'
      }
    };

  } catch (error) {
    console.error('❌ GitHub 搜索失败:', error);
    
    return {
      success: false,
      error: error.message,
      results: [],
      metadata: {
        timestamp: new Date(),
        source: 'github-worker'
      }
    };
  }
}

/**
 * 搜索 GitHub 仓库
 */
async function searchRepositories(octokit, keyword, languages, filters, maxResults) {
  try {
    // 构建搜索查询
    let query = keyword;
    
    // 添加星标过滤
    if (filters.minStars > 0) {
      query += ` stars:>=${filters.minStars}`;
    }
    
    // 添加语言过滤
    if (languages.length > 0) {
      const langFilter = languages.map(lang => `language:${lang}`).join(' ');
      query += ` ${langFilter}`;
    }
    
    // 添加时间过滤
    if (filters.maxAge) {
      const date = getDateFromAge(filters.maxAge);
      if (date) {
        query += ` pushed:>=${date}`;
      }
    }
    
    // 添加其他过滤器
    if (filters.hasReadme) {
      query += ' readme:README';
    }
    
    if (filters.hasLicense) {
      query += ' license:*';
    }

    console.log(`🔍 仓库搜索查询: ${query}`);

    const response = await octokit.rest.search.repos({
      q: query,
      sort: 'stars',
      order: 'desc',
      per_page: Math.min(maxResults, 100)
    });

    const repositories = response.data.items.slice(0, maxResults).map(repo => ({
      title: repo.full_name,
      content: repo.description || '无描述',
      url: repo.html_url,
      source: 'github',
      timestamp: new Date(repo.pushed_at),
      metadata: {
        type: 'repository',
        author: repo.owner.login,
        stars: repo.stargazers_count,
        forks: repo.forks_count,
        language: repo.language,
        license: repo.license?.name || null,
        openIssues: repo.open_issues_count,
        topics: repo.topics || [],
        archived: repo.archived,
        private: repo.private
      }
    }));

    console.log(`✅ 找到 ${repositories.length} 个仓库`);
    return repositories;

  } catch (error) {
    console.error('仓库搜索失败:', error.message);
    return [];
  }
}

/**
 * 搜索 GitHub 代码
 */
async function searchCode(octokit, keyword, languages, maxResults) {
  try {
    // 构建搜索查询
    let query = keyword;
    
    // 添加语言过滤
    if (languages.length > 0) {
      const langFilter = languages.map(lang => `language:${lang}`).join(' ');
      query += ` ${langFilter}`;
    }
    
    // 只搜索公开仓库中的代码
    query += ' in:file';

    console.log(`🔍 代码搜索查询: ${query}`);

    const response = await octokit.rest.search.code({
      q: query,
      sort: 'indexed',
      order: 'desc',
      per_page: Math.min(maxResults, 100)
    });

    const codeResults = response.data.items.slice(0, maxResults).map(item => ({
      title: `${item.repository.full_name}/${item.name}`,
      content: item.text_matches?.map(match => match.fragment).join('\n') || '代码片段',
      url: item.html_url,
      source: 'github',
      timestamp: new Date(), // 代码搜索没有明确的时间戳
      metadata: {
        type: 'code',
        fileName: item.name,
        filePath: item.path,
        repository: item.repository.full_name,
        repositoryUrl: item.repository.html_url,
        repositoryStars: item.repository.stargazers_count || 0,
        language: item.repository.language,
        score: item.score
      }
    }));

    console.log(`✅ 找到 ${codeResults.length} 个代码结果`);
    return codeResults;

  } catch (error) {
    console.error('代码搜索失败:', error.message);
    return [];
  }
}

/**
 * 从年龄字符串解析日期
 */
function getDateFromAge(ageString) {
  const now = new Date();
  const match = ageString.match(/^(\d+)([ywdhm])$/);
  
  if (!match) return null;
  
  const amount = parseInt(match[1]);
  const unit = match[2];
  
  switch (unit) {
    case 'y': // 年
      return new Date(now.getFullYear() - amount, now.getMonth(), now.getDate()).toISOString().split('T')[0];
    case 'w': // 周
      return new Date(now.getTime() - amount * 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    case 'd': // 天
      return new Date(now.getTime() - amount * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    case 'h': // 小时
      return new Date(now.getTime() - amount * 60 * 60 * 1000).toISOString().split('T')[0];
    case 'm': // 分钟
      return new Date(now.getTime() - amount * 60 * 1000).toISOString().split('T')[0];
    default:
      return null;
  }
}

// Piscina Worker 入口
module.exports = githubSearch;