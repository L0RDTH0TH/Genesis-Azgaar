import { defineConfig } from 'vite';

export default defineConfig(({ mode }) => {
  const isMinified = mode === 'minified';
  
  return {
    build: {
      lib: {
        entry: 'src/index.js',
        name: 'AzgaarGenesis',
        fileName: (format) => {
          if (format === 'umd') {
            return isMinified ? 'azgaar-genesis.min.js' : 'azgaar-genesis.umd.js';
          }
          if (format === 'es') {
            return 'azgaar-genesis.esm.js';
          }
          return `azgaar-genesis.${format}.js`;
        },
        formats: isMinified ? ['umd'] : ['umd', 'es']
      },
      rollupOptions: {
        // Externalize peer dependencies (not bundled)
        external: ['d3', 'delaunator'],
        output: {
          dir: 'dist',
          // Provide global variable names for UMD
          globals: {
            'd3': 'd3',
            'delaunator': 'Delaunator'
          },
        }
      },
      outDir: 'dist',
      minify: isMinified ? 'esbuild' : false,
      sourcemap: !isMinified, // Source maps for non-minified builds
      emptyOutDir: !isMinified, // Don't clean dist when building minified (preserve UMD/ESM)
    }
  };
});
