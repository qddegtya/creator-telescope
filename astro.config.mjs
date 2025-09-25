// @ts-check
import { defineConfig } from "astro/config";
import { remarkAutoAddDate } from "./plugins/remark-auto-add-date.mjs";
import remarkGfm from "remark-gfm";
import remarkEmoji from "remark-emoji";
import remarkBreaks from "remark-breaks";

// https://astro.build/config
export default defineConfig({
  output: "static",
  site: "https://ct-weekly.xiaoa.name",
  markdown: {
    remarkPlugins: [
      remarkAutoAddDate,
      remarkGfm,        // GitHub Flavored Markdown
      remarkEmoji,      // Emoji 支持
      remarkBreaks      // 换行支持
    ],
    rehypePlugins: [],
    extendDefaultPlugins: true,
    syntaxHighlight: 'prism',
    shikiConfig: {
      theme: 'github-light',
      wrap: true
    }
  },
});
