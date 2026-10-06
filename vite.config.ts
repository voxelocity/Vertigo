import { defineConfig } from 'vite';

export default defineConfig({
  // Relative asset paths, so `dist/` works both as an itch.io zip upload
  // and under a GitHub Pages subpath without any further config.
  base: './',

  server: {
    open: true,
  },

  build: {
    // mp3s are big; don't warn about them or try to inline anything.
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 2000,
  },
});
