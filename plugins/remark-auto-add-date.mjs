import fs from "fs/promises";

export function remarkAutoAddDate() {
  return async function transformer(tree, file) {
    // 获取文件的创建时间
    try {
      const stats = await fs.stat(file.history[0]);
      const createDate = stats.birthtime;

      // 检查是否已存在 frontmatter
      if (!file.data.astro?.frontmatter) {
        file.data.astro = { frontmatter: {} };
      }

      // 只在 frontmatter 中没有 date 字段时添加
      if (!file.data.astro.frontmatter.date) {
        file.data.astro.frontmatter.date = createDate;
      }
    } catch (error) {
      console.warn("无法获取文件创建时间: ", error);
    }
  };
}
