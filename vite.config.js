import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    lib: {
      entry: 'src/index.js',
      name: 'AzgaarLibrary',
      fileName: (format) => `azgaar-library.${format}.js`,
      formats: ['es', 'umd']
    },
    rollupOptions: {
      output: {
        dir: 'dist'
      }
    },
    outDir: 'dist'
  }
});
