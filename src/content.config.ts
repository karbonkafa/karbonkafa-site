import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const news = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/news' }),
  schema: z.object({
    title: z.string(),
    date: z.coerce.date(),
    category: z.enum(['Duyuru', 'Çıkış', 'Donanım', 'Endüstri', 'Bağımsız', 'Haftalık']),
    tags: z.array(z.string()).default([]),
    source: z.string(),
    sourceUrl: z.string().url().optional(),
    excerpt: z.string(),
    image: z.string().url().optional(),
  }),
});

export const collections = { news };
