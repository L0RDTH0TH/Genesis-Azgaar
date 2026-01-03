/**
 * =============================================================================
 * index.js
 * Desc: Rendering module exports
 * Author: Lordthoth (based on original by Azgaar)
 * =============================================================================
 */

// Canvas rendering is deprecated - use SVG instead
// export { renderMap } from './canvas.js'; // DEPRECATED
export {
  renderMapSVG,
  drawBiomesSVG,
  drawStatesSVG,
  drawBordersSVG,
  drawRiversSVG,
  drawBurgsSVG,
  drawFeaturesSVG,
} from './svg.js';