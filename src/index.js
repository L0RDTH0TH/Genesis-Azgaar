/**
 * =============================================================================
 * index.js
 * Desc: Public API exports for Azgaar Genesis Mythos fork
 * Author: Lordthoth (based on original by Azgaar)
 * =============================================================================
 */

// Public API - stateful generator functions
export {
  initGenerator,
  loadOptions,
  generateMap,
  generateLocal,    // Phase 4: Local Voronoi generation within dual grid cells
  getMapData,
  renderPreviewSVG, // Legacy API (for backward compatibility)
  renderToCanvas,   // Phase 1: Canvas rendering
  renderToSVG,      // Phase 1: Enhanced SVG rendering (interactive/layers)
  renderPreview,    // Phase 1: Unified render function
  registerCellClickHandler, // Phase 6: Register callback for cell clicks
  loadMapData,
  resetGeneratorState,
} from './generator.js';

// Utility exports (for advanced usage)
export { getDefaultOptions, mergeOptions } from './options.js';
export { RNG } from './utils/rng.js';

// Re-export core modules for advanced usage
export * from './core/index.js';
