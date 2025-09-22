/**
 * Content Analysis Worker
 * 使用 AStack DeepSeek 组件进行内容分析和语义理解
 */

const { ModelProvider } = require('@astack-tech/integrations');

/**
 * 执行内容分析
 */
async function contentAnalysis(taskData) {
  const { 
    contents,
    analysisType = 'comprehensive', // 'comprehensive', 'sentiment', 'keywords', 'summary'
    deepseekApiKey,
    batchSize = 5
  } = taskData;

  console.log(`🧠 Content Analysis Worker 开始分析: ${contents.length} 个内容`);

  const results = [];

  try {
    // 初始化 AStack DeepSeek 组件
    const deepseek = new ModelProvider.Deepseek({
      apiKey: deepseekApiKey || process.env.DEEPSEEK_API_KEY,
      model: 'deepseek-chat',
      temperature: 0.3,
      systemPrompt: '你是一个专业的内容分析专家，擅长语义理解、情感分析和关键信息提取。请按照要求的格式输出 JSON 结果。'
    });

    // 分批处理内容
    for (let i = 0; i < contents.length; i += batchSize) {
      const batch = contents.slice(i, i + batchSize);
      console.log(`📊 处理批次 ${Math.floor(i / batchSize) + 1}/${Math.ceil(contents.length / batchSize)}`);

      const batchResults = await Promise.all(
        batch.map(content => analyzeContent(deepseek, content, analysisType))
      );

      results.push(...batchResults.filter(result => result !== null));

      // 批次间延迟，避免 API 限制
      if (i + batchSize < contents.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    console.log(`✅ 内容分析完成，处理了 ${results.length} 个内容`);

    return {
      success: true,
      results,
      metadata: {
        totalContents: contents.length,
        processedContents: results.length,
        analysisType,
        timestamp: new Date(),
        source: 'content-analysis-worker'
      }
    };

  } catch (error) {
    console.error('❌ 内容分析失败:', error);
    
    return {
      success: false,
      error: error.message,
      results: [],
      metadata: {
        timestamp: new Date(),
        source: 'content-analysis-worker'
      }
    };
  }
}

/**
 * 分析单个内容
 */
async function analyzeContent(deepseek, content, analysisType) {
  try {
    const { title, content: text, url, source } = content;
    
    // 生成分析提示
    const prompt = generateAnalysisPrompt(title, text, analysisType);
    
    const analysisText = await deepseek.generateCompletion(prompt);
    const analysis = JSON.parse(analysisText);

    return {
      contentId: content.id || generateContentId(content),
      title,
      url,
      source,
      analysis,
      timestamp: new Date()
    };

  } catch (error) {
    console.error(`内容分析失败: ${content.title}`, error.message);
    return null;
  }
}

/**
 * 生成分析提示
 */
function generateAnalysisPrompt(title, text, analysisType) {
  const baseText = `标题: ${title}\n内容: ${text.substring(0, 1000)}${text.length > 1000 ? '...' : ''}`;

  switch (analysisType) {
    case 'comprehensive':
      return `请对以下内容进行全面分析：

${baseText}

请提供 JSON 格式的分析结果：
{
  "summary": "内容摘要（1-2 句话）",
  "keyPoints": ["关键点1", "关键点2", "关键点3"],
  "keywords": ["关键词1", "关键词2", "关键词3"],
  "sentiment": "positive|neutral|negative",
  "topics": ["主题1", "主题2"],
  "relevanceScore": 0.85,
  "freshness": "high|medium|low",
  "credibility": "high|medium|low",
  "insights": ["洞察1", "洞察2"]
}`;

    case 'sentiment':
      return `请分析以下内容的情感倾向：

${baseText}

请提供 JSON 格式的情感分析结果：
{
  "sentiment": "positive|neutral|negative",
  "confidence": 0.85,
  "emotions": ["excitement", "optimism"],
  "reasoning": "分析原因"
}`;

    case 'keywords':
      return `请提取以下内容的关键词和主题：

${baseText}

请提供 JSON 格式的关键词分析结果：
{
  "keywords": ["关键词1", "关键词2", "关键词3"],
  "entities": ["实体1", "实体2"],
  "topics": ["主题1", "主题2"],
  "categories": ["分类1", "分类2"]
}`;

    case 'summary':
      return `请对以下内容进行摘要：

${baseText}

请提供 JSON 格式的摘要结果：
{
  "summary": "详细摘要",
  "bulletPoints": ["要点1", "要点2", "要点3"],
  "mainTopic": "主要话题",
  "conclusion": "结论"
}`;

    default:
      return `请分析以下内容：\n\n${baseText}\n\n请提供 JSON 格式的分析结果。`;
  }
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
module.exports = contentAnalysis;