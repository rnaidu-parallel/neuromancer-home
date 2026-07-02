// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

// https://astro.build/config
export default defineConfig({
  site: 'https://neuromancer.in',
  // static output is the default; declared for clarity.
  output: 'static',
  integrations: [sitemap()],
});
