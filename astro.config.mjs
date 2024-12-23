// @ts-check
import { defineConfig } from "astro/config";
import { remarkAutoAddDate } from "./plugins/remark-auto-add-date.mjs";

// https://astro.build/config
export default defineConfig({
  output: "static",
  site: "https://ct-weekly.xiaoa.name",
  markdown: {
    remarkPlugins: [remarkAutoAddDate],
  },
});
