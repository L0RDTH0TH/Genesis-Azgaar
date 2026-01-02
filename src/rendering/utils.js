/**
 * =============================================================================
 * utils.js
 * Desc: Rendering utility functions for canvas operations
 * Author: Lordthoth (based on original by Azgaar)
 * =============================================================================
 */

/**
 * Get polygon path coordinates for a cell
 * Returns the polygon coordinates from pack.cells.vCoords[cellIndex] if available
 * Falls back to converting vertex indices to coordinates if vCoords not available
 * @param {number} cellIndex - Cell index in pack
 * @param {Object} pack - Pack object
 * @returns {Array<Array<number>>|null} Array of [x, y] coordinates, or null if not available
 */
export function getCellPolygonPath(cellIndex, pack) {
  if (!pack || !pack.cells) {
    return null;
  }
  
  // Prefer vCoords (polygon coordinates) for canvas rendering
  if (pack.cells.vCoords && pack.cells.vCoords[cellIndex]) {
    const coords = pack.cells.vCoords[cellIndex];
    if (Array.isArray(coords) && coords.length > 0) {
      return coords;
    }
  }
  
  // Fallback: convert vertex indices to coordinates
  if (pack.cells.v && pack.cells.v[cellIndex] && pack.vertices && pack.vertices.p) {
    const vertexIndices = pack.cells.v[cellIndex];
    if (Array.isArray(vertexIndices) && vertexIndices.length > 0) {
      // Check if it's already coordinates (backward compatibility)
      if (Array.isArray(vertexIndices[0]) && vertexIndices[0].length === 2) {
        return vertexIndices;
  }
      // Convert vertex indices to coordinates
      return vertexIndices.map(vId => pack.vertices.p[vId]).filter(p => p !== undefined);
    }
  }
  
  return null;
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
