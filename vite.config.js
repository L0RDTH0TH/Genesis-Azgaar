import { defineConfig } from 'vite';

export default defineConfig(({ mode }) => {
  const isMinified = mode === 'minified';
  
  return {
    build: {
      lib: {
        entry: 'src/index.js',
        name: 'AzgaarGenesis',
        fileName: (format) => {
          if (format === 'es') {
            return isMinified ? 'azgaar-genesis.min.js' : 'azgaar-genesis.esm.js';
          }
          if (format === 'umd') {
            return isMinified ? 'azgaar-genesis.min.js' : 'azgaar-genesis.umd.js';
          }
          return `azgaar-genesis.${format}.js`;
        },
        // Output ESM for browser/WebView embedding, UMD for compatibility
        formats: isMinified ? ['es'] : ['es', 'umd']
      },
      rollupOptions: {
        // Externalize Delaunator (required peer dependency)
        // User must provide Delaunator separately in WebView
        external: ['delaunator'],
        output: {
          dir: 'dist',
          // Preserve module exports for ESM version
          globals: {
            'delaunator': 'Delaunator'
          }
        }
      },
      outDir: 'dist',
      minify: isMinified ? 'esbuild' : false,
      sourcemap: !isMinified, // Source maps for non-minified builds
      emptyOutDir: !isMinified, // Don't clean dist when building minified (preserve ESM)
    }
  };
});
