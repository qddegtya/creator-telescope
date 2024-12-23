// @ts-check
import { defineConfig } from 'astro/config';

// https://astro.build/config
export default defineConfig({
  output: "static",
  site: "https://ct-weekly.xiaoa.name",
  redirects: {
    '/newsletter': '/newsletter/1'
  }
});
