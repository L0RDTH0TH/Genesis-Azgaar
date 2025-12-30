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
  getMapData,
  renderPreview,
  renderPreviewSVG,
  loadMapData,
} from './generator.js';

// Utility exports (for advanced usage)
export { getDefaultOptions, mergeOptions } from './options.js';
export { RNG } from './utils/rng.js';

// Re-export core modules for advanced usage
export * from './core/index.js';
