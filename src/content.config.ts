import { defineCollection, z } from "astro:content";
import { glob } from "astro/loaders";
import type { ValidUrl } from "./types";

// TODO: filter files
const newsletters = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./src/newsletters" }),
  schema: z.object({
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
  }),
});

export const collections = { newsletters };
