import { defineCollection, z } from "astro:content";
import { glob } from "astro/loaders";

// TODO: filter files
const newsletters = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./src/newsletters" }),
  schema: z.object({
    title: z.string(),
    summary: z.string(),
  }),
});

export const collections = { newsletters };
