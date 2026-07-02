// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

// https://astro.build/config
export default defineConfig({
  site: 'https://neuromancer.in',
  // static output is the default; declared for clarity.
  output: 'static',
  integrations: [sitemap()],
  build: {
    // ~19KB of CSS total: inlining removes the render-blocking request
    // (single-page site, no cross-page cache benefit to a separate file).
    inlineStylesheets: 'always',
  },
});
