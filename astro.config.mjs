// @ts-check
import { defineConfig } from 'astro/config';

import cloudflare from '@astrojs/cloudflare';

import tailwindcss from '@tailwindcss/vite';

// https://astro.build/config
export default defineConfig({
  output: 'server',
  adapter: cloudflare({
    // O dashboard não processa imagens; evita provisionar o binding "IMAGES" à toa.
    imageService: 'passthrough'
  }),

  vite: {
    plugins: [tailwindcss()]
  }
});