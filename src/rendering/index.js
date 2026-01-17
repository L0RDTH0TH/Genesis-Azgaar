/**
 * =============================================================================
 * index.js
 * Desc: Rendering module exports
 * Author: Lordthoth (based on original by Azgaar)
 * =============================================================================
 */

export { renderMap } from './canvas.js';
export {
  renderMapSVG,
  drawBiomesSVG,
  drawStatesSVG,
  drawBordersSVG,
  drawRiversSVG,
  drawBurgsSVG,
  drawFeaturesSVG,
} from './svg.js';

// Canvas-only migration renderers (Phase 0)
export { Canvas2DRenderer } from './canvas2d.js';
export { PixiRenderer } from './webgl.js';
export { Renderer } from './renderer-interface.js';