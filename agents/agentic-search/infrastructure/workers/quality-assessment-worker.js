/**
 * Quality Assessment Worker
 * 使用 AStack DeepSeek 组件进行内容质量评估和过滤
 */

const { ModelProvider } = require('@astack-tech/integrations');

/**
 * 执行质量评估
 */
async function qualityAssessment(taskData) {
  const { 
    contents,
    strategy,
    qualityThreshold = 0.6,
    deepseekApiKey,
    batchSize = 3
  } = taskData;

  console.log(`✨ Quality Assessment Worker 开始评估: ${contents.length} 个内容`);

  const results = [];
  const assessments = [];

  try {
    // 初始化 AStack DeepSeek 组件
    const deepseek = new ModelProvider.Deepseek({
      apiKey: deepseekApiKey || process.env.DEEPSEEK_API_KEY,
      model: 'deepseek-chat',
      temperature: 0.2,
      systemPrompt: `你是一个专业的内容质量评估专家。你的任务是客观评估内容的质量，包括相关性、可信度、时效性、独特性和互动性。

评分标准：
- 相关性 (0-1)：内容与搜索关键字的匹配度
- 可信度 (0-1)：来源的权威性和内容的可靠性  
- 时效性 (0-1)：内容的新鲜度和时间相关性
- 独特性 (0-1)：内容的原创性和独特见解
- 互动性 (0-1)：内容的参与度和影响力

请严格按照 JSON 格式输出评估结果。`
    });

    // 分批处理内容
    for (let i = 0; i < contents.length; i += batchSize) {
      const batch = contents.slice(i, i + batchSize);
      console.log(`📊 评估批次 ${Math.floor(i / batchSize) + 1}/${Math.ceil(contents.length / batchSize)}`);

      const batchAssessments = await Promise.all(
        batch.map(content => assessContentQuality(deepseek, content, strategy))
      );

      const validAssessments = batchAssessments.filter(assessment => assessment !== null);
      assessments.push(...validAssessments);

      // 根据质量阈值过滤内容
      for (const assessment of validAssessments) {
        if (assessment.overallScore >= qualityThreshold) {
          // 找到对应的原始内容并添加质量信息
          const originalContent = batch.find(c => 
            (c.id && c.id === assessment.contentId) || 
            (c.title === assessment.contentTitle)
          );
          
          if (originalContent) {
            results.push({
              ...originalContent,
              qualityScore: assessment.overallScore,
              qualityAssessment: assessment,
              passedFilter: true
            });
          }
        }
      }

      // 批次间延迟
      if (i + batchSize < contents.length) {
        await new Promise(resolve => setTimeout(resolve, 1500));
      }
    }

    // 计算过滤统计
    const filteringStats = {
      totalInputs: contents.length,
      passedFilter: results.length,
      rejectedCount: contents.length - results.length,
      averageScore: assessments.length > 0 ? 
        assessments.reduce((sum, a) => sum + a.overallScore, 0) / assessments.length : 0,
      qualityThreshold
    };

    // 生成改进建议
    const recommendations = generateRecommendations(assessments, strategy);

    console.log(`✅ 质量评估完成: ${results.length}/${contents.length} 通过过滤`);

    return {
      success: true,
      filteredContents: results,
      qualityAssessments: assessments,
      filteringStats,
      recommendations,
      metadata: {
        timestamp: new Date(),
        source: 'quality-assessment-worker'
      }
    };

  } catch (error) {
    console.error('❌ 质量评估失败:', error);
    
    return {
      success: false,
      error: error.message,
      filteredContents: [],
      qualityAssessments: [],
      filteringStats: { totalInputs: contents.length, passedFilter: 0 },
      recommendations: [],
      metadata: {
        timestamp: new Date(),
        source: 'quality-assessment-worker'
      }
    };
  }
}

/**
 * 评估单个内容的质量
 */
async function assessContentQuality(deepseek, content, strategy) {
  try {
    const { title, content: text, url, source, timestamp } = content;
    
    // 生成质量评估提示
    const prompt = generateQualityPrompt(title, text, source, strategy);
    
    const assessmentText = await deepseek.generateCompletion(prompt);
    const assessment = JSON.parse(assessmentText);

    // 计算总体得分
    const scores = assessment.scores;
    const overallScore = (
      scores.relevance * 0.3 +
      scores.credibility * 0.25 +
      scores.freshness * 0.2 +
      scores.uniqueness * 0.15 +
      scores.engagement * 0.1
    );

    return {
      contentId: content.id || generateContentId(content),
      contentTitle: title,
      scores,
      overallScore: Math.round(overallScore * 100) / 100,
      aiAnalysis: assessment.aiAnalysis,
      timestamp: new Date()
    };

  } catch (error) {
    console.error(`质量评估失败: ${content.title}`, error.message);
    return null;
  }
}

