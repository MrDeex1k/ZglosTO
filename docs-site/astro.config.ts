import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import nimbus, { defineConfig as defineNimbusConfig } from '@cloudflare/nimbus-docs';
import { tableScroll } from '@cloudflare/nimbus-docs/markdown';

const nimbusConfig = defineNimbusConfig({
  site: process.env.PUBLIC_SITE_URL || 'http://localhost:1235',
  title: 'ZgłosTO Docs',
  description: 'Interaktywna dokumentacja techniczna i operacyjna ZgłosTO.',
  locale: 'pl',
  github: null,
  socialImageAlt: 'Podgląd dokumentacji ZgłosTO',
});

export default defineConfig({
  output: 'static',
  base: '/docs/',
  vite: {
    plugins: [tailwindcss()],
  },
  prefetch: {
    prefetchAll: true,
    defaultStrategy: 'hover',
  },
  integrations: [
    nimbus(nimbusConfig, {
      rules: {
        'nimbus/frontmatter-shape': 'error',
        'nimbus/internal-link': 'error',
      },
      markdown: {
        hastPlugins: [tableScroll()],
      },
    }),
  ],
});
