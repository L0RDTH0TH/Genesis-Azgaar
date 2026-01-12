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
  generatePartial, // Partial generation: run only specific phases
  getMapData,
  renderPreview, // DEPRECATED: Use renderPreviewSVG() or renderToSVG() instead
  renderPreviewSVG, // Primary rendering method (SVG) - appends to container or returns string
  renderToSVG, // Convenience function - always returns SVG string
  loadMapData,
  PHASES, // Phase constants for partial generation support
} from './generator.js';

// Utility exports (for advanced usage)
export { getDefaultOptions, mergeOptions } from './options.js';
export { RNG } from './utils/rng.js';

// Render configuration exports
export { 
  getDefaultRenderConfig, 
  getOriginalRenderConfig, 
  mergeRenderConfig 
} from './rendering/config.js';

// Re-export core modules for advanced usage
export * from './core/index.js';

// Template utilities
export { getTemplate, listTemplates } from './core/heightmap-templates.js';
