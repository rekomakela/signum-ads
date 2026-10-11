import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
  preprocess: vitePreprocess(),
  kit: {
    adapter: adapter(),
    // CI (pages.yml) sets SIGNUM_BASE_PATH for project pages. Local builds
    // and custom-domain deployments use the domain root (empty base).
    paths: {
      base: process.env.SIGNUM_BASE_PATH ?? '',
    },
  },
};

export default config;
