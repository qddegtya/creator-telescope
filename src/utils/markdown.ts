import { remark } from 'remark';
import remarkGfm from 'remark-gfm';
import remarkEmoji from 'remark-emoji';
import remarkBreaks from 'remark-breaks';
import remarkHtml from 'remark-html';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize from 'rehype-sanitize';

// 创建markdown处理器实例
const processor = remark()
  .use(remarkGfm) // GitHub Flavored Markdown支持
  .use(remarkEmoji) // Emoji支持
  .use(remarkBreaks) // 换行支持
  .use(remarkHtml, { sanitize: false }) // 转换为HTML
  .use(rehypeRaw) // 支持原始HTML
  .use(rehypeSanitize); // 安全清理

/**
 * 解析markdown文本为HTML
 * @param markdown - markdown文本
 * @returns 解析后的HTML字符串
 */
export async function parseMarkdown(markdown: string): Promise<string> {
  if (!markdown) return '';
  
  try {
    const result = await processor.process(markdown);
    return String(result);
  } catch (error) {
    console.error('Markdown parsing error:', error);
    return markdown; // 如果解析失败，返回原文本
  }
}

/**
 * 同步版本的markdown解析 (简化版)
 * 用于在Astro组件中直接使用
 */
export function parseMarkdownSync(text: string): string {
  if (!text) return '';
  
  return text
    // 处理加粗文本 **text** -> <strong>text</strong>
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    // 处理斜体文本 *text* -> <em>text</em>  
    .replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, '<em>$1</em>')
    // 处理链接 [text](url) -> <a href="url" target="_blank" rel="noopener noreferrer">text</a>
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>')
    // 处理行内代码 `code` -> <code>code</code>
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    // 处理换行
    .replace(/\n/g, '<br>')
    // 处理分隔符
    .replace(/\s*\|\s*/g, ' <span class="separator">·</span> ')
    // 处理emoji shortcodes (简单版本)
    .replace(/:([a-z_]+):/g, (match, name) => {
      // 这里可以扩展为完整的emoji映射
      const emojiMap: Record<string, string> = {
        'star': '⭐',
        'fork': '🍴',
        'watch': '👁️',
        'bug': '🐛',
        'heart': '❤️',
        'fire': '🔥',
        'rocket': '🚀'
      };
      return emojiMap[name] || match;
    });
}

/**
 * 提取内容来源信息
 */
export function extractSourceInfo(text: string) {
  const patterns = [
    { regex: /🐙 \*\*GitHub 项目\*\*/i, type: 'github', icon: '🐙', label: 'GitHub 项目' },
    { regex: /🐦 \*\*Twitter 动态\*\*/i, type: 'twitter', icon: '🐦', label: 'Twitter 动态' },
    { regex: /🔍 \*\*搜索发现\*\*/i, type: 'google', icon: '🔍', label: '搜索发现' }
  ];
  
  for (const pattern of patterns) {
    if (pattern.regex.test(text)) {
      return pattern;
    }
  }
  
  return null;
}

/**
 * 提取GitHub项目的元数据
 */
export function extractGitHubMeta(text: string) {
  const starsMatch = text.match(/⭐ (\d+(?:,\d+)*) stars/i);
  const forksMatch = text.match(/🍴 (\d+(?:,\d+)*) forks/i);
  const languageMatch = text.match(/\*\*技术栈\*\*:\s*([^|]+)/i);
  
  return {
    stars: starsMatch ? starsMatch[1] : null,
    forks: forksMatch ? forksMatch[1] : null,
    language: languageMatch ? languageMatch[1].trim() : null
  };
}

/**
 * 提取Twitter动态的元数据
 */
export function extractTwitterMeta(text: string) {
  const likesMatch = text.match(/❤️ (\d+)/i);
  const retweetsMatch = text.match(/🔄 (\d+)/i);
  const repliesMatch = text.match(/💬 (\d+)/i);
  const authorMatch = text.match(/\*\*作者\*\*:\s*(@\w+)/i);
  
  return {
    likes: likesMatch ? likesMatch[1] : null,
    retweets: retweetsMatch ? retweetsMatch[1] : null,
    replies: repliesMatch ? repliesMatch[1] : null,
    author: authorMatch ? authorMatch[1] : null
  };
}

/**
 * 清理和优化描述文本
 */
export function optimizeDescription(text: string): string {
  if (!text) return '';
  
  return text
    // 移除冗余的链接重复 🔗 https://... 🔗 https://...
    .replace(/🔗 (https?:\/\/[^\s]+) 🔗 \1/g, '🔗 $1')
    // 清理过长的README摘要，保留主要信息
    .replace(/📖 \*\*README 摘要\*\*:.*?(?=🔧|\*\*技术栈\*\*|$)/gs, '')
    // 优化技术栈显示，添加换行
    .replace(/🔧 \*\*技术栈\*\*:\s*主要语言:\s*([^|]+)\s*\|\s*标签:\s*([^📊]+)/g, 
             '**技术栈**: $1\n\n**标签**: $2')
    // 简化社区活跃度显示，添加换行
    .replace(/📊 \*\*社区活跃度\*\*:\s*⭐ ([^|]+) \| 🍴 ([^|]+) \| 👁️ ([^🔄]+)/g, 
             '**社区数据**:\n⭐ $1 stars | 🍴 $2 forks')
    // 清理项目状态，提取关键信息
    .replace(/🔄 \*\*项目状态\*\*:\s*🐛 (\d+) open issues.*?📅 最后更新: ([^|]+).*?⚖️ 许可证: ([^🔗]+)/g,
             '**项目状态**: $1 个开放问题 | 更新时间: $2\n**许可证**: $3')
    // 清理重复的相关链接部分
    .replace(/🔗 \*\*相关链接\*\*:.*$/g, '')
    // 清理重复的技术栈和社区信息
    .replace(/\|\s*\*\*技术栈\*\*:.*?\*\*状态\*\*:.*?$/g, '')
    // 添加段落分隔
    .replace(/(\*\*[^*]+\*\*:)/g, '\n$1')
    // 清理多余的空行
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}