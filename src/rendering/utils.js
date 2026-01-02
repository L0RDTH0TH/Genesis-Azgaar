/**
 * =============================================================================
 * utils.js
 * Desc: Rendering utility functions for canvas operations
 * Author: Lordthoth (based on original by Azgaar)
 * =============================================================================
 */

/**
 * Get polygon path coordinates for a cell
 * Returns the polygon coordinates from pack.cells.v[cellIndex] if available
 * @param {number} cellIndex - Cell index in pack
 * @param {Object} pack - Pack object
 * @returns {Array<Array<number>>|null} Array of [x, y] coordinates, or null if not available
 */
export function getCellPolygonPath(cellIndex, pack) {
  if (!pack || !pack.cells || !pack.cells.v) {
    return null;
  }
  
  const cellVertices = pack.cells.v[cellIndex];
  if (!cellVertices || !Array.isArray(cellVertices) || cellVertices.length === 0) {
    return null;
  }
  
  // Return polygon coordinates (already in [x, y] format)
  return cellVertices;
}

/**
 * Draw polygon on canvas context
 * Helper function to draw a polygon from coordinates
 * @param {CanvasRenderingContext2D} ctx - Canvas context
 * @param {Array<Array<number>>} polygon - Array of [x, y] coordinates
 */
export function drawPolygon(ctx, polygon) {
  if (!polygon || polygon.length === 0) {
    return;
  }
  
  ctx.beginPath();
  const [firstX, firstY] = polygon[0];
  ctx.moveTo(firstX, firstY);
  
  for (let i = 1; i < polygon.length; i++) {
    const [x, y] = polygon[i];
    ctx.lineTo(x, y);
  }
  
  ctx.closePath();
}
