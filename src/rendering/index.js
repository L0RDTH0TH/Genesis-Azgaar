/**
 * =============================================================================
 * index.js
 * Desc: Rendering module exports (SVG + Canvas)
 * Author: Lordthoth (based on original by Azgaar)
 * =============================================================================
 * 
 * NOTE: Canvas rendering restored in Phase 1
 */

export {
  renderMapSVG,
  drawBiomesSVG,
  drawStatesSVG,
  drawBordersSVG,
  drawRiversSVG,
  drawBurgsSVG,
  drawFeaturesSVG,
} from './svg.js';

export {
  generateCellPath,
  generateDualGridPaths,
  generateInteractiveCellGroup,
} from './svgPaths.js';

export { Canvas2DRenderer } from './canvas2d.js';