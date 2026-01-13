import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        'content-script': resolve(__dirname, 'src/content/index.js'),
        'service-worker': resolve(__dirname, 'src/background/service-worker.js'),
        'popup': resolve(__dirname, 'popup/popup.js'),
      },
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: 'chunks/[name]-[hash].js',
        assetFileNames: 'assets/[name][extname]',
        format: 'es',
        // Inline all imports for content scripts (Chrome doesn't support dynamic imports in content scripts)
        inlineDynamicImports: false,
      },
    },
    // Don't minify for easier debugging during development
    minify: false,
    sourcemap: true,
  },
});

