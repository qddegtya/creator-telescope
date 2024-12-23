import { defineCollection, z } from "astro:content";
import { glob } from "astro/loaders";
import type { ValidUrl } from "./types";

// TODO: filter files
const newsletters = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./src/newsletters" }),
  schema: z
    .object({
      date: z.date().optional(),
      summary: z.string(),
      contentList: z.array(
        z.object({
          // TODO: regex ?
          teaser: z.custom<ValidUrl>(),
          link: z.custom<ValidUrl>(),
          description: z.string(),
          title: z.string(),
        })
      ),
    })
    .transform((data) => {
      // 如果 remark 插件已经添加了 date，就使用那个 date
      if (data.date) {
        return data;
      }

      // 只有在 remark 插件没有成功添加 date 时，才添加新的 date
      return {
        ...data,
        date: new Date(),
      };
    }),
});

export const collections = { newsletters };
