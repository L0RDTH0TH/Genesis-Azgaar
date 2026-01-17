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
  resetGeneratorState,
  exportRenderData,
  getRenderer,
} from './generator.js';

// Utility exports (for advanced usage)
export { getDefaultOptions, mergeOptions } from './options.js';
export { RNG } from './utils/rng.js';

// Re-export core modules for advanced usage
export * from './core/index.js';

// Re-export renderers for advanced usage
export { Canvas2DRenderer } from './rendering/canvas2d.js';
export { PixiRenderer } from './rendering/webgl.js';
export { Renderer } from './rendering/renderer-interface.js';