/**
 * 生成质量评估提示
 */
function generateQualityPrompt(title, text, source, strategy) {
  const searchFocus = strategy?.searchFocus?.join(', ') || '通用';
  const expectedTypes = strategy?.expectedContentTypes?.join(', ') || '全部';
  
  return `请评估以下内容的质量：

标题: ${title}
来源: ${source}
内容: ${text.substring(0, 800)}${text.length > 800 ? '...' : ''}

搜索重点: ${searchFocus}
期望内容类型: ${expectedTypes}

请提供 JSON 格式的质量评估：
{
  "scores": {
    "relevance": 0.85,
    "credibility": 0.90,
    "freshness": 0.75,
    "uniqueness": 0.80,
    "engagement": 0.70
  },
  "aiAnalysis": {
    "summary": "内容概述（1-2 句话）",
    "keyInsights": ["关键洞察1", "关键洞察2", "关键洞察3"],
    "recommendationLevel": "must-include|recommended|optional|exclude",
    "reasoning": "推荐理由详细说明（为什么给出这个推荐等级）"
  }
}

评估要点：
1. 相关性：内容是否与搜索关键字和期望主题高度相关
2. 可信度：来源是否权威，内容是否可靠，有无明显错误
3. 时效性：内容是否新鲜，时间是否相关
4. 独特性：是否提供独特见解，避免重复内容
5. 互动性：内容是否有吸引力，能引起读者兴趣`;
}

/**
 * 生成改进建议
 */
function generateRecommendations(assessments, strategy) {
  const recommendations = {
    searchGaps: [],
    qualityImprovements: [],
    nextActions: []
  };

  if (assessments.length === 0) {
    recommendations.searchGaps.push('没有获得任何质量评估结果');
    recommendations.nextActions.push('检查搜索关键字和数据源配置');
    return recommendations;
  }

  // 分析得分分布
  const avgScores = {
    relevance: assessments.reduce((sum, a) => sum + a.scores.relevance, 0) / assessments.length,
    credibility: assessments.reduce((sum, a) => sum + a.scores.credibility, 0) / assessments.length,
    freshness: assessments.reduce((sum, a) => sum + a.scores.freshness, 0) / assessments.length,
    uniqueness: assessments.reduce((sum, a) => sum + a.scores.uniqueness, 0) / assessments.length,
    engagement: assessments.reduce((sum, a) => sum + a.scores.engagement, 0) / assessments.length
  };

  // 识别薄弱环节
  if (avgScores.relevance < 0.7) {
    recommendations.qualityImprovements.push('搜索关键字相关性需要优化');
    recommendations.nextActions.push('重新评估关键字策略，增加更精确的搜索词');
  }

  if (avgScores.credibility < 0.7) {
    recommendations.qualityImprovements.push('内容来源可信度偏低');
    recommendations.nextActions.push('增加权威网站和官方来源的搜索权重');
  }

  if (avgScores.freshness < 0.7) {
    recommendations.qualityImprovements.push('内容时效性不足');
    recommendations.nextActions.push('缩短时间窗口，增加实时搜索频率');
  }

  if (avgScores.uniqueness < 0.6) {
    recommendations.qualityImprovements.push('内容重复性较高');
    recommendations.nextActions.push('增加去重算法，扩展搜索范围');
  }

  if (avgScores.engagement < 0.6) {
    recommendations.qualityImprovements.push('内容互动性和吸引力不足');
    recommendations.nextActions.push('优化搜索查询，关注热门和趋势内容');
  }

  // 识别内容空白
  const mustIncludeCount = assessments.filter(a => 
    a.aiAnalysis.recommendationLevel === 'must-include'
  ).length;

  const recommendedCount = assessments.filter(a => 
    a.aiAnalysis.recommendationLevel === 'recommended'
  ).length;

  if (mustIncludeCount < 3) {
    recommendations.searchGaps.push('缺少必须包含的高质量内容');
  }

  if (recommendedCount < 5) {
    recommendations.searchGaps.push('推荐级别内容数量不足');
  }

  return recommendations;
}

/**
 * 生成内容 ID
 */
function generateContentId(content) {
  const hash = require('crypto')
    .createHash('md5')
    .update(content.title + content.url)
    .digest('hex');
  return hash.substring(0, 12);
}

// Piscina Worker 入口
module.exports = qualityAssessment;